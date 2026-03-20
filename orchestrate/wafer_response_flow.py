from typing import Any

from pydantic import BaseModel, Field

from ibm_watsonx_orchestrate.flow_builder.flows import flow, START, END
from ibm_watsonx_orchestrate.flow_builder.flows.flow import Flow


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
    description="Run wafer triage, diagnosis, compliance review, and follow-up actions.",
)
def wafer_response_flow(aflow: Flow) -> Flow:
    """Coordinate the wafer response workflow across agents and tools."""

    monitor = aflow.agent(
        name="monitor",
        agent="Wafer Monitor Agent",
        display_name="monitor",
        description="Run wafer triage first and decide whether escalation is needed.",
    )
    diagnosis = aflow.agent(
        name="diagnosis",
        agent="Wafer Diagnosis Agent",
        display_name="diagnosis",
        description="Run defect classification and engineering hypothesis generation.",
    )
    compliance = aflow.agent(
        name="compliance",
        agent="Wafer Compliance Agent",
        display_name="compliance",
        description="Review proposed actions before any execution occurs.",
    )

    create_case_log = aflow.tool("create_case_log")
    create_engineering_ticket = aflow.tool("create_engineering_ticket")
    send_escalation_notification = aflow.tool("send_escalation_notification")
    export_rca_report = aflow.tool("export_rca_report")

    aflow.sequence(
        START,
        monitor,
        diagnosis,
        compliance,
        create_case_log,
        create_engineering_ticket,
        send_escalation_notification,
        export_rca_report,
        END,
    )

    return aflow