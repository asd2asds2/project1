import { useEffect, useState, useCallback } from "react";
import { apiFetch } from "../api";

const fmtMoney = (n) => Number(n || 0).toLocaleString("ru-RU", { maximumFractionDigits: 0 }) + " ₽";
const fmtDate = (d) => new Date(d).toLocaleDateString("ru-RU");

// Панель «Рабочий план / Утверждённый план» + кнопка «Утвердить план».
// viewVersion: null — рабочий (редактируемый) план, число — id утверждённой версии (только чтение).
export default function ApprovalBar({ year, canApprove, viewVersion, onChangeView, refreshKey }) {
  const [info, setInfo] = useState(null);
  const [confirming, setConfirming] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      setInfo(await apiFetch(`/api/approvals?year=${year}`));
    } catch (e) {
      setError(e.message);
    }
  }, [year]);

  useEffect(() => { load(); }, [load, refreshKey]);

  async function approve() {
    setBusy(true);
    setError("");
    try {
      const res = await apiFetch("/api/approvals", {
        method: "POST",
        body: JSON.stringify({ year, note }),
      });
      setConfirming(false);
      setNote("");
      await load();
      onChangeView(null); // после утверждения остаёмся в рабочем плане — его можно править дальше
      return res;
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  if (!info) return error ? <div style={styles.err}>{error}</div> : null;

  const approvals = info.approvals;
  const last = approvals[0];
  const viewing = approvals.find((a) => a.id === viewVersion) || null;

  return (
    <>
      <div style={styles.bar}>
        <div style={styles.tabs}>
          <button
            type="button"
            onClick={() => onChangeView(null)}
            style={{ ...styles.tab, ...(viewVersion === null ? styles.tabActive : {}) }}
          >
            ✏️ Рабочий план
          </button>
          {last && (
            <button
              type="button"
              onClick={() => onChangeView(viewing ? viewing.id : last.id)}
              style={{ ...styles.tab, ...(viewVersion !== null ? styles.tabActive : {}) }}
            >
              🔒 Утверждённый план
            </button>
          )}
        </div>

        {viewVersion !== null && approvals.length > 1 && (
          <select value={viewVersion} onChange={(e) => onChangeView(Number(e.target.value))} style={styles.select}>
            {approvals.map((a) => (
              <option key={a.id} value={a.id}>
                v{a.version} · {fmtDate(a.approved_at)}
              </option>
            ))}
          </select>
        )}

        <div style={styles.status}>
          {viewing ? (
            <>
              Версия <strong>v{viewing.version}</strong> от {fmtDate(viewing.approved_at)}
              {viewing.approved_by_name ? `, утвердил(а): ${viewing.approved_by_name}` : ""} ·{" "}
              {viewing.items_count} закупок · {fmtMoney(viewing.total_amount)}
              {viewing.note ? ` · «${viewing.note}»` : ""}
              <span style={styles.lock}> Только просмотр — изменить нельзя.</span>
            </>
          ) : last ? (
            <>
              Утверждена v{last.version} от {fmtDate(last.approved_at)}.{" "}
              {info.changes_since_last > 0 ? (
                <span style={styles.changed}>Изменений в рабочем плане после утверждения: {info.changes_since_last}</span>
              ) : (
                <span style={styles.same}>Рабочий план совпадает с утверждённым</span>
              )}
            </>
          ) : (
            <span>План ещё не утверждён</span>
          )}
        </div>

        {canApprove && viewVersion === null && (
          <button type="button" onClick={() => setConfirming(true)} style={styles.approveBtn}>
            ✅ {last ? "Утвердить новую версию" : "Утвердить план"}
          </button>
        )}
      </div>

      {error && <div style={styles.err}>{error}</div>}

      {confirming && (
        <div style={styles.overlay} onClick={() => !busy && setConfirming(false)}>
          <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ marginTop: 0 }}>Утвердить план {year} года?</h3>
            <p style={styles.text}>
              Будет сохранена <strong>неизменяемая копия</strong> всего плана: {info.current.items_count} закупок на сумму{" "}
              {fmtMoney(info.current.total_amount)} (без отменённых). Утверждённую копию потом нельзя редактировать.
              <br />
              Рабочий план остаётся как есть — его можно спокойно править дальше, а утверждённый всегда будет под рукой для сравнения.
            </p>
            <label style={styles.label}>
              Комментарий (необязательно)
              <input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="например: утверждено на совете 15.01"
                style={styles.input}
                maxLength={200}
              />
            </label>
            {error && <div style={styles.err}>{error}</div>}
            <div style={styles.actions}>
              <button type="button" onClick={() => setConfirming(false)} disabled={busy} style={styles.secondary}>
                Отмена
              </button>
              <button type="button" onClick={approve} disabled={busy} style={styles.approveBtn}>
                {busy ? "Утверждаю…" : "Да, утвердить"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

const styles = {
  bar: {
    display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap",
    background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius)",
    padding: "8px 12px", marginBottom: 12,
  },
  tabs: { display: "flex", gap: 4, background: "var(--surface-2)", padding: 3, borderRadius: "var(--radius-sm)" },
  tab: { border: "none", background: "transparent", color: "var(--text-secondary)", padding: "6px 12px", borderRadius: "var(--radius-sm)", cursor: "pointer", fontWeight: 500 },
  tabActive: { background: "var(--surface)", color: "var(--text)", fontWeight: 700, boxShadow: "var(--shadow-sm)" },
  select: { padding: "6px 8px", borderRadius: "var(--radius-sm)", border: "1px solid var(--border)", background: "var(--surface-2)", color: "var(--text)" },
  status: { fontSize: 12.5, color: "var(--text-secondary)", flex: 1, minWidth: 220 },
  lock: { color: "var(--danger)", fontWeight: 600 },
  changed: { color: "var(--danger)", fontWeight: 600 },
  same: { color: "var(--text-muted)" },
  approveBtn: { background: "var(--accent)", color: "var(--accent-contrast)", border: "none", borderRadius: "var(--radius-sm)", padding: "8px 14px", cursor: "pointer", fontWeight: 600 },
  secondary: { background: "var(--surface-2)", color: "var(--text)", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", padding: "8px 14px", cursor: "pointer" },
  err: { background: "var(--danger-soft)", color: "var(--danger)", padding: "8px 12px", borderRadius: "var(--radius-sm)", marginBottom: 10 },
  overlay: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 60 },
  modal: { background: "var(--surface)", color: "var(--text)", borderRadius: "var(--radius)", padding: 24, width: 480, maxWidth: "92vw", boxShadow: "var(--shadow-md)" },
  text: { fontSize: 13.5, lineHeight: 1.55, color: "var(--text-secondary)" },
  label: { display: "flex", flexDirection: "column", gap: 5, fontSize: 12.5, color: "var(--text-secondary)" },
  input: { padding: "8px 10px", borderRadius: "var(--radius-sm)", border: "1px solid var(--border)", background: "var(--surface-2)", color: "var(--text)" },
  actions: { display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 18 },
};
