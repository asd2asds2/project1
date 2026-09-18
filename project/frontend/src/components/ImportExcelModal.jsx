import { useState } from "react";
import { apiUpload } from "../api";

export default function ImportExcelModal({ year, defaultQuarter, onClose, onImported }) {
  const [quarter, setQuarter] = useState(defaultQuarter ? String(defaultQuarter) : "");
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");

  async function handleFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError("");
    setResult(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("year", String(year));
      if (quarter) formData.append("quarter", quarter);
      const res = await apiUpload("/api/purchases/import", formData);
      setResult(res);
      onImported?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  }

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <h3 style={{ marginTop: 0 }}>Импорт плана из Excel</h3>

        <p style={styles.hint}>
          Загрузите файл в формате «План закупочных мероприятий» (со строкой заголовков «№ п/п»,
          «Наименование…», «НМЦ договора руб.», «Потребители»). Если в файле есть разделы
          «1 квартал» / «2 квартал» и т.д. — квартал каждой закупки возьмётся из них. Если разделов
          нет — используется значение, выбранное ниже, для всего файла. Одна закупка может занимать
          несколько строк подряд (одно название, разные филиалы и суммы) — это распознаётся
          автоматически. Названия филиалов в файле должны совпадать с названиями на странице
          «Филиалы» (регистр не важен).
        </p>

        <label style={styles.label}>
          Квартал (если в файле нет разделов «N квартал»)
          <select value={quarter} onChange={(e) => setQuarter(e.target.value)} style={styles.input}>
            <option value="">— не указывать —</option>
            {[1, 2, 3, 4].map((q) => (
              <option key={q} value={q}>{q}</option>
            ))}
          </select>
        </label>

        <div style={{ marginTop: 14 }}>
          <input type="file" accept=".xlsx,.xls" onChange={handleFile} disabled={uploading} />
        </div>

        {uploading && <div style={styles.hint}>Импортирую…</div>}
        {error && <div style={styles.errorBox}>{error}</div>}

        {result && (
          <div style={styles.resultBox}>
            <div style={styles.resultHeadline}>Импортировано закупок: {result.created}</div>

            {result.unmatchedBranches?.length > 0 && (
              <div style={styles.warn}>
                Не найдены в системе филиалы (заведите их на странице «Филиалы» и повторите импорт
                для оставшихся строк): <strong>{result.unmatchedBranches.join(", ")}</strong>
              </div>
            )}

            {result.skipped?.length > 0 && (
              <div style={styles.warn}>
                Пропущено позиций: {result.skipped.length}
                <ul style={styles.skipList}>
                  {result.skipped.map((s, i) => (
                    <li key={i}>{s}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

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
    width: 560,
    maxWidth: "92vw",
    maxHeight: "88vh",
    overflow: "auto",
    boxShadow: "var(--shadow-md)",
    color: "var(--text)",
  },
  hint: { color: "var(--text-secondary)", fontSize: 12.5, lineHeight: 1.5, marginBottom: 14 },
  label: { display: "flex", flexDirection: "column", gap: 5, fontSize: 12.5, color: "var(--text-secondary)" },
  input: {
    padding: "8px 10px",
    borderRadius: "var(--radius-sm)",
    border: "1px solid var(--border)",
    background: "var(--surface-2)",
    color: "var(--text)",
  },
  errorBox: {
    background: "var(--danger-soft)",
    color: "var(--danger)",
    padding: "10px 14px",
    borderRadius: "var(--radius-sm)",
    marginTop: 14,
  },
  resultBox: {
    marginTop: 16,
    padding: 12,
    background: "var(--surface-2)",
    border: "1px solid var(--border)",
    borderRadius: "var(--radius-sm)",
  },
  resultHeadline: { fontWeight: 700, marginBottom: 6 },
  warn: { fontSize: 12.5, color: "var(--text-secondary)", marginTop: 8 },
  skipList: { margin: "6px 0 0", paddingLeft: 18 },
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
