import argparse
import json
import os
from pathlib import Path
from typing import Any

import yaml
from dotenv import load_dotenv

from ibm_watsonx_orchestrate.client.chat.run_client import RunClient


REPO_ROOT = Path(__file__).resolve().parents[1]
INPUT_DIR = REPO_ROOT / "data" / "workflow_inputs"
OUTPUT_DIR = REPO_ROOT / "data" / "workflow_outputs"
ORCHESTRATE_CONFIG_PATH = Path.home() / ".config" / "orchestrate" / "config.yaml"
ORCHESTRATE_CREDENTIALS_PATH = Path.home() / ".cache" / "orchestrate" / "credentials.yaml"


def load_json(path: Path) -> dict[str, Any]:
    with path.open("r", encoding="utf-8") as file_obj:
        return json.load(file_obj)


def save_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as file_obj:
        json.dump(payload, file_obj, indent=2)


def load_yaml(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {}

    with path.open("r", encoding="utf-8") as file_obj:
        data = yaml.safe_load(file_obj) or {}

    if not isinstance(data, dict):
        return {}
    return data


def load_cached_orchestrate_token() -> str:
    config_data = load_yaml(ORCHESTRATE_CONFIG_PATH)
    credentials_data = load_yaml(ORCHESTRATE_CREDENTIALS_PATH)

    active_environment = (
        config_data.get("context", {}).get("active_environment")
        if isinstance(config_data.get("context"), dict)
        else None
    )
    auth_block = credentials_data.get("auth", {})

    if active_environment and isinstance(auth_block, dict):
        env_auth = auth_block.get(active_environment, {})
        if isinstance(env_auth, dict):
            token = str(env_auth.get("wxo_mcsp_token", "")).strip()
            if token:
                return token

    return ""


def build_client_kwargs() -> dict[str, Any]:
    url = os.getenv("WO_INSTANCE_URL", "").strip()
    api_key = os.getenv("WO_API_KEY", "").strip()
    access_token = os.getenv("WO_ACCESS_TOKEN", "").strip() or load_cached_orchestrate_token()

    if not url:
        raise ValueError("Missing WO_INSTANCE_URL in .env")
    if not api_key and not access_token:
        raise ValueError(
            "Missing authentication. Set WO_ACCESS_TOKEN or WO_API_KEY in .env, "
            "or log in with the orchestrate CLI so the cached MCSP token is available."
        )

    return {
        "url": url,
        "base_url": url,
        "api_key": access_token or api_key,
        "verify": os.getenv("WO_VERIFY_SSL", "true").lower() != "false",
    }


def build_prompt(workflow_input: dict[str, Any]) -> str:
    payload = json.dumps(workflow_input, indent=2)
    return (
        "Run the wafer response workflow for the following structured wafer case input. "
        "Return structured JSON only.\n\n"
        f"{payload}"
    )


def extract_result_text(status: dict[str, Any]) -> str | None:
    for key in ("result", "response", "output", "message", "final_output"):
        value = status.get(key)
        if isinstance(value, str) and value.strip():
            return value
        if isinstance(value, dict):
            content = value.get("content")
            if isinstance(content, str) and content.strip():
                return content

    messages = status.get("messages")
    if isinstance(messages, list):
        for item in reversed(messages):
            if not isinstance(item, dict):
                continue

            content = item.get("content")
            if isinstance(content, str) and content.strip():
                return content

            if isinstance(content, list):
                for part in content:
                    if isinstance(part, dict) and isinstance(part.get("text"), str):
                        return part["text"]

    result = status.get("result")
    if isinstance(result, dict):
        data = result.get("data")
        if isinstance(data, dict):
            message = data.get("message")
            if isinstance(message, dict):
                content = message.get("content")
                if isinstance(content, str) and content.strip():
                    return content
                if isinstance(content, list):
                    for part in content:
                        if isinstance(part, dict) and isinstance(part.get("text"), str):
                            return part["text"]

    return None


def parse_result_payload(result_text: str | None) -> dict[str, Any] | None:
    if not result_text:
        return None

    try:
        return json.loads(result_text)
    except json.JSONDecodeError:
        start = result_text.find("{")
        end = result_text.rfind("}")
        if start != -1 and end != -1 and end > start:
            try:
                return json.loads(result_text[start : end + 1])
            except json.JSONDecodeError:
                return None
    return None


def run_single_workflow(
    input_path: Path,
    run_client: RunClient,
    agent_id: str,
    poll_interval: int,
    max_retries: int,
) -> Path:
    workflow_input = load_json(input_path)
    prompt = build_prompt(workflow_input)

    run_info = run_client.create_run(
        message=prompt,
        agent_id=agent_id,
        capture_logs=True,
    )
    run_id = run_info["run_id"]
    final_status = run_client.wait_for_run_completion(
        run_id,
        poll_interval=poll_interval,
        max_retries=max_retries,
    )

    result_text = extract_result_text(final_status)
    parsed_result = parse_result_payload(result_text)

    output_payload = {
        "input_file": str(input_path),
        "case_id": workflow_input.get("case_id"),
        "wafer_id": workflow_input.get("wafer_id"),
        "lot_id": workflow_input.get("lot_id"),
        "run_info": run_info,
        "final_status": final_status,
        "result_text": result_text,
        "parsed_result": parsed_result,
    }

    output_name = f"{input_path.stem.replace('_workflow_input', '')}_workflow_output.json"
    output_path = OUTPUT_DIR / output_name
    save_json(output_path, output_payload)
    return output_path


def resolve_input_files(single_file: str | None) -> list[Path]:
    if single_file:
        input_path = Path(single_file)
        if not input_path.exists():
            raise FileNotFoundError(f"Workflow input file not found: {input_path}")
        return [input_path]

    if not INPUT_DIR.exists():
        return []

    return sorted(INPUT_DIR.glob("*.json"))


def main() -> None:
    load_dotenv()

    parser = argparse.ArgumentParser(
        description="Run watsonx Orchestrate workflow for JSON input files.",
    )
    parser.add_argument(
        "--file",
        help="Process one workflow input JSON file instead of every file in data/workflow_inputs.",
    )
    parser.add_argument(
        "--poll-interval",
        type=int,
        default=3,
        help="Seconds between run status polls.",
    )
    parser.add_argument(
        "--max-retries",
        type=int,
        default=100,
        help="Maximum polling attempts before timeout.",
    )
    args = parser.parse_args()

    agent_id = os.getenv("WO_PLANNER_AGENT_ID", "").strip()
    if not agent_id:
        raise ValueError("Missing WO_PLANNER_AGENT_ID in .env")

    input_files = resolve_input_files(args.file)
    if not input_files:
        print(f"No workflow input JSON files found in {INPUT_DIR}")
        return

    client_kwargs = build_client_kwargs()
    run_client = RunClient(
        base_url=client_kwargs["base_url"],
        api_key=client_kwargs["api_key"],
        verify=client_kwargs["verify"],
    )

    for input_path in input_files:
        try:
            output_path = run_single_workflow(
                input_path=input_path,
                run_client=run_client,
                agent_id=agent_id,
                poll_interval=args.poll_interval,
                max_retries=args.max_retries,
            )
            print(f"Saved workflow output to: {output_path}")
        except Exception as exc:
            print(f"Failed on {input_path}: {exc}")


if __name__ == "__main__":
    main()
