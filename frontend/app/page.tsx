type RiskPoint = {
  time: string;
  risk: number;
  wafers: number;
};

type DefectPoint = {
  type: string;
  count: number;
  color: string;
};

type WaferRow = {
  id: string;
  lot: string;
  risk: number;
  defectType: string;
  recommendation: string;
  status: "Normal" | "Reviewing" | "Escalated" | "Actioned";
};

type ActionItem = {
  title: string;
  source: string;
  severity: "low" | "medium" | "high" | "critical";
  eta: string;
};

type PredictionResult = {
  wafer_id: string;
  image_path: string;
  predicted_defect: string;
  confidence: number;
  defect_found: boolean;
  risk_level: string;
  recommended_actions: string[];
  timestamp: string;
};

type DashboardData = {
  riskPoints: RiskPoint[];
  defectBreakdown: DefectPoint[];
  recentWafers: WaferRow[];
  actionQueue: ActionItem[];
  currentRisk: string;
  defectCandidates: string;
  actionedCount: string;
  modelConfidence: string;
  backendStatus: string;
  backendMessage: string;
};

const severityStyle = {
  low: "bg-emerald-400/20 text-emerald-100 border border-emerald-300/40",
  medium: "bg-amber-400/20 text-amber-100 border border-amber-300/40",
  high: "bg-orange-400/20 text-orange-100 border border-orange-300/40",
  critical: "bg-rose-400/20 text-rose-100 border border-rose-300/40",
} satisfies Record<ActionItem["severity"], string>;

const statusStyle = {
  Normal: "bg-emerald-500/20 text-emerald-100 border border-emerald-400/40",
  Reviewing: "bg-cyan-500/20 text-cyan-100 border border-cyan-400/40",
  Escalated: "bg-rose-500/20 text-rose-100 border border-rose-400/40",
  Actioned: "bg-blue-500/20 text-blue-100 border border-blue-400/40",
} satisfies Record<WaferRow["status"], string>;

const defectColors = [
  "#38bdf8",
  "#34d399",
  "#f59e0b",
  "#fb7185",
  "#c084fc",
  "#22c55e",
];

function titleCase(value: string) {
  return value
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function riskToScore(riskLevel: string) {
  if (riskLevel === "high") return 92;
  if (riskLevel === "medium") return 67;
  if (riskLevel === "low") return 18;
  return 45;
}

function predictionStatus(prediction: PredictionResult): WaferRow["status"] {
  if (prediction.risk_level === "high") return "Escalated";
  if (prediction.risk_level === "medium") return "Reviewing";
  if (!prediction.defect_found) return "Normal";
  return "Actioned";
}

function actionSeverity(action: string, riskLevel: string): ActionItem["severity"] {
  if (action.includes("hold") || action.includes("ticket") || riskLevel === "high") return "critical";
  if (action.includes("notify") || action.includes("inspection")) return "high";
  if (action.includes("review")) return "medium";
  return "low";
}

function estimateEta(severity: ActionItem["severity"]) {
  if (severity === "critical") return "immediate";
  if (severity === "high") return "15 mins";
  if (severity === "medium") return "30 mins";
  return "1 hour";
}

function buildDashboardData(predictions: PredictionResult[], error?: string): DashboardData {
  const sortedPredictions = [...predictions].sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  const recent = sortedPredictions.slice(0, 8);

  const riskPoints = recent
    .slice()
    .reverse()
    .map((prediction, index, items) => {
      const time = new Date(prediction.timestamp).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      });
      return {
        time,
        risk: riskToScore(prediction.risk_level),
        wafers: Math.max(items.length - index, 1),
      };
    });

  const defectCounts = recent.reduce<Record<string, number>>((acc, prediction) => {
    const key = titleCase(prediction.predicted_defect);
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});

  const defectBreakdown = Object.entries(defectCounts).map(([type, count], index) => ({
    type,
    count,
    color: defectColors[index % defectColors.length],
  }));

  const recentWafers = recent.map((prediction) => ({
    id: prediction.wafer_id,
    lot: prediction.image_path.split("/").at(-2) ?? "Unassigned",
    risk: riskToScore(prediction.risk_level),
    defectType: titleCase(prediction.predicted_defect),
    recommendation: prediction.recommended_actions[0]?.replaceAll("_", " ") ?? "No recommendation",
    status: predictionStatus(prediction),
  }));

  const actionQueue = recent.flatMap((prediction) =>
    prediction.recommended_actions.slice(0, 2).map((action) => {
      const severity = actionSeverity(action, prediction.risk_level);
      return {
        title: `${titleCase(action)} for wafer ${prediction.wafer_id}`,
        source: `Model risk: ${prediction.risk_level}, confidence ${(prediction.confidence * 100).toFixed(1)}%`,
        severity,
        eta: estimateEta(severity),
      };
    }),
  ).slice(0, 6);

  const riskScores = sortedPredictions.map((prediction) => riskToScore(prediction.risk_level));
  const avgRisk = riskScores.length
    ? (riskScores.reduce((sum, value) => sum + value, 0) / riskScores.length).toFixed(1)
    : "0.0";

  const confidences = sortedPredictions.map((prediction) => prediction.confidence);
  const avgConfidence = confidences.length
    ? `${((confidences.reduce((sum, value) => sum + value, 0) / confidences.length) * 100).toFixed(1)}%`
    : "0.0%";

  return {
    riskPoints: riskPoints.length > 1 ? riskPoints : [{ time: "--:--", risk: 0, wafers: 0 }, { time: "--:--", risk: 0, wafers: 0 }],
    defectBreakdown,
    recentWafers,
    actionQueue,
    currentRisk: avgRisk,
    defectCandidates: `${sortedPredictions.filter((prediction) => prediction.defect_found).length}`,
    actionedCount: `${actionQueue.length}`,
    modelConfidence: avgConfidence,
    backendStatus: error ? "Degraded" : "Connected",
    backendMessage: error ?? `Loaded ${sortedPredictions.length} wafer predictions from the backend bridge.`,
  };
}

async function getDashboardData(): Promise<DashboardData> {
  const baseUrl =
    process.env.NEXT_PUBLIC_SITE_URL ??
    process.env.SITE_URL ??
    "http://127.0.0.1:3000";

  try {
    const response = await fetch(`${baseUrl}/api/dashboard`, {
      cache: "no-store",
    });

    const payload = (await response.json()) as {
      predictions?: PredictionResult[];
      error?: string;
    };

    if (!response.ok) {
      return buildDashboardData(payload.predictions ?? [], payload.error ?? "Dashboard API request failed.");
    }

    return buildDashboardData(payload.predictions ?? [], payload.error);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Frontend could not reach the dashboard API.";
    return buildDashboardData([], message);
  }
}

function TrendChart({ riskPoints }: { riskPoints: RiskPoint[] }) {
  const maxRisk = 100;
  const width = 620;
  const height = 220;
  const padX = 40;
  const padY = 20;
  const plotW = width - padX * 2;
  const plotH = height - padY * 2;
  const step = riskPoints.length > 1 ? plotW / (riskPoints.length - 1) : plotW;
  const linePath = riskPoints
    .map((point, index) => {
      const x = padX + step * index;
      const y = padY + (maxRisk - point.risk) * (plotH / maxRisk);
      return `${index === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");
  const maxWafers = Math.max(...riskPoints.map((point) => point.wafers), 1);

  return (
    <div className="panel">
      <h2 className="panel-header">Risk Trend (Latest Predictions)</h2>
      <div className="panel-body">
        <svg viewBox={`0 0 ${width} ${height}`} className="h-64 w-full">
          <rect x="0" y="0" width={width} height={height} fill="transparent" />
          <g stroke="#334155" strokeWidth="1">
            {Array.from({ length: 6 }).map((_, index) => {
              const y = padY + (index * plotH) / 5;
              const value = maxRisk - index * 20;
              return (
                <g key={value}>
                  <line x1={padX} y1={y} x2={width - padX} y2={y} />
                  <text x="6" y={y + 4} fill="#94a3b8" fontSize="10">
                    {value}
                  </text>
                </g>
              );
            })}
          </g>
          <path d={linePath} fill="none" stroke="#38bdf8" strokeWidth="3" />
          {riskPoints.map((point, index) => {
            const x = padX + step * index;
            const y = padY + (maxRisk - point.risk) * (plotH / maxRisk);
            const barH = (point.wafers / maxWafers) * 40;
            return (
              <g key={`${point.time}-${index}`}>
                <circle cx={x} cy={y} r="4.5" fill="#0ea5e9" />
                <rect
                  x={x - 10}
                  y={height - padY}
                  width="20"
                  height={-barH}
                  fill="#34d399"
                  opacity="0.55"
                />
                <text x={x} y={height - 4} fontSize="10" fill="#cbd5e1" textAnchor="middle">
                  {point.time}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}

function DefectBars({ defectBreakdown }: { defectBreakdown: DefectPoint[] }) {
  const totalDefects = defectBreakdown.reduce((acc, item) => acc + item.count, 0);

  return (
    <div className="panel">
      <h2 className="panel-header">Defect Distribution (Live Feed)</h2>
      <div className="panel-body space-y-3">
        {defectBreakdown.length === 0 ? (
          <p className="text-sm text-slate-400">No prediction data is available yet.</p>
        ) : (
          defectBreakdown.map((item) => {
            const widthPercent = Math.round((item.count / totalDefects) * 100);
            return (
              <div key={item.type}>
                <div className="mb-1 flex justify-between text-sm">
                  <span>{item.type}</span>
                  <span className="text-slate-200">{item.count}</span>
                </div>
                <div className="h-3 w-full rounded-full bg-slate-800">
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${widthPercent}%`, backgroundColor: item.color }}
                  />
                </div>
              </div>
            );
          })
        )}
        <p className="pt-2 text-xs text-slate-400">
          Total analyzed wafers in this view: {totalDefects}
        </p>
      </div>
    </div>
  );
}

function KpiCard({ label, value, subtext }: { label: string; value: string; subtext: string }) {
  return (
    <div className="panel">
      <div className="panel-header">{label}</div>
      <div className="panel-body">
        <p className="text-4xl font-semibold">{value}</p>
        <p className="mt-2 text-sm text-slate-300">{subtext}</p>
      </div>
    </div>
  );
}

export default async function HomePage() {
  const data = await getDashboardData();

  return (
    <main className="min-h-screen bg-slate-950 px-4 pb-10 pt-6 text-slate-100 md:px-8">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-5">
        <header className="panel">
          <div className="panel-body">
            <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
              <div>
                <p className="text-sm uppercase tracking-[0.2em] text-cyan-300">Wafer AI Risk Command Center</p>
                <h1 className="mt-2 text-3xl font-semibold text-slate-100">
                  Wafer Image AI Monitoring
                </h1>
                <p className="mt-2 max-w-3xl text-sm text-slate-300">
                  Live pipeline: Backend wafer predictions feed the dashboard, then watsonx Orchestrate can
                  turn the same normalized case payload into agent actions.
                </p>
              </div>
              <div className="rounded-xl border border-slate-700 bg-slate-900/80 px-4 py-3 text-sm">
                <p className="text-slate-400">Backend bridge</p>
                <p className="mt-1 font-medium text-cyan-200">{data.backendStatus}</p>
              </div>
            </div>
          </div>
        </header>

        <section className="grid grid-cols-1 gap-4 md:grid-cols-4">
          <KpiCard
            label="Current Risk"
            value={data.currentRisk}
            subtext="Average risk score derived from recent saved predictions"
          />
          <KpiCard label="Defect Candidates" value={data.defectCandidates} subtext="Predictions with a detected defect" />
          <KpiCard label="Action Queue" value={data.actionedCount} subtext="Top recommended actions surfaced from backend results" />
          <KpiCard label="Model Confidence" value={data.modelConfidence} subtext="Average confidence across loaded predictions" />
        </section>

        <section className="grid gap-5 xl:grid-cols-[1.75fr_1fr]">
          <div className="space-y-5">
            <TrendChart riskPoints={data.riskPoints} />
            <div className="panel">
              <h2 className="panel-header">Recent Wafer Predictions</h2>
              <div className="panel-body overflow-x-auto">
                {data.recentWafers.length === 0 ? (
                  <p className="text-sm text-slate-400">No saved wafer predictions were returned by the backend.</p>
                ) : (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-slate-300">
                        <th className="pb-3 pr-2">Wafer ID</th>
                        <th className="pb-3 pr-2">Lot</th>
                        <th className="pb-3 pr-2">Risk Score</th>
                        <th className="pb-3 pr-2">Defect Type</th>
                        <th className="pb-3 pr-2">Recommendation</th>
                        <th className="pb-3 pr-2">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.recentWafers.map((row) => (
                        <tr key={row.id} className="border-t border-slate-800">
                          <td className="py-3 pr-2 font-medium">{row.id}</td>
                          <td className="py-3 pr-2">{row.lot}</td>
                          <td className="py-3 pr-2 font-semibold text-cyan-200">{row.risk}</td>
                          <td className="py-3 pr-2">{row.defectType}</td>
                          <td className="py-3 pr-2">{row.recommendation}</td>
                          <td className="py-3 pr-2">
                            <span className={`rounded-full px-2.5 py-1 text-xs ${statusStyle[row.status]}`}>
                              {row.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </div>

          <div className="space-y-5">
            <DefectBars defectBreakdown={data.defectBreakdown} />
            <div className="panel">
              <h2 className="panel-header">Action Queue</h2>
              <div className="panel-body flex flex-col gap-3">
                {data.actionQueue.length === 0 ? (
                  <p className="text-sm text-slate-400">No actions are available until prediction data arrives.</p>
                ) : (
                  data.actionQueue.map((action) => (
                    <div key={action.title} className="rounded-lg border border-slate-700 bg-slate-900 p-3">
                      <p className="text-sm text-slate-100">{action.title}</p>
                      <p className="mt-1 text-xs text-slate-300">Source: {action.source}</p>
                      <div className="mt-2 flex items-center justify-between">
                        <span className="text-xs text-slate-400">ETA: {action.eta}</span>
                        <span className={`rounded-full px-2.5 py-1 text-xs ${severityStyle[action.severity]}`}>
                          {action.severity}
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="panel">
              <h2 className="panel-header">Backend Status</h2>
              <div className="panel-body text-sm text-slate-300">
                <p>{data.backendMessage}</p>
                <p className="mt-3 text-xs text-slate-400">
                  The frontend calls its own dashboard route, which proxies the backend prediction bridge instead of
                  relying on hardcoded mock values.
                </p>
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
