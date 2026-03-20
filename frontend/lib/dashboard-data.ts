import { promises as fs } from "fs";
import path from "path";

export type Severity = "low" | "medium" | "high" | "critical";
export type WaferStatus = "Normal" | "Reviewing" | "Escalated" | "Actioned";

export type PredictionRecord = {
  wafer_id: string;
  image_path: string;
  predicted_defect: string;
  confidence: number;
  defect_found: boolean;
  risk_level: string;
  recommended_actions: string[];
  timestamp: string;
};

export type WorkflowRecord = {
  case_id?: string;
  wafer_id?: string;
  lot_id?: string;
  final_status?: {
    completed_at?: string;
    result?: {
      data?: {
        message?: {
          content?: Array<{ text?: string }>;
        };
      };
    };
  };
  final_recommendation?: string;
  approval_required?: boolean;
  next_human_owner?: string;
  execution_summary?: string;
  action_plan?: Array<{ title?: string; severity?: Severity }>;
  actions_executed?: Array<Record<string, unknown>>;
  monitor_result?: { recommended_priority?: string; summary?: string };
  diagnosis_result?: { predicted_defect?: string };
  compliance_result?: { compliance_status?: string };
  parsed_result?: {
    final_recommendation?: string;
    approval_required?: boolean;
    next_human_owner?: string;
    execution_summary?: string;
    action_plan?: Array<{ title?: string; severity?: Severity }>;
    actions_executed?: Array<Record<string, unknown>>;
    monitor_result?: { recommended_priority?: string; summary?: string };
    diagnosis_result?: { predicted_defect?: string };
    compliance_result?: { compliance_status?: string };
  };
};

type NormalizedActionPlanItem = {
  title: string;
  severity: Severity;
  eta: string;
  source: string;
};

type RiskEvent = {
  time: string;
  timestamp: string;
  risk: number;
  wafers: number;
};

export type RiskPoint = {
  time: string;
  risk: number;
  wafers: number;
};

export type DefectPoint = {
  type: string;
  count: number;
  color: string;
};

export type WaferRow = {
  id: string;
  lot: string;
  risk: number;
  defectType: string;
  recommendation: string;
  status: WaferStatus;
};

export type ActionItem = {
  title: string;
  source: string;
  severity: Severity;
  eta: string;
};

export type WorkflowSummary = {
  casesRequiringApproval: number;
  openActionPlans: number;
  lotsPendingHoldReview: number;
  engineeringTicketsRecommended: number;
};

function repoRoot(): string {
  return path.resolve(process.cwd(), "..");
}

function safeRoundRisk(confidence: number, riskLevel: string): number {
  const multiplier =
    riskLevel === "high" ? 1 :
    riskLevel === "medium" ? 0.72 :
    riskLevel === "review" ? 0.5 :
    0.2;
  return Math.round(confidence * 100 * multiplier);
}

function formatDefect(defect: string): string {
  const mapping: Record<string, string> = {
    center: "Center",
    donut: "Donut",
    "edge-local": "Edge-Loc",
    "edge-ring": "Edge-Ring",
    local: "Loc",
    "near-full": "Near-full",
    none: "None",
    random: "Random",
    scratch: "Scratch",
  };
  return mapping[defect.toLowerCase()] ?? defect;
}

function statusFromRecords(prediction: PredictionRecord, workflow?: WorkflowRecord): WaferStatus {
  const normalized = normalizeWorkflowRecord(workflow);
  if (normalized?.actions_executed?.length) {
    return "Actioned";
  }
  if (normalized?.approval_required || prediction.risk_level === "high") {
    return "Escalated";
  }
  if (prediction.risk_level === "review" || prediction.risk_level === "medium") {
    return "Reviewing";
  }
  return "Normal";
}

async function readJsonFiles<T>(dirPath: string): Promise<T[]> {
  try {
    const files = (await fs.readdir(dirPath))
      .filter((file) => file.endsWith(".json"))
      .sort()
      .reverse();

    const records = await Promise.all(
      files.map(async (file) => {
        const raw = await fs.readFile(path.join(dirPath, file), "utf8");
        return JSON.parse(raw) as T;
      }),
    );

    return records;
  } catch {
    return [];
  }
}

function extractParsedResultFromFinalStatus(workflow?: WorkflowRecord) {
  const parts = workflow?.final_status?.result?.data?.message?.content;
  if (!Array.isArray(parts)) {
    return undefined;
  }

  for (const part of parts) {
    if (typeof part?.text === "string" && part.text.trim()) {
      try {
        return JSON.parse(part.text);
      } catch {
        return undefined;
      }
    }
  }

  return undefined;
}

function normalizeWorkflowRecord(workflow?: WorkflowRecord) {
  if (!workflow) {
    return undefined;
  }

  const parsed = workflow.parsed_result ?? extractParsedResultFromFinalStatus(workflow) ?? {};
  return {
    ...parsed,
    ...workflow,
    final_recommendation: workflow.final_recommendation ?? parsed.final_recommendation,
    approval_required: workflow.approval_required ?? parsed.approval_required,
    next_human_owner: workflow.next_human_owner ?? parsed.next_human_owner,
    execution_summary: workflow.execution_summary ?? parsed.execution_summary,
    action_plan: workflow.action_plan ?? parsed.action_plan ?? [],
    actions_executed: workflow.actions_executed ?? parsed.actions_executed ?? [],
    monitor_result: workflow.monitor_result ?? parsed.monitor_result,
    diagnosis_result: workflow.diagnosis_result ?? parsed.diagnosis_result,
    compliance_result: workflow.compliance_result ?? parsed.compliance_result,
  };
}

function severityFromWorkflow(workflow: ReturnType<typeof normalizeWorkflowRecord>): Severity {
  if (!workflow) {
    return "medium";
  }

  const approval = workflow.approval_required;
  if (Array.isArray(approval) && approval.length > 0) {
    return "high";
  }
  if (approval === true) {
    return "high";
  }

  const recommendation = (workflow.final_recommendation ?? "").toLowerCase();
  if (recommendation.includes("urgent") || recommendation.includes("critical")) {
    return "critical";
  }
  if (recommendation.includes("hold") || recommendation.includes("inspection")) {
    return "high";
  }

  return "medium";
}

function normalizeActionPlanItems(
  workflow: ReturnType<typeof normalizeWorkflowRecord>,
): NormalizedActionPlanItem[] {
  if (!workflow) {
    return [];
  }

  const severity = severityFromWorkflow(workflow);

  return (workflow.action_plan ?? []).map((item) => {
    const actionType =
      (item as Record<string, unknown>).action_type ??
      (item as Record<string, unknown>).action ??
      "workflow_action";
    const details =
      typeof (item as Record<string, unknown>).details === "object" &&
      (item as Record<string, unknown>).details !== null
        ? ((item as Record<string, unknown>).details as Record<string, unknown>)
        : {};
    const explicitReason =
      typeof (item as Record<string, unknown>).reason === "string"
        ? ((item as Record<string, unknown>).reason as string)
        : "";

    const title =
      (typeof details.title === "string" && details.title) ||
      (typeof details.message === "string" && details.message) ||
      explicitReason ||
      String(actionType).replaceAll("_", " ");

    const status =
      typeof (item as Record<string, unknown>).status === "string"
        ? ((item as Record<string, unknown>).status as string)
        : "";

    return {
      title,
      severity,
      eta: status.includes("blocked") ? "awaiting approval" : "ready",
      source: workflow.case_id ? `Workflow ${workflow.case_id}` : "Workflow output",
    };
  });
}

function riskFromWorkflow(
  prediction: PredictionRecord,
  workflow: ReturnType<typeof normalizeWorkflowRecord>,
): number {
  let risk = safeRoundRisk(prediction.confidence, prediction.risk_level);
  if (!workflow) {
    return risk;
  }

  const serializedPlan = JSON.stringify(workflow.action_plan ?? []).toLowerCase();
  const recommendation = (workflow.final_recommendation ?? "").toLowerCase();
  const approval = workflow.approval_required;

  if (approval === true || (Array.isArray(approval) && approval.length > 0)) {
    risk += 12;
  }
  if (serializedPlan.includes("hold_lot") || serializedPlan.includes("hold lot") || recommendation.includes("hold")) {
    risk += 18;
  }
  if (
    serializedPlan.includes("tool_inspection") ||
    serializedPlan.includes("engineering_ticket") ||
    serializedPlan.includes("open_engineering_ticket")
  ) {
    risk += 8;
  }

  return Math.min(risk, 100);
}

export async function getPredictionRecords(): Promise<PredictionRecord[]> {
  const records = await readJsonFiles<PredictionRecord>(path.join(repoRoot(), "data", "sample_outputs"));
  return records.sort((a, b) => {
    const timeA = new Date(a.timestamp).getTime();
    const timeB = new Date(b.timestamp).getTime();
    return timeB - timeA;
  });
}

export async function getWorkflowRecords(): Promise<WorkflowRecord[]> {
  return readJsonFiles<WorkflowRecord>(path.join(repoRoot(), "data", "workflow_outputs"));
}

export async function buildRiskEventsResponse() {
  const predictions = await getPredictionRecords();
  const workflows = await getWorkflowRecords();
  const workflowByWafer = new Map(
    workflows
      .filter((record) => record.wafer_id)
      .map((record) => [record.wafer_id as string, record]),
  );

  const prioritizedPredictions = [...predictions].sort((a, b) => {
    const aHasWorkflow = workflowByWafer.has(a.wafer_id) ? 1 : 0;
    const bHasWorkflow = workflowByWafer.has(b.wafer_id) ? 1 : 0;
    if (aHasWorkflow !== bHasWorkflow) {
      return bHasWorkflow - aHasWorkflow;
    }
    return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
  });

  const recentWafers: WaferRow[] = prioritizedPredictions.slice(0, 8).map((prediction) => {
    const workflow = normalizeWorkflowRecord(workflowByWafer.get(prediction.wafer_id));
    const risk = riskFromWorkflow(prediction, workflow);
    return {
      id: prediction.wafer_id,
      lot: workflow?.lot_id ?? `LOT-${prediction.wafer_id.slice(-4).toUpperCase()}`,
      risk,
      defectType: formatDefect(prediction.predicted_defect),
      recommendation:
        workflow?.final_recommendation ??
        prediction.recommended_actions.join(", ").replaceAll("_", " "),
      status: statusFromRecords(prediction, workflow),
    };
  });

  const riskEvents: RiskEvent[] = predictions.flatMap((prediction) => {
    const workflow = normalizeWorkflowRecord(workflowByWafer.get(prediction.wafer_id));
    const events: RiskEvent[] = [
      {
        time: new Date(prediction.timestamp).toISOString().slice(11, 16),
        timestamp: prediction.timestamp,
        risk: safeRoundRisk(prediction.confidence, prediction.risk_level),
        wafers: 1,
      },
    ];

    const completedAt = workflowByWafer.get(prediction.wafer_id)?.final_status?.completed_at;
    if (workflow && completedAt) {
      events.push({
        time: new Date(completedAt).toISOString().slice(11, 16),
        timestamp: completedAt,
        risk: riskFromWorkflow(prediction, workflow),
        wafers: 1,
      });
    }

    return events;
  });

  const riskPoints: RiskPoint[] = riskEvents
    .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
    .slice(-12)
    .map((event) => ({
      time: event.time,
      risk: event.risk,
      wafers: event.wafers,
    }));

  const defectCounts = new Map<string, number>();
  for (const prediction of predictions) {
    const defectType = formatDefect(prediction.predicted_defect);
    defectCounts.set(defectType, (defectCounts.get(defectType) ?? 0) + 1);
  }

  const actionedCount = recentWafers.filter((row) => row.status === "Actioned").length;
  const currentRisk = riskPoints.length > 0 ? riskPoints[riskPoints.length - 1].risk.toFixed(1) : "0.0";
  const confidenceMedian =
    predictions.length > 0
      ? `${Math.round(
          [...predictions]
            .map((item) => item.confidence)
            .sort((a, b) => a - b)[Math.floor(predictions.length / 2)] * 100,
        )}%`
      : "0%";

  return {
    summary: {
      currentRisk,
      defectCandidates: predictions.length,
      actionedByAgent: actionedCount,
      modelConfidence: confidenceMedian,
    },
    riskPoints,
    recentWafers,
  };
}

export async function buildActionQueueResponse() {
  const workflows = await getWorkflowRecords();
  let casesRequiringApproval = 0;
  let openActionPlans = 0;
  let lotsPendingHoldReview = 0;
  let engineeringTicketsRecommended = 0;

  const actionQueue: ActionItem[] = workflows.flatMap((record) => {
    const workflow = normalizeWorkflowRecord(record);
    if (!workflow) {
      return [];
    }

    const approval = workflow.approval_required;
    if (approval === true || (Array.isArray(approval) && approval.length > 0)) {
      casesRequiringApproval += 1;
    }

    const plan = normalizeActionPlanItems(workflow);
    if (plan.length > 0) {
      openActionPlans += 1;
    }

    const serializedPlan = JSON.stringify(workflow.action_plan ?? []).toLowerCase();
    const recommendation = (workflow.final_recommendation ?? "").toLowerCase();

    if (serializedPlan.includes("hold_lot") || serializedPlan.includes("hold lot") || recommendation.includes("hold")) {
      lotsPendingHoldReview += 1;
    }

    if (
      serializedPlan.includes("engineering_ticket") ||
      serializedPlan.includes("open_engineering_ticket") ||
      recommendation.includes("engineering ticket")
    ) {
      engineeringTicketsRecommended += 1;
    }

    if (plan.length > 0) {
      return plan;
    }

    if (workflow.final_recommendation) {
      return [
        {
          title: workflow.final_recommendation,
          source: workflow.case_id ? `Workflow ${workflow.case_id}` : "Workflow output",
          severity: severityFromWorkflow(workflow),
          eta:
            workflow.approval_required === true ||
            (Array.isArray(workflow.approval_required) && workflow.approval_required.length > 0)
              ? "awaiting approval"
              : "ready",
        },
      ];
    }

    return [];
  });

  return {
    actionQueue: actionQueue.slice(0, 8),
    workflowCount: workflows.length,
    workflowSummary: {
      casesRequiringApproval,
      openActionPlans,
      lotsPendingHoldReview,
      engineeringTicketsRecommended,
    },
  };
}

export async function buildDashboardSnapshot() {
  const [risk, actions] = await Promise.all([
    buildRiskEventsResponse(),
    buildActionQueueResponse(),
  ]);

  return {
    risk,
    actions,
    generatedAt: new Date().toISOString(),
  };
}
