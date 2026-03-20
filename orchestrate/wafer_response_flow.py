from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field

from ibm_watsonx_orchestrate.experimental.flow_builder.flows import flow


class WaferCaseInput(BaseModel):
    case_id: str
    wafer_id: str
    lot_id: str
    tool_id: str
    process_step: str
    wafer_map_summary: str
    spc_summary: str = ""
    tool_alarm_summary: str = ""
    lot_history_summary: str = ""
    proposed_actions: list[str] = Field(default_factory=list)


class WaferFlowOutput(BaseModel):
    monitor_result: dict[str, Any]
    diagnosis_result: dict[str, Any] | None = None
    compliance_result: dict[str, Any] | None = None
    actions_executed: list[dict[str, Any]] = Field(default_factory=list)
    final_recommendation: str


@flow(
    input_schema=WaferCaseInput,
    output_schema=WaferFlowOutput,
    name="wafer_response_flow",
)
def wafer_response_flow(aflow):
    """
    Scaffold flow for watsonx Orchestrate.

    Notes:
    - The exact agent reference syntax can vary by Orchestrate version.
    - Replace agent names with the exact import-time references used in your environment.
    - Start with this minimal sequence, then add conditional branches once the basic flow imports cleanly.
    """

    monitor = aflow.agent("Wafer Monitor Agent")
    diagnosis = aflow.agent("Wafer Diagnosis Agent")
    compliance = aflow.agent("Wafer Compliance Agent")

    create_case_log = aflow.tool("create_case_log")
    create_engineering_ticket = aflow.tool("create_engineering_ticket")
    send_escalation_notification = aflow.tool("send_escalation_notification")
    export_rca_report = aflow.tool("export_rca_report")

    aflow.sequence(
        aflow.START,
        monitor,
        diagnosis,
        compliance,
        create_case_log,
        create_engineering_ticket,
        send_escalation_notification,
        export_rca_report,
        aflow.END,
    )
