# ============================================================
# Minimal wafer defect training script
# - Uses folder names as labels
# - Works with your actual WM811k_Dataset folder names
# - Simple train/val split
# - ResNet18
# - Light augmentation only
# ============================================================

import os
import json
import random
import time
from glob import glob
from collections import Counter

import numpy as np
from PIL import Image

import torch
import torch.nn as nn
from torch.utils.data import Dataset, DataLoader
from torchvision import transforms, models
from sklearn.model_selection import train_test_split
from sklearn.metrics import accuracy_score, precision_score, recall_score, f1_score, classification_report

# -----------------------------
# Config
# -----------------------------
DATA_DIR = "./WM811k_Dataset"
SAVE_DIR = "./ml_outputs"
os.makedirs(SAVE_DIR, exist_ok=True)

IMG_SIZE = 224
BATCH_SIZE = 32
EPOCHS = 15
LR = 1e-4
SEED = 42

DEVICE = torch.device("cuda" if torch.cuda.is_available() else "cpu")
USE_AMP = DEVICE.type == "cuda"

CANONICAL_CLASSES = [
    "center",
    "donut",
    "edge-local",
    "edge-ring",
    "local",
    "near-full",
    "none",
    "random",
    "scratch",
]

# -----------------------------
# Reproducibility
# -----------------------------
def set_seed(seed=42):
    random.seed(seed)
    np.random.seed(seed)
    torch.manual_seed(seed)
    if torch.cuda.is_available():
        torch.cuda.manual_seed_all(seed)

set_seed(SEED)

# -----------------------------
# Folder-name normalization
# -----------------------------
def normalize_name(s):
    return (
        s.strip()
         .lower()
         .replace("_", " ")
         .replace("-", " ")
    )

ALIAS_TO_CANONICAL = {
    "center": "center",
    "donut": "donut",
    "edge local": "edge-local",
    "edge ring": "edge-ring",
    "local": "local",
    "near full": "near-full",
    "none": "none",
    "random": "random",
    "scratch": "scratch",
}

# -----------------------------
# Discover dataset from folders
# -----------------------------
def discover_dataset(data_dir):
    folder_to_canonical = {}

    for folder_name in sorted(os.listdir(data_dir)):
        full_path = os.path.join(data_dir, folder_name)
        if not os.path.isdir(full_path):
            continue

        normalized = normalize_name(folder_name)
        if normalized in ALIAS_TO_CANONICAL:
            folder_to_canonical[folder_name] = ALIAS_TO_CANONICAL[normalized]

    if not folder_to_canonical:
        raise ValueError(f"No valid class folders found in {data_dir}")

    present_classes = sorted(
        set(folder_to_canonical.values()),
        key=lambda x: CANONICAL_CLASSES.index(x)
    )
    class_to_idx = {cls_name: i for i, cls_name in enumerate(present_classes)}
    idx_to_class = {i: cls_name for cls_name, i in class_to_idx.items()}

    paths, labels = [], []

    for folder_name, canonical_label in folder_to_canonical.items():
        folder_path = os.path.join(data_dir, folder_name)
        class_idx = class_to_idx[canonical_label]

        files = []
        for ext in ("*.jpg", "*.jpeg", "*.png", "*.bmp", "*.tif", "*.tiff"):
            files.extend(glob(os.path.join(folder_path, ext)))

        paths.extend(files)
        labels.extend([class_idx] * len(files))

    if not paths:
        raise ValueError("No image files found in dataset folders.")

    return paths, labels, class_to_idx, idx_to_class

paths, labels, class_to_idx, idx_to_class = discover_dataset(DATA_DIR)
num_classes = len(class_to_idx)

print("[INFO] Classes:", class_to_idx)
print("[INFO] Total images:", len(paths))

# -----------------------------
# Train/val split
# -----------------------------
idx_all = np.arange(len(paths))
train_idx, val_idx = train_test_split(
    idx_all,
    test_size=0.2,
    random_state=SEED,
    stratify=labels
)

def print_split_stats(name, idx):
    y = [labels[i] for i in idx]
    counts = Counter(y)
    print(f"\n[{name}] n={len(idx)}")
    for k in range(num_classes):
        print(f"  {idx_to_class[k]:>10s}: {counts.get(k, 0)}")

print_split_stats("TRAIN", train_idx)
print_split_stats("VAL", val_idx)

# -----------------------------
# Transforms
# Removed flips, kept light rotation only
# -----------------------------
IMAGENET_MEAN = [0.485, 0.456, 0.406]
IMAGENET_STD  = [0.229, 0.224, 0.225]

train_tf = transforms.Compose([
    transforms.Resize((IMG_SIZE, IMG_SIZE)),
    transforms.RandomRotation(10),
    transforms.ToTensor(),
    transforms.Normalize(IMAGENET_MEAN, IMAGENET_STD),
])

val_tf = transforms.Compose([
    transforms.Resize((IMG_SIZE, IMG_SIZE)),
    transforms.ToTensor(),
    transforms.Normalize(IMAGENET_MEAN, IMAGENET_STD),
])

# -----------------------------
# Dataset
# -----------------------------
class WaferDataset(Dataset):
    def __init__(self, indices, transform=None):
        self.indices = indices
        self.transform = transform

    def __len__(self):
        return len(self.indices)

    def __getitem__(self, idx):
        real_idx = self.indices[idx]
        img_path = paths[real_idx]
        label = labels[real_idx]

        with Image.open(img_path) as img:
            img = img.convert("RGB")

        if self.transform:
            img = self.transform(img)

        return img, label

train_ds = WaferDataset(train_idx, transform=train_tf)
val_ds = WaferDataset(val_idx, transform=val_tf)

train_dl = DataLoader(
    train_ds,
    batch_size=BATCH_SIZE,
    shuffle=True,
    num_workers=0,
    pin_memory=(DEVICE.type == "cuda")
)

val_dl = DataLoader(
    val_ds,
    batch_size=BATCH_SIZE,
    shuffle=False,
    num_workers=0,
    pin_memory=(DEVICE.type == "cuda")
)

# -----------------------------
# Model
# -----------------------------
def build_model(num_classes):
    model = models.resnet18(weights="DEFAULT")
    in_features = model.fc.in_features
    model.fc = nn.Linear(in_features, num_classes)
    return model

model = build_model(num_classes).to(DEVICE)

# -----------------------------
# Loss / optimizer
# -----------------------------
train_labels = [labels[i] for i in train_idx]
counts = np.bincount(train_labels, minlength=num_classes)
weights = 1.0 / np.maximum(counts, 1)
weights = weights / weights.sum() * len(weights)
class_weights = torch.tensor(weights, dtype=torch.float32, device=DEVICE)

criterion = nn.CrossEntropyLoss(weight=class_weights)
optimizer = torch.optim.Adam(model.parameters(), lr=LR)
scaler = torch.amp.GradScaler("cuda", enabled=USE_AMP)

# -----------------------------
# Train / eval loop
# -----------------------------
def run_epoch(model, loader, optimizer=None):
    is_train = optimizer is not None
    model.train(is_train)

    total_loss = 0.0
    all_true, all_pred = [], []

    for xb, yb in loader:
        xb = xb.to(DEVICE, non_blocking=True)
        yb = yb.to(DEVICE, non_blocking=True)

        if is_train:
            optimizer.zero_grad(set_to_none=True)
            with torch.amp.autocast("cuda", enabled=USE_AMP):
                logits = model(xb)
                loss = criterion(logits, yb)
            scaler.scale(loss).backward()
            scaler.step(optimizer)
            scaler.update()
        else:
            with torch.no_grad():
                logits = model(xb)
                loss = criterion(logits, yb)

        total_loss += loss.item() * xb.size(0)
        preds = logits.argmax(dim=1)

        all_true.extend(yb.cpu().numpy())
        all_pred.extend(preds.cpu().numpy())

    avg_loss = total_loss / len(loader.dataset)
    acc = accuracy_score(all_true, all_pred)
    f1 = f1_score(all_true, all_pred, average="macro")
    return avg_loss, acc, f1, all_true, all_pred

# -----------------------------
# Training
# -----------------------------
history = {
    "train_loss": [],
    "val_loss": [],
    "train_acc": [],
    "val_acc": [],
    "train_f1": [],
    "val_f1": []
}

best_val_f1 = -1.0
best_model_path = os.path.join(SAVE_DIR, "wafer_resnet18_best.pth")

start_time = time.time()

for epoch in range(1, EPOCHS + 1):
    train_loss, train_acc, train_f1, _, _ = run_epoch(model, train_dl, optimizer)
    val_loss, val_acc, val_f1, y_true, y_pred = run_epoch(model, val_dl)

    history["train_loss"].append(train_loss)
    history["val_loss"].append(val_loss)
    history["train_acc"].append(train_acc)
    history["val_acc"].append(val_acc)
    history["train_f1"].append(train_f1)
    history["val_f1"].append(val_f1)

    print(
        f"Epoch {epoch:02d} | "
        f"train_loss={train_loss:.4f} train_acc={train_acc:.4f} train_f1={train_f1:.4f} | "
        f"val_loss={val_loss:.4f} val_acc={val_acc:.4f} val_f1={val_f1:.4f}"
    )

    if val_f1 > best_val_f1:
        best_val_f1 = val_f1
        torch.save(model.state_dict(), best_model_path)

elapsed = (time.time() - start_time) / 60
print(f"\n[INFO] Training finished in {elapsed:.1f} min")
print(f"[INFO] Best val macro F1: {best_val_f1:.4f}")
print(f"[INFO] Saved best model to: {best_model_path}")

# -----------------------------
# Final validation evaluation
# -----------------------------
model.load_state_dict(torch.load(best_model_path, map_location=DEVICE))
model.eval()

_, val_acc, val_f1, y_true, y_pred = run_epoch(model, val_dl)

val_prec = precision_score(y_true, y_pred, average="macro", zero_division=0)
val_rec  = recall_score(y_true, y_pred, average="macro", zero_division=0)

class_names = [idx_to_class[i] for i in range(num_classes)]

print("\n[VAL] Metrics")
print(f"Accuracy : {val_acc:.4f}")
print(f"Precision: {val_prec:.4f}")
print(f"Recall   : {val_rec:.4f}")
print(f"F1-score : {val_f1:.4f}")

print("\n[VAL] Classification Report")
print(classification_report(y_true, y_pred, target_names=class_names, zero_division=0))

summary = {
    "classes": class_names,
    "num_classes": num_classes,
    "train_size": len(train_idx),
    "val_size": len(val_idx),
    "best_val_f1": float(best_val_f1),
    "final_val_metrics": {
        "accuracy": float(val_acc),
        "precision": float(val_prec),
        "recall": float(val_rec),
        "f1": float(val_f1),
    },
    "history": history
}

summary_path = os.path.join(SAVE_DIR, "train_summary_resnet18.json")
with open(summary_path, "w") as f:
    json.dump(summary, f, indent=2)

print(f"\n[SAVED] Summary -> {summary_path}")