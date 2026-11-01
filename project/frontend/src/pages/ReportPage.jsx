import { useEffect, useState, useCallback } from "react";
import { apiFetch, apiDownload } from "../api";
import { useYear } from "../context/YearContext";
import NoYearNotice from "../components/NoYearNotice";

const money = (n) => Number(n || 0).toLocaleString("ru-RU", { maximumFractionDigits: 0 });
const date = (d) => (d ? new Date(d).toLocaleDateString("ru-RU") : "—");

export default function ReportPage() {
  const { year } = useYear();
  const [quarter, setQuarter] = useState("");
  const [report, setReport] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all"); // all | executed | progress | unplanned

  const load = useCallback(async () => {
    if (!year) return;
    setLoading(true);
    setError("");
    try {
      const q = quarter ? `&quarter=${quarter}` : "";
      const res = await apiFetch(`/api/reports/execution?year=${year}${q}`);
      setReport(res.report);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [year, quarter]);

  useEffect(() => { load(); }, [load]);

  if (!year) return <NoYearNotice />;

  async function exportXlsx() {
    try {
      const q = quarter ? `&quarter=${quarter}` : "";
      await apiDownload(`/api/reports/execution.xlsx?year=${year}${q}`, `Исполнение_закупок_${year}${quarter ? `_кв${quarter}` : ""}.xlsx`);
    } catch (e) {
      setError(e.message);
    }
  }

  const t = report?.totals;
  const rows = (report?.purchases || []).filter((p) =>
    filter === "executed" ? p.executed : filter === "progress" ? !p.executed : filter === "unplanned" ? p.unplanned : true
  );

  return (
    <div>
      <div style={styles.header}>
        <h2 style={styles.title}>Отчёт об исполнении закупок {year}{quarter ? `, ${quarter} квартал` : ""}</h2>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <select value={quarter} onChange={(e) => setQuarter(e.target.value)} style={styles.select}>
            <option value="">Весь год</option>
            {[1, 2, 3, 4].map((q) => <option key={q} value={q}>{q} квартал</option>)}
          </select>
          <button type="button" onClick={exportXlsx} style={styles.primary}>⬇ Выгрузить в Excel</button>
        </div>
      </div>

      {error && <div style={styles.err}>{error}</div>}
      {loading && !report && <div style={styles.muted}>Загрузка…</div>}

      {t && (
        <>
          <div style={styles.cards}>
            <Card label="План закупок (НМЦ)" value={`${money(t.plan)} ₽`} sub={`${t.plan_count} закупок${report.plan_target ? ` · установленный план ${money(report.plan_target)} ₽` : ""}`} />
            <Card label="Внеплан (НМЦ)" value={`${money(t.unplanned)} ₽`} sub={`${t.unplanned_count} закупок`} color="var(--danger)" />
            <Card label="Исполнено (договоры)" value={`${money(t.executed)} ₽`} sub={`${t.executed_count} закупок · ${t.execution_percent}% от НМЦ`} color="var(--accent)" />
            <Card label="Экономия" value={`${money(t.economy)} ₽`} sub={t.overrun > 0 ? `перерасход ${money(t.overrun)} ₽ · чистая ${money(t.net_economy)} ₽` : "перерасхода нет"} color="var(--success, #1a8a4e)" />
            <Card label="В работе (не исполнено)" value={`${money(t.in_progress)} ₽`} sub={`${t.in_progress_count} закупок`} />
            {report.cancelled.count > 0 && <Card label="Отменено" value={`${money(report.cancelled.sum)} ₽`} sub={`${report.cancelled.count} закупок (не входят в расчёт)`} color="var(--text-muted)" />}
          </div>

          <div style={styles.progressWrap} title={`${t.execution_percent}% исполнено`}>
            <div style={{ ...styles.progressBar, width: `${Math.min(100, t.execution_percent)}%` }} />
          </div>

          {!quarter && (
            <Section title="По кварталам">
              <SummaryTable
                firstCol="Квартал"
                rows={report.byQuarter.map((q) => ({ key: q.quarter, name: `${q.quarter} квартал`, ...q }))}
                total={t}
                showTarget
              />
            </Section>
          )}

          <Section title="По филиалам">
            {report.byBranch.length ? (
              <SummaryTable firstCol="Филиал" rows={report.byBranch.map((b) => ({ key: b.branch_id, name: b.branch_name, ...b }))} total={t} />
            ) : <div style={styles.muted}>Нет данных</div>}
            <div style={styles.note}>Сумма договора по закупке на несколько филиалов делится пропорционально их долям в НМЦ.</div>
          </Section>

          <Section title="Закупки">
            <div style={styles.filters}>
              {[["all", "Все"], ["executed", "Исполненные"], ["progress", "В работе"], ["unplanned", "Внеплан"]].map(([k, l]) => (
                <button key={k} type="button" onClick={() => setFilter(k)} style={{ ...styles.chip, ...(filter === k ? styles.chipActive : {}) }}>{l}</button>
              ))}
            </div>
            <div style={styles.tableWrap}>
              <table style={styles.table}>
                <thead>
                  <tr>
                    {["Кв.", "Наименование", "Филиалы", "Тип", "НМЦ", "Сумма договора", "Экономия", "Дата", "№ договора / поставщик"].map((h) => <th key={h} style={styles.th}>{h}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {rows.length === 0 && <tr><td colSpan={9} style={{ ...styles.td, textAlign: "center", color: "var(--text-muted)" }}>Нет закупок</td></tr>}
                  {rows.map((p) => (
                    <tr key={p.id}>
                      <td style={styles.td}>{p.quarter}</td>
                      <td style={{ ...styles.td, minWidth: 260 }}>{p.name}</td>
                      <td style={styles.td}>{p.branches}</td>
                      <td style={styles.td}>{p.unplanned ? <span style={styles.badgeRed}>ВНЕПЛАН</span> : "План"}</td>
                      <td style={{ ...styles.td, ...styles.num }}>{money(p.nmc)}</td>
                      <td style={{ ...styles.td, ...styles.num }}>{p.executed ? money(p.contract_amount) : <span style={styles.muted}>в работе</span>}</td>
                      <td style={{ ...styles.td, ...styles.num, color: p.economy === null ? undefined : p.economy >= 0 ? "var(--success, #1a8a4e)" : "var(--danger)" }}>
                        {p.economy === null ? "—" : money(p.economy)}
                      </td>
                      <td style={styles.td}>{date(p.executed_at)}</td>
                      <td style={styles.td}>{[p.contract_no, p.supplier].filter(Boolean).join(" · ") || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>
        </>
      )}
    </div>
  );
}

function Card({ label, value, sub, color }) {
  return (
    <div style={styles.card}>
      <div style={styles.cardLabel}>{label}</div>
      <div style={{ ...styles.cardValue, color: color || "var(--text)" }}>{value}</div>
      <div style={styles.cardSub}>{sub}</div>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div style={{ marginTop: 22 }}>
      <h3 style={styles.h3}>{title}</h3>
      {children}
    </div>
  );
}

function SummaryTable({ firstCol, rows, total, showTarget }) {
  const heads = [firstCol, ...(showTarget ? ["Уст. план"] : []), "План", "Внеплан", "Исполнено", "Экономия", "Перерасход", "В работе", "% исп."];
  const cells = (x) => [
    ...(showTarget ? [money(x.plan_target)] : []),
    money(x.plan), money(x.unplanned), money(x.executed), money(x.economy), money(x.overrun), money(x.in_progress), `${x.execution_percent}%`,
  ];
  return (
    <div style={styles.tableWrap}>
      <table style={styles.table}>
        <thead><tr>{heads.map((h) => <th key={h} style={styles.th}>{h}</th>)}</tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key}>
              <td style={styles.td}>{r.name}</td>
              {cells(r).map((c, i) => <td key={i} style={{ ...styles.td, ...styles.num }}>{c}</td>)}
            </tr>
          ))}
          <tr>
            <td style={{ ...styles.td, fontWeight: 700 }}>Итого</td>
            {cells({ ...total, plan_target: rows.reduce((s, r) => s + (r.plan_target || 0), 0) }).map((c, i) => (
              <td key={i} style={{ ...styles.td, ...styles.num, fontWeight: 700 }}>{c}</td>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  );
}

const styles = {
  header: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 16 },
  title: { margin: 0, fontSize: 20 },
  h3: { margin: "0 0 10px", fontSize: 15 },
  select: { padding: "8px 10px", borderRadius: "var(--radius-sm)", border: "1px solid var(--border)", background: "var(--surface-2)", color: "var(--text)" },
  primary: { background: "var(--accent)", color: "var(--accent-contrast)", border: "none", borderRadius: "var(--radius-sm)", padding: "8px 14px", cursor: "pointer", fontWeight: 600 },
  err: { background: "var(--danger-soft)", color: "var(--danger)", padding: "10px 14px", borderRadius: "var(--radius-sm)", marginBottom: 12 },
  muted: { color: "var(--text-muted)", fontSize: 13 },
  note: { color: "var(--text-muted)", fontSize: 12, marginTop: 6 },
  cards: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: 12 },
  card: { background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: "12px 16px", boxShadow: "var(--shadow-sm)" },
  cardLabel: { fontSize: 12, color: "var(--text-secondary)" },
  cardValue: { fontSize: 22, fontWeight: 700, margin: "4px 0" },
  cardSub: { fontSize: 12, color: "var(--text-muted)" },
  progressWrap: { height: 8, background: "var(--surface-2)", borderRadius: 4, marginTop: 14, overflow: "hidden" },
  progressBar: { height: "100%", background: "var(--accent)", transition: "width .3s" },
  filters: { display: "flex", gap: 8, marginBottom: 10, flexWrap: "wrap" },
  chip: { border: "1px solid var(--border)", background: "var(--surface-2)", color: "var(--text)", borderRadius: 14, padding: "4px 12px", cursor: "pointer", fontSize: 12.5 },
  chipActive: { background: "var(--accent)", color: "var(--accent-contrast)", borderColor: "var(--accent)" },
  tableWrap: { background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius)", overflow: "auto", boxShadow: "var(--shadow-sm)" },
  table: { width: "100%", borderCollapse: "collapse", fontSize: 13 },
  th: { textAlign: "left", padding: "9px 12px", background: "var(--surface-2)", color: "var(--text-secondary)", fontWeight: 600, whiteSpace: "nowrap", borderBottom: "1px solid var(--border)" },
  td: { padding: "8px 12px", borderBottom: "1px solid var(--border)", verticalAlign: "top" },
  num: { textAlign: "right", whiteSpace: "nowrap" },
  badgeRed: { background: "var(--unplanned-border)", color: "#fff", fontWeight: 700, fontSize: 11, borderRadius: 4, padding: "2px 7px", whiteSpace: "nowrap" },
};
