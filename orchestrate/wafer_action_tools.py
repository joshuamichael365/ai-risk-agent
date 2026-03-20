from __future__ import annotations

from typing import Any

from ibm_watsonx_orchestrate.agent_builder.tools import tool


@tool
def create_case_log(case_id: str, summary: str, priority: str) -> dict[str, Any]:
    """Create a wafer defect case log entry.

    Args:
        case_id: Unique identifier for the wafer defect case.
        summary: Short summary of the issue being recorded.
        priority: Requested priority level for the case log.

    Returns:
        A dictionary confirming the created case log payload.
    """
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
    """Create an engineering ticket for wafer issue follow-up.

    Args:
        case_id: Unique identifier for the wafer defect case.
        owner: Team or engineer responsible for the ticket.
        details: Detailed issue description for the engineering team.

    Returns:
        A dictionary confirming the created engineering ticket payload.
    """
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
    """Send an escalation notification for a wafer defect case.

    Args:
        case_id: Unique identifier for the wafer defect case.
        recipients: List of recipients who should receive the notification.
        message: Notification message content.

    Returns:
        A dictionary confirming the notification payload.
    """
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
    """Create a metrology review request for a wafer.

    Args:
        wafer_id: Unique wafer identifier.
        lot_id: Lot identifier associated with the wafer.
        requested_checks: List of metrology checks to perform.
        reason: Reason for requesting the metrology review.

    Returns:
        A dictionary confirming the metrology review request payload.
    """
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
    """Create a tool inspection request for suspected equipment issues.

    Args:
        tool_id: Identifier of the manufacturing tool to inspect.
        suspected_issue: Short description of the suspected tool issue.
        severity: Severity level of the suspected issue.
        evidence: Supporting evidence such as alarms, logs, or observations.

    Returns:
        A dictionary confirming the tool inspection request payload.
    """
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
    """Submit a request to place a manufacturing lot on hold.

    Args:
        lot_id: Identifier of the lot to hold.
        reason: Business or quality reason for the hold request.
        severity: Severity level associated with the hold request.
        evidence: Supporting evidence for the hold decision.

    Returns:
        A dictionary confirming the lot hold request payload.
    """
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
    """Compare recent tool history to identify similar defect patterns.

    Args:
        tool_id: Identifier of the manufacturing tool.
        lookback_hours: Number of hours to look back in recent history.
        defect_class: Optional defect class to filter historical cases.

    Returns:
        A dictionary summarizing recurrence counts, affected lots, and trend signals.
    """
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
    """Export a root cause analysis report for a wafer case.

    Args:
        case_id: Unique identifier for the wafer defect case.
        diagnosis_summary: Summary of the diagnosis findings.
        compliance_summary: Summary of the compliance review findings.

    Returns:
        A dictionary confirming the RCA report export payload.
    """
    return {
        "report_exported": True,
        "case_id": case_id,
        "diagnosis_summary": diagnosis_summary,
        "compliance_summary": compliance_summary,
    }