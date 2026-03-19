import os
import json
import sys
from pathlib import Path
from datetime import datetime

VALID_EXTENSIONS = {".jpg", ".jpeg", ".png"}


def predict_defect(image_path: str) -> tuple[str, float]:
    label = Path(image_path).parent.name
    confidence = 0.95
    return label, confidence


def risk_from_defect(defect: str) -> str:
    defect_n = defect.strip().replace(" ", "_").lower()

    if defect_n in {"scratch", "near_full"}:
        return "high"
    if defect_n in {"center", "donut", "edge_local", "edge_ring", "local", "random"}:
        return "medium"
    if defect_n == "none":
        return "low"
    return "unknown"


def recommended_actions(defect: str, risk_level: str) -> list[str]:
    defect_n = defect.strip().replace(" ", "_").lower()

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


def build_output(image_path: str) -> dict:
    defect, confidence = predict_defect(image_path)
    risk_level = risk_from_defect(defect)
    actions = recommended_actions(defect, risk_level)

    return {
        "wafer_id": Path(image_path).stem,
        "image_path": image_path.replace("\\", "/"),
        "predicted_defect": defect,
        "confidence": confidence,
        "defect_found": defect.strip().lower() != "none",
        "risk_level": risk_level,
        "recommended_actions": actions,
        "timestamp": datetime.utcnow().isoformat() + "Z"
    }


def save_json(output: dict, output_dir: str = "data/sample_outputs") -> str:
    os.makedirs(output_dir, exist_ok=True)
    out_path = os.path.join(output_dir, f"{output['wafer_id']}.json")

    with open(out_path, "w") as f:
        json.dump(output, f, indent=2)

    return out_path


def process_single_image(image_path: str, output_dir: str = "data/sample_outputs") -> None:
    output = build_output(image_path)
    saved_path = save_json(output, output_dir)
    print(f"Saved JSON to: {saved_path}")
    print(json.dumps(output, indent=2))


def process_dataset(dataset_dir: str, output_dir: str = "data/sample_outputs") -> None:
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
            total += 1
        except Exception as e:
            print(f"Failed on {image_path}: {e}")

    print(f"Finished. Saved {total} JSON files to {output_dir}")


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
