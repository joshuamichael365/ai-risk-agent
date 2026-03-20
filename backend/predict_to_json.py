import os
import json
import sys
from pathlib import Path
from datetime import datetime
from typing import Any

import torch
import torch.nn as nn
from torchvision import transforms, models
from PIL import Image

VALID_EXTENSIONS = {".jpg", ".jpeg", ".png", ".bmp", ".tif", ".tiff"}

# -----------------------------
# Paths / config
# -----------------------------
REPO_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_MODEL_PATH = REPO_ROOT / "ml_outputs" / "wafer_resnet18_best.pth"
OUTPUT_DIR = REPO_ROOT / "data" / "sample_outputs"
WORKFLOW_INPUT_DIR = REPO_ROOT / "data" / "workflow_inputs"
IMG_SIZE = 224

DEVICE = torch.device("cuda" if torch.cuda.is_available() else "cpu")

CLASS_NAMES = [
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

IMAGENET_MEAN = [0.485, 0.456, 0.406]
IMAGENET_STD = [0.229, 0.224, 0.225]

eval_tf = transforms.Compose([
    transforms.Resize((IMG_SIZE, IMG_SIZE)),
    transforms.ToTensor(),
    transforms.Normalize(IMAGENET_MEAN, IMAGENET_STD),
])

_model = None


def resolve_model_path() -> Path:
    explicit = os.getenv("WAFER_MODEL_PATH", "").strip()
    if explicit:
        candidate = Path(explicit).expanduser()
        if candidate.exists():
            return candidate

    if DEFAULT_MODEL_PATH.exists():
        return DEFAULT_MODEL_PATH

    model_dir = REPO_ROOT / "ml_outputs"
    candidates = sorted(model_dir.glob("*.pth"))
    if candidates:
        return candidates[-1]

    raise FileNotFoundError(
        "No trained model weights found.\n"
        f"Expected default path: {DEFAULT_MODEL_PATH}\n"
        "Train the model first with:\n"
        "  python ml/train_wafer.py\n"
        "Or set WAFER_MODEL_PATH in .env to an existing .pth file."
    )


# -----------------------------
# Model
# -----------------------------
def build_model(num_classes: int):
    model = models.resnet18(weights=None)
    in_features = model.fc.in_features
    model.fc = nn.Linear(in_features, num_classes)
    return model


def load_model():
    global _model
    if _model is None:
        model_path = resolve_model_path()

        model = build_model(len(CLASS_NAMES))
        state_dict = torch.load(model_path, map_location=DEVICE)
        model.load_state_dict(state_dict)
        model.to(DEVICE)
        model.eval()
        _model = model

    return _model


# -----------------------------
# Prediction
# -----------------------------
def predict_defect(image_path: str) -> tuple[str, float]:
    model = load_model()

    with Image.open(image_path) as img:
        img = img.convert("RGB")
        x = eval_tf(img).unsqueeze(0).to(DEVICE)

    with torch.no_grad():
        logits = model(x)
        probs = torch.softmax(logits, dim=1)

    pred_idx = int(torch.argmax(probs, dim=1).item())
    confidence = float(probs[0, pred_idx].item())
    label = CLASS_NAMES[pred_idx]

    return label, confidence


# -----------------------------
# Risk / actions
# -----------------------------
def risk_from_defect(defect: str, confidence: float) -> str:
    defect_n = defect.strip().lower()

    if confidence < 0.60:
        return "review"

    if defect_n in {"scratch", "near-full"}:
        return "high"
    if defect_n in {"center", "donut", "edge-local", "edge-ring", "local", "random"}:
        return "medium"
    if defect_n == "none":
        return "low"

    return "unknown"


def recommended_actions(defect: str, risk_level: str, confidence: float) -> list[str]:
    defect_n = defect.strip().lower()

    if confidence < 0.60:
        return ["log_result", "manual_review"]

    if defect_n == "none":
        return ["log_result", "mark_as_pass"]

    actions = ["log_result"]

    if risk_level == "high":
        actions.extend([
            "create_ticket",
            "notify_engineering",
            "schedule_inspection"
        ])
    elif risk_level == "medium":
        actions.extend([
            "create_review_task",
            "recommend_manual_check"
        ])
    else:
        actions.append("queue_for_review")

    return actions


def normalize_defect_label(defect: str) -> str:
    mapping = {
        "center": "Center",
        "donut": "Donut",
        "edge-local": "Edge-Loc",
        "edge-ring": "Edge-Ring",
        "local": "Loc",
        "near-full": "Near-full",
        "none": "None",
        "random": "Random",
        "scratch": "Scratch",
    }
    return mapping.get(defect.strip().lower(), defect)


def build_workflow_input(prediction_output: dict[str, Any]) -> dict[str, Any]:
    wafer_id = prediction_output["wafer_id"]
    timestamp = datetime.utcnow().strftime("%Y%m%d%H%M%S")
    lot_id = os.getenv("DEFAULT_LOT_ID", f"LOT-{wafer_id[-4:].upper()}")
    tool_id = os.getenv("DEFAULT_TOOL_ID", "TOOL-UNKNOWN")
    process_step = os.getenv("DEFAULT_PROCESS_STEP", "inspection")
    defect = normalize_defect_label(prediction_output["predicted_defect"])
    confidence = prediction_output["confidence"]
    risk_level = prediction_output["risk_level"]

    return {
        "case_id": f"CASE-{timestamp}-{wafer_id}",
        "wafer_id": wafer_id,
        "lot_id": lot_id,
        "tool_id": tool_id,
        "process_step": process_step,
        "wafer_map_summary": (
            f"Predicted defect {defect} with confidence {confidence}. "
            f"Risk level is {risk_level}."
        ),
        "spc_summary": "",
        "tool_alarm_summary": "",
        "lot_history_summary": "",
        "proposed_actions": prediction_output["recommended_actions"],
        "prediction": prediction_output,
    }


# -----------------------------
# JSON builder
# -----------------------------
def build_output(image_path: str) -> dict:
    defect, confidence = predict_defect(image_path)
    risk_level = risk_from_defect(defect, confidence)
    actions = recommended_actions(defect, risk_level, confidence)

    return {
        "wafer_id": Path(image_path).stem,
        "image_path": image_path.replace("\\", "/"),
        "predicted_defect": defect,
        "confidence": round(confidence, 4),
        "defect_found": defect != "none",
        "risk_level": risk_level,
        "recommended_actions": actions,
        "timestamp": datetime.utcnow().isoformat() + "Z"
    }


def save_json(output: dict, output_dir: str = OUTPUT_DIR) -> str:
    output_dir_path = Path(output_dir)
    output_dir_path.mkdir(parents=True, exist_ok=True)
    out_path = output_dir_path / f"{output['wafer_id']}.json"

    with open(out_path, "w") as f:
        json.dump(output, f, indent=2)

    return str(out_path)


def save_workflow_input(workflow_input: dict[str, Any], output_dir: str = WORKFLOW_INPUT_DIR) -> str:
    output_dir_path = Path(output_dir)
    output_dir_path.mkdir(parents=True, exist_ok=True)
    out_path = output_dir_path / f"{workflow_input['wafer_id']}_workflow_input.json"

    with open(out_path, "w") as f:
        json.dump(workflow_input, f, indent=2)

    return str(out_path)


# -----------------------------
# Processing
# -----------------------------
def process_single_image(image_path: str, output_dir: str = OUTPUT_DIR) -> None:
    output = build_output(image_path)
    saved_path = save_json(output, output_dir)
    workflow_saved_path = save_workflow_input(build_workflow_input(output))
    print(f"Saved JSON to: {saved_path}")
    print(f"Saved workflow input to: {workflow_saved_path}")
    print(json.dumps(output, indent=2))


def process_dataset(dataset_dir: str, output_dir: str = OUTPUT_DIR) -> None:
    image_paths = []

    for root, _, files in os.walk(dataset_dir):
        for file in files:
            ext = Path(file).suffix.lower()
            if ext in VALID_EXTENSIONS:
                image_paths.append(os.path.join(root, file))

    image_paths.sort()

    if not image_paths:
        print("No image files found.")
        return

    total = 0
    for image_path in image_paths:
        try:
            output = build_output(image_path)
            save_json(output, output_dir)
            save_workflow_input(build_workflow_input(output))
            total += 1
        except Exception as e:
            print(f"Failed on {image_path}: {e}")

    print(f"Finished. Saved {total} prediction JSON files to {output_dir}")
    print(f"Workflow inputs saved to {WORKFLOW_INPUT_DIR}")


# -----------------------------
# Main
# -----------------------------
if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage:")
        print("  python backend/predict_to_json.py <image_path>")
        print("  python backend/predict_to_json.py <dataset_folder>")
        sys.exit(1)

    input_path = sys.argv[1]

    if os.path.isfile(input_path):
        process_single_image(input_path)
    elif os.path.isdir(input_path):
        process_dataset(input_path)
    else:
        print(f"Path not found: {input_path}")
        sys.exit(1)
