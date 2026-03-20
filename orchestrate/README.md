# Watsonx Orchestrate Integration Plan

This project already has the right logical split for a wafer-defect multi-agent system:

- Wafer Response Planner: main entry point
- Wafer Monitor Agent: triage
- Wafer Diagnosis Agent: engineering hypothesis
- Wafer Compliance Agent: policy gate

The next step is to connect them with a deterministic flow so the execution order is fixed:

1. Monitor runs first.
2. Diagnosis runs only when monitor escalation is needed.
3. Compliance runs before any operational action.
4. Action tools run only when compliance clears them.
5. One final structured result is returned to the planner.

## Recommended flow

Input case
-> Wafer Monitor Agent
-> conditional diagnosis gate
-> Wafer Diagnosis Agent
-> Wafer Compliance Agent
-> conditional tool execution
-> final response bundle

## Current agent review

Your four agents are separated well.

What looks good:
- Monitor is focused on triage and escalation.
- Diagnosis is focused on defect interpretation and engineering rationale.
- Compliance is focused on allowed versus blocked actions.
- Planner is positioned as the single user-facing coordinator.

What I would tighten:
- Keep the planner as the only agent that executes tools.
- Move operational execution into imported tools or one imported workflow tool.
- Make planner instructions explicitly prefer the workflow tool over free-form collaborator reasoning.
- Remove any temptation for the monitor or diagnosis agents to imply execution authority.

## Suggested planner behavior

If the UI supports it, a planning-oriented style is a better fit than a purely reactive style for the planner. If not, keep the current style and tighten the instructions so it behaves like a controlled dispatcher.

Recommended planner rules:
- always run the wafer response flow first
- never execute action tools before compliance
- only execute compliance-approved actions
- return structured JSON only

## Build order

### 1. Import Python action tools

Create Python tools for:
- `create_case_log`
- `create_engineering_ticket`
- `send_escalation_notification`
- `request_metrology_review`
- `request_tool_inspection`
- `submit_lot_hold_request`
- `compare_recent_tool_history`
- `export_rca_report`

Import pattern:

```bash
orchestrate tools import -f orchestrate/wafer_action_tools.py
```

### 2. Import the workflow

Use the flow in `orchestrate/wafer_response_flow.py` as the sequencing layer.

Import pattern:

```bash
orchestrate tools import --kind flow -f orchestrate/wafer_response_flow.py
```

Use CLI help to confirm flags in your installed version:

```bash
orchestrate tools import --help
```

### 3. Attach only the flow tool to the planner

Best practice for your demo:
- attach specialist tools to specialist agents only when needed
- attach the imported flow tool to `Wafer Response Planner`
- let the flow call monitor, diagnosis, compliance, and approved tools in order

That gives you one clean front door instead of relying on free-form collaborator selection.

## Environment variables

The checked-in `.env` file contains placeholders for:
- watsonx Orchestrate instance and auth
- the four agent IDs and names
- downstream action-system API endpoints and bearer tokens
- the OpenAPI backend base URL exposed to Orchestrate

Keep real secrets only in the local `.env`.
