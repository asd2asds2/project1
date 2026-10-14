import { useEffect, useState, useCallback } from "react";
import { apiFetch } from "../api";
import { useAuth } from "../context/AuthContext";

const YEAR = 2026;
const EMPTY = { name: "", quarter: 0, amount: "", comment: "" };
const fmt = (n) => Number(n || 0).toLocaleString("ru-RU", { maximumFractionDigits: 2 });

export default function ManualPlanPage() {
  const { user } = useAuth();
  const canEdit = user?.role === "admin" || user?.role === "financier";
  const [items, setItems] = useState([]);
  const [form, setForm] = useState(EMPTY);
  const [editingId, setEditingId] = useState(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const d = await apiFetch(`/api/plan/manual?year=${YEAR}`);
      setItems(d.items);
    } catch (e) {
      setError(e.message);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function save(e) {
    e.preventDefault();
    setError("");
    try {
      const body = JSON.stringify({ ...form, year: YEAR, quarter: Number(form.quarter), amount: Number(form.amount) });
      if (editingId) await apiFetch(`/api/plan/manual/${editingId}`, { method: "PUT", body });
      else await apiFetch(`/api/plan/manual`, { method: "POST", body });
      setForm(EMPTY);
      setEditingId(null);
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  function startEdit(it) {
    setEditingId(it.id);
    setForm({ name: it.name, quarter: it.quarter, amount: it.amount, comment: it.comment || "" });
  }

  async function remove(it) {
    if (!confirm(`Удалить пункт «${it.name}»?`)) return;
    try {
      await apiFetch(`/api/plan/manual/${it.id}`, { method: "DELETE" });
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  const total = items.reduce((s, i) => s + Number(i.amount || 0), 0);
  const cell = { padding: "8px 10px", borderBottom: "1px solid var(--border)", textAlign: "left" };
  const input = { padding: "6px 8px", border: "1px solid var(--border)", borderRadius: 6, background: "var(--surface)", color: "inherit" };

  return (
    <div>
      <h2>Ручной план {YEAR}</h2>
      {error && <div style={{ color: "var(--danger)", marginBottom: 8 }}>{error}</div>}

      {canEdit && (
        <form onSubmit={save} style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
          <input style={{ ...input, flex: "2 1 220px" }} placeholder="Название пункта" value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          <select style={input} value={form.quarter} onChange={(e) => setForm({ ...form, quarter: e.target.value })}>
            <option value={0}>Год</option>
            {[1, 2, 3, 4].map((q) => <option key={q} value={q}>{q} квартал</option>)}
          </select>
          <input style={{ ...input, width: 160 }} type="number" min="0" step="0.01" placeholder="Сумма, ₽"
            value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} required />
          <input style={{ ...input, flex: "2 1 200px" }} placeholder="Комментарий" value={form.comment}
            onChange={(e) => setForm({ ...form, comment: e.target.value })} />
          <button type="submit">{editingId ? "Сохранить" : "Добавить"}</button>
          {editingId && <button type="button" onClick={() => { setEditingId(null); setForm(EMPTY); }}>Отмена</button>}
        </form>
      )}

      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr><th style={cell}>Название</th><th style={cell}>Период</th><th style={cell}>Сумма, ₽</th><th style={cell}>Комментарий</th>{canEdit && <th style={cell} />}</tr>
        </thead>
        <tbody>
          {items.length === 0 && <tr><td style={cell} colSpan={5}>Пока нет пунктов</td></tr>}
          {items.map((it) => (
            <tr key={it.id}>
              <td style={cell}>{it.name}</td>
              <td style={cell}>{it.quarter === 0 ? "Год" : `${it.quarter} кв.`}</td>
              <td style={cell}>{fmt(it.amount)}</td>
              <td style={cell}>{it.comment}</td>
              {canEdit && (
                <td style={cell}>
                  <button type="button" onClick={() => startEdit(it)}>✏️</button>{" "}
                  <button type="button" onClick={() => remove(it)}>🗑</button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
        <tfoot><tr><td style={cell}><b>Итого</b></td><td style={cell} /><td style={cell}><b>{fmt(total)}</b></td><td style={cell} /></tr></tfoot>
      </table>
    </div>
  );
}