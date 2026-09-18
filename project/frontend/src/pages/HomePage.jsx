import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiFetch } from "../api";
import { useAuth } from "../context/AuthContext";
import { colorForBranchId } from "../theme/branchPalette";

const YEAR = 2026;

function fmtMoney(n) {
  return Number(n || 0).toLocaleString("ru-RU", { minimumFractionDigits: 0 });
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

  const maxQuarterTotal = summary
    ? Math.max(1, ...summary.byQuarter.map((q) => Number(q.total)))
    : 1;

  const yearFact = summary ? summary.byQuarter.reduce((s, q) => s + Number(q.total), 0) : 0;
  const yearPlan = Number(plan[0] || 0);
  const yearPct = yearPlan > 0 ? Math.round((yearFact / yearPlan) * 100) : null;

  return (
    <div>
      <div style={styles.headerRow}>
        <h1 style={styles.h1}>Здравствуйте, {user?.full_name?.split(" ")[0] || ""}</h1>
        <p style={styles.sub}>План закупочных мероприятий, {YEAR} год, 223-ФЗ</p>
      </div>

      {error && <div style={styles.errorBox}>{error}</div>}

      {summary?.pendingReview > 0 && (
        <Link to="/search?pending=1" style={styles.pendingCard}>
          ⚠ {summary.pendingReview} {plural(summary.pendingReview)} от филиалов ждут проверки
        </Link>
      )}

      <div style={styles.planCard}>
        <div>
          <div style={styles.cardLabel}>План на год / факт</div>
          <div style={styles.cardTotal}>
            {fmtMoney(yearFact)} ₽ <span style={styles.planOfText}>из плана {fmtMoney(yearPlan)} ₽</span>
            {canReview && (
              <button type="button" onClick={() => editPlan(0, "на год")} style={styles.planEditButton} title="Изменить план на год">
                ✏️
              </button>
            )}
          </div>
          {yearPct !== null && <div style={styles.cardMeta}>Выполнение: {yearPct}%</div>}
          {yearPlan > 0 && (
            <div style={styles.barTrack}>
              <div style={{ ...styles.barFill, width: `${Math.min(100, yearPct)}%` }} />
            </div>
          )}
        </div>
      </div>

      <div style={styles.grid}>
        {[1, 2, 3, 4].map((q) => {
          const row = summary?.byQuarter.find((r) => Number(r.quarter) === q);
          const total = row ? Number(row.total) : 0;
          const count = row ? Number(row.items) : 0;
          const qPlan = Number(plan[q] || 0);
          return (
            <div key={q} style={styles.card}>
              <Link to={`/plan/q/${q}`} style={styles.cardLink}>
                <div style={styles.cardLabel}>{q} квартал</div>
                <div style={styles.cardTotal}>{fmtMoney(total)} ₽</div>
                <div style={styles.cardMeta}>{count} {plural(count)}</div>
                <div style={styles.barTrack}>
                  <div style={{ ...styles.barFill, width: `${(total / maxQuarterTotal) * 100}%` }} />
                </div>
              </Link>
              <div style={styles.cardPlanRow}>
                <span>план: {fmtMoney(qPlan)} ₽</span>
                {canReview && (
                  <button type="button" onClick={() => editPlan(q, `на ${q} квартал`)} style={styles.planEditButton} title="Изменить план">
                    ✏️
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <h2 style={styles.h2}>По филиалам</h2>
      <div style={styles.tableWrap}>
        <table>
          <thead>
            <tr>
              <th style={{ ...styles.th, width: 30 }}></th>
              <th style={styles.th}>Филиал</th>
              <th style={{ ...styles.th, textAlign: "right" }}>Сумма за год, руб.</th>
            </tr>
          </thead>
          <tbody>
            {summary?.byBranch.map((b) => (
              <tr key={b.branch_id}>
                <td style={styles.td}>
                  <span style={{ ...styles.colorDot, background: colorForBranchId(branches, b.branch_id) }} />
                </td>
                <td style={styles.td}>{b.branch_name}</td>
                <td style={{ ...styles.td, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{fmtMoney(b.total)}</td>
              </tr>
            ))}
            {!summary && (
              <tr><td colSpan={3} style={styles.td}>Загрузка…</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function plural(n) {
  const mod10 = n % 10, mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return "закупка";
  if ([2, 3, 4].includes(mod10) && ![12, 13, 14].includes(mod100)) return "закупки";
  return "закупок";
}

const styles = {
  headerRow: { marginBottom: 20 },
  h1: { margin: 0, fontSize: 24, color: "var(--text)" },
  sub: { margin: "4px 0 0", color: "var(--text-secondary)" },
  h2: { fontSize: 16, color: "var(--text)", marginTop: 28 },
  errorBox: { background: "var(--danger-soft)", color: "var(--danger)", padding: "10px 14px", borderRadius: "var(--radius-sm)", marginBottom: 16 },
  pendingCard: {
    display: "block", background: "var(--highlight-new-bg)", border: "1px solid var(--highlight-new-border)",
    color: "var(--text)", borderRadius: "var(--radius)", padding: "12px 16px", marginBottom: 20,
    textDecoration: "none", fontWeight: 600,
  },
  grid: { display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14 },
  card: {
    background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius)",
    padding: 16, boxShadow: "var(--shadow-sm)",
  },
  cardLink: { textDecoration: "none", color: "var(--text)", display: "block" },
  cardLabel: { fontSize: 12, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: 0.4 },
  cardTotal: { fontSize: 20, fontWeight: 700, marginTop: 6 },
  cardMeta: { fontSize: 12, color: "var(--text-muted)", marginTop: 2 },
  cardPlanRow: { display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--text-secondary)", marginTop: 8, borderTop: "1px solid var(--border)", paddingTop: 8 },
  barTrack: { height: 6, background: "var(--border)", borderRadius: 3, marginTop: 10, overflow: "hidden" },
  barFill: { height: "100%", background: "var(--accent)" },
  planCard: {
    background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius)",
    padding: 16, boxShadow: "var(--shadow-sm)", marginBottom: 14,
  },
  planOfText: { fontSize: 13, fontWeight: 400, color: "var(--text-secondary)", marginLeft: 6 },
  planEditButton: { border: "none", background: "none", cursor: "pointer", fontSize: 12, padding: 0, marginLeft: 6, lineHeight: 1 },
  tableWrap: { background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius)", overflow: "hidden", marginTop: 10 },
  th: { textAlign: "left", padding: "10px 14px", borderBottom: "1px solid var(--border)", color: "var(--text-secondary)", fontSize: 12 },
  td: { padding: "9px 14px", borderBottom: "1px solid var(--border)", fontSize: 13.5, color: "var(--text)" },
  colorDot: { display: "inline-block", width: 12, height: 12, borderRadius: "50%" },
};
