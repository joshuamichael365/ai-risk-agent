from __future__ import annotations

from typing import Any

from ibm_watsonx_orchestrate.agent_builder.tools import tool


@tool
def create_case_log(case_id: str, summary: str, priority: str) -> dict[str, Any]:
    return {
        "case_log_created": True,
        "case_id": case_id,
        "summary": summary,
        "priority": priority,
    }


@tool
def create_engineering_ticket(
    case_id: str,
    owner: str,
    details: str,
) -> dict[str, Any]:
    return {
        "ticket_created": True,
        "case_id": case_id,
        "owner": owner,
        "details": details,
    }


@tool
def send_escalation_notification(
    case_id: str,
    recipients: list[str],
    message: str,
) -> dict[str, Any]:
    return {
        "notification_sent": True,
        "case_id": case_id,
        "recipients": recipients,
        "message": message,
    }


@tool
def request_metrology_review(
    wafer_id: str,
    lot_id: str,
    requested_checks: list[str],
    reason: str,
) -> dict[str, Any]:
    return {
        "request_created": True,
        "request_type": "metrology_review",
        "wafer_id": wafer_id,
        "lot_id": lot_id,
        "requested_checks": requested_checks,
        "reason": reason,
    }


@tool
def request_tool_inspection(
    tool_id: str,
    suspected_issue: str,
    severity: str,
    evidence: list[str],
) -> dict[str, Any]:
    return {
        "request_created": True,
        "request_type": "tool_inspection",
        "tool_id": tool_id,
        "suspected_issue": suspected_issue,
        "severity": severity,
        "evidence": evidence,
    }


@tool
def submit_lot_hold_request(
    lot_id: str,
    reason: str,
    severity: str,
    evidence: list[str],
) -> dict[str, Any]:
    return {
        "hold_request_submitted": True,
        "lot_id": lot_id,
        "reason": reason,
        "severity": severity,
        "evidence": evidence,
    }


@tool
def compare_recent_tool_history(
    tool_id: str,
    lookback_hours: int,
    defect_class: str = "",
) -> dict[str, Any]:
    return {
        "tool_id": tool_id,
        "lookback_hours": lookback_hours,
        "defect_class": defect_class,
        "recurrence_counts": 0,
        "affected_lots": [],
        "trend_summary": "Stub response. Replace with real backend lookup.",
    }


@tool
def export_rca_report(
    case_id: str,
    diagnosis_summary: str,
    compliance_summary: str,
) -> dict[str, Any]:
    return {
        "report_exported": True,
        "case_id": case_id,
        "diagnosis_summary": diagnosis_summary,
        "compliance_summary": compliance_summary,
    }
