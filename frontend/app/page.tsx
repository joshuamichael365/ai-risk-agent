"use client";

import { useEffect, useState } from "react";

type RiskPoint = {
  time: string;
  risk: number;
  wafers: number;
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

const severityStyle = {
  low: "bg-emerald-400/20 text-emerald-100 border border-emerald-300/40",
  medium: "bg-amber-400/20 text-amber-100 border border-amber-300/40",
  high: "bg-orange-400/20 text-orange-100 border border-orange-300/40",
  critical: "bg-rose-400/20 text-rose-100 border border-rose-300/40",
};

const statusStyle = {
  Normal: "bg-emerald-500/20 text-emerald-100 border border-emerald-400/40",
  Reviewing: "bg-cyan-500/20 text-cyan-100 border border-cyan-400/40",
  Escalated: "bg-rose-500/20 text-rose-100 border border-rose-400/40",
  Actioned: "bg-blue-500/20 text-blue-100 border border-blue-400/40",
};

type RiskResponse = {
  summary: {
    currentRisk: string;
    defectCandidates: number;
    actionedByAgent: number;
    modelConfidence: string;
  };
  riskPoints: RiskPoint[];
  recentWafers: WaferRow[];
};

type ActionResponse = {
  actionQueue: ActionItem[];
  workflowCount: number;
  workflowSummary: {
    casesRequiringApproval: number;
    openActionPlans: number;
    lotsPendingHoldReview: number;
    engineeringTicketsRecommended: number;
  };
};

type DashboardSnapshot = {
  risk: RiskResponse;
  actions: ActionResponse;
  generatedAt: string;
};

const emptyRiskResponse: RiskResponse = {
  summary: {
    currentRisk: "0.0",
    defectCandidates: 0,
    actionedByAgent: 0,
    modelConfidence: "0%",
  },
  riskPoints: [],
  recentWafers: [],
};

const emptyActionResponse: ActionResponse = {
  actionQueue: [],
  workflowCount: 0,
  workflowSummary: {
    casesRequiringApproval: 0,
    openActionPlans: 0,
    lotsPendingHoldReview: 0,
    engineeringTicketsRecommended: 0,
  },
};

function TrendChart({ riskPoints }: { riskPoints: RiskPoint[] }) {
  if (riskPoints.length === 0) {
    return (
      <div className="panel">
        <h2 className="panel-header">Live Risk Score Trend</h2>
        <div className="panel-body text-sm text-slate-400">No prediction files found yet.</div>
      </div>
    );
  }

  const maxRisk = 100;
  const width = 620;
  const height = 220;
  const padX = 40;
  const padY = 20;
  const plotW = width - padX * 2;
  const plotH = height - padY * 2;
  const step = plotW / (riskPoints.length - 1);
  const latestRisk = riskPoints[riskPoints.length - 1]?.risk ?? 0;
  const previousRisk = riskPoints[riskPoints.length - 2]?.risk ?? latestRisk;
  const delta = latestRisk - previousRisk;
  const deltaLabel = `${delta >= 0 ? "+" : ""}${delta}`;

  const linePath = riskPoints
    .map((point, index) => {
      const x = padX + step * index;
      const y = padY + (maxRisk - point.risk) * (plotH / maxRisk);
      return `${index === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");

  const areaPath = `${linePath} L ${padX + step * (riskPoints.length - 1)} ${height - padY} L ${padX} ${
    height - padY
  } Z`;

  const maxWafers = Math.max(...riskPoints.map((point) => point.wafers));

  return (
    <div className="panel">
      <div className="panel-header flex items-center justify-between gap-3">
        <div>
          <h2>Live Risk Score Trend</h2>
          <p className="mt-1 text-xs font-normal text-slate-400">
            Latest 12 prediction events feeding the current risk signal
          </p>
        </div>
        <div className="text-right">
          <div className="text-2xl font-semibold text-cyan-200">{latestRisk}</div>
          <div
            className={`text-xs ${
              delta > 0 ? "text-rose-300" : delta < 0 ? "text-emerald-300" : "text-slate-400"
            }`}
          >
            {deltaLabel} vs previous event
          </div>
        </div>
      </div>
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
          <path d={areaPath} fill="url(#riskArea)" opacity="0.9" />
          <path d={linePath} fill="none" stroke="#38bdf8" strokeWidth="4" />
          <defs>
            <linearGradient id="riskArea" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.35" />
              <stop offset="100%" stopColor="#38bdf8" stopOpacity="0.02" />
            </linearGradient>
          </defs>
          {riskPoints.map((point, index) => {
            const x = padX + step * index;
            const y = padY + (maxRisk - point.risk) * (plotH / maxRisk);
            const barH = (point.wafers / maxWafers) * 40;
            return (
              <g key={`${point.time}-${index}`}>
                <circle cx={x} cy={y} r={index === riskPoints.length - 1 ? "6.5" : "4.5"} fill="#0ea5e9" />
                <circle
                  cx={x}
                  cy={y}
                  r={index === riskPoints.length - 1 ? "10" : "0"}
                  fill="#38bdf8"
                  opacity="0.18"
                />
                <rect
                  x={x - 10}
                  y={height - padY}
                  width="20"
                  height={-barH}
                  fill="#22c55e"
                  opacity="0.3"
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

export default function HomePage() {
  const [riskData, setRiskData] = useState<RiskResponse>(emptyRiskResponse);
  const [actionData, setActionData] = useState<ActionResponse>(emptyActionResponse);
  const [connectionState, setConnectionState] = useState<"connecting" | "live" | "offline">("connecting");

  useEffect(() => {
    const eventSource = new EventSource("/api/dashboard/stream");

    eventSource.addEventListener("dashboard-ready", () => {
      setConnectionState("live");
    });

    eventSource.addEventListener("dashboard-update", (event) => {
      try {
        const snapshot = JSON.parse((event as MessageEvent).data) as DashboardSnapshot;
        setRiskData(snapshot.risk);
        setActionData(snapshot.actions);
        setConnectionState("live");
      } catch (error) {
        console.error("Failed to parse dashboard stream update", error);
      }
    });

    eventSource.addEventListener("dashboard-error", (event) => {
      console.error("Dashboard stream error payload", (event as MessageEvent).data);
      setConnectionState("offline");
    });

    eventSource.onerror = () => {
      setConnectionState("offline");
    };

    return () => {
      eventSource.close();
    };
  }, []);

  return (
    <main className="min-h-screen bg-slate-950 px-4 pb-10 pt-6 text-slate-100 md:px-8">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-5">
        <header className="panel">
          <div className="panel-body">
            <p className="text-sm uppercase tracking-[0.2em] text-cyan-300">Wafer AI Risk Command Center</p>
            <h1 className="mt-2 text-3xl font-semibold text-slate-100">
              Wafer Image AI Monitoring
            </h1>
            <p className="mt-2 max-w-3xl text-sm text-slate-300">
              Pipeline preview: Wafer images → CNN defect prediction → risk score + defect type → actions by
              Watsonx Orchestrate → operator dashboard.
            </p>
            <div className="mt-4 inline-flex items-center gap-2 rounded-full border border-slate-700 bg-slate-900/70 px-3 py-1 text-xs text-slate-300">
              <span
                className={`h-2.5 w-2.5 rounded-full ${
                  connectionState === "live"
                    ? "bg-emerald-400"
                    : connectionState === "connecting"
                      ? "bg-amber-400"
                      : "bg-rose-400"
                }`}
              />
              {connectionState === "live"
                ? "Live dashboard stream connected"
                : connectionState === "connecting"
                  ? "Connecting to live dashboard stream"
                  : "Live stream disconnected"}
            </div>
          </div>
        </header>

        <section className="grid grid-cols-1 gap-4 md:grid-cols-4">
          <KpiCard
            label="Cases Requiring Approval"
            value={String(actionData.workflowSummary.casesRequiringApproval)}
            subtext="Workflow cases waiting on human approval"
          />
          <KpiCard
            label="Open Action Plans"
            value={String(actionData.workflowSummary.openActionPlans)}
            subtext="Workflow outputs with planned next steps"
          />
          <KpiCard
            label="Lots Pending Hold Review"
            value={String(actionData.workflowSummary.lotsPendingHoldReview)}
            subtext="Cases mentioning lot hold or containment review"
          />
          <KpiCard
            label="Engineering Tickets Recommended"
            value={String(actionData.workflowSummary.engineeringTicketsRecommended)}
            subtext={`${actionData.workflowCount} workflow outputs detected`}
          />
        </section>

        <section className="grid gap-5 xl:grid-cols-[1.75fr_1fr]">
          <div className="space-y-5">
            <TrendChart riskPoints={riskData.riskPoints} />
            <div className="panel">
              <h2 className="panel-header">Recent Wafer Predictions</h2>
              <div className="panel-body overflow-x-auto">
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
                    {riskData.recentWafers.map((row) => (
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
                    {riskData.recentWafers.length === 0 ? (
                      <tr>
                        <td className="py-6 text-sm text-slate-400" colSpan={6}>
                          Run `backend/predict_to_json.py` first to generate wafer prediction files.
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <div className="space-y-5">
            <div className="panel">
              <h2 className="panel-header">Action Queue</h2>
              <div className="panel-body flex flex-col gap-3">
                {actionData.actionQueue.map((action, index) => (
                  <div
                    key={`${action.source}-${action.title}-${index}`}
                    className="rounded-lg border border-slate-700 bg-slate-900 p-3"
                  >
                    <p className="text-sm text-slate-100">{action.title}</p>
                    <p className="mt-1 text-xs text-slate-300">Source: {action.source}</p>
                    <div className="mt-2 flex items-center justify-between">
                      <span className="text-xs text-slate-400">ETA: {action.eta}</span>
                      <span className={`rounded-full px-2.5 py-1 text-xs ${severityStyle[action.severity]}`}>
                        {action.severity}
                      </span>
                    </div>
                  </div>
                ))}
                {actionData.actionQueue.length === 0 ? (
                  <p className="text-sm text-slate-400">
                    No workflow output files found yet. Drop watsonx Orchestrate results into
                    <code className="ml-1 rounded bg-slate-800 px-1 py-0.5">data/workflow_outputs</code>.
                  </p>
                ) : null}
              </div>
            </div>

            <div className="panel">
              <h2 className="panel-header">Live Connection</h2>
              <div className="panel-body text-sm text-slate-300">
                The dashboard now listens to a live server-sent event stream:
                <ul className="mt-2 list-disc space-y-1 pl-5">
                  <li>
                    <code className="rounded bg-slate-800 px-1 py-0.5">/api/dashboard/stream</code> pushes prediction and workflow updates
                  </li>
                  <li>
                    New files in <code className="rounded bg-slate-800 px-1 py-0.5">data/workflow_outputs</code> are reflected automatically
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
