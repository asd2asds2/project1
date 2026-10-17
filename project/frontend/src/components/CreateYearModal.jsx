import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useYear } from "../context/YearContext";

// Окно «Создать план на год»: год → шаблон (с превью разделов) → отдел →
// копирование плановых сумм. Внизу — список созданных годов.
export default function CreateYearModal({ onClose }) {
  const navigate = useNavigate();
  const { years, templates, departments, departmentId, createYear, deleteYear } = useYear();

  const nextYear = years.length ? Math.max(...years.map((y) => y.year)) + 1 : new Date().getFullYear();
  const [year, setYear] = useState(String(nextYear));
  const [templateId, setTemplateId] = useState(() => (templates.find((t) => t.is_default) || templates[0])?.id || null);
  const [copyFrom, setCopyFrom] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const yearNum = Number(year);
  const exists = years.some((y) => y.year === yearNum);
  const validYear = Number.isInteger(yearNum) && yearNum >= 2000 && yearNum <= 2100;
  const department = departments.find((d) => d.id === departmentId);
  const template = templates.find((t) => t.id === templateId);

  const preview = useMemo(
    () => (template?.items || []).map((i) => ({ ...i, label: i.label.replace("{year}", validYear ? yearNum : "…") })),
    [template, yearNum, validYear]
  );

  async function submit(e) {
    e.preventDefault();
    setError("");
    setSaving(true);
    try {
      await createYear({ year: yearNum, template_id: templateId, copy_from_year: copyFrom ? Number(copyFrom) : null });
      onClose();
      navigate("/");
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function remove(y) {
    if (!window.confirm(`Удалить пустой план ${y.year} года? Плановые суммы этого года тоже будут удалены.`)) return;
    setError("");
    try {
      await deleteYear(y.year);
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div style={styles.overlay} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form style={styles.modal} onSubmit={submit}>
        <div style={styles.head}>
          <h2 style={styles.title}>Создать план на год</h2>
          <button type="button" onClick={onClose} style={styles.close} aria-label="Закрыть">✕</button>
        </div>

        <div style={styles.row}>
          <label style={{ ...styles.label, width: 130 }}>
            Год
            <input
              type="number"
              min="2000"
              max="2100"
              value={year}
              onChange={(e) => setYear(e.target.value)}
              style={styles.input}
              autoFocus
            />
          </label>
          <div style={{ ...styles.label, flex: 1 }}>
            Отдел
            {departments.length > 1 ? (
              <select value={departmentId || ""} disabled style={styles.input}>
                {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            ) : (
              <div style={styles.fixed}>{department?.name || "—"}</div>
            )}
          </div>
        </div>
        {exists && <div style={styles.warn}>План на {yearNum} год уже создан.</div>}

        <div style={styles.sectionTitle}>Шаблон</div>
        <div style={styles.templates}>
          {templates.map((t) => (
            <label key={t.id} style={{ ...styles.tpl, ...(t.id === templateId ? styles.tplActive : {}) }}>
              <input type="radio" name="tpl" checked={t.id === templateId} onChange={() => setTemplateId(t.id)} />
              <span>
                <b>{t.name}</b>
                {t.description && <span style={styles.muted}> — {t.description}</span>}
              </span>
            </label>
          ))}
        </div>

        <div style={styles.sectionTitle}>В плане появятся разделы</div>
        <div style={styles.chips}>
          {preview.map((i, idx) => (
            <span key={idx} style={styles.chip}>
              <span>{i.icon}</span> {i.label}
            </span>
          ))}
        </div>

        {years.length > 0 && (
          <label style={{ ...styles.label, marginTop: 16 }}>
            Плановые суммы (год и кварталы)
            <select value={copyFrom} onChange={(e) => setCopyFrom(e.target.value)} style={styles.input}>
              <option value="">Начать с нуля</option>
              {years.map((y) => (
                <option key={y.year} value={y.year}>Скопировать из {y.year} года</option>
              ))}
            </select>
          </label>
        )}

        {error && <div style={styles.error}>{error}</div>}

        <div style={styles.actions}>
          <button type="button" onClick={onClose} style={styles.secondary}>Отмена</button>
          <button type="submit" disabled={saving || !validYear || exists || !templateId} style={{ ...styles.primary, opacity: saving || !validYear || exists || !templateId ? 0.55 : 1 }}>
            {saving ? "Создаю…" : `Создать план ${validYear ? yearNum : ""}`}
          </button>
        </div>

        {years.length > 0 && (
          <>
            <div style={styles.sectionTitle}>Созданные годы</div>
            <div style={styles.yearList}>
              {years.map((y) => (
                <div key={y.year} style={styles.yearRow}>
                  <b style={{ minWidth: 48 }}>{y.year}</b>
                  <span style={styles.muted}>
                    {y.template_name || "без шаблона"} · закупок: {y.purchases_count}
                  </span>
                  <span style={{ flex: 1 }} />
                  <button
                    type="button"
                    onClick={() => remove(y)}
                    disabled={y.purchases_count > 0}
                    title={y.purchases_count > 0 ? "В году есть закупки — удалить нельзя" : "Удалить пустой год"}
                    style={{ ...styles.del, opacity: y.purchases_count > 0 ? 0.35 : 1, cursor: y.purchases_count > 0 ? "not-allowed" : "pointer" }}
                  >
                    Удалить
                  </button>
                </div>
              ))}
            </div>
          </>
        )}
      </form>
    </div>
  );
}

const styles = {
  overlay: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 70 },
  modal: { background: "var(--surface)", color: "var(--text)", borderRadius: "var(--radius)", padding: 24, width: 620, maxWidth: "94vw", maxHeight: "90vh", overflow: "auto", boxShadow: "var(--shadow-md)" },
  head: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 },
  title: { margin: 0, fontSize: 18 },
  close: { border: "none", background: "transparent", color: "var(--text-muted)", fontSize: 16, cursor: "pointer" },
  row: { display: "flex", gap: 12 },
  label: { display: "flex", flexDirection: "column", gap: 5, fontSize: 12.5, color: "var(--text-secondary)" },
  input: { padding: "8px 10px", borderRadius: "var(--radius-sm)", border: "1px solid var(--border)", background: "var(--surface-2)", color: "var(--text)", fontSize: 14 },
  fixed: { padding: "8px 10px", borderRadius: "var(--radius-sm)", border: "1px solid var(--border)", background: "var(--surface-2)", color: "var(--text)", fontSize: 14 },
  sectionTitle: { margin: "18px 0 8px", fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, color: "var(--text-muted)" },
  templates: { display: "flex", flexDirection: "column", gap: 6 },
  tpl: { display: "flex", alignItems: "center", gap: 10, padding: "9px 12px", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", cursor: "pointer", fontSize: 13.5 },
  tplActive: { borderColor: "var(--accent)", background: "var(--accent-soft)" },
  muted: { color: "var(--text-secondary)", fontSize: 12.5 },
  chips: { display: "flex", flexWrap: "wrap", gap: 6 },
  chip: { display: "inline-flex", gap: 6, alignItems: "center", padding: "5px 10px", borderRadius: 999, background: "var(--surface-2)", border: "1px solid var(--border)", fontSize: 12.5 },
  warn: { marginTop: 10, padding: "8px 12px", borderRadius: "var(--radius-sm)", background: "var(--warning-soft)", color: "var(--warning)", fontSize: 13 },
  error: { marginTop: 14, padding: "10px 14px", borderRadius: "var(--radius-sm)", background: "var(--danger-soft)", color: "var(--danger)", fontSize: 13 },
  actions: { display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 18 },
  secondary: { background: "var(--surface-2)", color: "var(--text)", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", padding: "9px 14px", cursor: "pointer" },
  primary: { background: "var(--accent)", color: "var(--accent-contrast)", border: "none", borderRadius: "var(--radius-sm)", padding: "9px 16px", fontWeight: 600, cursor: "pointer" },
  yearList: { display: "flex", flexDirection: "column", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)" },
  yearRow: { display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", borderBottom: "1px solid var(--border)", fontSize: 13.5 },
  del: { border: "none", background: "transparent", color: "var(--danger)", fontSize: 12.5 },
};
