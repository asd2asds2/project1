import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { apiFetch } from "../api";
import { useAuth } from "../context/AuthContext";
import { colorForBranchId, BRANCH_PALETTE } from "../theme/branchPalette";

const YEAR = 2026;
const MONTHS = ["Янв", "Фев", "Мар", "Апр", "Май", "Июн", "Июл", "Авг", "Сен", "Окт", "Ноя", "Дек"];

function fmtMoney(n) {
  return Number(n || 0).toLocaleString("ru-RU", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

// Короткая запись сумм для подписей на графиках: 12,5 млн / 840 тыс.
function fmtShort(n) {
  const v = Number(n || 0);
  const abs = Math.abs(v);
  if (abs >= 1e9) return `${(v / 1e9).toFixed(1).replace(".", ",")} млрд`;
  if (abs >= 1e6) return `${(v / 1e6).toFixed(1).replace(".", ",")} млн`;
  if (abs >= 1e3) return `${Math.round(v / 1e3)} тыс`;
  return String(Math.round(v));
}

function plural(n) {
  const mod10 = n % 10, mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return "закупка";
  if ([2, 3, 4].includes(mod10) && ![12, 13, 14].includes(mod100)) return "закупки";
  return "закупок";
}

// Плавное появление графиков: сначала рисуем «нулевые» значения,
// через кадр — настоящие, и CSS-transition анимирует рост.
function useMounted() {
  const [m, setM] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setM(true), 60);
    return () => clearTimeout(t);
  }, []);
  return m;
}

/* ───────────── Кольцо прогресса (выполнение плана) ───────────── */
function ProgressRing({ pct }) {
  const mounted = useMounted();
  const r = 38;
  const c = 2 * Math.PI * r;
  const shown = pct === null ? 0 : Math.min(100, pct);
  const over = pct !== null && pct > 100;
  return (
    <svg width="104" height="104" viewBox="0 0 104 104" style={{ flexShrink: 0 }}>
      <defs>
        <linearGradient id="ringGrad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" style={{ stopColor: "var(--accent)" }} />
          <stop offset="100%" style={{ stopColor: over ? "var(--warning)" : "var(--success)" }} />
        </linearGradient>
      </defs>
      <circle cx="52" cy="52" r={r} fill="none" style={{ stroke: "var(--border)" }} strokeWidth="10" />
      <circle
        cx="52" cy="52" r={r} fill="none" stroke="url(#ringGrad)" strokeWidth="10" strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={mounted ? c * (1 - shown / 100) : c}
        transform="rotate(-90 52 52)"
        style={{ transition: "stroke-dashoffset 1s cubic-bezier(.2,.8,.2,1)" }}
      />
      <text x="52" y="52" textAnchor="middle" dominantBaseline="central" style={{ fill: "var(--text)", fontSize: 20, fontWeight: 700 }}>
        {pct === null ? "—" : `${pct}%`}
      </text>
    </svg>
  );
}

/* ───────────── Столбчатая диаграмма: план и факт по кварталам ───────────── */
function QuarterChart({ data }) {
  const mounted = useMounted();
  const W = 520, H = 250, padL = 52, padR = 12, padT = 18, padB = 34;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;
  const maxVal = Math.max(1, ...data.flatMap((d) => [d.plan, d.fact]));
  // «Красивый» верх шкалы
  const pow = Math.pow(10, Math.floor(Math.log10(maxVal)));
  const niceMax = Math.ceil(maxVal / (pow / 2)) * (pow / 2);
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => niceMax * t);
  const groupW = innerW / data.length;
  const barW = Math.min(34, groupW * 0.32);
  const y = (v) => padT + innerH - (v / niceMax) * innerH;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto", display: "block" }} role="img" aria-label="План и факт по кварталам">
      <defs>
        <linearGradient id="factGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" style={{ stopColor: "var(--accent)" }} />
          <stop offset="100%" style={{ stopColor: "var(--accent)", stopOpacity: 0.55 }} />
        </linearGradient>
      </defs>
      {ticks.map((t) => (
        <g key={t}>
          <line x1={padL} x2={W - padR} y1={y(t)} y2={y(t)} style={{ stroke: "var(--border)" }} strokeDasharray={t === 0 ? "0" : "3 4"} />
          <text x={padL - 8} y={y(t)} textAnchor="end" dominantBaseline="central" style={{ fill: "var(--text-muted)", fontSize: 10.5 }}>
            {fmtShort(t)}
          </text>
        </g>
      ))}
      {data.map((d, i) => {
        const cx = padL + groupW * i + groupW / 2;
        const planH = (d.plan / niceMax) * innerH;
        const factH = (d.fact / niceMax) * innerH;
        const pct = d.plan > 0 ? Math.round((d.fact / d.plan) * 100) : null;
        return (
          <g key={d.q}>
            <title>{`${d.q} кв.: факт ${fmtMoney(d.fact)} ₽, план ${fmtMoney(d.plan)} ₽${pct !== null ? ` (${pct}%)` : ""}`}</title>
            {/* план — контурный столбец */}
            <rect
              x={cx - barW - 3} y={padT + innerH - planH} width={barW} height={Math.max(0, planH)} rx="4"
              style={{ fill: "var(--accent-soft)", stroke: "var(--accent)", strokeDasharray: "4 3", strokeWidth: 1.2, transformBox: "fill-box", transformOrigin: "bottom", transform: mounted ? "scaleY(1)" : "scaleY(0)", transition: `transform .8s cubic-bezier(.2,.8,.2,1) ${i * 80}ms` }}
            />
            {/* факт — заливка */}
            <rect
              x={cx + 3} y={padT + innerH - factH} width={barW} height={Math.max(0, factH)} rx="4" fill="url(#factGrad)"
              style={{ transformBox: "fill-box", transformOrigin: "bottom", transform: mounted ? "scaleY(1)" : "scaleY(0)", transition: `transform .8s cubic-bezier(.2,.8,.2,1) ${i * 80 + 120}ms` }}
            />
            {d.fact > 0 && (
              <text x={cx + 3 + barW / 2} y={y(d.fact) - 5} textAnchor="middle" style={{ fill: "var(--text)", fontSize: 10.5, fontWeight: 600, opacity: mounted ? 1 : 0, transition: "opacity .6s .6s" }}>
                {fmtShort(d.fact)}
              </text>
            )}
            <text x={cx} y={H - 12} textAnchor="middle" style={{ fill: "var(--text-secondary)", fontSize: 12, fontWeight: 600 }}>
              {d.q} кв.
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/* ───────────── Кольцевая диаграмма: доли филиалов ───────────── */
function BranchDonut({ items, total }) {
  const mounted = useMounted();
  const [hover, setHover] = useState(null);
  const r = 70, c = 2 * Math.PI * r, gap = items.length > 1 ? 2 : 0;
  let acc = 0;
  const active = hover !== null ? items[hover] : null;

  return (
    <div style={{ display: "flex", gap: 20, alignItems: "center", flexWrap: "wrap", justifyContent: "center" }}>
      <svg width="190" height="190" viewBox="0 0 190 190" style={{ flexShrink: 0 }} role="img" aria-label="Распределение суммы по филиалам">
        <circle cx="95" cy="95" r={r} fill="none" style={{ stroke: "var(--border)" }} strokeWidth="24" />
        {items.map((it, i) => {
          const len = (it.total / total) * c;
          const seg = Math.max(0, len - gap);
          const off = -acc;
          acc += len;
          return (
            <circle
              key={it.branch_id}
              cx="95" cy="95" r={r} fill="none" stroke={it.color}
              strokeWidth={hover === i ? 30 : 24}
              strokeDasharray={`${mounted ? seg : 0} ${c}`}
              strokeDashoffset={off}
              transform="rotate(-90 95 95)"
              style={{ transition: "stroke-dasharray .9s cubic-bezier(.2,.8,.2,1), stroke-width .15s", cursor: "pointer", opacity: hover === null || hover === i ? 1 : 0.35 }}
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
            >
              <title>{`${it.branch_name}: ${fmtMoney(it.total)} ₽ (${Math.round((it.total / total) * 100)}%)`}</title>
            </circle>
          );
        })}
        <text x="95" y="86" textAnchor="middle" style={{ fill: "var(--text-muted)", fontSize: 10.5, textTransform: "uppercase", letterSpacing: 0.5 }}>
          {active ? active.branch_name.slice(0, 18) : "Всего"}
        </text>
        <text x="95" y="108" textAnchor="middle" style={{ fill: "var(--text)", fontSize: 19, fontWeight: 700 }}>
          {fmtShort(active ? active.total : total)}
        </text>
        <text x="95" y="126" textAnchor="middle" style={{ fill: "var(--text-secondary)", fontSize: 11 }}>
          {active ? `${Math.round((active.total / total) * 100)}%` : "руб."}
        </text>
      </svg>

      <div style={{ display: "flex", flexDirection: "column", gap: 7, minWidth: 150, flex: 1, maxHeight: 190, overflow: "auto" }}>
        {items.map((it, i) => (
          <div
            key={it.branch_id}
            onMouseEnter={() => setHover(i)}
            onMouseLeave={() => setHover(null)}
            style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, opacity: hover === null || hover === i ? 1 : 0.45, transition: "opacity .15s", cursor: "default" }}
          >
            <span style={{ width: 10, height: 10, borderRadius: 3, background: it.color, flexShrink: 0 }} />
            <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "var(--text)" }}>{it.branch_name}</span>
            <span style={{ color: "var(--text-secondary)", fontVariantNumeric: "tabular-nums" }}>{Math.round((it.total / total) * 100)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ───────────── Рейтинг филиалов: горизонтальные полосы ───────────── */
function BranchBars({ items }) {
  const mounted = useMounted();
  const max = Math.max(1, ...items.map((i) => i.total));
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {items.map((it, i) => (
        <div key={it.branch_id}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", fontSize: 13, marginBottom: 5, gap: 10 }}>
            <span style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--text)", minWidth: 0 }}>
              <span style={{ width: 10, height: 10, borderRadius: "50%", background: it.color, flexShrink: 0 }} />
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{it.branch_name}</span>
            </span>
            <span style={{ fontVariantNumeric: "tabular-nums", fontWeight: 600, color: "var(--text)", whiteSpace: "nowrap" }}>{fmtMoney(it.total)} ₽</span>
          </div>
          <div style={{ height: 9, background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 6, overflow: "hidden" }}>
            <div
              style={{
                height: "100%",
                width: mounted ? `${(it.total / max) * 100}%` : "0%",
                background: `linear-gradient(90deg, ${it.color}, ${it.color}aa)`,
                borderRadius: 6,
                transition: `width .9s cubic-bezier(.2,.8,.2,1) ${i * 60}ms`,
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

/* ───────────── Квартал × филиал: столбцы с накоплением ───────────── */
function StackedQuarterChart({ data, branchOrder }) {
  const mounted = useMounted();
  const [hover, setHover] = useState(null); // { q, key }
  const W = 520, H = 260, padL = 52, padR = 12, padT = 16, padB = 34;
  const innerW = W - padL - padR, innerH = H - padT - padB;
  const maxVal = Math.max(1, ...data.map((d) => d.total));
  const pow = Math.pow(10, Math.floor(Math.log10(maxVal)));
  const niceMax = Math.ceil(maxVal / (pow / 2)) * (pow / 2);
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => niceMax * t);
  const groupW = innerW / data.length;
  const barW = Math.min(56, groupW * 0.55);
  const y = (v) => padT + innerH - (v / niceMax) * innerH;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto", display: "block" }} role="img" aria-label="Суммы по кварталам в разрезе филиалов">
      {ticks.map((t) => (
        <g key={t}>
          <line x1={padL} x2={W - padR} y1={y(t)} y2={y(t)} style={{ stroke: "var(--border)" }} strokeDasharray={t === 0 ? "0" : "3 4"} />
          <text x={padL - 8} y={y(t)} textAnchor="end" dominantBaseline="central" style={{ fill: "var(--text-muted)", fontSize: 10.5 }}>{fmtShort(t)}</text>
        </g>
      ))}
      {data.map((d, i) => {
        const cx = padL + groupW * i + groupW / 2;
        let acc = 0;
        return (
          <g key={d.q}>
            {d.segments.map((sg) => {
              const h = (sg.value / niceMax) * innerH;
              const yy = padT + innerH - ((acc + sg.value) / niceMax) * innerH;
              acc += sg.value;
              const isHover = hover && hover.q === d.q && hover.key === sg.key;
              return (
                <rect
                  key={sg.key}
                  x={cx - barW / 2} y={yy} width={barW} height={Math.max(0, h)}
                  fill={sg.color}
                  style={{
                    transformBox: "fill-box", transformOrigin: "bottom",
                    transform: mounted ? "scaleY(1)" : "scaleY(0)",
                    transition: `transform .8s cubic-bezier(.2,.8,.2,1) ${i * 80}ms, opacity .15s`,
                    opacity: hover && !isHover ? 0.4 : 1,
                    stroke: "var(--surface)", strokeWidth: 1,
                    cursor: "pointer",
                  }}
                  onMouseEnter={() => setHover({ q: d.q, key: sg.key })}
                  onMouseLeave={() => setHover(null)}
                >
                  <title>{`${sg.name}: ${fmtMoney(sg.value)} ₽ (${d.q} кв.)`}</title>
                </rect>
              );
            })}
            {d.total > 0 && (
              <text x={cx} y={y(d.total) - 6} textAnchor="middle" style={{ fill: "var(--text)", fontSize: 10.5, fontWeight: 600, opacity: mounted ? 1 : 0, transition: "opacity .6s .6s" }}>
                {fmtShort(d.total)}
              </text>
            )}
            <text x={cx} y={H - 12} textAnchor="middle" style={{ fill: "var(--text-secondary)", fontSize: 12, fontWeight: 600 }}>{d.q} кв.</text>
          </g>
        );
      })}
    </svg>
  );
}

/* ───────────── Нарастающий итог по месяцам vs план на год ───────────── */
function CumulativeChart({ months, yearPlan }) {
  const mounted = useMounted();
  const [hover, setHover] = useState(null);
  const W = 520, H = 260, padL = 52, padR = 14, padT = 18, padB = 32;
  const innerW = W - padL - padR, innerH = H - padT - padB;

  let run = 0;
  const pts = months.map((m) => { run += m.total; return { ...m, cum: run }; });
  const maxVal = Math.max(1, yearPlan, run);
  const pow = Math.pow(10, Math.floor(Math.log10(maxVal)));
  const niceMax = Math.ceil(maxVal / (pow / 2)) * (pow / 2);
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => niceMax * t);
  const step = innerW / 11;
  const x = (i) => padL + step * i;
  const y = (v) => padT + innerH - (v / niceMax) * innerH;

  const line = pts.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(p.cum).toFixed(1)}`).join(" ");
  const area = `${line} L${x(11)},${y(0)} L${x(0)},${y(0)} Z`;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto", display: "block" }} role="img" aria-label="Нарастающий итог по месяцам">
      <defs>
        <linearGradient id="cumGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" style={{ stopColor: "var(--accent)", stopOpacity: 0.35 }} />
          <stop offset="100%" style={{ stopColor: "var(--accent)", stopOpacity: 0.02 }} />
        </linearGradient>
        <clipPath id="cumClip">
          <rect x="0" y="0" height={H} width={mounted ? W : 0} style={{ transition: "width 1.2s cubic-bezier(.2,.8,.2,1)" }} />
        </clipPath>
      </defs>
      {ticks.map((t) => (
        <g key={t}>
          <line x1={padL} x2={W - padR} y1={y(t)} y2={y(t)} style={{ stroke: "var(--border)" }} strokeDasharray={t === 0 ? "0" : "3 4"} />
          <text x={padL - 8} y={y(t)} textAnchor="end" dominantBaseline="central" style={{ fill: "var(--text-muted)", fontSize: 10.5 }}>{fmtShort(t)}</text>
        </g>
      ))}
      {yearPlan > 0 && (
        <g>
          <line x1={padL} x2={W - padR} y1={y(yearPlan)} y2={y(yearPlan)} style={{ stroke: "var(--warning)" }} strokeWidth="1.4" strokeDasharray="6 4" />
          <text x={W - padR} y={y(yearPlan) - 6} textAnchor="end" style={{ fill: "var(--warning)", fontSize: 10.5, fontWeight: 600 }}>план {fmtShort(yearPlan)}</text>
        </g>
      )}
      <g clipPath="url(#cumClip)">
        <path d={area} fill="url(#cumGrad)" />
        <path d={line} fill="none" style={{ stroke: "var(--accent)" }} strokeWidth="2.4" strokeLinejoin="round" strokeLinecap="round" />
        {pts.map((p, i) => (
          <circle key={i} cx={x(i)} cy={y(p.cum)} r={hover === i ? 5 : 3} style={{ fill: "var(--surface)", stroke: "var(--accent)", strokeWidth: 2, transition: "r .12s" }} />
        ))}
      </g>
      {pts.map((p, i) => (
        <g key={`h${i}`}>
          <rect
            x={x(i) - step / 2} y={padT} width={step} height={innerH} fill="transparent"
            onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}
          >
            <title>{`${MONTHS[i]}: +${fmtMoney(p.total)} ₽, нарастающим ${fmtMoney(p.cum)} ₽ (${p.items} ${plural(p.items)})`}</title>
          </rect>
          <text x={x(i)} y={H - 10} textAnchor="middle" style={{ fill: hover === i ? "var(--text)" : "var(--text-muted)", fontSize: 10.5, fontWeight: hover === i ? 700 : 400 }}>{MONTHS[i]}</text>
        </g>
      ))}
      {hover !== null && (
        <g pointerEvents="none">
          <line x1={x(hover)} x2={x(hover)} y1={padT} y2={padT + innerH} style={{ stroke: "var(--text-muted)" }} strokeDasharray="2 3" />
          <text
            x={Math.min(Math.max(x(hover), padL + 50), W - padR - 50)} y={padT - 4} textAnchor="middle"
            style={{ fill: "var(--text)", fontSize: 11, fontWeight: 700 }}
          >
            {fmtShort(pts[hover].cum)} ₽
          </text>
        </g>
      )}
    </svg>
  );
}

/* ───────────── Способы закупки: пончик + список ───────────── */
function MethodChart({ items, total }) {
  const mounted = useMounted();
  const [hover, setHover] = useState(null);
  const r = 54, c = 2 * Math.PI * r, gap = items.length > 1 ? 2 : 0;
  let acc = 0;
  const active = hover !== null ? items[hover] : null;
  return (
    <div style={{ display: "flex", gap: 18, alignItems: "center", flexWrap: "wrap", justifyContent: "center" }}>
      <svg width="160" height="160" viewBox="0 0 160 160" style={{ flexShrink: 0 }} role="img" aria-label="Способы закупки">
        <circle cx="80" cy="80" r={r} fill="none" style={{ stroke: "var(--border)" }} strokeWidth="20" />
        {items.map((it, i) => {
          const len = (it.total / total) * c;
          const seg = Math.max(0, len - gap);
          const off = -acc;
          acc += len;
          return (
            <circle
              key={it.method} cx="80" cy="80" r={r} fill="none" stroke={it.color}
              strokeWidth={hover === i ? 26 : 20}
              strokeDasharray={`${mounted ? seg : 0} ${c}`} strokeDashoffset={off}
              transform="rotate(-90 80 80)"
              style={{ transition: "stroke-dasharray .9s cubic-bezier(.2,.8,.2,1), stroke-width .15s", cursor: "pointer", opacity: hover === null || hover === i ? 1 : 0.35 }}
              onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}
            >
              <title>{`${it.method}: ${fmtMoney(it.total)} ₽, ${it.items} ${plural(it.items)}`}</title>
            </circle>
          );
        })}
        <text x="80" y="72" textAnchor="middle" style={{ fill: "var(--text-muted)", fontSize: 10.5, textTransform: "uppercase", letterSpacing: 0.5 }}>{active ? active.method : "Способов"}</text>
        <text x="80" y="94" textAnchor="middle" style={{ fill: "var(--text)", fontSize: 20, fontWeight: 700 }}>{active ? `${Math.round((active.total / total) * 100)}%` : items.length}</text>
        <text x="80" y="111" textAnchor="middle" style={{ fill: "var(--text-secondary)", fontSize: 10.5 }}>{active ? fmtShort(active.total) : "закупки"}</text>
      </svg>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, flex: 1, minWidth: 160 }}>
        {items.map((it, i) => (
          <div
            key={it.method}
            onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}
            style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, opacity: hover === null || hover === i ? 1 : 0.45, transition: "opacity .15s" }}
          >
            <span style={{ width: 10, height: 10, borderRadius: 3, background: it.color, flexShrink: 0 }} />
            <span style={{ flex: 1, color: "var(--text)", fontWeight: 600 }}>{it.method}</span>
            <span style={{ color: "var(--text-muted)", fontVariantNumeric: "tabular-nums" }}>{it.items} шт.</span>
            <span style={{ color: "var(--text-secondary)", fontVariantNumeric: "tabular-nums", minWidth: 62, textAlign: "right" }}>{fmtShort(it.total)} ₽</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function HomePage() {
  const { user } = useAuth();
  const canReview = user?.role === "admin" || user?.role === "financier";
  const [summary, setSummary] = useState(null);
  const [branches, setBranches] = useState([]);
  const [plan, setPlan] = useState({});
  const [error, setError] = useState("");

  function loadPlan() {
    apiFetch(`/api/plan?year=${YEAR}`).then((d) => setPlan(d.plan)).catch((err) => setError(err.message));
  }

  useEffect(() => {
    apiFetch(`/api/purchases/summary?year=${YEAR}`)
      .then(setSummary)
      .catch((err) => setError(err.message));
    apiFetch(`/api/branches`)
      .then((d) => setBranches(d.branches))
      .catch((err) => setError(err.message));
    loadPlan();
  }, []);

  async function editPlan(q, label) {
    const current = plan[q] || 0;
    const input = prompt(`План ${label}, руб.:`, String(current));
    if (input === null) return;
    const amount = Number(String(input).replace(/[^\d.,-]/g, "").replace(",", "."));
    if (!Number.isFinite(amount) || amount < 0) {
      setError("Некорректная сумма плана");
      return;
    }
    try {
      await apiFetch(`/api/plan`, { method: "PUT", body: JSON.stringify({ year: YEAR, quarter: q, amount }) });
      setPlan((prev) => ({ ...prev, [q]: amount }));
    } catch (err) {
      setError(err.message);
    }
  }

  const yearFact = summary ? summary.byQuarter.reduce((s, q) => s + Number(q.total), 0) : 0;
  const yearItems = summary ? summary.byQuarter.reduce((s, q) => s + Number(q.items), 0) : 0;
  const yearPlan = Number(plan[0] || 0);
  const yearPct = yearPlan > 0 ? Math.round((yearFact / yearPlan) * 100) : null;
  const remaining = yearPlan - yearFact;

  const quarterData = useMemo(
    () =>
      [1, 2, 3, 4].map((q) => {
        const row = summary?.byQuarter.find((r) => Number(r.quarter) === q);
        return { q, fact: row ? Number(row.total) : 0, items: row ? Number(row.items) : 0, plan: Number(plan[q] || 0) };
      }),
    [summary, plan]
  );

  const branchItems = useMemo(
    () =>
      (summary?.byBranch || [])
        .map((b) => ({ ...b, total: Number(b.total), color: colorForBranchId(branches, b.branch_id) }))
        .sort((a, b) => b.total - a.total),
    [summary, branches]
  );
  const branchTotal = branchItems.reduce((s, b) => s + b.total, 0);
  const donutItems = branchItems.filter((b) => b.total > 0);

  // Квартал × филиал
  const stackedData = useMemo(() => {
    const rows = summary?.byQuarterBranch || [];
    return [1, 2, 3, 4].map((q) => {
      const segments = rows
        .filter((r) => Number(r.quarter) === q && Number(r.total) > 0)
        .map((r) => ({
          key: String(r.branch_id), name: r.branch_name, value: Number(r.total),
          color: colorForBranchId(branches, r.branch_id),
        }))
        .sort((a, b) => b.value - a.value);
      return { q, segments, total: segments.reduce((s, x) => s + x.value, 0) };
    });
  }, [summary, branches]);
  const hasStacked = stackedData.some((d) => d.total > 0);

  // Месяцы (12 точек, пустые = 0)
  const monthData = useMemo(
    () =>
      Array.from({ length: 12 }, (_, i) => {
        const row = summary?.byMonth?.find((r) => Number(r.month) === i + 1);
        return { month: i + 1, total: row ? Number(row.total) : 0, items: row ? Number(row.items) : 0 };
      }),
    [summary]
  );
  const hasMonths = monthData.some((m) => m.total > 0);
  const datedItems = monthData.reduce((s, m) => s + m.items, 0);

  // Способы закупки
  const methodItems = useMemo(
    () =>
      (summary?.byMethod || [])
        .map((m, i) => ({ method: m.method, total: Number(m.total), items: Number(m.items), color: BRANCH_PALETTE[(i * 5) % BRANCH_PALETTE.length] }))
        .filter((m) => m.total > 0),
    [summary]
  );
  const methodTotal = methodItems.reduce((s, m) => s + m.total, 0);

  // Группы товаров (переиспользуем BranchBars: ему нужны branch_id / branch_name)
  const groupItems = useMemo(
    () =>
      (summary?.byGroup || []).map((g, i) => ({
        branch_id: `g${i}`, branch_name: g.product_group, total: Number(g.total),
        color: BRANCH_PALETTE[(i * 2 + 1) % BRANCH_PALETTE.length],
      })),
    [summary]
  );

  const maxQuarterTotal = Math.max(1, ...quarterData.map((d) => d.fact));

  return (
    <div>
      <div style={styles.headerRow}>
        <h1 style={styles.h1}>Здравствуйте, {user?.full_name?.split(" ")[0] || ""}</h1>
        <p style={styles.sub}>План закупочных мероприятий, {YEAR} год, 223-ФЗ</p>
      </div>

      {error && <div style={styles.errorBox}>{error}</div>}

      {summary?.pendingReview > 0 && (
        <Link to="/search?pending=1" style={styles.pendingCard}>
          <span style={styles.pendingIcon}>⚠</span>
          <span>
            {summary.pendingReview} {plural(summary.pendingReview)} от филиалов ждут проверки
          </span>
          <span style={{ marginLeft: "auto", opacity: 0.7 }}>Открыть →</span>
        </Link>
      )}

      {/* ── Верхние показатели ── */}
      <div style={styles.kpiGrid}>
        <div style={{ ...styles.kpiCard, ...styles.kpiHero }}>
          <ProgressRing pct={yearPct} />
          <div style={{ minWidth: 0 }}>
            <div style={styles.cardLabel}>Факт за год</div>
            <div style={styles.kpiValue}>{fmtMoney(yearFact)} ₽</div>
            <div style={styles.cardMeta}>
              из плана {fmtMoney(yearPlan)} ₽
              {canReview && (
                <button type="button" onClick={() => editPlan(0, "на год")} style={styles.planEditButton} title="Изменить план на год">
                  ✏️
                </button>
              )}
            </div>
          </div>
        </div>

        <div style={styles.kpiCard}>
          <div style={styles.cardLabel}>Закупок в плане</div>
          <div style={styles.kpiValue}>{yearItems}</div>
          <div style={styles.cardMeta}>
            {yearItems > 0 ? `в среднем ${fmtShort(yearFact / yearItems)} ₽ на закупку` : "пока нет данных"}
          </div>
        </div>

        <div style={styles.kpiCard}>
          <div style={styles.cardLabel}>{remaining >= 0 ? "Осталось до плана" : "Превышение плана"}</div>
          <div style={{ ...styles.kpiValue, color: remaining >= 0 ? "var(--text)" : "var(--warning)" }}>
            {yearPlan > 0 ? `${fmtMoney(Math.abs(remaining))} ₽` : "—"}
          </div>
          <div style={styles.cardMeta}>{yearPlan > 0 ? `план на год ${fmtShort(yearPlan)} ₽` : "задайте план на год"}</div>
        </div>
      </div>

      {/* ── Графики ── */}
      <div style={styles.chartGrid}>
        <div style={styles.panel}>
          <div style={styles.panelHead}>
            <h2 style={styles.panelTitle}>План и факт по кварталам</h2>
            <div style={styles.legend}>
              <span style={styles.legendItem}><i style={{ ...styles.legendSwatch, border: "1.5px dashed var(--accent)", background: "var(--accent-soft)" }} /> план</span>
              <span style={styles.legendItem}><i style={{ ...styles.legendSwatch, background: "var(--accent)" }} /> факт</span>
            </div>
          </div>
          {summary ? <QuarterChart data={quarterData} /> : <div style={styles.empty}>Загрузка…</div>}
        </div>

        <div style={styles.panel}>
          <div style={styles.panelHead}>
            <h2 style={styles.panelTitle}>Доли филиалов в сумме</h2>
          </div>
          {!summary ? (
            <div style={styles.empty}>Загрузка…</div>
          ) : branchTotal > 0 ? (
            <BranchDonut items={donutItems} total={branchTotal} />
          ) : (
            <div style={styles.empty}>Нет данных по филиалам</div>
          )}
        </div>
      </div>

      {/* ── Карточки кварталов ── */}
      <h2 style={styles.h2}>Кварталы</h2>
      <div style={styles.grid}>
        {quarterData.map((d) => {
          const pct = d.plan > 0 ? Math.round((d.fact / d.plan) * 100) : null;
          return (
            <div key={d.q} style={styles.card}>
              <Link to={`/plan/q/${d.q}`} style={styles.cardLink}>
                <div style={styles.cardTop}>
                  <div style={styles.cardLabel}>{d.q} квартал</div>
                  {pct !== null && (
                    <span style={{ ...styles.pctBadge, ...(pct > 100 ? styles.pctOver : null) }}>{pct}%</span>
                  )}
                </div>
                <div style={styles.cardTotal}>{fmtMoney(d.fact)} ₽</div>
                <div style={styles.cardMeta}>{d.items} {plural(d.items)}</div>
                <div style={styles.barTrack}>
                  <div style={{ ...styles.barFill, width: `${(d.fact / maxQuarterTotal) * 100}%` }} />
                </div>
              </Link>
              <div style={styles.cardPlanRow}>
                <span>план: {fmtMoney(d.plan)} ₽</span>
                {canReview && (
                  <button type="button" onClick={() => editPlan(d.q, `на ${d.q} квартал`)} style={styles.planEditButton} title="Изменить план">
                    ✏️
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Рейтинг филиалов ── */}
      <h2 style={styles.h2}>По филиалам</h2>
      <div style={styles.panel}>
        {!summary ? (
          <div style={styles.empty}>Загрузка…</div>
        ) : branchItems.length === 0 ? (
          <div style={styles.empty}>Филиалов пока нет</div>
        ) : (
          <BranchBars items={branchItems} />
        )}
      </div>

      {/* ── Аналитика ── */}
      <h2 style={styles.h2}>Аналитика</h2>
      <div style={styles.analyticsGrid}>
        <div style={styles.panel}>
          <div style={styles.panelHead}>
            <h2 style={styles.panelTitle}>Кварталы по филиалам</h2>
            <span style={styles.panelHint}>наведите на сегмент</span>
          </div>
          {!summary ? (
            <div style={styles.empty}>Загрузка…</div>
          ) : hasStacked ? (
            <StackedQuarterChart data={stackedData} />
          ) : (
            <div style={styles.empty}>Нет данных</div>
          )}
        </div>

        <div style={styles.panel}>
          <div style={styles.panelHead}>
            <h2 style={styles.panelTitle}>Нарастающий итог по месяцам</h2>
            <div style={styles.legend}>
              <span style={styles.legendItem}><i style={{ ...styles.legendSwatch, background: "var(--accent)" }} /> размещение</span>
              <span style={styles.legendItem}><i style={{ ...styles.legendSwatch, border: "1.5px dashed var(--warning)" }} /> план</span>
            </div>
          </div>
          {!summary ? (
            <div style={styles.empty}>Загрузка…</div>
          ) : hasMonths ? (
            <>
              <CumulativeChart months={monthData} yearPlan={yearPlan} />
              <div style={styles.note}>По дате размещения извещения · учтено {datedItems} {plural(datedItems)} из {yearItems}</div>
            </>
          ) : (
            <div style={styles.empty}>Нет закупок с датой размещения извещения</div>
          )}
        </div>

        <div style={styles.panel}>
          <div style={styles.panelHead}>
            <h2 style={styles.panelTitle}>Способы закупки</h2>
          </div>
          {!summary ? (
            <div style={styles.empty}>Загрузка…</div>
          ) : methodTotal > 0 ? (
            <MethodChart items={methodItems} total={methodTotal} />
          ) : (
            <div style={styles.empty}>Нет данных</div>
          )}
        </div>

        <div style={styles.panel}>
          <div style={styles.panelHead}>
            <h2 style={styles.panelTitle}>Крупнейшие группы товаров</h2>
          </div>
          {!summary ? (
            <div style={styles.empty}>Загрузка…</div>
          ) : groupItems.length > 0 ? (
            <BranchBars items={groupItems} />
          ) : (
            <div style={styles.empty}>Группы товаров не заполнены</div>
          )}
        </div>
      </div>

      {summary?.cancelled?.items > 0 && (
        <div style={styles.cancelledStrip}>
          <span>Отменено закупок: <b>{summary.cancelled.items}</b></span>
          <span style={{ color: "var(--text-muted)" }}>на сумму {fmtMoney(summary.cancelled.total)} ₽ — в графики не входят</span>
        </div>
      )}
    </div>
  );
}

const styles = {
  headerRow: { marginBottom: 20 },
  h1: { margin: 0, fontSize: 26, color: "var(--text)", letterSpacing: -0.3 },
  sub: { margin: "4px 0 0", color: "var(--text-secondary)" },
  h2: { fontSize: 16, color: "var(--text)", marginTop: 28, marginBottom: 12 },
  errorBox: { background: "var(--danger-soft)", color: "var(--danger)", padding: "10px 14px", borderRadius: "var(--radius-sm)", marginBottom: 16 },
  pendingCard: {
    display: "flex", alignItems: "center", gap: 10, background: "var(--highlight-new-bg)", border: "1px solid var(--highlight-new-border)",
    color: "var(--text)", borderRadius: "var(--radius)", padding: "12px 16px", marginBottom: 18,
    textDecoration: "none", fontWeight: 600,
  },
  pendingIcon: { color: "var(--highlight-new-border)", fontSize: 18 },

  kpiGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 14, marginBottom: 14 },
  kpiCard: {
    background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12,
    padding: "18px 20px", boxShadow: "var(--shadow-sm)", display: "flex", flexDirection: "column", justifyContent: "center",
  },
  kpiHero: { flexDirection: "row", alignItems: "center", gap: 18, background: "linear-gradient(135deg, var(--accent-soft), var(--surface) 70%)" },
  kpiValue: { fontSize: 26, fontWeight: 700, marginTop: 6, color: "var(--text)", letterSpacing: -0.3, fontVariantNumeric: "tabular-nums" },

  chartGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))", gap: 14 },
  analyticsGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 440px), 1fr))", gap: 14 },
  panel: {
    background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12,
    padding: 18, boxShadow: "var(--shadow-sm)", minWidth: 0,
  },
  panelHead: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, gap: 10, flexWrap: "wrap" },
  panelTitle: { margin: 0, fontSize: 15, color: "var(--text)" },
  legend: { display: "flex", gap: 14, fontSize: 12, color: "var(--text-secondary)" },
  legendItem: { display: "inline-flex", alignItems: "center", gap: 6 },
  legendSwatch: { display: "inline-block", width: 12, height: 12, borderRadius: 3 },
  panelHint: { fontSize: 11.5, color: "var(--text-muted)" },
  note: { fontSize: 11.5, color: "var(--text-muted)", marginTop: 8 },
  cancelledStrip: { display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8, marginTop: 14, padding: "10px 14px", background: "var(--surface-2)", border: "1px dashed var(--border)", borderRadius: 10, fontSize: 12.5, color: "var(--text-secondary)" },
  empty: { color: "var(--text-muted)", fontSize: 13, padding: "30px 0", textAlign: "center" },

  grid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: 14 },
  card: {
    background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12,
    padding: 16, boxShadow: "var(--shadow-sm)",
  },
  cardLink: { textDecoration: "none", color: "var(--text)", display: "block" },
  cardTop: { display: "flex", justifyContent: "space-between", alignItems: "center" },
  cardLabel: { fontSize: 12, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: 0.4 },
  cardTotal: { fontSize: 20, fontWeight: 700, marginTop: 6, fontVariantNumeric: "tabular-nums" },
  cardMeta: { fontSize: 12, color: "var(--text-muted)", marginTop: 3 },
  cardPlanRow: { display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--text-secondary)", marginTop: 10, borderTop: "1px solid var(--border)", paddingTop: 8 },
  pctBadge: { fontSize: 11, fontWeight: 700, color: "var(--success)", background: "var(--success-soft)", borderRadius: 10, padding: "1px 8px" },
  pctOver: { color: "var(--warning)", background: "var(--warning-soft)" },
  barTrack: { height: 6, background: "var(--border)", borderRadius: 3, marginTop: 10, overflow: "hidden" },
  barFill: { height: "100%", background: "linear-gradient(90deg, var(--accent), var(--accent-soft))", borderRadius: 3, transition: "width .8s cubic-bezier(.2,.8,.2,1)" },
  planEditButton: { border: "none", background: "none", cursor: "pointer", fontSize: 12, padding: 0, marginLeft: 6, lineHeight: 1 },
};