# ai-risk-agent

Wafer defect detection and response orchestration demo built around:

- a wafer image classifier trained on `WM811k_Dataset`
- watsonx Orchestrate agents and workflow execution
- a live Next.js dashboard that reads prediction and workflow outputs

## Project Flow

The end-to-end flow in this repo is:

1. Train a wafer defect model from `WM811k_Dataset`
2. Run prediction on one image or the full dataset
3. Save prediction JSON to `data/sample_outputs`
4. Save workflow input JSON to `data/workflow_inputs`
5. Send workflow inputs to watsonx Orchestrate
6. Save workflow output JSON to `data/workflow_outputs`
7. Stream those results into the frontend dashboard

## Project Structure

- `ml/train_wafer.py`: trains a ResNet18 wafer defect classifier
- `backend/predict_to_json.py`: predicts defect label and generates JSON outputs
- `backend/run_workflow.py`: sends workflow inputs to watsonx Orchestrate and saves workflow outputs
- `orchestrate/wafer_action_tools.py`: Python tool definitions for Orchestrate
- `orchestrate/wafer_response_flow.py`: flow scaffold for the wafer response process
- `knowledge/`: knowledge packages used by the Orchestrate agents
- `frontend/`: Next.js dashboard with live SSE updates

## Prerequisites

- Python 3.11
- Node.js and npm
- An activated watsonx Orchestrate environment with your four agents configured
- A valid Orchestrate login or token

## Python Setup

Create and activate a virtual environment:

```bash
cd "/Users/liuzitang/Desktop/Side Projects/Hack_NCCU/ai-risk-agent"
python3 -m venv .venv
source .venv/bin/activate
```

Install Python packages:

```bash
pip install -r orchestrate/install_requirements.txt
pip install torch torchvision pillow numpy scikit-learn pyyaml
```

## Frontend Setup

Install frontend dependencies:

```bash
cd frontend
npm install
cd ..
```

## Environment Variables

This project uses a local `.env` file at the repo root.

Minimum required values:

```env
WO_INSTANCE_URL=...
WO_API_KEY=...
WO_PLANNER_AGENT_ID=...
WO_VERIFY_SSL=true
WAFER_MODEL_PATH=./ml_outputs/wafer_resnet18_best.pth
```

Optional:

- `WO_ACCESS_TOKEN`: explicit bearer token if you do not want to rely on CLI cached auth
- `DEFAULT_LOT_ID`
- `DEFAULT_TOOL_ID`
- `DEFAULT_PROCESS_STEP`

Notes:

- `.env` is ignored by git
- `backend/run_workflow.py` can also reuse the active Orchestrate CLI token from the local cache

## Watsonx Orchestrate Setup

You should already have these agents configured:

- Wafer Response Planner
- Wafer Monitor Agent
- Wafer Diagnosis Agent
- Wafer Compliance Agent

Import the Python tools:

```bash
orchestrate tools import -f orchestrate/wafer_action_tools.py
```

Import the flow:

```bash
orchestrate tools import --kind flow -f orchestrate/wafer_response_flow.py
```

Attach the imported flow tool to the `Wafer Response Planner`.

Recommended planner behavior:

- always use the wafer response flow
- do not rely on free-form collaborator selection when the flow tool is available
- return structured JSON

## Train the Model

Train the wafer classifier:

```bash
source .venv/bin/activate
python ml/train_wafer.py
```

Expected outputs:

- `ml_outputs/wafer_resnet18_best.pth`
- `ml_outputs/train_summary_resnet18.json`

If pretrained ResNet weights cannot be downloaded, the script falls back to random initialization automatically.

## Generate Prediction and Workflow Input JSON

Run prediction for one image:

```bash
source .venv/bin/activate
python backend/predict_to_json.py ./WM811k_Dataset/Center/641447.jpg
```

Run prediction for the full dataset:

```bash
source .venv/bin/activate
python backend/predict_to_json.py ./WM811k_Dataset
```

This generates:

- `data/sample_outputs/<wafer_id>.json`
- `data/workflow_inputs/<wafer_id>_workflow_input.json`

## Run the Orchestrate Workflow

Run workflow processing for all input files:

```bash
source .venv/bin/activate
python backend/run_workflow.py
```

Run workflow processing for a single file:

```bash
source .venv/bin/activate
python backend/run_workflow.py --file data/workflow_inputs/641447_workflow_input.json
```

Optional flags:

```bash
python backend/run_workflow.py --poll-interval 3 --max-retries 100
```

Workflow outputs are written to:

- `data/workflow_outputs/*.json`

## Run the Frontend Dashboard

Start the frontend:

```bash
cd frontend
npm run dev
```

Open:

- `http://localhost:3000`

## Live Dashboard Behavior

The dashboard uses Server-Sent Events from:

- `frontend/app/api/dashboard/stream/route.ts`

It reads:

- prediction files from `data/sample_outputs`
- workflow outputs from `data/workflow_outputs`

The top KPI cards are workflow-driven:

- Cases Requiring Approval
- Open Action Plans
- Lots Pending Hold Review
- Engineering Tickets Recommended

The live risk chart combines:

- prediction events
- workflow completion events

The recent wafer table prioritizes wafers that already have workflow outputs.

## Typical End-to-End Run Order

From the repo root:

```bash
source .venv/bin/activate
python ml/train_wafer.py
python backend/predict_to_json.py ./WM811k_Dataset/Center/641447.jpg
python backend/run_workflow.py
cd frontend && npm run dev
```

## Troubleshooting

### `Model weights not found`

Train first:

```bash
python ml/train_wafer.py
```

Or set:

```env
WAFER_MODEL_PATH=/full/path/to/model.pth
```

### `401 unauthorized` from `run_workflow.py`

Check:

- `WO_INSTANCE_URL`
- `WO_API_KEY`
- active Orchestrate CLI login

The runner can use the active CLI token cache automatically.

### Dashboard shows prediction data but no workflow updates

Check that workflow outputs exist:

```bash
ls -la data/workflow_outputs
```

Then rerun:

```bash
python backend/run_workflow.py
```

### Live risk trend stays fixed around one minute

That usually means:

- no new workflow outputs were written
- the dashboard only sees prediction timestamps
- `data/workflow_outputs` is empty

## Notes

- Generated JSON output folders are ignored by git
- The current workflow runner invokes the planner agent, which should be configured to use the imported flow tool
- The dashboard is designed for a local file-based demo workflow, not a production event bus
