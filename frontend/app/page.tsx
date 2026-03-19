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

const riskPoints: RiskPoint[] = [
  { time: "06:00", risk: 16, wafers: 74 },
  { time: "08:00", risk: 22, wafers: 80 },
  { time: "10:00", risk: 35, wafers: 93 },
  { time: "12:00", risk: 47, wafers: 89 },
  { time: "14:00", risk: 59, wafers: 85 },
  { time: "16:00", risk: 72, wafers: 81 },
  { time: "18:00", risk: 68, wafers: 88 },
];

const defectBreakdown: DefectPoint[] = [
  { type: "Scratch", count: 27, color: "#fb7185" },
  { type: "Particle", count: 31, color: "#f59e0b" },
  { type: "Edge", count: 18, color: "#38bdf8" },
  { type: "Pattern", count: 22, color: "#34d399" },
  { type: "Dark", count: 12, color: "#c084fc" },
];

const recentWafers: WaferRow[] = [
  {
    id: "WAF-2411",
    lot: "LOT-9901",
    risk: 78,
    defectType: "Scratch",
    recommendation: "Hold at CMP bay and inspect optical defect map",
    status: "Actioned",
  },
  {
    id: "WAF-2409",
    lot: "LOT-9899",
    risk: 62,
    defectType: "Particle",
    recommendation: "Shift to slower cassette speed for 15 mins",
    status: "Reviewing",
  },
  {
    id: "WAF-2405",
    lot: "LOT-9900",
    risk: 29,
    defectType: "Clean",
    recommendation: "Continue normal processing",
    status: "Normal",
  },
  {
    id: "WAF-2403",
    lot: "LOT-9888",
    risk: 94,
    defectType: "Pattern",
    recommendation: "Open urgent maintenance order for scanner",
    status: "Escalated",
  },
];

const actionQueue: ActionItem[] = [
  {
    title: "Trigger maintenance ticket on WAF-2403 line-4 optics station",
    source: "Agent rule: defect score > 90",
    severity: "critical",
    eta: "12 mins",
  },
  {
    title: "Recommend setpoint reduction for WAF-2409",
    source: "Agent policy: trend slope increase",
    severity: "high",
    eta: "20 mins",
  },
  {
    title: "Push alert to shift team for potential lot diversion",
    source: "Agent recommendation",
    severity: "medium",
    eta: "immediate",
  },
];

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

const totalDefects = defectBreakdown.reduce((acc, item) => acc + item.count, 0);

function TrendChart() {
  const maxRisk = 100;
  const width = 620;
  const height = 220;
  const padX = 40;
  const padY = 20;
  const plotW = width - padX * 2;
  const plotH = height - padY * 2;
  const step = plotW / (riskPoints.length - 1);

  const linePath = riskPoints
    .map((point, index) => {
      const x = padX + step * index;
      const y = padY + (maxRisk - point.risk) * (plotH / maxRisk);
      return `${index === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");

  const maxWafers = Math.max(...riskPoints.map((point) => point.wafers));

  return (
    <div className="panel">
      <h2 className="panel-header">Risk Trend (12h)</h2>
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
              <g key={point.time}>
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

function DefectBars() {
  return (
    <div className="panel">
      <h2 className="panel-header">Defect Distribution (Current Shift)</h2>
      <div className="panel-body space-y-3">
        {defectBreakdown.map((item) => {
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
        })}
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

export default function HomePage() {
  // TODO: Replace with API fetch: const response = await fetch("/api/risk-events")
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
          </div>
        </header>

        <section className="grid grid-cols-1 gap-4 md:grid-cols-4">
          <KpiCard
            label="Current Risk"
            value="71.8"
            subtext="AI score (0-100), rolling 30-min window"
          />
          <KpiCard label="Defect Candidates" value="132" subtext="Flagged wafers in this shift" />
          <KpiCard label="Actioned by Agent" value="9" subtext="3 critical, 2 high in progress" />
          <KpiCard label="Model Confidence" value="92.7%" subtext="CNN softmax confidence median" />
        </section>

        <section className="grid gap-5 xl:grid-cols-[1.75fr_1fr]">
          <div className="space-y-5">
            <TrendChart />
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
                    {recentWafers.map((row) => (
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
              </div>
            </div>
          </div>

          <div className="space-y-5">
            <DefectBars />
            <div className="panel">
              <h2 className="panel-header">Action Queue</h2>
              <div className="panel-body flex flex-col gap-3">
                {actionQueue.map((action) => (
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
                ))}
              </div>
            </div>

            <div className="panel">
              <h2 className="panel-header">Connection Placeholder</h2>
              <div className="panel-body text-sm text-slate-300">
                Replace this area with API polling/WebSocket updates:
                <ul className="mt-2 list-disc space-y-1 pl-5">
                  <li>
                    <code className="rounded bg-slate-800 px-1 py-0.5">/api/wafer/risk-events</code> for PostgreSQL-backed risk rows
                  </li>
                  <li>
                    <code className="rounded bg-slate-800 px-1 py-0.5">/api/orchestrate/actions</code> for agent recommendations
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
