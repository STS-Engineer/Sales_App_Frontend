import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  BarChart3,
  BriefcaseBusiness,
  ChevronDown,
  ChevronUp,
  Clock3,
  Layers3,
  Plus,
  ShieldCheck,
  TrendingUp,
  Users
} from "lucide-react";
import { Link } from "react-router-dom";
import TopBar from "../components/TopBar.jsx";
import { useToast } from "../components/ToastProvider.jsx";
import { listRfqs } from "../api";
import {
  KPI_PHASES,
  KPI_TIMEFRAME_OPTIONS,
  buildKpiRecords,
  buildKpiSummary,
  filterKpiRecords,
  getKpiFilterOptions
} from "../utils/kpis.js";

/* ─── Formatters ──────────────────────────────────────────────────── */
const compactFmt = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 });
const intFmt     = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const decFmt     = new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 });

const fmtCompact  = (v) => compactFmt.format(Number(v || 0));
const fmtPct      = (v) => `${decFmt.format(Number(v || 0))}%`;
const fmtKeur     = (v) => `${decFmt.format(Number(v || 0))} kEUR`;
const rfqLabel    = (v) => Math.abs(Number(v || 0)) === 1 ? "RFQ" : "RFQs";
const fmtRfqCount = (v) => `${intFmt.format(Number(v || 0))} ${rfqLabel(v)}`;

/* ─── Color helpers ───────────────────────────────────────────────── */
const hexRgba = (hex, a) => {
  const h = String(hex || "").replace("#", "");
  if (h.length !== 6) return `rgba(4,110,175,${a})`;
  const r = parseInt(h.slice(0,2),16);
  const g = parseInt(h.slice(2,4),16);
  const b = parseInt(h.slice(4,6),16);
  return `rgba(${r},${g},${b},${a})`;
};

/* ─── Shared primitives ───────────────────────────────────────────── */
const GRID_STROKE = "rgba(15,23,42,0.06)";
const AXIS_TEXT   = "fill-slate-400 text-[10px] font-medium tracking-wide";

function GridLine({ x1, x2, y1, y2 }) {
  return <line x1={x1} x2={x2} y1={y1} y2={y2} stroke={GRID_STROKE} />;
}

/* ─── FilterSelect ────────────────────────────────────────────────── */
function FilterSelect({ label, value, onChange, options, icon: Icon }) {
  return (
    <label className="group relative rounded-2xl border border-slate-200/80 bg-white/80 px-5 py-4 shadow-sm transition duration-200 hover:-translate-y-0.5 hover:border-slate-300 hover:bg-white hover:shadow-md">
      <span className="mb-3 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.28em] text-slate-400">
        <Icon className="h-4 w-4 text-slate-400 transition group-hover:text-tide" />
        {label}
      </span>

      <div className="relative">
        <select
          className="w-full appearance-none bg-transparent pr-8 text-[15px] font-semibold text-ink outline-none cursor-pointer"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        >
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>

        <ChevronDown className="pointer-events-none absolute right-0 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-300 transition group-hover:text-tide" />
      </div>
    </label>
  );
}

/* ─── MetricCard ──────────────────────────────────────────────────── */
const TONE_COLORS = {
  blue:    "#046eaf",
  mint:    "#0e4e78",
  sun:     "#ef7807",
  success: "#1f9d6b",
  violet:  "#7c3aed",
};

function MetricCard({ icon: Icon, tone = "blue", label, value, note }) {
  const color = TONE_COLORS[tone] || TONE_COLORS.blue;
  return (
    <div className="kpi-metric-card group relative overflow-hidden">
      {/* subtle corner accent */}
      <div
        className="absolute -right-6 -top-6 h-20 w-20 rounded-full opacity-[0.07] transition-opacity duration-300 group-hover:opacity-[0.12]"
        style={{ background: color }}
      />
      <div
        className="kpi-metric-icon shrink-0"
        style={{ background: hexRgba(color, 0.1), color }}
      >
        <Icon className="h-4.5 w-4.5" />
      </div>
      <div className="min-w-0 relative">
        <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-400">{label}</p>
        <p className="mt-1.5 text-[2rem] font-semibold leading-none tracking-tight text-ink">{value}</p>
        <p className="mt-2 text-xs text-slate-500 leading-relaxed">{note}</p>
      </div>
    </div>
  );
}

/* ─── Panel ───────────────────────────────────────────────────────── */
function Panel({ eyebrow, title, subtitle, children, className = "" }) {
  return (
    <section className={`kpi-panel ${className}`.trim()}>
      <div className="mb-5">
        {eyebrow && (
          <p className="text-[10px] font-semibold uppercase tracking-[0.26em] text-slate-400">{eyebrow}</p>
        )}
        <h3 className="mt-1 font-display text-xl font-semibold text-ink">{title}</h3>
        {subtitle && <p className="mt-1.5 max-w-2xl text-xs text-slate-500 leading-relaxed">{subtitle}</p>}
      </div>
      {children}
    </section>
  );
}

/* ─── Tooltip box (shared) ────────────────────────────────────────── */
function SvgTooltip({ x, y, width = 160, lines = [] }) {
  const h = 16 + lines.length * 18;
  const clampedX = Math.max(width / 2, Math.min(x, 820 - width / 2));
  return (
    <g>
      <rect
        x={clampedX - width / 2} y={y}
        width={width} height={h} rx="8"
        fill="rgba(15,23,42,0.92)"
      />
      {lines.map((line, i) => (
        <text
          key={i}
          x={clampedX} y={y + 14 + i * 18}
          textAnchor="middle"
          className={i === 0
            ? "fill-white/60 text-[9px] font-semibold uppercase tracking-[0.18em]"
            : "fill-white text-[11px] font-semibold"
          }
        >
          {line}
        </text>
      ))}
    </g>
  );
}

/* ─── PhaseComboChart ─────────────────────────────────────────────── */
function PhaseComboChart({ segments, total, selectedLabel = "all", onSelectSegment }) {
  const [hover, setHover] = useState(null);
  const W = 820, H = 320, PL = 48, PR = 56, PT = 36, PB = 64;
  const IW = W - PL - PR, IH = H - PT - PB;

  if (!segments.length || total === 0) return <EmptyState />;

  const active = segments.find(s => s.label === hover)
    || segments.find(s => s.label === selectedLabel)
    || segments[0];

  const maxCount  = Math.max(...segments.map(s => s.value), 1);
  const maxAmount = Math.max(...segments.map(s => s.amount), 1);
  const countTop  = Math.ceil(maxCount  / 4) * 4 || 4;
  const amountTop = Math.ceil(maxAmount / 4 / 25) * 4 * 25 || 100;

  const step = IW / segments.length;
  const bW   = Math.min(20, step * 0.22);
  const gap  = 8;

  const activeIdx = segments.findIndex(s => s.label === active.label);
  const tipX = PL + step * activeIdx + step / 2;

  return (
    <div className="space-y-3">
      {/* legend */}
      <div className="flex items-center gap-5 text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400">
        <span className="flex items-center gap-1.5"><span className="h-2 w-4 rounded-[2px] bg-[#046eaf]"/>Volume</span>
        <span className="flex items-center gap-1.5"><span className="h-2 w-4 rounded-[2px] bg-slate-800"/>Value</span>
      </div>

      <div className="rounded-2xl border border-slate-100 bg-white/60 backdrop-blur-sm px-2 py-3">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full overflow-visible">
          {/* grid */}
          {[0,1,2,3,4].map(i => {
            const y = PT + (IH / 4) * i;
            const cv = Math.round((countTop / 4) * (4 - i));
            const av = (amountTop / 4) * (4 - i);
            return (
              <g key={i}>
                <GridLine x1={PL} x2={PL+IW} y1={y} y2={y} />
                <text x={PL-8} y={y+4} textAnchor="end" className={AXIS_TEXT}>{cv}</text>
                <text x={PL+IW+8} y={y+4} textAnchor="start" className={AXIS_TEXT}>{fmtKeur(av)}</text>
              </g>
            );
          })}

          {segments.map((seg, i) => {
            const cx = PL + step * i + step / 2;
            const cH  = (seg.value  / countTop)  * IH;
            const aH  = (seg.amount / amountTop) * IH;
            const cY  = PT + IH - cH;
            const aY  = PT + IH - aH;
            const cX  = cx - bW - gap / 2;
            const aX  = cx + gap / 2;
            const sel = seg.label === selectedLabel;
            const act = seg.label === active.label;

            return (
              <g key={seg.label}>
                {/* hover zone */}
                <rect
                  x={PL + step * i} y={PT}
                  width={step} height={IH + 40}
                  fill={act ? hexRgba(seg.color, 0.04) : "transparent"}
                  style={{ cursor: "pointer" }}
                  onMouseEnter={() => setHover(seg.label)}
                  onMouseLeave={() => setHover(null)}
                  onClick={() => onSelectSegment?.(seg.label)}
                />
                {/* count bar */}
                <rect
                  x={cX} y={cY}
                  width={bW} height={Math.max(cH, seg.value > 0 ? 4 : 0)}
                  rx="3"
                  fill="#046eaf"
                  opacity={act || sel ? 1 : 0.55}
                  style={{ transition: "opacity 150ms" }}
                />
                {/* amount bar */}
                <rect
                  x={aX} y={aY}
                  width={bW} height={Math.max(aH, seg.amount > 0 ? 4 : 0)}
                  rx="3"
                  fill="#0f172a"
                  opacity={act || sel ? 0.9 : 0.45}
                  style={{ transition: "opacity 150ms" }}
                />
                {/* count label */}
                {seg.value > 0 && (
                  <text x={cX + bW/2} y={cY - 6} textAnchor="middle" className="fill-slate-500 text-[10px] font-semibold">
                    {seg.value}
                  </text>
                )}
                {/* x label */}
                <text
                  x={cx} y={PT + IH + 20}
                  textAnchor="middle"
                  className={`text-[10px] font-semibold ${act ? "fill-ink" : "fill-slate-400"}`}
                  style={{ transition: "fill 150ms" }}
                >
                  {seg.label}
                </text>
                {/* selected ring */}
                {sel && (
                  <rect
                    x={PL + step * i + 4} y={PT}
                    width={step - 8} height={IH + 36}
                    rx="8"
                    fill="none"
                    stroke={seg.color}
                    strokeWidth="1.5"
                    strokeOpacity="0.3"
                    strokeDasharray="4 3"
                  />
                )}
              </g>
            );
          })}

          {/* tooltip */}
          <SvgTooltip
            x={tipX} y={6}
            lines={[
              active.label,
              `${fmtRfqCount(active.value)} · ${fmtKeur(active.amount)}`
            ]}
          />
        </svg>
      </div>
    </div>
  );
}

/* ─── PhasePieChart ───────────────────────────────────────────────── */
function PhasePieChart({ segments, total, selectedLabel = "all", onSelectSegment }) {
  const [hover, setHover] = useState(null);
  const SIZE = 260, C = SIZE / 2, R = 100, HOLE = 58;

  if (!total) return <EmptyState h={220} />;

  const active = hover || selectedLabel;
  const activeSeg = segments.find(s => s.label === active) || null;

  let angle = -90;
  const slices = segments.filter(s => s.value > 0).map(seg => {
    const sweep = (seg.value / total) * 360;
    const start = angle;
    const end   = angle + sweep;
    const mid   = start + sweep / 2;
    angle = end;

    const sel  = selectedLabel === seg.label;
    const push = sel ? 10 : 0;
    const mr   = (mid * Math.PI) / 180;
    const ox   = Math.cos(mr) * push;
    const oy   = Math.sin(mr) * push;
    const sp   = polar(start, R, C + ox, C + oy);
    const ep   = polar(end,   R, C + ox, C + oy);
    const textRadius = (R + HOLE) / 2;
    const lp = polar(mid, textRadius, C + ox, C + oy);
    const la   = sweep > 180 ? 1 : 0;

    const path = `M${C+ox},${C+oy} L${sp.x},${sp.y} A${R},${R},0,${la},1,${ep.x},${ep.y} Z`;
    return { ...seg, path, lp, sweep, sel };
  });

  return (
    <div className="grid gap-4 lg:grid-cols-[240px_1fr] items-center">
      <div className="flex justify-center">
        <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} className="overflow-visible">
          {slices.map(slice => (
            <g key={slice.label}>
              <path
                d={slice.path}
                fill={slice.color}
                opacity={activeSeg && activeSeg.label !== slice.label ? 0.45 : 1}
                style={{ cursor: "pointer", transition: "opacity 150ms" }}
                onMouseEnter={() => setHover(slice.label)}
                onMouseLeave={() => setHover(null)}
                onClick={() => onSelectSegment?.(slice.label)}
              />
              {slice.sweep >= 20 && (
                <text
                  x={slice.lp.x} y={slice.lp.y}
                  textAnchor="middle" dominantBaseline="middle"
                  fill="white" fontSize="13" fontWeight="700"
                  style={{ pointerEvents: "none" }}
                >
                  {slice.value}
                </text>
              )}
            </g>
          ))}
          {/* hole */}
          <circle cx={C} cy={C} r={HOLE} fill="white" />
          {/* center text */}
          <text x={C} y={C - 10} textAnchor="middle" className="fill-slate-400 text-[9px] font-semibold uppercase tracking-[0.2em]">
            {activeSeg ? activeSeg.label : "Pipeline"}
          </text>
          <text x={C} y={C + 10} textAnchor="middle" className="fill-ink text-[22px] font-semibold">
            {activeSeg ? activeSeg.value : total}
          </text>
          {activeSeg && (
            <text x={C} y={C + 26} textAnchor="middle" className="fill-slate-400 text-[9px] font-medium">
              {fmtPct(activeSeg.share * 100)}
            </text>
          )}
        </svg>
      </div>

      <div className="space-y-1.5">
        {segments.map(seg => (
          <button
            key={seg.label} type="button"
            className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition duration-150 hover:bg-slate-50 focus:outline-none"
            style={{
              background: selectedLabel === seg.label ? hexRgba(seg.color, 0.06) : undefined,
              borderLeft: selectedLabel === seg.label ? `2px solid ${seg.color}` : "2px solid transparent"
            }}
            onMouseEnter={() => setHover(seg.label)}
            onMouseLeave={() => setHover(null)}
            onClick={() => onSelectSegment?.(seg.label)}
          >
            <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: seg.color }} />
            <span className="flex-1 text-xs font-semibold text-ink truncate">{seg.label}</span>
            <span className="text-xs font-semibold text-slate-500">{seg.value}</span>
            <span className="w-10 text-right text-[10px] text-slate-400">{fmtPct(seg.share * 100)}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function polar(deg, r, cx, cy) {
  const rad = (deg * Math.PI) / 180;
  return { x: cx + Math.cos(rad) * r, y: cy + Math.sin(rad) * r };
}

/* ─── LineAreaChart ───────────────────────────────────────────────── */
function LineAreaChart({ data, color, gradientId, formatter, emptyLabel }) {
  const [activeKey, setActiveKey] = useState(data[data.length - 1]?.key || null);
  const W = 720, H = 280, PX = 32, PY = 28, PB = 36;
  const IW = W - PX * 2, IH = H - PY - PB;
  const maxV = Math.max(...data.map(d => d.value), 0);

  if (!data.length || maxV === 0) return <EmptyState label={emptyLabel} />;

  const stepX = data.length > 1 ? IW / (data.length - 1) : 0;
  const pts = data.map((d, i) => ({
    ...d,
    x: PX + stepX * i,
    y: PY + IH - (d.value / maxV) * IH,
  }));
  const activeP = pts.find(p => p.key === activeKey) || pts[pts.length - 1];

  const linePts = pts.map(p => `${p.x},${p.y}`).join(" ");
  const area = [
    `M${pts[0].x},${PY+IH}`,
    ...pts.map(p => `L${p.x},${p.y}`),
    `L${pts[pts.length-1].x},${PY+IH}`,
    "Z"
  ].join(" ");

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full overflow-visible">
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stopColor={hexRgba(color, 0.18)} />
            <stop offset="100%" stopColor={hexRgba(color, 0.0)} />
          </linearGradient>
        </defs>

        {/* grid */}
        {[0,1,2,3].map(i => (
          <GridLine key={i} x1={PX} x2={PX+IW} y1={PY+(IH/3)*i} y2={PY+(IH/3)*i} />
        ))}

        {/* active crosshair */}
        {activeP && (
          <line x1={activeP.x} x2={activeP.x} y1={PY} y2={PY+IH}
            stroke={hexRgba(color, 0.2)} strokeDasharray="4 5" />
        )}

        <path d={area} fill={`url(#${gradientId})`} />
        <polyline points={linePts} fill="none" stroke={color} strokeWidth="2.5"
          strokeLinecap="round" strokeLinejoin="round" />

        {pts.map(pt => {
          const isActive = activeP?.key === pt.key;
          return (
            <g key={pt.key}>
              <circle cx={pt.x} cy={pt.y} r="14" fill="transparent"
                onMouseEnter={() => setActiveKey(pt.key)}
                onFocus={() => setActiveKey(pt.key)}
              />
              <circle cx={pt.x} cy={pt.y}
                r={isActive ? "5" : "3.5"}
                fill="white" stroke={color}
                strokeWidth={isActive ? "2.5" : "2"}
                style={{ transition: "r 150ms" }}
              />
              {/* month label directly below bullet */}
              <text
                x={pt.x} y={PY + IH + 18}
                textAnchor="middle"
                style={{
                  fill: isActive ? color : "#94a3b8",
                  fontSize: "10px",
                  fontWeight: isActive ? "700" : "500",
                  transition: "fill 150ms, font-weight 150ms"
                }}
              >
                {pt.label}
              </text>
              {/* active pill bg */}
              {isActive && (
                <rect
                  x={pt.x - 20} y={PY + IH + 6}
                  width={40} height={14} rx="7"
                  fill={hexRgba(color, 0.1)}
                />
              )}
            </g>
          );
        })}

        {/* active value label above point */}
        {activeP && (
          <text x={activeP.x} y={activeP.y - 12} textAnchor="middle"
            className="fill-slate-600 text-[11px] font-semibold">
            {formatter(activeP.value)}
          </text>
        )}
      </svg>
    </div>
  );
}

/* ─── StatusConcentrationChart ────────────────────────────────────── */
function StatusConcentrationChart({ data }) {
  const [hover, setHover] = useState(null);
  const maxV  = Math.max(...data.map(d => d.value), 0);
  const total = data.reduce((s, d) => s + d.value, 0);

  if (!data.length || maxV === 0) return <EmptyState label="No status distribution yet." />;

  return (
    <div className="space-y-2">
      {data.map((item, i) => {
        const share = total > 0 ? (item.value / total) * 100 : 0;
        const pct   = Math.max((item.value / maxV) * 100, 4);
        const act   = hover === item.label;
        return (
          <div
            key={item.label}
            className="group flex items-center gap-4 rounded-xl px-4 py-3 transition duration-150"
            style={{ background: act ? hexRgba(item.color, 0.05) : "transparent" }}
            onMouseEnter={() => setHover(item.label)}
            onMouseLeave={() => setHover(null)}
          >
            {/* rank */}
            <span
              className="shrink-0 text-[10px] font-bold tabular-nums"
              style={{ color: hexRgba(item.color, 0.7), minWidth: 18 }}
            >
              {String(i+1).padStart(2,"0")}
            </span>

            {/* label + bar */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2 mb-1.5">
                <p className="truncate text-xs font-semibold text-ink">{item.label}</p>
                <span className="shrink-0 text-xs font-semibold text-ink">{item.value}</span>
              </div>
              <div className="h-1.5 rounded-full bg-slate-100">
              <div
                className="h-full rounded-full transition-all duration-300"
                style={{
                  width: `${pct}%`,
                  background: item.color,
                  opacity: 1
                }}
              />
              </div>
            </div>

            {/* pct */}
            <span className="shrink-0 text-[10px] font-semibold text-slate-400 w-10 text-right">
              {fmtPct(share)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/* ─── LeaderboardBars ─────────────────────────────────────────────── */
function LeaderboardBars({ data, formatter, secondaryFormatter, emptyMessage, onSelectItem, selectedLabel = "all" }) {
  const [hover, setHover] = useState(null);
  const maxV = Math.max(...data.map(d => d.value), 0);

  if (!data.length || maxV === 0) return <EmptyState label={emptyMessage} />;

  return (
    <div className="space-y-1.5">
      {data.map((item, i) => {
        const pct = Math.max((item.value / maxV) * 100, 4);
        const act = hover === item.label || selectedLabel === item.label;
        return (
          <div
            key={item.label}
            className="group cursor-pointer rounded-xl px-4 py-3 transition duration-150"
            style={{ background: act ? hexRgba(item.color, 0.05) : "transparent" }}
            onMouseEnter={() => setHover(item.label)}
            onMouseLeave={() => setHover(null)}
            onClick={() => onSelectItem?.(item.label)}
            role={onSelectItem ? "button" : undefined}
            tabIndex={onSelectItem ? 0 : undefined}
          >
            <div className="flex items-center gap-3 mb-2">
              <span
                className="shrink-0 text-[10px] font-bold tabular-nums"
                style={{ color: hexRgba(item.color, 0.7), minWidth: 18 }}
              >
                {String(i+1).padStart(2,"0")}
              </span>
              <p className="flex-1 truncate text-xs font-semibold text-ink">{item.label}</p>
              <p className="shrink-0 text-xs font-semibold text-ink">{formatter(item.value)}</p>
            </div>
            <div className="h-1 rounded-full bg-slate-100 ml-7">
              <div
                className="h-full rounded-full transition-all duration-300"
                style={{
                  width: `${pct}%`,
                  background: item.color,
                  opacity: 1
                }}
              />
            </div>
            {secondaryFormatter && (
              <p className="mt-1 ml-7 text-[10px] text-slate-400">{secondaryFormatter(item.secondaryValue || 0)}</p>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ─── ColumnCategoryChart ─────────────────────────────────────────── */
function ColumnCategoryChart({ data, formatter, secondaryFormatter, emptyMessage, onSelectItem, selectedLabel = "all" }) {
  const [hover, setHover] = useState(null);
  const W = 640, H = 260, PL = 40, PR = 12, PT = 20, PB = 100;
  const IW = W - PL - PR, IH = H - PT - PB;
  const maxV = Math.max(...data.map(d => d.value), 0);

  if (!data.length || maxV === 0) return <EmptyState h={220} label={emptyMessage} />;

  const ticks  = 4;
  const topV   = Math.ceil(maxV / ticks) * ticks || ticks;
  const step   = IW / Math.max(data.length, 1);
  const bW     = Math.min(40, step * 0.5);
  const hoveredIndex = data.findIndex(item => item.label === hover);
  const hoveredItem = hoveredIndex >= 0 ? data[hoveredIndex] : null;
  const tooltip =
    hoveredItem
      ? (() => {
          const cx = PL + step * hoveredIndex + step / 2;
          const barHeight = Math.max((hoveredItem.value / topV) * IH, hoveredItem.value > 0 ? 4 : 0);
          const barTop = PT + IH - barHeight;
          const lines = [hoveredItem.label, `count : ${String(formatter(hoveredItem.value))}`];
          const boxWidth = Math.max(
            116,
            ...lines.map((line) => 26 + String(line).length * 7.2)
          );
          const boxHeight = 58;
          const x = Math.min(Math.max(cx - boxWidth / 2, 10), W - boxWidth - 10);
          const y = Math.max(8, barTop - boxHeight - 16);

          return {
            color: hoveredItem.color,
            lines,
            boxHeight,
            boxWidth,
            x,
            y
          };
        })()
      : null;

  return (
    <div className="rounded-2xl border border-slate-100 bg-white/60 backdrop-blur-sm px-2 py-3">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full overflow-visible">
        {/* grid */}
        {[0,1,2,3,4].map(i => {
          const v = Math.round((topV / ticks) * (ticks - i));
          const y = PT + (IH / ticks) * i;
          return (
            <g key={i}>
              <GridLine x1={PL} x2={PL+IW} y1={y} y2={y} />
              <text x={PL-6} y={y+4} textAnchor="end" className={AXIS_TEXT}>{v}</text>
            </g>
          );
        })}

        {data.map((item, i) => {
          const cx  = PL + step * i + step / 2;
          const bH  = Math.max((item.value / topV) * IH, item.value > 0 ? 4 : 0);
          const bY  = PT + IH - bH;
          const bX  = cx - bW / 2;
          const sel = item.label === selectedLabel;
          const act = item.label === hover || sel;

          return (
            <g key={item.label}>
              <rect
                x={bX} y={bY} width={bW} height={bH} rx="4"
                fill={item.color}
                opacity={1}
                style={{ cursor: onSelectItem ? "pointer" : "default", transition: "opacity 150ms" }}
                onMouseEnter={() => setHover(item.label)}
                onMouseLeave={() => setHover(null)}
                onClick={() => onSelectItem?.(item.label)}
              />
              {/* selection indicator */}
              {sel && (
                <rect x={bX-2} y={bY-2} width={bW+4} height={bH+2} rx="5"
                  fill="none" stroke={item.color} strokeWidth="1.5" strokeOpacity="0.4"
                />
              )}
              {/* value label */}
              {item.value > 0 && (
                <text x={cx} y={bY-6} textAnchor="middle" className="fill-slate-500 text-[10px] font-semibold">
                  {formatter(item.value)}
                </text>
              )}
              {/* x label */}
              <text
                x={cx} y={PT+IH+16} textAnchor="end"
                className={`text-[10px] font-semibold ${act ? "fill-ink" : "fill-slate-400"}`}
                transform={`rotate(-38 ${cx} ${PT+IH+16})`}
                style={{ transition: "fill 150ms" }}
              >
                {item.label}
              </text>
            </g>
          );
        })}

        {tooltip && (
          <g pointerEvents="none">
            <rect
              x={tooltip.x}
              y={tooltip.y}
              width={tooltip.boxWidth}
              height={tooltip.boxHeight}
              rx="14"
              fill="rgba(255,255,255,0.98)"
              stroke={hexRgba(tooltip.color, 0.78)}
              strokeWidth="1.2"
              style={{ filter: "drop-shadow(0 18px 32px rgba(15, 23, 42, 0.12))" }}
            />
            <text
              x={tooltip.x + 18}
              y={tooltip.y + 24}
              className="fill-ink text-[11px] font-semibold uppercase tracking-[0.12em]"
            >
              {tooltip.lines[0]}
            </text>
            <text
              x={tooltip.x + 18}
              y={tooltip.y + 44}
              className="fill-slate-600 text-[11px] font-semibold"
            >
              {tooltip.lines[1]}
            </text>
          </g>
        )}
      </svg>
    </div>
  );
}

/* ─── EmptyState ──────────────────────────────────────────────────── */
function EmptyState({ label = "No data available for the current filters.", h = 180 }) {
  return (
    <div
      className="flex items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50/60 text-xs text-slate-400"
      style={{ minHeight: h }}
    >
      {label}
    </div>
  );
}

/* ─── Loading skeleton ────────────────────────────────────────────── */
function KpiLoadingState() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="kpi-hero">
        <div className="h-5 w-28 rounded-full bg-white/20" />
        <div className="mt-4 h-10 w-64 rounded-xl bg-white/25" />
        <div className="mt-3 h-4 w-96 rounded-full bg-white/20" />
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {Array.from({length:6},(_,i)=>(
          <div key={i} className="kpi-metric-card">
            <div className="h-10 w-10 rounded-xl bg-slate-200" />
            <div className="flex-1 space-y-2">
              <div className="h-3 w-24 rounded bg-slate-200" />
              <div className="h-8 w-32 rounded bg-slate-200" />
              <div className="h-3 w-40 rounded bg-slate-200" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─── KpiDashboard (main) ─────────────────────────────────────────── */
export default function KpiDashboard() {
  const { showToast } = useToast();
  const [rfqs, setRfqs]       = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({
    timeframe: "all", phase: "all", productLine: "all", creator: "all"
  });

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const data = await listRfqs();
        setRfqs(Array.isArray(data) ? data : []);
      } catch {
        setRfqs([]);
        showToast("Unable to load KPI data. Please refresh.", { type: "error", title: "Dashboard unavailable" });
      } finally {
        setLoading(false);
      }
    })();
  }, [showToast]);

  const records        = useMemo(() => buildKpiRecords(rfqs),            [rfqs]);
  const filterOptions  = useMemo(() => getKpiFilterOptions(records),     [records]);
  const filteredRecs   = useMemo(() => filterKpiRecords(records, filters),[filters, records]);
  const summary        = useMemo(
    () => buildKpiSummary(filteredRecs, new Date(), filterOptions.productLines),
    [filteredRecs, filterOptions.productLines]
  );

  const toggle = (key, val) =>
    setFilters(c => ({ ...c, [key]: c[key] === val ? "all" : val }));

  const mkOptions = (arr, label) => [
    { value: "all", label },
    ...arr.map(v => ({ value: v, label: v }))
  ];

  const creatorOptions     = useMemo(() => mkOptions(filterOptions.creators,    "All creators"),    [filterOptions.creators]);
  const phaseOptions       = useMemo(() => mkOptions(KPI_PHASES,                "All phases"),      []);
  const productLineOptions = useMemo(() => mkOptions(filterOptions.productLines,"All product lines"),[filterOptions.productLines]);

  return (
    <div className="min-h-screen">
      <TopBar />

      <div className="px-4 py-8 md:px-5 md:py-9 xl:px-6 xl:py-10">
        <div className="mx-auto flex max-w-[1550px] flex-col gap-6">
          {loading ? <KpiLoadingState /> : (
            <>
              {/* Hero */}
              <section className="kpi-hero">
                <div className="kpi-orb kpi-orb-one" />
                <div className="kpi-orb kpi-orb-two" />
                <div className="kpi-orb kpi-orb-three" />
                <div className="relative z-[1] flex flex-col gap-4">
                  <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                    <h1 className="flex items-center gap-2 font-display text-[1.6rem] leading-tight text-white md:text-[2rem]">
                      <BarChart3 className="h-6 w-6 shrink-0" />
                      KPI Dashboard
                    </h1>
                    <div className="flex flex-wrap items-center gap-2.5">
                      <Link to="/dashboard" className="kpi-hero-button">
                        RFQ dashboard <ArrowRight className="h-3.5 w-3.5" />
                      </Link>
                      <Link to="/rfqs/new" className="kpi-hero-button-secondary">
                        <Plus className="h-3.5 w-3.5" /> Create RFQ
                      </Link>
                    </div>
                  </div>
                  <p className="max-w-2xl text-[13px] leading-relaxed text-white/70">
                    Track commercial value, pipeline shape, validation workload, and monthly movement in one visual workspace.
                  </p>
                </div>
              </section>

              {/* Filters */}
              <section className="relative overflow-hidden rounded-[2rem] border border-white/70 bg-white/75 p-6 shadow-[0_20px_60px_rgba(15,23,42,0.08)] backdrop-blur-xl md:p-7">
                <div className="pointer-events-none absolute -right-20 -top-20 h-56 w-56 rounded-full bg-[#046eaf]/10 blur-3xl" />
                <div className="pointer-events-none absolute -bottom-24 -left-24 h-64 w-64 rounded-full bg-[#ef7807]/10 blur-3xl" />

                <div className="relative z-[1] mb-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-[0.32em] text-slate-400">
                      Filters
                    </p>
                    <h3 className="mt-2 font-display text-2xl font-semibold tracking-tight text-ink">
                      Interactive KPI controls
                    </h3>
                    <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-500">
                      Slice by time, phase, product line, or owner.
                    </p>
                  </div>

                  {/* Reset button */}
                  <button
                    type="button"
                    onClick={() =>
                      setFilters({
                        timeframe: "all",
                        phase: "all",
                        productLine: "all",
                        creator: "all"
                      })
                    }
                    className="flex items-center gap-2 rounded-xl bg-[#ef7807] px-4 py-2 text-sm font-semibold text-white shadow-md transition hover:-translate-y-0.5 hover:bg-[#d96d06] hover:shadow-lg"
                  >
                    Reset Filters
                  </button>
                </div>

                <div className="relative z-[1] grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                  <FilterSelect
                    label="Timeframe"
                    value={filters.timeframe}
                    onChange={(v) => setFilters((c) => ({ ...c, timeframe: v }))}
                    options={KPI_TIMEFRAME_OPTIONS}
                    icon={Clock3}
                  />

                  <FilterSelect
                    label="Phase"
                    value={filters.phase}
                    onChange={(v) => setFilters((c) => ({ ...c, phase: v }))}
                    options={phaseOptions}
                    icon={Layers3}
                  />

                  <FilterSelect
                    label="Product line"
                    value={filters.productLine}
                    onChange={(v) => setFilters((c) => ({ ...c, productLine: v }))}
                    options={productLineOptions}
                    icon={BriefcaseBusiness}
                  />

                  <FilterSelect
                    label="Creator"
                    value={filters.creator}
                    onChange={(v) => setFilters((c) => ({ ...c, creator: v }))}
                    options={creatorOptions}
                    icon={Users}
                  />
                </div>
              </section>

              {/* Metric cards */}
              <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-6">
                <MetricCard icon={BriefcaseBusiness} tone="blue"    label="Total RFQs"        value={fmtCompact(summary.totalRfqs)}   note="All RFQs visible after filters." />
                <MetricCard icon={Activity}           tone="mint"    label="Open pipeline"     value={fmtCompact(summary.activeRfqs)}  note={`${fmtKeur(summary.openAmount)} active in the commercial flow.`} />
                <MetricCard icon={TrendingUp}          tone="sun"     label="Commercial value"  value={fmtKeur(summary.totalAmount)}    note={`Avg. RFQ value: ${fmtKeur(summary.averageAmount)}.`} />
                <MetricCard icon={ShieldCheck}         tone="success" label="Win rate"          value={fmtPct(summary.winRate)}         note="Positive outcomes vs. lost / cancelled." />
                <MetricCard icon={Clock3}              tone="violet"  label="Average aging"     value={`${fmtCompact(summary.averageAgeDays)} days`} note="From creation to today." />
                <MetricCard icon={AlertTriangle}       tone="sun"     label="At risk RFQs"      value={fmtCompact(summary.atRiskRfqs)}  note="Older items in validation or costing." />
              </div>

              {/* Phase charts */}
              <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
                <Panel eyebrow="Pipeline anatomy" title="Phase split & commercial weight"
                  subtitle="RFQ count and value across operating phases.">
                  <PhaseComboChart
                    segments={summary.phaseDistribution} total={summary.totalRfqs}
                    selectedLabel={filters.phase}
                    onSelectSegment={label => toggle("phase", label)}
                  />
                </Panel>
                <Panel eyebrow="Phase share" title="Distribution"
                  subtitle="Phase mix in the filtered pipeline.">
                  <PhasePieChart
                    segments={summary.phaseDistribution} total={summary.totalRfqs}
                    selectedLabel={filters.phase}
                    onSelectSegment={label => toggle("phase", label)}
                  />
                </Panel>
              </div>

              {/* Trend charts */}
              <div className="grid gap-6 xl:grid-cols-2">
                <Panel eyebrow="Volume trend" title="Monthly RFQ creation"
                  subtitle="Spot surges and dips across the last 8 visible months.">
                  <LineAreaChart
                    data={summary.monthlyVolume} color="#046eaf"
                    gradientId="kpi-volume-trend"
                    formatter={v => intFmt.format(v)}
                    emptyLabel="No monthly volume for the selected filters."
                  />
                </Panel>
                <Panel eyebrow="Value trend" title="Monthly commercial value"
                  subtitle="Pipeline value in kEUR across the same window.">
                  <LineAreaChart
                    data={summary.monthlyValue} color="#ef7807"
                    gradientId="kpi-value-trend"
                    formatter={v => fmtCompact(v)}
                    emptyLabel="No RFQ value for the selected filters."
                  />
                </Panel>
              </div>

              {/* Ranking charts */}
              <div className="grid gap-6 xl:grid-cols-2">
                <Panel eyebrow="Status spread" title="Status concentration"
                  subtitle="Heaviest sub-statuses in the current slice.">
                  <StatusConcentrationChart data={summary.statusDistribution} />
                </Panel>
                <Panel eyebrow="Customer mix" title="Top customers by value"
                  subtitle="Most valuable accounts in the filtered set.">
                  <LeaderboardBars
                    data={summary.topCustomers}
                    formatter={v => fmtKeur(v)}
                    secondaryFormatter={v => fmtRfqCount(v)}
                    emptyMessage="No customer value data available."
                  />
                </Panel>
                <Panel eyebrow="Product lens" title="Product line mix"
                  subtitle="RFQ volume across product lines.">
                  <ColumnCategoryChart
                    data={summary.productLineDistribution}
                    formatter={v => `${intFmt.format(v)}`}
                    secondaryFormatter={v => fmtKeur(v)}
                    emptyMessage="No product line data for the current filters."
                    onSelectItem={label => toggle("productLine", label)}
                    selectedLabel={filters.productLine}
                  />
                </Panel>
                <Panel eyebrow="Customer volume" title="Top customers by RFQ volume"
                  subtitle="Accounts generating the highest number of RFQs.">
                  <ColumnCategoryChart
                    data={summary.topCustomersByVolume}
                    formatter={v => `${intFmt.format(v)}`}
                    secondaryFormatter={v => fmtKeur(v)}
                    emptyMessage="No customer volume data available."
                  />
                </Panel>
                <Panel eyebrow="Ownership lens" title="Top creators by RFQ volume"
                  subtitle="Sales contributors with the strongest flow.">
                  <ColumnCategoryChart
                    data={summary.creatorLoad}
                    formatter={v => `${intFmt.format(v)}`}
                    secondaryFormatter={v => fmtKeur(v)}
                    emptyMessage="No creator activity found."
                    onSelectItem={label => toggle("creator", label)}
                    selectedLabel={filters.creator}
                  />
                </Panel>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
