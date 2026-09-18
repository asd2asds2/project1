import { useEffect, useRef, useState } from "react";
import { apiDownload, apiFetch, apiUpload } from "../api";
import { useAuth } from "../context/AuthContext";

function fmtSize(bytes) {
  if (!bytes) return "—";
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(0)} КБ`;
  return `${(kb / 1024).toFixed(1)} МБ`;
}

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

// Иконка по расширению файла — чтобы служебки было видно с первого взгляда,
// не открывая/не скачивая файл.
function fileIcon(fileName) {
  const ext = (fileName || "").split(".").pop()?.toLowerCase() || "";
  if (["pdf"].includes(ext)) return "📕";
  if (["doc", "docx", "rtf", "odt"].includes(ext)) return "📄";
  if (["xls", "xlsx", "ods", "csv"].includes(ext)) return "📊";
  if (["ppt", "pptx", "odp"].includes(ext)) return "📽️";
  if (["jpg", "jpeg", "png", "gif", "webp", "bmp", "tif", "tiff"].includes(ext)) return "🖼️";
  if (["zip", "rar", "7z"].includes(ext)) return "🗜️";
  return "📎";
}

// entityType: "purchase" | "transfer" | "cancellation" | "unplanned"
// onChanged — вызывается после успешной загрузки/удаления файла, чтобы
// родительская таблица обновила счётчик 📎 у закупки, не дожидаясь
// следующей полной перезагрузки страницы.
export default function DocumentsModal({ entityType, entityId, title, onClose, onChanged }) {
  const { user } = useAuth();
  const canDelete = user?.role === "admin" || user?.role === "financier";

  const [docs, setDocs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [uploading, setUploading] = useState(false);
  const [description, setDescription] = useState("");
  const fileInputRef = useRef(null);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const res = await apiFetch(`/api/documents?entity_type=${entityType}&entity_id=${entityId}`);
      setDocs(res.documents);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entityType, entityId]);

  async function handleFileChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError("");
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("entity_type", entityType);
      formData.append("entity_id", entityId);
      if (description) formData.append("description", description);
      await apiUpload("/api/documents", formData);
      setDescription("");
      if (fileInputRef.current) fileInputRef.current.value = "";
      load();
      onChanged?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
    }
  }

  async function handleDownload(doc) {
    setError("");
    try {
      await apiDownload(`/api/documents/${doc.id}/download`, doc.file_name);
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleDelete(doc) {
    if (!confirm(`Удалить файл «${doc.file_name}»?`)) return;
    setError("");
    try {
      await apiFetch(`/api/documents/${doc.id}`, { method: "DELETE" });
      load();
      onChanged?.();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div style={styles.stickyHead}>
        <h3 style={{ marginTop: 0 }}>Файлы служебок{title ? ` — ${title}` : ""}</h3>

        {error && <div style={styles.errorBox}>{error}</div>}

        <div style={styles.uploadRow}>
          <input
            placeholder="Описание (необязательно)"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            style={styles.descInput}
          />
          <input
            ref={fileInputRef}
            type="file"
            onChange={handleFileChange}
            disabled={uploading}
            style={styles.fileInput}
          />
          {uploading && <div style={styles.hint}>Загрузка…</div>}
        </div>
        </div>

        <div style={styles.list}>
          {loading && <div style={styles.hint}>Загрузка списка…</div>}
          {!loading && docs.length === 0 && <div style={styles.hint}>Файлов пока нет</div>}
          {!loading &&
            docs.map((d) => {
              const tooltip = [d.file_name, d.description].filter(Boolean).join(" — ");
              return (
                <div key={d.id} style={styles.docRow} title={tooltip}>
                  <span style={styles.docIcon}>{fileIcon(d.file_name)}</span>
                  <div style={styles.docInfo}>
                    <button type="button" onClick={() => handleDownload(d)} style={styles.docName} title={tooltip}>
                      {d.file_name}
                    </button>
                    <div style={styles.docMeta}>
                      {fmtSize(d.file_size)} · {d.uploaded_by_name || "—"} · {fmtDate(d.uploaded_at)}
                      {d.description ? ` · ${d.description}` : ""}
                    </div>
                  </div>
                  <div style={styles.docActions}>
                    <button
                      type="button"
                      onClick={() => handleDownload(d)}
                      style={styles.downloadButton}
                      title="Скачать"
                    >
                      ⬇
                    </button>
                    {canDelete && (
                      <button type="button" onClick={() => handleDelete(d)} style={styles.deleteButton} title="Удалить">
                        ✕
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
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
  stickyHead: {
    position: "sticky",
    top: -24,
    background: "var(--surface)",
    zIndex: 1,
    paddingTop: 24,
    marginTop: -24,
  },
  errorBox: {
    background: "var(--danger-soft)",
    color: "var(--danger)",
    padding: "10px 14px",
    borderRadius: "var(--radius-sm)",
    marginBottom: 12,
  },
  uploadRow: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
    marginBottom: 14,
    paddingBottom: 14,
    borderBottom: "1px solid var(--border)",
  },
  descInput: {
    padding: "8px 10px",
    borderRadius: "var(--radius-sm)",
    border: "1px solid var(--border)",
    background: "var(--surface-2)",
    color: "var(--text)",
  },
  fileInput: { color: "var(--text)" },
  hint: { color: "var(--text-muted)", fontSize: 13, padding: "4px 0" },
  list: { display: "flex", flexDirection: "column", gap: 8, maxHeight: 320, overflow: "auto" },
  docRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 10,
    padding: "8px 10px",
    background: "var(--surface-2)",
    borderRadius: "var(--radius-sm)",
  },
  docIcon: { fontSize: 18, lineHeight: "20px", flexShrink: 0 },
  docInfo: { display: "flex", flexDirection: "column", gap: 3, minWidth: 0, flex: 1 },
  docName: {
    border: "none",
    background: "none",
    color: "var(--accent)",
    cursor: "pointer",
    fontSize: 13.5,
    fontWeight: 600,
    padding: 0,
    textAlign: "left",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
    maxWidth: "100%",
    display: "block",
  },
  docMeta: {
    fontSize: 11.5,
    color: "var(--text-secondary)",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  docActions: { display: "flex", alignItems: "center", gap: 2, flexShrink: 0 },
  downloadButton: {
    border: "none",
    background: "none",
    color: "var(--accent)",
    cursor: "pointer",
    fontSize: 14,
    padding: "2px 6px",
    flexShrink: 0,
  },
  deleteButton: {
    border: "none",
    background: "none",
    color: "var(--danger)",
    cursor: "pointer",
    fontSize: 14,
    padding: "2px 6px",
    flexShrink: 0,
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
