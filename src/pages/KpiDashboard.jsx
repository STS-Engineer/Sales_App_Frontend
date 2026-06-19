import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  BarChart3,
  BriefcaseBusiness,
  CalendarDays,
  ChevronDown,
  ChevronLeft,
  ChevronUp,
  Clock3,
  ExternalLink,
  Factory,
  Layers3,
  Save,
  Settings,
  ShieldCheck,
  TrendingUp,
  Users
} from "lucide-react";
import { Link } from "react-router-dom";
import TopBar from "../components/TopBar.jsx";
import { useToast } from "../components/ToastProvider.jsx";
import { getUserProfile } from "../utils/session.js";
import {
  listRfqs,
  getTeamView,
  getKpiConsolidated,
  getKpiIndividual,
  getKpiSettings,
  upsertKpiSettings,
  getTeamMembers,
  getOwnerUsers,
} from "../api";
import {
  KPI_PHASES,
  KPI_SECTOR_COLORS,
  KPI_SECTOR_ORDER,
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

const fmtCompact      = (v) => compactFmt.format(Number(v || 0));
const fmtPct          = (v) => `${decFmt.format(Number(v || 0))}%`;
const fmtKeur         = (v) => `${decFmt.format(Number(v || 0))} kEUR`;
const requestLabel    = (v) => Math.abs(Number(v || 0)) === 1 ? "request" : "requests";
const fmtRequestCount = (v) => `${intFmt.format(Number(v || 0))} ${requestLabel(v)}`;

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
  blue:    { color: "#046eaf", bg: "rgba(4,110,175,0.07)",   border: "rgba(4,110,175,0.18)"   },
  mint:    { color: "#0891b2", bg: "rgba(8,145,178,0.07)",   border: "rgba(8,145,178,0.18)"   },
  sun:     { color: "#d97706", bg: "rgba(217,119,6,0.07)",   border: "rgba(217,119,6,0.18)"   },
  success: { color: "#059669", bg: "rgba(5,150,105,0.07)",   border: "rgba(5,150,105,0.18)"   },
  violet:  { color: "#7c3aed", bg: "rgba(124,58,237,0.07)",  border: "rgba(124,58,237,0.18)"  },
};

function MetricCard({ tone = "blue", label, value, note }) {
  const { color, bg, border } = TONE_COLORS[tone] || TONE_COLORS.blue;
  return (
    <div
      className="kpi-metric-card group"
      style={{
        "--card-color": color,
        "--card-bg-from": bg,
        backgroundColor: "#ffffff",
        borderColor: border,
      }}
    >
      <p className="text-[11px] font-extrabold uppercase tracking-[0.22em] text-slate-500">{label}</p>
      <p className="mt-2 text-[2rem] font-bold leading-none tracking-tight" style={{ color }}>{value}</p>
      <p className="mt-2 text-[13px] leading-relaxed text-slate-500">{note}</p>
    </div>
  );
}

/* ─── Panel ───────────────────────────────────────────────────────── */
function Panel({ eyebrow, title, subtitle, children, className = "" }) {
  return (
    <section className={`kpi-panel ${className}`.trim()}>
      <div className="mb-5">
        <h3 className="font-display text-xl font-semibold text-ink">{title}</h3>
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
              `${fmtRequestCount(active.value)} · ${fmtKeur(active.amount)}`
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
    <div className="grid gap-4 sm:grid-cols-[200px_1fr] lg:grid-cols-[240px_1fr] items-center">
      <div className="flex justify-center">
        <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="w-full max-w-[260px] overflow-visible">
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

function StackedDistributionChart({ data, selectedLabel = "all", onSelectLabel }) {
  const [hover, setHover] = useState(null);
  const columns = data?.columns || [];
  const legend = data?.legend || [];
  const maxV = Math.max(...columns.map((column) => column.total), 0);

  if (!columns.length || maxV === 0) {
    return <EmptyState h={250} label="No phase/status distribution for the current filters." />;
  }

  const W = 620, H = 260, PL = 38, PR = 12, PT = 18, PB = 64;
  const IW = W - PL - PR, IH = H - PT - PB;
  const ticks = 4;
  const topV = Math.max(ticks, Math.ceil(maxV / ticks) * ticks);
  const step = IW / Math.max(columns.length, 1);
  const bW = Math.min(46, step * 0.42);
  const tooltipWidth = 186;
  const tooltipHeight = 48;
  const tooltipX = hover
    ? Math.min(Math.max(hover.x - tooltipWidth / 2, 10), W - tooltipWidth - 10)
    : 0;
  const tooltipY = hover ? Math.max(8, hover.y - tooltipHeight - 14) : 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {legend.map((item) => (
          <span
            key={item.label}
            className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500"
          >
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: item.color }} />
            {item.label}
          </span>
        ))}
      </div>

      <div className="rounded-2xl border border-slate-100 bg-white/60 px-2 py-3 backdrop-blur-sm">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full overflow-visible">
          {[0, 1, 2, 3, 4].map((i) => {
            const value = Math.round((topV / ticks) * (ticks - i));
            const y = PT + (IH / ticks) * i;
            return (
              <g key={i}>
                <GridLine x1={PL} x2={PL + IW} y1={y} y2={y} />
                <text x={PL - 6} y={y + 4} textAnchor="end" className={AXIS_TEXT}>
                  {value}
                </text>
              </g>
            );
          })}

          {columns.map((column, index) => {
            const cx = PL + step * index + step / 2;
            const zoneX = PL + step * index;
            const barX = cx - bW / 2;
            const totalHeight = (column.total / topV) * IH;
            const barTop = PT + IH - totalHeight;
            const isSelected = selectedLabel === column.label;
            const isActive = hover?.column === column.label || isSelected;
            let currentY = PT + IH;

            return (
              <g key={column.label}>
                <rect
                  x={zoneX}
                  y={PT}
                  width={step}
                  height={IH + 32}
                  rx="10"
                  fill={isActive ? hexRgba("#0f172a", 0.03) : "transparent"}
                  style={{ cursor: onSelectLabel ? "pointer" : "default" }}
                  onMouseLeave={() => setHover(null)}
                  onClick={() => onSelectLabel?.(column.label)}
                />

                {column.segments.map((segment) => {
                  const segmentHeight = (segment.value / topV) * IH;
                  const segmentY = currentY - segmentHeight;
                  currentY = segmentY;

                  return (
                    <rect
                      key={`${column.label}-${segment.label}`}
                      x={barX}
                      y={segmentY}
                      width={bW}
                      height={segmentHeight}
                      rx="4"
                      fill={segment.color}
                      opacity={
                        hover && (hover.column !== column.label || hover.segment !== segment.label)
                          ? 0.3
                          : 1
                      }
                      style={{
                        cursor: onSelectLabel ? "pointer" : "default",
                        transition: "opacity 150ms"
                      }}
                      onMouseEnter={() =>
                        setHover({
                          column: column.label,
                          segment: segment.label,
                          value: segment.value,
                          total: column.total,
                          color: segment.color,
                          x: cx,
                          y: segmentY
                        })
                      }
                      onClick={() => onSelectLabel?.(column.label)}
                    />
                  );
                })}

                {column.total > 0 ? (
                  <text
                    x={cx}
                    y={barTop - 8}
                    textAnchor="middle"
                    className="fill-slate-500 text-[10px] font-semibold"
                  >
                    {intFmt.format(column.total)}
                  </text>
                ) : null}

                {isSelected ? (
                  <rect
                    x={barX - 4}
                    y={Math.max(PT, barTop - 6)}
                    width={bW + 8}
                    height={Math.max(totalHeight + 10, 16)}
                    rx="8"
                    fill="none"
                    stroke="#046eaf"
                    strokeWidth="1.5"
                    strokeOpacity="0.3"
                    strokeDasharray="4 3"
                  />
                ) : null}

                <text
                  x={cx}
                  y={PT + IH + 20}
                  textAnchor="middle"
                  className={`text-[10px] font-semibold ${isActive ? "fill-ink" : "fill-slate-400"}`}
                  style={{ transition: "fill 150ms" }}
                >
                  {column.label}
                </text>
              </g>
            );
          })}

          {hover ? (
            <g pointerEvents="none">
              <rect
                x={tooltipX}
                y={tooltipY}
                width={tooltipWidth}
                height={tooltipHeight}
                rx="14"
                fill="rgba(255,255,255,0.98)"
                stroke={hexRgba(hover.color, 0.72)}
                strokeWidth="1.2"
                style={{ filter: "drop-shadow(0 18px 32px rgba(15, 23, 42, 0.12))" }}
              />
              <text
                x={tooltipX + 16}
                y={tooltipY + 22}
                className="fill-ink text-[11px] font-semibold uppercase tracking-[0.12em]"
              >
                {hover.column}
              </text>
              <text
                x={tooltipX + 16}
                y={tooltipY + 40}
                className="fill-slate-600 text-[11px] font-semibold"
              >
                {`${hover.segment}: ${intFmt.format(hover.value)}`}
              </text>
            </g>
          ) : null}
        </svg>
      </div>
    </div>
  );
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
          const primaryLabel =
            String(hoveredItem.label || "").includes("@")
              ? String(hoveredItem.label || "").toLowerCase()
              : hoveredItem.label;
          const lines = [primaryLabel, `count : ${String(formatter(hoveredItem.value))}`];
          const boxWidth = Math.max(
            220,
            ...lines.map((line) => 34 + String(line).length * 8.1)
          );
          const boxHeight = 60;
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
              className="fill-ink text-[11px] font-semibold tracking-[0.04em]"
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

/* ─── Shared KPI helpers (consolidated / individual / settings) ───── */

const THIS_YEAR = new Date().getFullYear();
const KPI_YEARS = [THIS_YEAR - 1, THIS_YEAR, THIS_YEAR + 1];
const inputSt = "rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-ink focus:outline-none focus:ring-2 focus:ring-tide disabled:opacity-60";
const roSt    = "rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-tide";

function pctColor(p) {
  if (p == null) return "#94a3b8";
  return p >= 66 ? "#059669" : p >= 33 ? "#d97706" : "#dc2626";
}

function PBar({ pct, label }) {
  const c = Math.min(100, Math.max(0, pct || 0));
  const color = pctColor(pct);
  return (
    <div className="w-full">
      {label && (
        <div className="mb-1 flex justify-between text-xs">
          <span className="text-slate-500">{label}</span>
          <span className="font-bold" style={{ color }}>{Math.round(pct || 0)} %</span>
        </div>
      )}
      <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
        <div className="h-full rounded-full transition-all duration-500" style={{ width: `${c}%`, backgroundColor: color }} />
      </div>
    </div>
  );
}

function MBar({ monthly = [], target, tint = "#046eaf" }) {
  const W = 580, H = 210;
  const pad = { t: 24, b: 52, l: 48, r: 32 };
  const iW = W - pad.l - pad.r;
  const iH = H - pad.t - pad.b;

  const n = monthly.length || 12;
  const maxRaw = Math.max(target || 0, ...monthly.map(d => d.value), 1);
  const tickStep = Math.ceil(maxRaw / 5 / 5) * 5 || 10;
  const topVal = Math.ceil(maxRaw / tickStep) * tickStep;
  const ticks = [];
  for (let v = 0; v <= topVal; v += tickStep) ticks.push(v);

  const fy = v => pad.t + iH * (1 - v / topVal);
  const cW = iW / n;
  const bW = Math.max(cW * 0.6, 8);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ maxHeight: 230 }}>
      {/* Plot background */}
      <rect x={pad.l} y={pad.t} width={iW} height={iH} fill="#f8fafc" rx={3} />

      {/* Gridlines + Y labels */}
      {ticks.map(v => (
        <g key={v}>
          <line x1={pad.l} x2={pad.l + iW} y1={fy(v)} y2={fy(v)}
            stroke={v === 0 ? "#cbd5e1" : "#e2e8f0"} strokeWidth={v === 0 ? 1.5 : 1} />
          <text x={pad.l - 6} y={fy(v) + 4} textAnchor="end"
            fill="#64748b" fontSize={11} fontFamily="system-ui,sans-serif">{v}</text>
        </g>
      ))}

      {/* Y-axis spine */}
      <line x1={pad.l} x2={pad.l} y1={pad.t} y2={pad.t + iH} stroke="#cbd5e1" strokeWidth={1.5} />

      {/* Target line */}
      {target > 0 && (
        <>
          <line x1={pad.l} x2={pad.l + iW} y1={fy(target)} y2={fy(target)}
            stroke="#22c55e" strokeWidth={2.5} />
          <text x={pad.l + iW + 4} y={fy(target) + 4}
            fill="#22c55e" fontSize={10} fontFamily="system-ui,sans-serif" fontWeight="700">{target}</text>
        </>
      )}

      {/* Bars + value labels + X labels */}
      {monthly.map((d, i) => {
        const bx = pad.l + i * cW + (cW - bW) / 2;
        const by = fy(d.value);
        const bh = Math.max(2, pad.t + iH - by);
        const color = target ? (d.value >= target ? "#059669" : tint) : tint;
        return (
          <g key={i}>
            <rect x={bx} y={by} width={bW} height={bh} rx={3} fill={color} fillOpacity={0.85} />
            {d.value > 0 && (
              <text x={bx + bW / 2} y={by - 5} textAnchor="middle"
                fill={color} fontSize={10} fontFamily="system-ui,sans-serif" fontWeight="700">
                {d.value}
              </text>
            )}
            <text x={pad.l + i * cW + cW / 2} y={pad.t + iH + 16} textAnchor="middle"
              fill="#64748b" fontSize={11} fontFamily="system-ui,sans-serif">{d.label}</text>
          </g>
        );
      })}

      {/* Target legend — below X labels */}
      {target > 0 && (
        <g transform={`translate(${pad.l},${pad.t + iH + 36})`}>
          <line x1={0} x2={14} y1={0} y2={0} stroke="#22c55e" strokeWidth={2.5} />
          <text x={18} y={4} fill="#64748b" fontSize={10} fontFamily="system-ui,sans-serif">
            Target: {target}
          </text>
        </g>
      )}
    </svg>
  );
}

function MTile({ label, value, color = "#046eaf" }) {
  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white/80 px-5 py-4 shadow-sm">
      <p className="text-[11px] font-extrabold uppercase tracking-[0.22em] text-slate-400">{label}</p>
      <p className="mt-2 text-[1.55rem] font-bold leading-none tracking-tight" style={{ color }}>{value}</p>
    </div>
  );
}

function ZTbl({ rows = [], vLabel = "Value", fmt }) {
  if (!rows.length) return null;
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200/80">
      <table className="w-full text-sm">
        <thead><tr className="bg-slate-50">
          <th className="px-4 py-2 text-left text-[11px] font-bold uppercase tracking-[0.22em] text-slate-400">Zone / Site</th>
          <th className="px-4 py-2 text-right text-[11px] font-bold uppercase tracking-[0.22em] text-slate-400">{vLabel}</th>
        </tr></thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-t border-slate-100">
              <td className="px-4 py-2 font-medium text-ink">{r.zone ?? r.site}</td>
              <td className="px-4 py-2 text-right font-semibold text-ink">{fmt ? fmt(r) : (r.value != null ? r.value.toFixed(1) : "—")}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ─── IndividualSection ───────────────────────────────────────────── */
function IndividualSection({ email, year, onBack }) {
  const { addToast } = useToast();
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState(null);

  useEffect(() => {
    if (!email) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const r = await getKpiIndividual(email, year);
        if (!cancelled) setData(r);
      } catch {
        if (!cancelled) addToast({ type: "error", message: "Failed to load salesperson data" });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [email, year]);

  const renewalPct = data?.annual_target_keur ? (data.renewal_confirmed_keur / data.annual_target_keur * 100) : null;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        {onBack && (
          <button onClick={onBack} className="flex items-center gap-1 text-sm text-slate-500 hover:text-tide">
            <ChevronLeft className="h-4 w-4" /> Back to consolidated view
          </button>
        )}
        <h2 className="text-xl font-bold text-ink">{data?.label || email}</h2>
      </div>
      {loading ? (
        <div className="flex justify-center py-12 text-slate-400">Loading…</div>
      ) : data && (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <MTile label="Confirmed Renewal k€" value={`${Math.round(data.renewal_confirmed_keur || 0).toLocaleString()} k€`} color="#046eaf" />
            <MTile label="Annual Target k€" value={data.annual_target_keur != null ? `${Math.round(data.annual_target_keur).toLocaleString()} k€` : "—"} color="#94a3b8" />
            <MTile label="New Business YTD k€" value={`${Math.round(data.new_business_ytd_keur || 0).toLocaleString()} k€`} color="#059669" />
            <MTile label="# RFQ" value={data.nb_rfq ?? 0} color="#7c3aed" />
          </div>
          <section className="kpi-panel">
            <h3 className="font-display text-lg font-semibold text-ink mb-1">Renewal Portfolio</h3>
            <p className="text-xs text-slate-500 mb-4">Total pipeline: {Math.round(data.renewal_pipeline_keur || 0).toLocaleString()} k€</p>
            {renewalPct !== null && <div className="mb-4"><PBar pct={renewalPct} label="Confirmed vs annual target" /></div>}
            {data.renewal_portfolio?.length > 0 ? (
              <div className="overflow-x-auto rounded-xl border border-slate-200/80">
                <table className="w-full text-sm">
                  <thead><tr className="bg-slate-50 text-left">
                    {["Customer","Description","Product Line","k€/year","Probability","Site","Sector"].map(h => (
                      <th key={h} className="px-4 py-2 text-[11px] font-bold uppercase tracking-[0.22em] text-slate-400">{h}</th>
                    ))}
                  </tr></thead>
                  <tbody>
                    {data.renewal_portfolio.map((r, i) => (
                      <tr key={i} className="border-t border-slate-100">
                        <td className="px-4 py-2 font-medium text-ink">{r.customer||"—"}</td>
                        <td className="px-4 py-2 text-slate-600">{r.description||"—"}</td>
                        <td className="px-4 py-2 text-slate-600">{r.product_line||"—"}</td>
                        <td className="px-4 py-2 font-semibold text-ink">{Math.round(r.annual_keur||0).toLocaleString()}</td>
                        <td className="px-4 py-2"><span className="font-bold" style={{color:pctColor(r.probability)}}>{Math.round(r.probability||0)} %</span></td>
                        <td className="px-4 py-2 text-slate-600">{r.site||"—"}</td>
                        <td className="px-4 py-2 text-slate-600">{r.sector||"—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : <p className="text-sm italic text-slate-400">No opportunities recorded</p>}
          </section>
          {(data.new_business_categories || []).map(cat => (
            <section key={cat.category} className="kpi-panel">
              <h3 className="font-display text-lg font-semibold text-ink mb-1">New Business — {cat.category}</h3>
              <p className="text-xs text-slate-500 mb-4">YTD: {Math.round(cat.ytd_keur||0).toLocaleString()} k€</p>
              <MBar monthly={cat.monthly} tint="#046eaf" />
              {cat.deals?.length > 0 && (
                <div className="mt-5 overflow-x-auto rounded-xl border border-slate-200/80">
                  <table className="w-full text-sm">
                    <thead><tr className="bg-slate-50 text-left">
                      {["Customer","Project","Product Line","k€/year","SOP","Site"].map(h => (
                        <th key={h} className="px-4 py-2 text-[11px] font-bold uppercase tracking-[0.22em] text-slate-400">{h}</th>
                      ))}
                    </tr></thead>
                    <tbody>
                      {cat.deals.map((r, i) => (
                        <tr key={i} className="border-t border-slate-100">
                          <td className="px-4 py-2 font-medium text-ink">{r.customer||"—"}</td>
                          <td className="px-4 py-2 text-slate-600">{r.project_name||"—"}</td>
                          <td className="px-4 py-2 text-slate-600">{r.product_line||"—"}</td>
                          <td className="px-4 py-2 font-semibold text-ink">{Math.round(r.annual_keur||0).toLocaleString()}</td>
                          <td className="px-4 py-2 text-slate-600">{r.sop||"—"}</td>
                          <td className="px-4 py-2 text-slate-600">{r.site||"—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          ))}
        </>
      )}
    </div>
  );
}

/* ─── ConsolidatedTab ─────────────────────────────────────────────── */
function ConsolidatedTab() {
  const { addToast } = useToast();
  const { email: currentEmail, role: currentRole } = getUserProfile();
  const [year, setYear] = useState(THIS_YEAR);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState(null);
  const [indEmail, setIndEmail] = useState(null);

  // All hooks must be declared before any conditional return
  useEffect(() => {
    if (currentRole === "COMMERCIAL") return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const r = await getKpiConsolidated(year);
        if (!cancelled) setData(r);
      } catch {
        if (!cancelled) addToast({ type: "error", message: "Failed to load consolidated KPIs" });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [year, currentRole]);

  // COMMERCIAL → show only their own KPIs, no consolidated view
  if (currentRole === "COMMERCIAL") {
    return <IndividualSection email={currentEmail} year={year} onBack={null} />;
  }

  if (indEmail) return <IndividualSection email={indEmail} year={year} onBack={() => setIndEmail(null)} />;

  const ren = data?.renewal, nb = data?.new_business;
  const rfa = data?.rfq_automotive, rfna = data?.rfq_non_auto;
  const sps = data?.salespersons || [];
  const renPct = ren?.annual_target_keur ? (ren.confirmed_keur / ren.annual_target_keur * 100) : null;
  const nbPct  = nb?.monthly_target_keur  ? (nb.ytd_keur / (nb.monthly_target_keur * 12) * 100)  : null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-end gap-4">
        <select value={year} onChange={e => setYear(Number(e.target.value))} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-ink">
          {KPI_YEARS.map(y => <option key={y} value={y}>{y}</option>)}
        </select>
      </div>

      {loading ? (
        <div className="flex justify-center py-20 text-slate-400">Loading…</div>
      ) : !data ? (
        <div className="flex justify-center py-20 text-slate-400">No data available for {year}</div>
      ) : (
        <>
          {/* Revenue Renewal */}
          <section className="kpi-panel">
            <div className="mb-5">
              <h3 className="font-display text-xl font-semibold text-ink">Renewal Performance</h3>
              <p className="mt-1 text-sm text-slate-500">Confirmed renewals (probability 100%) vs annual target — monthly breakdown</p>
            </div>
            <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <MTile label="Confirmed" value={`${Math.round(ren?.confirmed_keur||0).toLocaleString()} k€`} color="#046eaf" />
              <MTile label="Annual target" value={ren?.annual_target_keur!=null?`${Math.round(ren.annual_target_keur).toLocaleString()} k€`:"—"} color="#94a3b8" />
              <MTile label="Total pipeline" value={`${Math.round(ren?.pipeline_total_keur||0).toLocaleString()} k€`} color="#7c3aed" />
              <MTile label="Weighted pipeline" value={`${Math.round(ren?.pipeline_weighted_keur||0).toLocaleString()} k€`} color="#0891b2" />
            </div>
            <PBar pct={renPct} label="Progress vs annual target" />
            <div className="mt-5"><MBar monthly={ren?.monthly} target={ren?.monthly_target_keur} /></div>
            {ren?.by_site?.length > 0 && (
              <div className="mt-5">
                <h4 className="mb-3 text-sm font-semibold text-ink">Breakdown by site</h4>
                <ZTbl rows={ren.by_site} vLabel="Confirmed k€" fmt={r=>`${Math.round(r.confirmed_keur||0).toLocaleString()} k€`} />
              </div>
            )}
          </section>

          {/* New Business */}
          <section className="kpi-panel">
            <div className="mb-5">
              <h3 className="font-display text-xl font-semibold text-ink">New Business</h3>
              <p className="mt-1 text-sm text-slate-500">Year-to-date cumulative vs annual target — monthly target: {(nb?.monthly_target_keur??2000).toLocaleString()} k€/mo</p>
            </div>
            <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
              <MTile label="YTD cumulative" value={`${Math.round(nb?.ytd_keur||0).toLocaleString()} k€`} color="#059669" />
              <MTile label="Monthly target" value={`${(nb?.monthly_target_keur??2000).toLocaleString()} k€`} color="#94a3b8" />
              <MTile label="Annual target" value={`${Math.round((nb?.monthly_target_keur??2000)*12).toLocaleString()} k€`} color="#94a3b8" />
            </div>
            <PBar pct={nbPct} label="YTD vs annual target" />
            <div className="mt-5"><MBar monthly={nb?.monthly} target={nb?.monthly_target_keur} tint="#059669" /></div>
            {nb?.by_zone?.length > 0 && (
              <div className="mt-5">
                <h4 className="mb-3 text-sm font-semibold text-ink">Breakdown by zone</h4>
                <ZTbl rows={nb.by_zone} vLabel="k€" fmt={r=>`${Math.round(r.value||0).toLocaleString()} k€`} />
              </div>
            )}
          </section>

          {/* RFQ Automotive */}
          <section className="kpi-panel">
            <div className="mb-5">
              <h3 className="font-display text-xl font-semibold text-ink">Automotive RFQ Activity</h3>
              <p className="mt-1 text-sm text-slate-500">Monthly RFQ count for automotive segment — target: {rfa?.monthly_target??40} / month</p>
            </div>
            <MTile label="Total automotive RFQs" value={`${(rfa?.monthly||[]).reduce((s,d)=>s+d.value,0)} RFQs`} color="#ef7807" />
            <div className="mt-5"><MBar monthly={rfa?.monthly} target={rfa?.monthly_target} tint="#ef7807" /></div>
            {rfa?.by_zone?.length > 0 && (
              <div className="mt-5">
                <h4 className="mb-3 text-sm font-semibold text-ink">Breakdown by zone</h4>
                <ZTbl rows={rfa.by_zone} vLabel="# RFQ" fmt={r=>Math.round(r.value)} />
              </div>
            )}
          </section>

          {/* RFQ Non-Automotive */}
          <section className="kpi-panel">
            <div className="mb-5">
              <h3 className="font-display text-xl font-semibold text-ink">Non-Automotive RFQ Activity</h3>
              <p className="mt-1 text-sm text-slate-500">Monthly RFQ count for non-automotive segment — target: {rfna?.monthly_target??8} / month</p>
            </div>
            <MTile label="Total non-automotive RFQs" value={`${(rfna?.monthly||[]).reduce((s,d)=>s+d.value,0)} RFQs`} color="#7c3aed" />
            <div className="mt-5"><MBar monthly={rfna?.monthly} target={rfna?.monthly_target} tint="#7c3aed" /></div>
            {rfna?.by_zone?.length > 0 && (
              <div className="mt-5">
                <h4 className="mb-3 text-sm font-semibold text-ink">Breakdown by zone</h4>
                <ZTbl rows={rfna.by_zone} vLabel="# RFQ" fmt={r=>Math.round(r.value)} />
              </div>
            )}
          </section>

          {/* Sales Team Performance */}
          {sps.length > 0 && (
            <section className="kpi-panel">
              <div className="mb-5 flex items-center justify-between">
                <div>
                  <h3 className="font-display text-xl font-semibold text-ink">
                    {currentRole === "ZONE_MANAGER" ? "Team Performance" : "Sales Rep Performance"}
                  </h3>
                  <p className="mt-1 text-sm text-slate-500">Individual renewal, new business and RFQ activity per salesperson</p>
                </div>
              </div>
              <div className="overflow-x-auto rounded-xl border border-slate-100">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50 text-left">
                      {["Salesperson", "Renewal k€", "Target k€", "% Renewal", "New Business k€", "% New Biz", "# RFQ"].map(h => (
                        <th key={h} className="px-2 py-3 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400 sm:px-4 sm:text-[11px] sm:tracking-[0.22em]">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {sps.map((sp, i) => (
                      <tr key={i} className="border-t border-slate-100 hover:bg-slate-50/50">
                        <td className="px-2 py-3 sm:px-4">
                          <button onClick={() => setIndEmail(sp.identifier)} className="flex items-center gap-1 font-semibold text-tide hover:underline">
                            {sp.label||sp.identifier}<ExternalLink className="h-3 w-3 opacity-50" />
                          </button>
                        </td>
                        <td className="px-2 py-3 font-semibold text-ink sm:px-4">{Math.round(sp.renewal_confirmed_keur||0).toLocaleString()}</td>
                        <td className="px-2 py-3 text-slate-500 sm:px-4">{sp.renewal_target_keur!=null?Math.round(sp.renewal_target_keur).toLocaleString():"—"}</td>
                        <td className="px-2 py-3 sm:px-4">{sp.pct_renewal!=null?<span className="font-bold" style={{color:pctColor(sp.pct_renewal)}}>{Math.round(sp.pct_renewal)} %</span>:"—"}</td>
                        <td className="px-2 py-3 font-semibold text-ink sm:px-4">{Math.round(sp.new_business_keur||0).toLocaleString()}</td>
                        <td className="px-2 py-3 sm:px-4"><span className="font-bold" style={{color:pctColor(sp.pct_new_business)}}>{Math.round(sp.pct_new_business||0)} %</span></td>
                        <td className="px-2 py-3 font-semibold text-ink sm:px-4">{sp.nb_rfq}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}

function FL({lbl, children}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-base font-bold text-[#7c8da2]">{lbl}</span>
      {children}
    </label>
  );
}

/* ─── SettingsTab ─────────────────────────────────────────────────── */
function SettingsTab() {
  const { addToast } = useToast();
  const [year, setYear] = useState(THIS_YEAR);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [totalCa, setTotalCa] = useState("");
  const [renPct, setRenPct] = useState("25");
  const [rfqAutoYear, setRfqAutoYear] = useState("480");
  const [rfqNonAutoYear, setRfqNonAutoYear] = useState("96");
  const [nbTargetYear, setNbTargetYear] = useState("24000");

  const outstanding = useMemo(() => {
    const t = parseFloat(totalCa);
    return !totalCa || isNaN(t) ? null : t;
  }, [totalCa]);

  const renAnnual = useMemo(() =>
    outstanding !== null ? outstanding * 1000 * (parseFloat(renPct)||0) / 100 : null,
  [outstanding, renPct]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const d = await getKpiSettings(year);
        if (cancelled) return;
        setTotalCa(d.total_ca_meur != null ? String(d.total_ca_meur) : "");
        setRenPct(String(d.renewal_pct ?? 25));
        setRfqAutoYear(String((d.rfq_automotive_monthly_target ?? 40) * 12));
        setRfqNonAutoYear(String((d.rfq_non_auto_monthly_target ?? 8) * 12));
        setNbTargetYear(String((d.new_business_monthly_keur ?? 2000) * 12));
      } catch {
        if (!cancelled) addToast({ type: "error", message: "Failed to load settings" });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [year]);

  const save = async () => {
    setSaving(true);
    try {
      await upsertKpiSettings(year, {
        total_ca_meur: totalCa ? parseFloat(totalCa) : null,
        renewal_pct: parseFloat(renPct)||25,
        rfq_automotive_monthly_target: Math.round((parseInt(rfqAutoYear)||480) / 12),
        rfq_non_auto_monthly_target: Math.round((parseInt(rfqNonAutoYear)||96) / 12),
        new_business_monthly_keur: Math.round((parseFloat(nbTargetYear)||24000) / 12),
      });
      addToast({ type: "success", message: "Settings saved" });
    } catch {
      addToast({ type: "error", message: "Failed to save settings" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="w-full space-y-6">

      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-tide/10">
            <Settings className="h-5 w-5 text-tide" />
          </div>
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.3em] text-slate-400">Configuration</p>
            <h2 className="font-display text-2xl font-semibold tracking-tight text-ink">KPI Settings — {year}</h2>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={year}
            onChange={e => setYear(Number(e.target.value))}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-ink shadow-sm"
          >
            {KPI_YEARS.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <button
            onClick={save}
            disabled={saving}
            className="flex items-center gap-2 rounded-xl bg-tide px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:-translate-y-0.5 hover:bg-tide/90 hover:shadow-md disabled:translate-y-0 disabled:opacity-50"
          >
            <Save className="h-4 w-4" />
            {saving ? "Saving…" : "Save settings"}
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-16 text-slate-400">Loading…</div>
      ) : (
        <>
          {/* Revenue & Renewal */}
          <section className="kpi-panel">
            <div className="mb-6 flex items-start gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#046eaf]/10">
                <TrendingUp className="h-4 w-4 text-[#046eaf]" />
              </div>
              <div>
                <h3 className="font-display text-xl font-semibold text-ink">Revenue &amp; Renewal</h3>
                <p className="mt-0.5 text-sm text-slate-400">
                  Set the total revenue base and renewal rate — the renewal target is computed automatically.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
              <FL lbl="Total revenue M€">
                <input
                  type="number" step="0.1" min="0"
                  value={totalCa} onChange={e => setTotalCa(e.target.value)}
                  placeholder="e.g. 12.5"
                  className={inputSt}
                />
              </FL>
              <FL lbl="Renewal rate %">
                <input
                  type="number" step="0.5" min="0" max="100"
                  value={renPct} onChange={e => setRenPct(e.target.value)}
                  className={inputSt}
                />
              </FL>
              <FL lbl="Renewal target k€">
                <div className="flex items-center justify-between rounded-xl border border-tide/25 bg-tide/5 px-3 py-2">
                  <span className="rounded-md bg-tide/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-widest text-tide">auto</span>
                  <span className="text-sm font-bold text-tide">
                    {renAnnual !== null ? Math.round(renAnnual).toLocaleString() : "—"}
                  </span>
                </div>
              </FL>
            </div>
          </section>

          {/* Annual Targets */}
          <section className="kpi-panel">
            <div className="mb-6 flex items-start gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#ef7807]/10">
                <BarChart3 className="h-4 w-4 text-[#ef7807]" />
              </div>
              <div>
                <h3 className="font-display text-xl font-semibold text-ink">Annual Targets</h3>
                <p className="mt-0.5 text-sm text-slate-400">
                  Enter yearly targets — monthly values are derived automatically.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
              <FL lbl="RFQ Automotive — per year">
                <input
                  type="number" step="1" min="0"
                  value={rfqAutoYear} onChange={e => setRfqAutoYear(e.target.value)}
                  className={inputSt}
                />
              </FL>
              <FL lbl="RFQ Non-Automotive — per year">
                <input
                  type="number" step="1" min="0"
                  value={rfqNonAutoYear} onChange={e => setRfqNonAutoYear(e.target.value)}
                  className={inputSt}
                />
              </FL>
              <FL lbl="New Business k€ — per year">
                <input
                  type="number" step="100" min="0"
                  value={nbTargetYear} onChange={e => setNbTargetYear(e.target.value)}
                  className={inputSt}
                />
              </FL>
            </div>

            <div className="mt-5 rounded-2xl border border-slate-100 bg-slate-50/70 px-5 py-4">
              <p className="mb-3 text-base font-bold text-[#7c8da2]">
                Monthly breakdown — computed
              </p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {[
                  { lbl: "RFQ Automotive / month",  val: Math.round((parseInt(rfqAutoYear)   || 0) / 12).toLocaleString() },
                  { lbl: "RFQ Non-Automotive / month", val: Math.round((parseInt(rfqNonAutoYear) || 0) / 12).toLocaleString() },
                  { lbl: "New Business k€ / month", val: Math.round((parseFloat(nbTargetYear) || 0) / 12).toLocaleString() },
                ].map(({ lbl, val }) => (
                  <div key={lbl} className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
                    <span className="text-sm text-slate-500">{lbl}</span>
                    <span className="text-base font-bold text-tide">{val}</span>
                  </div>
                ))}
              </div>
            </div>
          </section>
        </>
      )}
    </div>
  );
}

/* ─── KpiDashboard (main) ─────────────────────────────────────────── */
export default function KpiDashboard() {
  const { showToast } = useToast();
  const { role: currentRole } = getUserProfile();
  const isOwner = currentRole === "OWNER";
  const [activeTab, setActiveTab] = useState("consolidated");
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({
    timeframe: "all", phase: "all", productLine: "all", creator: "all", sector: "all"
  });
  const [rbacCreatorList, setRbacCreatorList] = useState([]);

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        if (currentRole === "ZONE_MANAGER") {
          const [ownData, teamData] = await Promise.all([listRfqs(), getTeamView()]);
          const own = Array.isArray(ownData) ? ownData : [];
          const team = Array.isArray(teamData) ? teamData : [];
          const seen = new Set();
          const combined = [];
          for (const rfq of [...own, ...team]) {
            if (!seen.has(rfq.rfq_id)) {
              seen.add(rfq.rfq_id);
              combined.push(rfq);
            }
          }
          setRequests(combined);
        } else {
          const data = await listRfqs();
          setRequests(Array.isArray(data) ? data : []);
        }
      } catch {
        setRequests([]);
        showToast("Unable to load KPI data. Please refresh.", { type: "error", title: "Dashboard unavailable" });
      } finally {
        setLoading(false);
      }
    })();
  }, [showToast, currentRole]);

  useEffect(() => {
    if (currentRole === "COMMERCIAL") return;
    (async () => {
      try {
        if (currentRole === "OWNER") {
          const users = await getOwnerUsers();
          setRbacCreatorList(users.map(u => ({ value: u.email, label: u.full_name || u.email })));
        } else if (currentRole === "ZONE_MANAGER") {
          const members = await getTeamMembers(true);
          setRbacCreatorList(members.map(m => ({ value: m.email, label: m.person })));
        }
      } catch {
        // ignore
      }
    })();
  }, [currentRole]);

  const records        = useMemo(() => buildKpiRecords(requests),        [requests]);
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

  const creatorOptions = useMemo(() => {
    if (currentRole === "COMMERCIAL") return [];
    if (currentRole === "OWNER" || currentRole === "ZONE_MANAGER") {
      return [{ value: "all", label: "All creators" }, ...rbacCreatorList];
    }
    return mkOptions(filterOptions.creators, "All creators");
  }, [currentRole, rbacCreatorList, filterOptions.creators]);
  const phaseOptions       = useMemo(() => mkOptions(KPI_PHASES,                "All phases"),      []);
  const productLineOptions = useMemo(() => mkOptions(filterOptions.productLines,"All product lines"),[filterOptions.productLines]);
  const sectorOptions      = useMemo(() => mkOptions(KPI_SECTOR_ORDER,          "All sectors"),     []);

  return (
    <div className="min-h-screen">
      <TopBar />

      <div className="px-3 py-5 sm:px-4 sm:py-7 md:px-5 md:py-9 xl:px-6 xl:py-10">
        <div className="mx-auto flex w-full flex-col gap-6">
          <>
            {/* Hero — always visible */}
            <section className="kpi-hero">
              <div className="kpi-orb kpi-orb-one" />
              <div className="kpi-orb kpi-orb-two" />
              <div className="kpi-orb kpi-orb-three" />
              <div className="relative z-[1] flex flex-col gap-4">
                <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                  <h1 className="flex items-center gap-2 font-display text-[1.25rem] leading-tight text-white sm:text-[1.6rem] md:text-[2rem]">
                    <BarChart3 className="h-6 w-6 shrink-0" />
                    KPI Dashboard
                  </h1>
                  <div className="flex flex-wrap items-center gap-2.5">
                    <Link to="/dashboard" className="kpi-hero-button">
                      Request dashboard <ArrowRight className="h-3.5 w-3.5" />
                    </Link>
                  </div>
                </div>
                {/* Tab nav */}
                <div className="flex gap-1 w-fit rounded-2xl bg-white/15 p-1 backdrop-blur-sm overflow-x-auto">
                  {[
                    { id: "consolidated", label: "Consolidated KPI" },
                    { id: "pipeline",     label: "Pipeline RFQ" },
                    ...(isOwner ? [{ id: "settings", label: "Settings" }] : []),
                  ].map(t => (
                    <button
                      key={t.id}
                      onClick={() => setActiveTab(t.id)}
                      className={`rounded-xl px-3 py-1.5 text-xs font-semibold whitespace-nowrap transition sm:px-4 sm:py-2 sm:text-sm ${
                        activeTab === t.id
                          ? "bg-white text-ink shadow"
                          : "text-white/80 hover:bg-white/15 hover:text-white"
                      }`}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>
            </section>

            {/* Pipeline tab */}
            {activeTab === "pipeline" && (loading ? <KpiLoadingState /> : (
              <>
              {/* Filters */}
              <section className="relative overflow-hidden rounded-[2rem] border border-white/70 bg-white/75 px-3 py-4 shadow-[0_20px_60px_rgba(15,23,42,0.08)] backdrop-blur-xl sm:px-6 md:px-7 md:py-5">
                <div className="pointer-events-none absolute -right-20 -top-20 h-56 w-56 rounded-full bg-[#046eaf]/10 blur-3xl" />
                <div className="pointer-events-none absolute -bottom-24 -left-24 h-64 w-64 rounded-full bg-[#ef7807]/10 blur-3xl" />

                <div className="relative z-[1] mb-4 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-[0.32em] text-slate-400">
                      Filters
                    </p>
                    <h3 className="mt-2 font-display text-2xl font-semibold tracking-tight text-ink">
                      Interactive KPI controls
                    </h3>
                  </div>

                  {/* Reset button */}
                  <button
                    type="button"
                    onClick={() =>
                      setFilters({
                        timeframe: "all",
                        phase: "all",
                        productLine: "all",
                        creator: "all",
                        sector: "all"
                      })
                    }
                    className="flex items-center gap-2 rounded-xl bg-[#ef7807] px-4 py-2 text-sm font-semibold text-white shadow-md transition hover:-translate-y-0.5 hover:bg-[#d96d06] hover:shadow-lg"
                  >
                    Reset Filters
                  </button>
                </div>

                <div className="relative z-[1] grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
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

                  {currentRole !== "COMMERCIAL" && (
                    <FilterSelect
                      label="Creator"
                      value={filters.creator}
                      onChange={(v) => setFilters((c) => ({ ...c, creator: v }))}
                      options={creatorOptions}
                      icon={Users}
                    />
                  )}

                  <FilterSelect
                    label="Sector"
                    value={filters.sector}
                    onChange={(v) => setFilters((c) => ({ ...c, sector: v }))}
                    options={sectorOptions}
                    icon={Factory}
                  />

                </div>
              </section>

              {/* Pipeline metric cards */}
              <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 xl:grid-cols-6">
                <MetricCard icon={BriefcaseBusiness} tone="blue"    label="Total requests"    value={fmtCompact(summary.totalRequests)}   note="All requests visible after filters." />
                <MetricCard icon={Activity}           tone="mint"    label="Open pipeline"     value={fmtCompact(summary.activeRequests)}  note={`${fmtKeur(summary.openAmount)} active in the commercial flow.`} />
                <MetricCard icon={Layers3}            tone="sun"     label="Closed pipeline"   value={fmtCompact(summary.closedRequests)}  note="Cancelled and lost requests." />
                <MetricCard icon={ShieldCheck}         tone="success" label="Win rate"          value={fmtPct(summary.winRate)}         note="Positive outcomes vs. lost / cancelled." />
                <MetricCard icon={Clock3}              tone="violet"  label="Average aging"     value={`${fmtCompact(summary.averageAgeDays)} days`} note="From creation to today." />
                <MetricCard icon={AlertTriangle}       tone="sun"     label="At risk requests"  value={fmtCompact(summary.atRiskRequests)}  note="Older items in validation or costing." />
              </div>

              {/* Phase charts */}
              <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
                <Panel eyebrow="Pipeline anatomy" title="Phase split & commercial weight"
                  subtitle="Request count and value across operating phases.">
                  <PhaseComboChart
                    segments={summary.phaseDistribution} total={summary.totalRequests}
                    selectedLabel={filters.phase}
                    onSelectSegment={label => toggle("phase", label)}
                  />
                </Panel>
                <Panel eyebrow="Phase share" title="Phase distribution"
                  subtitle="Phase mix in the filtered pipeline.">
                  <PhasePieChart
                    segments={summary.phaseDistribution} total={summary.totalRequests}
                    selectedLabel={filters.phase}
                    onSelectSegment={label => toggle("phase", label)}
                  />
                </Panel>
              </div>

              <div className="grid gap-6 lg:grid-cols-2">
                <Panel eyebrow="Phase x status" title="Status distribution by phase"
                  subtitle="See how each operating phase is split across its underlying statuses.">
                  <StackedDistributionChart
                    data={summary.phaseStatusDistribution}
                    selectedLabel={filters.phase}
                    onSelectLabel={label => toggle("phase", label)}
                  />
                </Panel>
                <Panel eyebrow="Type x phase" title="Phase distribution by type"
                  subtitle="See where RFQ, RFI and Potential sit across the operating phases.">
                  <StackedDistributionChart
                    data={summary.typePhaseDistribution}
                  />
                </Panel>
              </div>

              {/* Trend charts */}
              <div className="grid gap-6 lg:grid-cols-2">
                <Panel eyebrow="Volume trend" title="Monthly request creation"
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
                    emptyLabel="No request value for the selected filters."
                  />
                </Panel>
              </div>

              {/* Ranking charts */}
              <div className="grid gap-6 lg:grid-cols-2">
                <Panel eyebrow="Status spread" title="Status concentration"
                  subtitle="Heaviest sub-statuses in the current slice.">
                  <StatusConcentrationChart data={summary.statusDistribution} />
                </Panel>
                <Panel eyebrow="Customer mix" title="Top customers by value"
                  subtitle="Most valuable accounts in the filtered set.">
                  <LeaderboardBars
                    data={summary.topCustomers}
                    formatter={v => fmtKeur(v)}
                    secondaryFormatter={v => fmtRequestCount(v)}
                    emptyMessage="No customer value data available."
                  />
                </Panel>
                <Panel eyebrow="Product lens" title="Product line mix"
                  subtitle="Request volume across product lines.">
                  <ColumnCategoryChart
                    data={summary.productLineDistribution}
                    formatter={v => `${intFmt.format(v)}`}
                    secondaryFormatter={v => fmtKeur(v)}
                    emptyMessage="No product line data for the current filters."
                    onSelectItem={label => toggle("productLine", label)}
                    selectedLabel={filters.productLine}
                  />
                </Panel>
                <Panel eyebrow="Customer volume" title="Top customers by request volume"
                  subtitle="Accounts generating the highest number of requests.">
                  <ColumnCategoryChart
                    data={summary.topCustomersByVolume}
                    formatter={v => `${intFmt.format(v)}`}
                    secondaryFormatter={v => fmtKeur(v)}
                    emptyMessage="No customer volume data available."
                  />
                </Panel>
                {currentRole !== "COMMERCIAL" && (
                  <Panel eyebrow="Ownership lens" title="Top creators by request volume"
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
                )}
              </div>
            </>))}

            {activeTab === "consolidated" && <ConsolidatedTab />}
            {activeTab === "settings" && isOwner && <SettingsTab />}
          </>
        </div>
      </div>
    </div>
  );
}