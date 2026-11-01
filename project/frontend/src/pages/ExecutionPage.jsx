import { useEffect, useMemo, useState, useCallback } from "react";
import { apiFetch } from "../api";
import { useAuth } from "../context/AuthContext";
import { useYear } from "../context/YearContext";
import NoYearNotice from "../components/NoYearNotice";
import DateInput from "../components/DateInput";

const money = (n) => Number(n || 0).toLocaleString("ru-RU", { maximumFractionDigits: 2 });
const todayIso = () => new Date().toISOString().slice(0, 10);
const isUnplanned = (p) => p.status === "unplanned" || p.is_unplanned === true;
const isExecuted = (p) => p.contract_amount !== null && p.contract_amount !== undefined;

// Вкладка «Исполнение»: факт и сумма договора вносятся прямо в строке.
export default function ExecutionPage() {
  const { year } = useYear();
  const { user } = useAuth();
  const canEdit = user?.role === "admin" || user?.role === "financier";

  const [items, setItems] = useState([]);
  const [quarter, setQuarter] = useState("");
  const [filter, setFilter] = useState("todo"); // todo | done | unplanned | all
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!year) return;
    setLoading(true);
    setError("");
    try {
      const q = quarter ? `&quarter=${quarter}` : "";
      const res = await apiFetch(`/api/purchases?year=${year}${q}`);
      setItems(res.purchases.filter((p) => p.status !== "cancelled"));
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [year, quarter]);

  useEffect(() => { load(); }, [load]);

  const replace = (purchase) => setItems((prev) => prev.map((p) => (p.id === purchase.id ? { ...p, ...purchase } : p)));

  const stats = useMemo(() => {
    let nmc = 0, nmcDone = 0, contract = 0, economy = 0, overrun = 0, done = 0;
    for (const p of items) {
      nmc += Number(p.amount);
      if (isExecuted(p)) {
        done += 1;
        nmcDone += Number(p.amount);
        contract += Number(p.contract_amount);
        const d = Number(p.amount) - Number(p.contract_amount);
        if (d >= 0) economy += d; else overrun += -d;
      }
    }
    return { count: items.length, done, nmc, nmcDone, contract, economy, overrun };
  }, [items]);

  const visible = items.filter((p) => {
    if (filter === "todo" && isExecuted(p)) return false;
    if (filter === "done" && !isExecuted(p)) return false;
    if (filter === "unplanned" && !isUnplanned(p)) return false;
    const s = search.trim().toLowerCase();
    return !s || [p.name, p.branch_name, p.okpd2, p.contract_no, p.supplier].some((v) => String(v || "").toLowerCase().includes(s));
  });

  if (!year) return <NoYearNotice />;

  return (
    <div>
      <div style={styles.header}>
        <h2 style={styles.title}>Исполнение закупок {year}</h2>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <input placeholder="Поиск…" value={search} onChange={(e) => setSearch(e.target.value)} style={styles.input} />
          <select value={quarter} onChange={(e) => setQuarter(e.target.value)} style={styles.input}>
            <option value="">Весь год</option>
            {[1, 2, 3, 4].map((q) => <option key={q} value={q}>{q} квартал</option>)}
          </select>
        </div>
      </div>

      <div style={styles.stats}>
        <span>Исполнено: <strong>{stats.done} из {stats.count}</strong></span>
        <span>Сумма договоров: <strong>{money(stats.contract)} ₽</strong></span>
        <span style={{ color: "var(--success, #1a8a4e)" }}>Экономия: <strong>{money(stats.economy)} ₽</strong></span>
        {stats.overrun > 0 && <span style={{ color: "var(--danger)" }}>Перерасход: <strong>{money(stats.overrun)} ₽</strong></span>}
        <span>Не исполнено (НМЦ): <strong>{money(stats.nmc - stats.nmcDone)} ₽</strong></span>
      </div>

      <div style={styles.filters}>
        {[["todo", "Ждут исполнения"], ["done", "Исполненные"], ["unplanned", "Внеплан"], ["all", "Все"]].map(([k, l]) => (
          <button key={k} type="button" onClick={() => setFilter(k)} style={{ ...styles.chip, ...(filter === k ? styles.chipActive : {}) }}>{l}</button>
        ))}
        {!canEdit && <span style={styles.muted}>Только просмотр — вносить исполнение могут администратор и финансист</span>}
      </div>

      {error && <div style={styles.err}>{error}</div>}

      <div style={styles.tableWrap}>
        <table style={styles.table}>
          <thead>
            <tr>
              {["Кв.", "Наименование", "Филиал", "НМЦ, ₽", "Сумма договора, ₽", "Экономия", "Дата исполнения", "№ договора", "Поставщик", "Внеплан", ""].map((h) => (
                <th key={h} style={styles.th}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={11} style={{ ...styles.td, textAlign: "center" }}>Загрузка…</td></tr>}
            {!loading && visible.length === 0 && (
              <tr><td colSpan={11} style={{ ...styles.td, textAlign: "center", color: "var(--text-muted)" }}>
                {filter === "todo" ? "Все закупки исполнены 🎉" : "Нет закупок"}
              </td></tr>
            )}
            {visible.map((p) => (
              <Row key={p.id} p={p} canEdit={canEdit} onSaved={replace} onError={setError} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Row({ p, canEdit, onSaved, onError }) {
  const executed = isExecuted(p);
  const [amount, setAmount] = useState(executed ? String(p.contract_amount) : "");
  const [date, setDate] = useState(executed && p.executed_at ? String(p.executed_at).slice(0, 10) : "");
  const [no, setNo] = useState(p.contract_no || "");
  const [supplier, setSupplier] = useState(p.supplier || "");
  const [busy, setBusy] = useState(false);

  // Если строку обновили снаружи (например, после сохранения) — подтягиваем значения
  useEffect(() => {
    const ex = isExecuted(p);
    setAmount(ex ? String(p.contract_amount) : "");
    setDate(ex && p.executed_at ? String(p.executed_at).slice(0, 10) : "");
    setNo(p.contract_no || "");
    setSupplier(p.supplier || "");
  }, [p.contract_amount, p.executed_at, p.contract_no, p.supplier]);

  const nmc = Number(p.amount);
  const contract = Number(String(amount).replace(/\s/g, "").replace(",", "."));
  const valid = amount !== "" && Number.isFinite(contract) && contract >= 0;
  const diff = valid ? nmc - contract : null;

  const dirty =
    amount !== (executed ? String(p.contract_amount) : "") ||
    date !== (executed && p.executed_at ? String(p.executed_at).slice(0, 10) : "") ||
    no !== (p.contract_no || "") ||
    supplier !== (p.supplier || "");

  async function save() {
    if (!valid) return;
    setBusy(true);
    onError("");
    try {
      const res = await apiFetch(`/api/purchases/${p.id}/execute`, {
        method: "POST",
        body: JSON.stringify({ contract_amount: contract, executed_at: date || todayIso(), contract_no: no, supplier }),
      });
      onSaved(res.purchase);
    } catch (e) {
      onError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function clear() {
    if (!window.confirm(`Снять отметку об исполнении?\n«${p.name}»`)) return;
    setBusy(true);
    try {
      const res = await apiFetch(`/api/purchases/${p.id}/unexecute`, { method: "POST" });
      onSaved(res.purchase);
    } catch (e) {
      onError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function toggleUnplanned() {
    try {
      const res = await apiFetch(`/api/purchases/${p.id}/unplanned`, { method: "POST", body: JSON.stringify({ value: !isUnplanned(p) }) });
      onSaved(res.purchase);
    } catch (e) {
      onError(e.message);
    }
  }

  return (
    <tr style={executed && !dirty ? { background: "var(--surface-2)" } : undefined}>
      <td style={styles.td}>{p.quarter}</td>
      <td style={{ ...styles.td, minWidth: 240 }}>{p.name}</td>
      <td style={styles.td}>{p.branch_name}</td>
      <td style={{ ...styles.td, textAlign: "right", whiteSpace: "nowrap" }}>{money(nmc)}</td>
      <td style={styles.td}>
        {canEdit ? (
          <input
            value={amount}
            onChange={(e) => {
              setAmount(e.target.value);
              if (!date) setDate(todayIso());
            }}
            onKeyDown={(e) => e.key === "Enter" && dirty && save()}
            inputMode="decimal"
            placeholder="0,00"
            style={{ ...styles.cell, width: 120, textAlign: "right" }}
          />
        ) : executed ? money(p.contract_amount) : "—"}
      </td>
      <td style={{ ...styles.td, whiteSpace: "nowrap", fontWeight: 600, color: diff === null ? undefined : diff >= 0 ? "var(--success, #1a8a4e)" : "var(--danger)" }}>
        {diff === null ? "—" : diff >= 0 ? `+${money(diff)}` : `−${money(-diff)} (перерасход)`}
      </td>
      <td style={styles.td}>
        {canEdit ? <DateInput value={date} onChange={setDate} style={{ ...styles.cell, width: 110 }} /> : date ? new Date(date).toLocaleDateString("ru-RU") : "—"}
      </td>
      <td style={styles.td}>
        {canEdit ? <input value={no} onChange={(e) => setNo(e.target.value)} style={{ ...styles.cell, width: 100 }} /> : p.contract_no || "—"}
      </td>
      <td style={styles.td}>
        {canEdit ? <input value={supplier} onChange={(e) => setSupplier(e.target.value)} style={{ ...styles.cell, width: 150 }} /> : p.supplier || "—"}
      </td>
      <td style={{ ...styles.td, textAlign: "center" }}>
        <input type="checkbox" checked={isUnplanned(p)} onChange={toggleUnplanned} disabled={!canEdit || p.status === "unplanned"} title="Внеплановая закупка" />
      </td>
      <td style={{ ...styles.td, whiteSpace: "nowrap" }}>
        {canEdit && (
          <>
            <button type="button" onClick={save} disabled={busy || !valid || !dirty} style={{ ...styles.saveBtn, ...(busy || !valid || !dirty ? { opacity: 0.4, cursor: "not-allowed" } : {}) }}>
              {executed && !dirty ? "✔" : "Сохранить"}
            </button>
            {executed && (
              <button type="button" onClick={clear} disabled={busy} style={styles.clearBtn} title="Снять исполнение">↩</button>
            )}
          </>
        )}
      </td>
    </tr>
  );
}

const styles = {
  header: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 12 },
  title: { margin: 0, fontSize: 20 },
  input: { padding: "8px 10px", borderRadius: "var(--radius-sm)", border: "1px solid var(--border)", background: "var(--surface-2)", color: "var(--text)" },
  stats: { display: "flex", gap: 22, flexWrap: "wrap", fontSize: 13, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: "10px 14px", marginBottom: 12 },
  filters: { display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 10 },
  chip: { border: "1px solid var(--border)", background: "var(--surface-2)", color: "var(--text)", borderRadius: 14, padding: "4px 12px", cursor: "pointer", fontSize: 12.5 },
  chipActive: { background: "var(--accent)", color: "var(--accent-contrast)", borderColor: "var(--accent)" },
  muted: { color: "var(--text-muted)", fontSize: 12.5, marginLeft: 8 },
  err: { background: "var(--danger-soft)", color: "var(--danger)", padding: "10px 14px", borderRadius: "var(--radius-sm)", marginBottom: 12 },
  tableWrap: { background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius)", overflow: "auto", boxShadow: "var(--shadow-sm)" },
  table: { width: "100%", borderCollapse: "collapse", fontSize: 13 },
  th: { textAlign: "left", padding: "9px 10px", background: "var(--surface-2)", color: "var(--text-secondary)", fontWeight: 600, whiteSpace: "nowrap", borderBottom: "1px solid var(--border)" },
  td: { padding: "6px 10px", borderBottom: "1px solid var(--border)", verticalAlign: "middle" },
  cell: { padding: "6px 8px", borderRadius: "var(--radius-sm)", border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text)", fontSize: 13 },
  saveBtn: { background: "var(--accent)", color: "var(--accent-contrast)", border: "none", borderRadius: "var(--radius-sm)", padding: "6px 12px", cursor: "pointer", fontWeight: 600 },
  clearBtn: { background: "transparent", border: "1px solid var(--border)", color: "var(--text-secondary)", borderRadius: "var(--radius-sm)", padding: "5px 9px", marginLeft: 6, cursor: "pointer" },
};
