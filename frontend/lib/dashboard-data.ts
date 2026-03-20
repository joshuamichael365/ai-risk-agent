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

const DEFECT_COLORS: Record<string, string> = {
  Scratch: "#fb7185",
  Random: "#f59e0b",
  "Edge-Ring": "#38bdf8",
  "Edge-Loc": "#38bdf8",
  Donut: "#34d399",
  Center: "#a78bfa",
  Loc: "#22c55e",
  "Near-full": "#ef4444",
  None: "#94a3b8",
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

function normalizeWorkflowRecord(workflow?: WorkflowRecord) {
  if (!workflow) {
    return undefined;
  }

  const parsed = workflow.parsed_result ?? {};
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

export async function getPredictionRecords(): Promise<PredictionRecord[]> {
  return readJsonFiles<PredictionRecord>(path.join(repoRoot(), "data", "sample_outputs"));
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

  const recentWafers: WaferRow[] = predictions.slice(0, 8).map((prediction) => {
    const workflow = normalizeWorkflowRecord(workflowByWafer.get(prediction.wafer_id));
    const risk = safeRoundRisk(prediction.confidence, prediction.risk_level);
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

  const groupedByHour = new Map<string, { riskTotal: number; wafers: number }>();
  for (const prediction of predictions) {
    const hour = new Date(prediction.timestamp).toISOString().slice(11, 16);
    const current = groupedByHour.get(hour) ?? { riskTotal: 0, wafers: 0 };
    current.riskTotal += safeRoundRisk(prediction.confidence, prediction.risk_level);
    current.wafers += 1;
    groupedByHour.set(hour, current);
  }

  const riskPoints: RiskPoint[] = [...groupedByHour.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-8)
    .map(([time, value]) => ({
      time,
      risk: Math.round(value.riskTotal / value.wafers),
      wafers: value.wafers,
    }));

  const defectCounts = new Map<string, number>();
  for (const prediction of predictions) {
    const defectType = formatDefect(prediction.predicted_defect);
    defectCounts.set(defectType, (defectCounts.get(defectType) ?? 0) + 1);
  }

  const defectBreakdown: DefectPoint[] = [...defectCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([type, count]) => ({
      type,
      count,
      color: DEFECT_COLORS[type] ?? "#94a3b8",
    }));

  const actionedCount = recentWafers.filter((row) => row.status === "Actioned").length;
  const averageRisk =
    recentWafers.length > 0
      ? (recentWafers.reduce((sum, row) => sum + row.risk, 0) / recentWafers.length).toFixed(1)
      : "0.0";
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
      currentRisk: averageRisk,
      defectCandidates: predictions.length,
      actionedByAgent: actionedCount,
      modelConfidence: confidenceMedian,
    },
    riskPoints,
    defectBreakdown,
    recentWafers,
  };
}

export async function buildActionQueueResponse() {
  const workflows = await getWorkflowRecords();
  const actionQueue: ActionItem[] = workflows.flatMap((record) => {
    const workflow = normalizeWorkflowRecord(record);
    if (!workflow) {
      return [];
    }

    const plan = workflow.action_plan ?? [];
    if (plan.length > 0) {
      return plan.map((item) => ({
        title: item.title ?? "Planned wafer response action",
        source: workflow.case_id ? `Workflow ${workflow.case_id}` : "Workflow output",
        severity: item.severity ?? "medium",
        eta: workflow.approval_required ? "awaiting approval" : "ready",
      }));
    }

    if (workflow.final_recommendation) {
      return [
        {
          title: workflow.final_recommendation,
          source: workflow.case_id ? `Workflow ${workflow.case_id}` : "Workflow output",
          severity: workflow.approval_required ? "high" : "medium",
          eta: workflow.approval_required ? "awaiting approval" : "ready",
        },
      ];
    }

    return [];
  });

  return {
    actionQueue: actionQueue.slice(0, 8),
    workflowCount: workflows.length,
  };
}
