import { useEffect, useState } from "react";
import { apiFetch } from "../api";
import { useAuth } from "../context/AuthContext";

function fmtDate(d) {
  if (!d) return "—";
  return new Date(d).toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function NotesModal({ purchase, onClose, onChanged }) {
  const { user } = useAuth();
  const canDeleteAny = user?.role === "admin" || user?.role === "financier";

  const [notes, setNotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const res = await apiFetch(`/api/purchases/${purchase.id}/notes`);
      setNotes(res.notes);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [purchase.id]);

  async function addNote() {
    if (!text.trim()) return;
    setSaving(true);
    setError("");
    try {
      await apiFetch(`/api/purchases/${purchase.id}/notes`, {
        method: "POST",
        body: JSON.stringify({ text }),
      });
      setText("");
      await load();
      onChanged?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function removeNote(id) {
    if (!confirm("Удалить заметку?")) return;
    setError("");
    try {
      await apiFetch(`/api/purchases/${purchase.id}/notes/${id}`, { method: "DELETE" });
      await load();
      onChanged?.();
    } catch (err) {
      setError(err.message);
    }
  }

  function handleKeyDown(e) {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      addNote();
    }
  }

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <h3 style={{ marginTop: 0 }}>Заметки — {purchase.name}</h3>

        {error && <div style={styles.errorBox}>{error}</div>}

        <div style={styles.list}>
          {loading && <div style={styles.hint}>Загрузка…</div>}
          {!loading && notes.length === 0 && <div style={styles.hint}>Заметок пока нет</div>}
          {!loading &&
            notes.map((n) => (
              <div key={n.id} style={styles.noteRow}>
                <div style={styles.noteBody}>
                  <div style={styles.noteText}>{n.text}</div>
                  <div style={styles.noteMeta}>
                    {n.author_name || "—"} · {fmtDate(n.created_at)}
                  </div>
                </div>
                {(canDeleteAny || n.author_id === user?.id) && (
                  <button type="button" onClick={() => removeNote(n.id)} style={styles.deleteButton} title="Удалить">
                    ✕
                  </button>
                )}
              </div>
            ))}
        </div>

        <div style={styles.addRow}>
          <textarea
            placeholder="Добавить заметку… (Ctrl/⌘+Enter — отправить)"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            style={styles.textarea}
            rows={2}
          />
          <button
            type="button"
            onClick={addNote}
            disabled={saving || !text.trim()}
            style={{ ...styles.primaryButton, opacity: saving || !text.trim() ? 0.6 : 1 }}
          >
            Добавить
          </button>
        </div>

        <div style={styles.actions}>
          <button type="button" onClick={onClose} style={styles.secondaryButton}>
            Закрыть
          </button>
        </div>
      </div>
    </div>
  );
}

const styles = {
  overlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,0.4)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 60,
  },
  modal: {
    background: "var(--surface)",
    borderRadius: "var(--radius)",
    padding: 24,
    width: 520,
    maxWidth: "92vw",
    maxHeight: "88vh",
    overflow: "auto",
    boxShadow: "var(--shadow-md)",
    color: "var(--text)",
  },
  errorBox: {
    background: "var(--danger-soft)",
    color: "var(--danger)",
    padding: "10px 14px",
    borderRadius: "var(--radius-sm)",
    marginBottom: 12,
  },
  hint: { color: "var(--text-muted)", fontSize: 13, padding: "4px 0" },
  list: { display: "flex", flexDirection: "column", gap: 8, maxHeight: 320, overflow: "auto", marginBottom: 14 },
  noteRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 10,
    padding: "8px 10px",
    background: "var(--surface-2)",
    borderRadius: "var(--radius-sm)",
  },
  noteBody: { display: "flex", flexDirection: "column", gap: 3, minWidth: 0 },
  noteText: { fontSize: 13.5, color: "var(--text)", whiteSpace: "pre-wrap", wordBreak: "break-word" },
  noteMeta: { fontSize: 11.5, color: "var(--text-secondary)" },
  deleteButton: {
    border: "none",
    background: "none",
    color: "var(--danger)",
    cursor: "pointer",
    fontSize: 14,
    padding: "2px 6px",
    flexShrink: 0,
  },
  addRow: {
    display: "flex",
    gap: 8,
    alignItems: "flex-end",
    paddingTop: 14,
    borderTop: "1px solid var(--border)",
  },
  textarea: {
    flex: 1,
    padding: "8px 10px",
    borderRadius: "var(--radius-sm)",
    border: "1px solid var(--border)",
    background: "var(--surface-2)",
    color: "var(--text)",
    resize: "vertical",
    fontFamily: "inherit",
  },
  primaryButton: {
    background: "var(--accent)",
    color: "var(--accent-contrast)",
    border: "none",
    borderRadius: "var(--radius-sm)",
    padding: "9px 16px",
    cursor: "pointer",
    fontWeight: 600,
    whiteSpace: "nowrap",
  },
  actions: { display: "flex", justifyContent: "flex-end", marginTop: 16 },
  secondaryButton: {
    background: "var(--surface-2)",
    color: "var(--text)",
    border: "1px solid var(--border)",
    borderRadius: "var(--radius-sm)",
    padding: "8px 14px",
    cursor: "pointer",
  },
};
