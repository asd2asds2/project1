import { useEffect, useState } from "react";
import { apiFetch } from "../api";
import { useAuth } from "../context/AuthContext";
import { BRANCH_PALETTE, colorForBranch } from "../theme/branchPalette";

const EMPTY = { name: "", code: "", address: "", color: "" };

export default function BranchesPage() {
  const { user } = useAuth();
  const canEdit = user?.role === "admin" || user?.role === "financier";

  const [branches, setBranches] = useState([]);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(null); // id или "new"
  const [form, setForm] = useState(EMPTY);

  function load() {
    apiFetch("/api/branches").then((d) => setBranches(d.branches)).catch((e) => setError(e.message));
  }

  useEffect(load, []);

  function startEdit(b) {
    setEditing(b.id);
    setForm({ name: b.name, code: b.code, address: b.address || "", color: colorForBranch(b) });
  }

  function startNew() {
    setEditing("new");
    // Цвет по умолчанию для нового филиала — случайный из палитры (можно
    // сразу же поменять на свой в этой же форме); если оставить как есть,
    // при сохранении уйдёт именно этот цвет.
    const random = BRANCH_PALETTE[Math.floor(Math.random() * BRANCH_PALETTE.length)];
    setForm({ ...EMPTY, color: random });
  }

  async function save() {
    try {
      if (editing === "new") {
        await apiFetch("/api/branches", { method: "POST", body: JSON.stringify(form) });
      } else {
        await apiFetch(`/api/branches/${editing}`, { method: "PUT", body: JSON.stringify(form) });
      }
      setEditing(null);
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function toggleActive(b) {
    try {
      await apiFetch(`/api/branches/${b.id}`, { method: "PUT", body: JSON.stringify({ is_active: !b.is_active }) });
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div>
      <div style={styles.header}>
        <h1 style={styles.h1}>Филиалы</h1>
        {canEdit && <button type="button" onClick={startNew} style={styles.primaryButton}>+ Добавить филиал</button>}
      </div>

      {error && <div style={styles.errorBox}>{error}</div>}

      <div style={styles.tableWrap}>
        <table>
          <thead>
            <tr>
              <th style={{ ...styles.th, width: 36 }}>Цвет</th>
              <th style={styles.th}>Название</th>
              <th style={styles.th}>Код</th>
              <th style={styles.th}>Адрес</th>
              <th style={styles.th}>Статус</th>
              <th style={styles.th}></th>
            </tr>
          </thead>
          <tbody>
            {branches.map((b) => (
              <tr key={b.id} style={!b.is_active ? { opacity: 0.5 } : {}}>
                <td style={styles.td}>
                  <span style={{ ...styles.colorDot, background: colorForBranch(b) }} title={colorForBranch(b)} />
                </td>
                <td style={styles.td}>{b.name}</td>
                <td style={styles.td}>{b.code}</td>
                <td style={styles.td}>{b.address || "—"}</td>
                <td style={styles.td}>{b.is_active ? "активен" : "отключён"}</td>
                <td style={styles.td}>
                  {canEdit && (
                    <>
                      <button type="button" onClick={() => startEdit(b)} style={styles.linkButton}>изм.</button>
                      <button type="button" onClick={() => toggleActive(b)} style={styles.linkButton}>
                        {b.is_active ? "отключить" : "включить"}
                      </button>
                    </>
                  )}
                </td>
              </tr>
            ))}
            {branches.length === 0 && (
              <tr><td colSpan={6} style={styles.emptyCell}>Филиалов пока нет</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {editing && (
        <div style={styles.modalOverlay}>
          <div style={styles.modal}>
            <h3 style={{ marginTop: 0 }}>{editing === "new" ? "Новый филиал" : "Редактирование филиала"}</h3>
            <label style={styles.label}>
              Название
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} style={styles.input} />
            </label>
            <label style={styles.label}>
              Код (короткий, уникальный)
              <input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} style={styles.input} />
            </label>
            <label style={styles.label}>
              Адрес
              <input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} style={styles.input} />
            </label>
            <label style={styles.label}>
              Цвет (для меток в таблице закупок и на главной)
              <div style={styles.colorRow}>
                <input
                  type="color"
                  value={form.color || "#2f6fed"}
                  onChange={(e) => setForm({ ...form, color: e.target.value })}
                  style={styles.colorInput}
                />
                <span>{form.color}</span>
                <button
                  type="button"
                  onClick={() => setForm({ ...form, color: BRANCH_PALETTE[Math.floor(Math.random() * BRANCH_PALETTE.length)] })}
                  style={styles.linkButton}
                >
                  случайный
                </button>
              </div>
            </label>
            <div style={styles.modalActions}>
              <button type="button" onClick={() => setEditing(null)} style={styles.secondaryButton}>Отмена</button>
              <button type="button" onClick={save} style={styles.primaryButton}>Сохранить</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const styles = {
  header: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 },
  h1: { margin: 0, fontSize: 22, color: "var(--text)" },
  primaryButton: { background: "var(--accent)", color: "var(--accent-contrast)", border: "none", borderRadius: "var(--radius-sm)", padding: "8px 14px", cursor: "pointer", fontWeight: 600 },
  secondaryButton: { background: "var(--surface-2)", color: "var(--text)", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", padding: "8px 14px", cursor: "pointer" },
  errorBox: { background: "var(--danger-soft)", color: "var(--danger)", padding: "10px 14px", borderRadius: "var(--radius-sm)", marginBottom: 16 },
  tableWrap: { background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius)", overflow: "hidden", boxShadow: "var(--shadow-sm)" },
  th: { textAlign: "left", padding: "10px 14px", borderBottom: "1px solid var(--border)", color: "var(--text-secondary)", fontSize: 12 },
  td: { padding: "9px 14px", borderBottom: "1px solid var(--border)", fontSize: 13.5, color: "var(--text)" },
  emptyCell: { padding: 24, textAlign: "center", color: "var(--text-muted)" },
  linkButton: { border: "none", background: "none", color: "var(--accent)", cursor: "pointer", fontSize: 12.5, marginRight: 10, padding: 0 },
  modalOverlay: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50 },
  modal: { background: "var(--surface)", borderRadius: "var(--radius)", padding: 24, width: 420, maxWidth: "92vw", boxShadow: "var(--shadow-md)", color: "var(--text)" },
  label: { display: "flex", flexDirection: "column", gap: 5, fontSize: 12.5, color: "var(--text-secondary)", marginBottom: 12 },
  input: { padding: "8px 10px", borderRadius: "var(--radius-sm)", border: "1px solid var(--border)", background: "var(--surface-2)", color: "var(--text)" },
  modalActions: { display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 10 },
  colorDot: { display: "inline-block", width: 14, height: 14, borderRadius: "50%", border: "1px solid var(--border)" },
  colorRow: { display: "flex", alignItems: "center", gap: 10 },
  colorInput: { width: 40, height: 30, padding: 0, border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", background: "none", cursor: "pointer" },
};
