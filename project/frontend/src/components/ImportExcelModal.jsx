import { useState } from "react";
import { apiUpload } from "../api";

const fmt = (n) => Number(n).toLocaleString("ru-RU", { maximumFractionDigits: 2 });

export default function ImportExcelModal({ year, defaultQuarter, onClose, onImported }) {
  const [quarter, setQuarter] = useState(defaultQuarter ? String(defaultQuarter) : "");
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState(null); // отчёт проверки (до записи)
  const [result, setResult] = useState(null); // итог после импорта
  const [error, setError] = useState("");
  const [addDuplicates, setAddDuplicates] = useState(false);

  async function send({ previewOnly, dup }) {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("year", String(year));
    if (quarter) formData.append("quarter", quarter);
    if (previewOnly) formData.append("preview", "1");
    if (dup) formData.append("duplicates", "add");
    return apiUpload("/api/purchases/import", formData);
  }

  // Шаг 1: выбрали файл — сразу проверяем, ничего не записывая.
  async function checkFile(f, q = quarter) {
    if (!f) return;
    setBusy(true);
    setError("");
    setPreview(null);
    setResult(null);
    setAddDuplicates(false);
    try {
      const formData = new FormData();
      formData.append("file", f);
      formData.append("year", String(year));
      if (q) formData.append("quarter", q);
      formData.append("preview", "1");
      setPreview(await apiUpload("/api/purchases/import", formData));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  function onPick(e) {
    const f = e.target.files?.[0] || null;
    setFile(f);
    checkFile(f);
    e.target.value = "";
  }

  // Шаг 2: подтверждение — реальный импорт.
  async function doImport() {
    setBusy(true);
    setError("");
    try {
      const res = await send({ previewOnly: false, dup: addDuplicates });
      setResult(res);
      setPreview(null);
      onImported?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const dups = preview?.duplicates || [];
  const nothingToDo = preview && preview.toCreate === 0;

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <h3 style={{ marginTop: 0 }}>Импорт плана из Excel</h3>

        <p style={styles.hint}>
          Загрузите файл в формате «План закупочных мероприятий». Перед записью файл проверяется:
          закупки, которые уже есть в плане этого года (тот же квартал и название), считаются
          дублями и по умолчанию пропускаются — повторный импорт того же файла ничего не задвоит.
          Названия филиалов в файле должны совпадать с названиями на странице «Филиалы».
        </p>

        <label style={styles.label}>
          Квартал (если в файле нет разделов «N квартал»)
          <select
            value={quarter}
            onChange={(e) => {
              setQuarter(e.target.value);
              if (file) checkFile(file, e.target.value);
            }}
            style={styles.input}
            disabled={busy}
          >
            <option value="">— не указывать —</option>
            {[1, 2, 3, 4].map((q) => (
              <option key={q} value={q}>{q}</option>
            ))}
          </select>
        </label>

        <div style={{ marginTop: 14 }}>
          <input type="file" accept=".xlsx,.xls" onChange={onPick} disabled={busy} />
        </div>

        {busy && <div style={styles.hint}>{preview || result ? "Импортирую…" : "Проверяю файл…"}</div>}
        {error && <div style={styles.errorBox}>{error}</div>}

        {preview && (
          <div style={styles.resultBox}>
            {preview.fileAlreadyImported && (
              <div style={styles.alert}>
                ⚠ Этот файл уже импортировали {new Date(preview.fileAlreadyImported.at).toLocaleString("ru-RU")}
                {preview.fileAlreadyImported.by ? ` (${preview.fileAlreadyImported.by})` : ""} — тогда добавлено
                закупок: {preview.fileAlreadyImported.created}.
              </div>
            )}

            <div style={styles.resultHeadline}>
              Будет добавлено новых закупок: {preview.toCreate}
              {dups.length > 0 && !addDuplicates ? ` · дублей пропущено: ${dups.length}` : ""}
            </div>

            {dups.length > 0 && (
              <div style={styles.warn}>
                <strong>Найдены дубли ({dups.length}):</strong>
                <ul style={styles.skipList}>
                  {dups.map((d, i) => (
                    <li key={i}>
                      «{d.name}» — {d.quarter} кв., {fmt(d.amount)} ₽ —{" "}
                      {d.reason === "repeated_in_file"
                        ? "повторяется в самом файле"
                        : d.same_amount
                        ? "уже есть в плане (сумма совпадает)"
                        : `уже есть в плане, но с другой суммой (${fmt(d.existing_amount)} ₽) — проверьте вручную`}
                    </li>
                  ))}
                </ul>
                <label style={styles.checkRow}>
                  <input type="checkbox" checked={addDuplicates} onChange={(e) => setAddDuplicates(e.target.checked)} />
                  Всё равно добавить и дубли (если это действительно разные закупки)
                </label>
              </div>
            )}

            {preview.unmatchedBranches?.length > 0 && (
              <div style={styles.warn}>
                Не найдены в системе филиалы (заведите их на странице «Филиалы» и повторите импорт
                для оставшихся строк): <strong>{preview.unmatchedBranches.join(", ")}</strong>
              </div>
            )}

            {preview.dateWarnings?.length > 0 && (
              <div style={styles.warn}>
                Проверьте даты ({preview.dateWarnings.length}):
                <ul style={styles.skipList}>
                  {preview.dateWarnings.map((w, i) => <li key={i}>{w}</li>)}
                </ul>
              </div>
            )}

            {preview.skipped?.length > 0 && (
              <div style={styles.warn}>
                Будет пропущено позиций: {preview.skipped.length}
                <ul style={styles.skipList}>
                  {preview.skipped.map((s, i) => <li key={i}>{s}</li>)}
                </ul>
              </div>
            )}

            <div style={{ marginTop: 12 }}>
              <button
                type="button"
                onClick={doImport}
                disabled={busy || nothingToDo}
                style={{ ...styles.primaryButton, ...(busy || nothingToDo ? { opacity: 0.5, cursor: "not-allowed" } : {}) }}
              >
                {nothingToDo ? "Нечего импортировать — всё уже в плане" : `Импортировать (${preview.toCreate})`}
              </button>
            </div>
          </div>
        )}

        {result && (
          <div style={styles.resultBox}>
            <div style={styles.resultHeadline}>Импортировано закупок: {result.created}</div>
            {result.duplicates?.length > 0 && !addDuplicates && (
              <div style={styles.warn}>Пропущено дублей: {result.duplicates.length}</div>
            )}
            {result.skipped?.length > 0 && (
              <div style={styles.warn}>Пропущено позиций: {result.skipped.length}</div>
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
  alert: { background: "var(--danger-soft)", color: "var(--danger)", padding: "8px 10px", borderRadius: "var(--radius-sm)", fontSize: 12.5, marginBottom: 8 },
  checkRow: { display: "flex", gap: 8, alignItems: "center", marginTop: 8, cursor: "pointer" },
  primaryButton: { background: "var(--accent)", color: "var(--accent-contrast)", border: "none", borderRadius: "var(--radius-sm)", padding: "8px 14px", cursor: "pointer", fontWeight: 600 },
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
