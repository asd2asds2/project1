import { useEffect, useMemo, useState, useCallback } from "react";
import { apiFetch } from "../api";
import { useAuth } from "../context/AuthContext";
import DocumentsModal from "./DocumentsModal";
import ImportExcelModal from "./ImportExcelModal";

const METHODS = ["ЕП", "ЭА", "ЗК", "Р", "Конкурс", "Другое"];
const EMPTY_SHARE = { branch_id: "", amount: "" };
const EMPTY_FORM = {
  quarter: 1, name: "", product_group: "", method: "ЕП",
  justification: "", tz_date: "", notice_date: "", deadline: "", okpd2: "", comment: "",
  shares: [{ ...EMPTY_SHARE }],
};

function fmtMoney(n) {
  return Number(n || 0).toLocaleString("ru-RU", { minimumFractionDigits: 0 });
}

function rowStyle(p) {
  if (p.status === "cancelled") {
    return { background: "var(--surface)", color: "var(--cancelled-text)", textDecoration: "line-through" };
  }
  if (p.status === "unplanned") {
    return { background: "var(--unplanned-bg)", borderLeft: "3px solid var(--unplanned-border)" };
  }
  if (p.source === "branch" && !p.reviewed_at) {
    return { background: "var(--highlight-new-bg)", borderLeft: "3px solid var(--highlight-new-border)" };
  }
  return {};
}

// year=2026 фикс (можно вынести в проп, если понадобятся другие годы)
// quarter: число 1-4, null — все кварталы (годовой план / поиск)
// search: строка для серверного поиска (используется на странице поиска)
export default function PurchasesTable({ year = 2026, quarter = null, search = "", pending = false, showQuarterColumn = false, title }) {
  const { user } = useAuth();
  const canEdit = user?.role === "admin" || user?.role === "financier" || user?.role === "branch_editor";
  const canReview = user?.role === "admin" || user?.role === "financier";
  const canImport = user?.role === "admin" || user?.role === "financier";

  const [items, setItems] = useState([]);
  const [branches, setBranches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [localSearch, setLocalSearch] = useState("");
  const [editing, setEditing] = useState(null); // id закупки, которую редактируем, или "new"
  const [form, setForm] = useState(EMPTY_FORM);
  const [filesFor, setFilesFor] = useState(null); // закупка, для которой открыта модалка файлов
  const [importing, setImporting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ year: String(year) });
      if (quarter) params.set("quarter", String(quarter));
      if (pending) params.set("pending", "1");
      const effectiveSearch = search || localSearch;
      if (effectiveSearch) params.set("search", effectiveSearch);

      const [purchasesRes, branchesRes] = await Promise.all([
        apiFetch(`/api/purchases?${params.toString()}`),
        apiFetch(`/api/branches`),
      ]);
      setItems(purchasesRes.purchases);
      setBranches(branchesRes.branches);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [year, quarter, search, pending, localSearch]);

  useEffect(() => { load(); }, [load]);

  const total = useMemo(
    () => items.filter((i) => i.status !== "cancelled").reduce((sum, i) => sum + Number(i.amount || 0), 0),
    [items]
  );

  function startEdit(p) {
    setEditing(p.id);
    const shares =
      p.shares && p.shares.length > 0
        ? p.shares.map((s) => ({ branch_id: s.branch_id, amount: s.amount }))
        : [{ branch_id: p.branch_id || "", amount: p.amount || "" }];
    setForm({
      quarter: p.quarter, name: p.name, product_group: p.product_group || "",
      method: p.method || "ЕП", justification: p.justification || "",
      tz_date: p.tz_date ? p.tz_date.slice(0, 10) : "", notice_date: p.notice_date ? p.notice_date.slice(0, 10) : "",
      deadline: p.deadline || "", okpd2: p.okpd2 || "", comment: p.comment || "",
      shares,
    });
  }

  function startNew() {
    setEditing("new");
    setForm({ ...EMPTY_FORM, quarter: quarter || 1, shares: [{ branch_id: branches[0]?.id || "", amount: "" }] });
  }

  async function save() {
    const cleanShares = form.shares
      .map((s) => ({ branch_id: Number(s.branch_id), amount: Number(s.amount) }))
      .filter((s) => s.branch_id && s.amount > 0);

    if (cleanShares.length === 0) {
      setError("Укажите хотя бы один филиал и сумму больше нуля");
      return;
    }

    const payload = { ...form, shares: cleanShares };
    delete payload.branch_id;

    try {
      if (editing === "new") {
        await apiFetch(`/api/purchases`, { method: "POST", body: JSON.stringify({ ...payload, year }) });
      } else {
        await apiFetch(`/api/purchases/${editing}`, { method: "PUT", body: JSON.stringify(payload) });
      }
      setEditing(null);
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function review(id) {
    try {
      await apiFetch(`/api/purchases/${id}/review`, { method: "POST" });
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function transfer(id) {
    const to = prompt("Перенести в какой квартал? (1-4)");
    if (!to) return;
    const reason = prompt("Причина переноса:");
    if (!reason) return;
    try {
      await apiFetch(`/api/purchases/${id}/transfer`, { method: "POST", body: JSON.stringify({ to_quarter: Number(to), reason }) });
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function cancelItem(id) {
    const reason = prompt("Причина отмены:");
    if (!reason) return;
    try {
      await apiFetch(`/api/purchases/${id}/cancel`, { method: "POST", body: JSON.stringify({ reason }) });
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function deleteItem(p) {
    if (!confirm(`Удалить закупку «${p.name}» безвозвратно? Это действие нельзя отменить.`)) return;
    try {
      await apiFetch(`/api/purchases/${p.id}`, { method: "DELETE" });
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div>
      <div style={styles.header}>
        <h2 style={styles.title}>{title}</h2>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          {!search && (
            <input
              placeholder="Фильтр по этой странице…"
              value={localSearch}
              onChange={(e) => setLocalSearch(e.target.value)}
              style={styles.filterInput}
            />
          )}
          {canImport && (
            <button type="button" onClick={() => setImporting(true)} style={styles.secondaryButton}>
              Импорт из Excel
            </button>
          )}
          {canEdit && (
            <button type="button" onClick={startNew} style={styles.primaryButton}>
              + Добавить закупку
            </button>
          )}
        </div>
      </div>

      {error && <div style={styles.errorBox}>{error}</div>}

      <div style={styles.legend}>
        <span><i style={{ ...styles.dot, background: "var(--highlight-new-border)" }} /> новое от филиала — не просмотрено</span>
        <span><i style={{ ...styles.dot, background: "var(--unplanned-border)" }} /> внеплановая закупка</span>
        <span><i style={{ ...styles.dot, background: "var(--cancelled-text)" }} /> отменено</span>
      </div>

      <div style={styles.tableWrap}>
        <table>
          <thead>
            <tr>
              <th style={styles.th}>№</th>
              {showQuarterColumn && <th style={styles.th}>Кв.</th>}
              <th style={styles.th}>Наименование закупки</th>
              <th style={styles.th}>Группа (АСГОР)</th>
              <th style={styles.th}>Способ</th>
              <th style={styles.th}>НМЦ, руб.</th>
              <th style={styles.th}>Филиал</th>
              <th style={styles.th}>Срок исп.</th>
              <th style={styles.th}>ОКПД2</th>
              <th style={styles.th}>Статус</th>
              <th style={styles.th}></th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={11} style={styles.emptyCell}>Загрузка…</td></tr>
            )}
            {!loading && items.length === 0 && (
              <tr><td colSpan={11} style={styles.emptyCell}>Пока нет закупок</td></tr>
            )}
            {!loading && items.map((p) => (
              <tr key={p.id} style={rowStyle(p)}>
                <td style={styles.td}>{p.item_no ?? "—"}</td>
                {showQuarterColumn && <td style={styles.td}>{p.quarter}</td>}
                <td style={styles.td}>{p.name}</td>
                <td style={styles.td}>{p.product_group || "—"}</td>
                <td style={styles.td}>{p.method || "—"}</td>
                <td style={{ ...styles.td, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{fmtMoney(p.amount)}</td>
                <td style={styles.td}>
                  {p.shares && p.shares.length > 1 ? (
                    <div>
                      <div>{p.shares.length} филиала(ов)</div>
                      <div style={styles.sharesBreakdown}>
                        {p.shares.map((s) => `${s.branch_name}: ${fmtMoney(s.amount)}`).join("; ")}
                      </div>
                    </div>
                  ) : (
                    p.branch_name || "—"
                  )}
                </td>
                <td style={styles.td}>{p.deadline || "—"}</td>
                <td style={styles.td}>{p.okpd2 || "—"}</td>
                <td style={styles.td}>{statusLabel(p.status)}</td>
                <td style={{ ...styles.td, whiteSpace: "nowrap" }}>
                  {canEdit && <button type="button" onClick={() => startEdit(p)} style={styles.linkButton}>изм.</button>}
                  <button type="button" onClick={() => setFilesFor(p)} style={styles.linkButton}>📎 файлы</button>
                  {canReview && p.source === "branch" && !p.reviewed_at && (
                    <button type="button" onClick={() => review(p.id)} style={styles.linkButton}>✓ просмотрено</button>
                  )}
                  {canReview && p.status === "plan" && (
                    <>
                      <button type="button" onClick={() => transfer(p.id)} style={styles.linkButton}>перенос</button>
                      <button type="button" onClick={() => cancelItem(p.id)} style={{ ...styles.linkButton, color: "var(--danger)" }}>отменить</button>
                    </>
                  )}
                  {canReview && p.status === "cancelled" && (
                    <button type="button" onClick={() => deleteItem(p)} style={{ ...styles.linkButton, color: "var(--danger)" }}>удалить</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
          {!loading && items.length > 0 && (
            <tfoot>
              <tr>
                <td colSpan={showQuarterColumn ? 5 : 4} style={styles.totalLabel}>Итого:</td>
                <td style={{ ...styles.totalValue, textAlign: "right" }}>{fmtMoney(total)}</td>
                <td colSpan={5}></td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {editing && (
        <EditModal
          form={form}
          setForm={setForm}
          branches={branches}
          isNew={editing === "new"}
          onCancel={() => setEditing(null)}
          onSave={save}
        />
      )}

      {filesFor && (
        <DocumentsModal
          entityType="purchase"
          entityId={filesFor.id}
          title={filesFor.name}
          onClose={() => setFilesFor(null)}
        />
      )}

      {importing && (
        <ImportExcelModal
          year={year}
          defaultQuarter={quarter}
          onClose={() => setImporting(false)}
          onImported={load}
        />
      )}
    </div>
  );
}

function statusLabel(status) {
  const map = {
    plan: "в плане",
    transferred: "перенесено",
    cancelled: "отменено",
    unplanned: "внеплан",
    done: "исполнено",
  };
  return map[status] || status;
}

function EditModal({ form, setForm, branches, isNew, onCancel, onSave }) {
  function set(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  function updateShare(idx, field, value) {
    setForm((f) => {
      const shares = f.shares.map((s, i) => (i === idx ? { ...s, [field]: value } : s));
      return { ...f, shares };
    });
  }

  function addShare() {
    setForm((f) => ({ ...f, shares: [...f.shares, { ...EMPTY_SHARE, branch_id: branches[0]?.id || "" }] }));
  }

  function removeShare(idx) {
    setForm((f) => ({ ...f, shares: f.shares.filter((_, i) => i !== idx) }));
  }

  const sharesTotal = form.shares.reduce((sum, s) => sum + (Number(s.amount) || 0), 0);

  return (
    <div style={styles.modalOverlay}>
      <div style={styles.modal}>
        <h3 style={{ marginTop: 0 }}>{isNew ? "Новая закупка" : "Редактирование закупки"}</h3>

        <div style={styles.formGrid}>
          <label style={styles.label}>
            Квартал
            <select value={form.quarter} onChange={(e) => set("quarter", Number(e.target.value))} style={styles.input}>
              {[1, 2, 3, 4].map((q) => <option key={q} value={q}>{q}</option>)}
            </select>
          </label>

          <label style={{ ...styles.label, gridColumn: "1 / -1" }}>
            Наименование закупки
            <input value={form.name} onChange={(e) => set("name", e.target.value)} style={styles.input} />
          </label>

          <label style={{ ...styles.label, gridColumn: "1 / -1" }}>
            Филиалы и суммы (НМЦ)
            <div style={styles.sharesList}>
              {form.shares.map((sh, idx) => (
                <div key={idx} style={styles.shareRow}>
                  <select
                    value={sh.branch_id}
                    onChange={(e) => updateShare(idx, "branch_id", e.target.value)}
                    style={{ ...styles.input, flex: 2 }}
                  >
                    <option value="">— филиал —</option>
                    {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </select>
                  <input
                    type="number"
                    placeholder="Сумма, руб."
                    value={sh.amount}
                    onChange={(e) => updateShare(idx, "amount", e.target.value)}
                    style={{ ...styles.input, flex: 1 }}
                  />
                  {form.shares.length > 1 && (
                    <button type="button" onClick={() => removeShare(idx)} style={styles.removeShareButton} title="Убрать филиал">
                      ✕
                    </button>
                  )}
                </div>
              ))}
              <div style={styles.sharesFooter}>
                <button type="button" onClick={addShare} style={styles.linkButton}>+ добавить филиал</button>
                <span style={styles.sharesTotal}>Итого по закупке: {fmtMoney(sharesTotal)} руб.</span>
              </div>
            </div>
          </label>

          <label style={styles.label}>
            Группа продукции (АСГОР)
            <input value={form.product_group} onChange={(e) => set("product_group", e.target.value)} style={styles.input} />
          </label>

          <label style={styles.label}>
            Способ размещения
            <select value={form.method} onChange={(e) => set("method", e.target.value)} style={styles.input}>
              {METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </label>

          <label style={{ ...styles.label, gridColumn: "1 / -1" }}>
            Обоснование закупки у ЕП
            <input value={form.justification} onChange={(e) => set("justification", e.target.value)} style={styles.input} />
          </label>

          <label style={styles.label}>
            Дата подачи ТЗ
            <input type="date" value={form.tz_date} onChange={(e) => set("tz_date", e.target.value)} style={styles.input} />
          </label>

          <label style={styles.label}>
            Дата размещения извещения
            <input type="date" value={form.notice_date} onChange={(e) => set("notice_date", e.target.value)} style={styles.input} />
          </label>

          <label style={styles.label}>
            Срок исполнения (мес, год)
            <input value={form.deadline} onChange={(e) => set("deadline", e.target.value)} style={styles.input} />
          </label>

          <label style={styles.label}>
            Код ОКПД2
            <input value={form.okpd2} onChange={(e) => set("okpd2", e.target.value)} style={styles.input} />
          </label>

          <label style={{ ...styles.label, gridColumn: "1 / -1" }}>
            Примечание
            <input value={form.comment} onChange={(e) => set("comment", e.target.value)} style={styles.input} />
          </label>
        </div>

        <div style={styles.modalActions}>
          <button type="button" onClick={onCancel} style={styles.secondaryButton}>Отмена</button>
          <button type="button" onClick={onSave} style={styles.primaryButton}>Сохранить</button>
        </div>
      </div>
    </div>
  );
}

const styles = {
  header: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, flexWrap: "wrap", gap: 10 },
  title: { margin: 0, fontSize: 20, color: "var(--text)" },
  filterInput: { padding: "7px 10px", borderRadius: "var(--radius-sm)", border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text)", width: 220 },
  primaryButton: { background: "var(--accent)", color: "var(--accent-contrast)", border: "none", borderRadius: "var(--radius-sm)", padding: "8px 14px", cursor: "pointer", fontWeight: 600 },
  secondaryButton: { background: "var(--surface-2)", color: "var(--text)", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", padding: "8px 14px", cursor: "pointer" },
  errorBox: { background: "var(--danger-soft)", color: "var(--danger)", padding: "10px 14px", borderRadius: "var(--radius-sm)", marginBottom: 12 },
  legend: { display: "flex", gap: 18, fontSize: 12, color: "var(--text-secondary)", marginBottom: 10, flexWrap: "wrap" },
  dot: { display: "inline-block", width: 9, height: 9, borderRadius: "50%", marginRight: 5 },
  tableWrap: { background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius)", overflow: "auto", boxShadow: "var(--shadow-sm)" },
  th: { textAlign: "left", padding: "10px 12px", borderBottom: "1px solid var(--border)", color: "var(--text-secondary)", fontSize: 12, textTransform: "uppercase", letterSpacing: 0.3, whiteSpace: "nowrap" },
  td: { padding: "9px 12px", borderBottom: "1px solid var(--border)", fontSize: 13.5, color: "var(--text)" },
  sharesBreakdown: { fontSize: 11, color: "var(--text-secondary)", marginTop: 2 },
  emptyCell: { padding: 24, textAlign: "center", color: "var(--text-muted)" },
  totalLabel: { padding: "10px 12px", fontWeight: 700, textAlign: "right", color: "var(--text)" },
  totalValue: { padding: "10px 12px", fontWeight: 700, color: "var(--text)", fontVariantNumeric: "tabular-nums" },
  linkButton: { border: "none", background: "none", color: "var(--accent)", cursor: "pointer", fontSize: 12.5, marginRight: 10, padding: 0 },
  modalOverlay: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50 },
  modal: { background: "var(--surface)", borderRadius: "var(--radius)", padding: 24, width: 640, maxWidth: "92vw", maxHeight: "88vh", overflow: "auto", boxShadow: "var(--shadow-md)", color: "var(--text)" },
  formGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 },
  label: { display: "flex", flexDirection: "column", gap: 5, fontSize: 12.5, color: "var(--text-secondary)" },
  input: { padding: "8px 10px", borderRadius: "var(--radius-sm)", border: "1px solid var(--border)", background: "var(--surface-2)", color: "var(--text)" },
  modalActions: { display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 18 },
  sharesList: { display: "flex", flexDirection: "column", gap: 8, background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", padding: 10 },
  shareRow: { display: "flex", gap: 8, alignItems: "center" },
  removeShareButton: { border: "none", background: "none", color: "var(--danger)", cursor: "pointer", fontSize: 14, padding: "4px 6px", flexShrink: 0 },
  sharesFooter: { display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 4, flexWrap: "wrap", gap: 8 },
  sharesTotal: { fontSize: 12.5, fontWeight: 600, color: "var(--text)" },
};