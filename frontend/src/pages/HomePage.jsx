import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiFetch } from "../api";
import { useAuth } from "../context/AuthContext";

const YEAR = 2026;

function fmtMoney(n) {
  return Number(n || 0).toLocaleString("ru-RU", { minimumFractionDigits: 0 });
}

export default function HomePage() {
  const { user } = useAuth();
  const [summary, setSummary] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    apiFetch(`/api/purchases/summary?year=${YEAR}`)
      .then(setSummary)
      .catch((err) => setError(err.message));
  }, []);

  const maxQuarterTotal = summary
    ? Math.max(1, ...summary.byQuarter.map((q) => Number(q.total)))
    : 1;

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

      <div style={styles.grid}>
        {[1, 2, 3, 4].map((q) => {
          const row = summary?.byQuarter.find((r) => Number(r.quarter) === q);
          const total = row ? Number(row.total) : 0;
          const count = row ? Number(row.items) : 0;
          return (
            <Link to={`/plan/q/${q}`} key={q} style={styles.card}>
              <div style={styles.cardLabel}>{q} квартал</div>
              <div style={styles.cardTotal}>{fmtMoney(total)} ₽</div>
              <div style={styles.cardMeta}>{count} {plural(count)}</div>
              <div style={styles.barTrack}>
                <div style={{ ...styles.barFill, width: `${(total / maxQuarterTotal) * 100}%` }} />
              </div>
            </Link>
          );
        })}
      </div>

      <h2 style={styles.h2}>По филиалам</h2>
      <div style={styles.tableWrap}>
        <table>
          <thead>
            <tr>
              <th style={styles.th}>Филиал</th>
              <th style={{ ...styles.th, textAlign: "right" }}>Сумма за год, руб.</th>
            </tr>
          </thead>
          <tbody>
            {summary?.byBranch.map((b) => (
              <tr key={b.branch_id}>
                <td style={styles.td}>{b.branch_name}</td>
                <td style={{ ...styles.td, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{fmtMoney(b.total)}</td>
              </tr>
            ))}
            {!summary && (
              <tr><td colSpan={2} style={styles.td}>Загрузка…</td></tr>
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
    padding: 16, textDecoration: "none", color: "var(--text)", boxShadow: "var(--shadow-sm)",
  },
  cardLabel: { fontSize: 12, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: 0.4 },
  cardTotal: { fontSize: 20, fontWeight: 700, marginTop: 6 },
  cardMeta: { fontSize: 12, color: "var(--text-muted)", marginTop: 2 },
  barTrack: { height: 6, background: "var(--border)", borderRadius: 3, marginTop: 10, overflow: "hidden" },
  barFill: { height: "100%", background: "var(--accent)" },
  tableWrap: { background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius)", overflow: "hidden", marginTop: 10 },
  th: { textAlign: "left", padding: "10px 14px", borderBottom: "1px solid var(--border)", color: "var(--text-secondary)", fontSize: 12 },
  td: { padding: "9px 14px", borderBottom: "1px solid var(--border)", fontSize: 13.5, color: "var(--text)" },
};
