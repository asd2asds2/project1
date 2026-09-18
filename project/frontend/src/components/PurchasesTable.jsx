import { useEffect, useMemo, useState, useCallback } from "react";
import { apiFetch } from "../api";
import { useAuth } from "../context/AuthContext";
import DocumentsModal from "./DocumentsModal";
import NotesModal from "./NotesModal";
import ImportExcelModal from "./ImportExcelModal";
import ContextMenu from "./ContextMenu";

const METHODS = ["ЕП", "ЭА", "ЗК", "Р", "Конкурс", "Другое"];
const EMPTY_SHARE = { branch_id: "", amount: "" };
const EMPTY_FORM = {
  quarter: 1, name: "", product_group: "", method: "ЕП",
  justification: "", tz_date: "", notice_date: "", deadline: "", okpd2: "", comment: "",
  shares: [{ ...EMPTY_SHARE }],
};

// Цвет-метка квартала (для бейджа в колонке "Кв." на годовом плане) —
// чисто визуальная подсказка, к статусу закупки отношения не имеет.
const QUARTER_COLORS = {
  1: "#2f6fed",
  2: "#1a8a4e",
  3: "#b6780f",
  4: "#8a4fd1",
};

function fmtMoney(n) {
  return Number(n || 0).toLocaleString("ru-RU", { minimumFractionDigits: 0 });
}

// Считаем закупку/долю "по центру", если название филиала содержит "Центр"
// (так филиал обычно и заведён в справочнике — см. README-INTEGRATION).
function isCenterName(name) {
  return /центр/i.test(String(name || ""));
}

// Сумма конкретной закупки, которая приходится на филиал "Центр":
// у закупок с разбивкой по филиалам — сумма долей с этим филиалом,
// у старых закупок с одним branch_id — вся сумма, если это Центр.
function centerAmountOf(p) {
  if (p.shares && p.shares.length > 0) {
    return p.shares.reduce((sum, s) => sum + (isCenterName(s.branch_name) ? Number(s.amount || 0) : 0), 0);
  }
  return isCenterName(p.branch_name) ? Number(p.amount || 0) : 0;
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
  const [notesFor, setNotesFor] = useState(null); // закупка, для которой открыта модалка заметок
  const [importing, setImporting] = useState(false);
  const [menu, setMenu] = useState(null); // { x, y, purchase } — контекстное меню по ПКМ
  const [dragId, setDragId] = useState(null);
  const [overId, setOverId] = useState(null);
  // Часть колонок (второстепенные, редко нужные) по умолчанию скрыта,
  // чтобы таблица помещалась по ширине без горизонтального скролла целиком
  // экрана. Кнопка "Показать все колонки" раскрывает их обратно.
  // Выбор запоминается в localStorage — одинаковый для всех страниц с таблицей.
  const [wideColumns, setWideColumns] = useState(() => {
    try {
      return localStorage.getItem("purchasesTable.wideColumns") === "1";
    } catch {
      return false;
    }
  });

  function toggleWideColumns() {
    setWideColumns((prev) => {
      const next = !prev;
      try {
        localStorage.setItem("purchasesTable.wideColumns", next ? "1" : "0");
      } catch {
        // localStorage недоступен (приватный режим и т.п.) — просто не сохраняем выбор
      }
      return next;
    });
  }

  const effectiveSearch = search || localSearch;
  // Порядок можно менять перетаскиванием только внутри одного конкретного
  // квартала и без активного поиска/фильтра — иначе визуальный порядок строк
  // не совпадает с реальным порядком в квартале, и перетаскивание запутает.
  const canReorder = canEdit && !!quarter && !effectiveSearch && !pending;

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ year: String(year) });
      if (quarter) params.set("quarter", String(quarter));
      if (pending) params.set("pending", "1");
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year, quarter, search, pending, localSearch]);

  useEffect(() => { load(); }, [load]);

  const stats = useMemo(() => {
    const active = items.filter((i) => i.status !== "cancelled");
    return {
      total: active.reduce((sum, i) => sum + Number(i.amount || 0), 0),
      count: active.length,
      cancelled: items.filter((i) => i.status === "cancelled").length,
      unplanned: items.filter((i) => i.status === "unplanned").length,
      pendingReview: items.filter((i) => i.source === "branch" && !i.reviewed_at).length,
    };
  }, [items]);

  // Итоги "как в Excel-плане": по каждому кварталу, что встречается в items,
  // плюс отдельно сумма, приходящаяся на филиал "Центр". На годовом плане
  // (quarter=null) получаем строку на каждый квартал 1-4, на странице
  // квартала — фактически одну строку (в items только этот квартал).
  const quarterTotals = useMemo(() => {
    const active = items.filter((i) => i.status !== "cancelled");
    const quarters = [...new Set(active.map((i) => i.quarter))].sort((a, b) => a - b);
    return quarters.map((q) => {
      const qItems = active.filter((i) => i.quarter === q);
      return {
        quarter: q,
        total: qItems.reduce((sum, i) => sum + Number(i.amount || 0), 0),
        center: qItems.reduce((sum, i) => sum + centerAmountOf(i), 0),
      };
    });
  }, [items]);

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

  async function restoreItem(id) {
    try {
      await apiFetch(`/api/purchases/${id}/restore`, { method: "POST" });
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

  // --- Перетаскивание строк (drag-and-drop) ---------------------------------

  async function persistOrder(newItems) {
    try {
      await apiFetch(`/api/purchases/reorder`, {
        method: "PATCH",
        body: JSON.stringify({ year, quarter, order: newItems.map((p) => p.id) }),
      });
    } catch (err) {
      setError(err.message);
      load();
    }
  }

  function onRowDragStart(e, id) {
    setDragId(id);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", String(id));
  }

  function onRowDragOver(e, id) {
    if (dragId === null || dragId === id) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (overId !== id) setOverId(id);
  }

  function onRowDrop(e, id) {
    e.preventDefault();
    if (dragId === null || dragId === id) {
      setDragId(null);
      setOverId(null);
      return;
    }
    setItems((prev) => {
      const fromIdx = prev.findIndex((p) => p.id === dragId);
      const toIdx = prev.findIndex((p) => p.id === id);
      if (fromIdx === -1 || toIdx === -1) return prev;
      const next = [...prev];
      const [moved] = next.splice(fromIdx, 1);
      next.splice(toIdx, 0, moved);
      const renumbered = next.map((p, idx) => ({ ...p, item_no: idx + 1 }));
      persistOrder(renumbered);
      return renumbered;
    });
    setDragId(null);
    setOverId(null);
  }

  function onRowDragEnd() {
    setDragId(null);
    setOverId(null);
  }

  // --- Контекстное меню (ПКМ) -----------------------------------------------

  function openContextMenu(e, p) {
    e.preventDefault();
    setMenu({ x: e.clientX, y: e.clientY, purchase: p });
  }

  function contextMenuItems(p) {
    const items = [];
    if (canEdit) {
      items.push({ label: "Изменить", icon: "✏️", onClick: () => startEdit(p) });
    }
    items.push({ label: "Файлы служебок", icon: "📎", onClick: () => setFilesFor(p) });
    items.push({
      label: p.notes_count > 0 ? `Заметки (${p.notes_count})` : "Заметки",
      icon: "📝",
      onClick: () => setNotesFor(p),
    });
    if (canReview && p.source === "branch" && !p.reviewed_at) {
      items.push({ divider: true });
      items.push({ label: "Отметить просмотренным", icon: "✓", onClick: () => review(p.id) });
    }
    if (canReview && p.status === "plan") {
      items.push({ divider: true });
      items.push({ label: "Перенести в другой квартал", icon: "↷", onClick: () => transfer(p.id) });
      items.push({ label: "Отменить закупку", icon: "⊘", danger: true, onClick: () => cancelItem(p.id) });
    }
    if (canReview && p.status === "cancelled") {
      items.push({ divider: true });
      items.push({ label: "Вернуть из отмены", icon: "↺", onClick: () => restoreItem(p.id) });
      items.push({ label: "Удалить безвозвратно", icon: "🗑", danger: true, onClick: () => deleteItem(p) });
    }
    return items;
  }

  // Для colSpan строк "Загрузка…" / "Пока нет закупок" — считаем реально
  // отображаемые колонки: 7 всегда видимых (№, Наименование, НМЦ,
  // Потребители, ОКПД2, Статус, действия) + опциональные.
  const columnCount = 7 + (canReorder ? 1 : 0) + (showQuarterColumn ? 1 : 0) + (wideColumns ? 6 : 0);

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
          <button type="button" onClick={toggleWideColumns} style={styles.secondaryButton} className="secondary-btn">
            {wideColumns ? "Скрыть доп. колонки" : "Показать все колонки"}
          </button>
          {canImport && (
            <button type="button" onClick={() => setImporting(true)} style={styles.secondaryButton} className="secondary-btn">
              Импорт из Excel
            </button>
          )}
          {canEdit && (
            <button type="button" onClick={startNew} style={styles.primaryButton} className="primary-btn">
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
        {canReorder && <span style={styles.legendHint}>⋮⋮ — перетащите, чтобы изменить порядок · ПКМ по строке — быстрые действия</span>}
        {!canReorder && <span style={styles.legendHint}>ПКМ по строке — быстрые действия</span>}
      </div>

      <div style={styles.tableWrap}>
        <table>
          <thead>
            <tr>
              {canReorder && <th style={{ ...styles.th, width: 28 }}></th>}
              <th style={styles.th}>№ п/п</th>
              {showQuarterColumn && <th style={styles.th}>Кв.</th>}
              <th style={styles.th}>Наименование закупки (предмет договора)</th>
              {wideColumns && <th style={styles.th}>Группа продукции (АСГОР)</th>}
              {wideColumns && <th style={styles.th}>Способ размещения закупки</th>}
              {wideColumns && <th style={styles.th}>Обоснование закупки у ЕП</th>}
              {wideColumns && <th style={styles.th}>Плановая дата подачи ТЗ/спецификации</th>}
              {wideColumns && <th style={styles.th}>Плановая дата размещения извещения</th>}
              <th style={styles.th}>НМЦ договора, руб.</th>
              <th style={styles.th}>Потребители</th>
              {wideColumns && <th style={styles.th}>Срок исполнения договора</th>}
              <th style={styles.th}>Код по ОКПД 2</th>
              <th style={styles.th}>Статус</th>
              <th style={styles.th}></th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={columnCount} style={styles.emptyCell}>Загрузка…</td></tr>
            )}
            {!loading && items.length === 0 && (
              <tr><td colSpan={columnCount} style={styles.emptyCell}>Пока нет закупок</td></tr>
            )}
            {!loading && items.map((p) => {
              const isDragging = dragId === p.id;
              const isDropTarget = overId === p.id && dragId !== null && dragId !== p.id;
              return (
                <tr
                  key={p.id}
                  className="purchase-row"
                  style={{
                    ...rowStyle(p),
                    opacity: isDragging ? 0.4 : 1,
                    boxShadow: isDropTarget ? "inset 0 2px 0 var(--accent)" : "none",
                    cursor: "context-menu",
                  }}
                  draggable={canReorder}
                  onDragStart={canReorder ? (e) => onRowDragStart(e, p.id) : undefined}
                  onDragOver={canReorder ? (e) => onRowDragOver(e, p.id) : undefined}
                  onDrop={canReorder ? (e) => onRowDrop(e, p.id) : undefined}
                  onDragEnd={canReorder ? onRowDragEnd : undefined}
                  onContextMenu={(e) => openContextMenu(e, p)}
                >
                  {canReorder && (
                    <td style={{ ...styles.td, ...styles.dragHandleCell }} title="Перетащите, чтобы изменить порядок">
                      <span style={styles.dragHandle} className="drag-handle">⋮⋮</span>
                    </td>
                  )}
                  <td style={styles.td}>{p.item_no ?? "—"}</td>
                  {showQuarterColumn && (
                    <td style={styles.td}>
                      <span
                        style={{
                          ...styles.quarterBadge,
                          background: `${QUARTER_COLORS[p.quarter] || "var(--text-muted)"}22`,
                          color: QUARTER_COLORS[p.quarter] || "var(--text-muted)",
                        }}
                      >
                        {p.quarter}
                      </span>
                    </td>
                  )}
                  <td style={styles.td}>
                    {p.name}
                    {Number(p.notes_count) > 0 && (
                      <span style={styles.notesBadge} title={`Заметок: ${p.notes_count}`}>📝 {p.notes_count}</span>
                    )}
                    {Number(p.documents_count) > 0 && (
                      <span style={styles.notesBadge} title={`Файлов служебок: ${p.documents_count}`}>📎 {p.documents_count}</span>
                    )}
                  </td>
                  {wideColumns && <td style={styles.td}>{p.product_group || "—"}</td>}
                  {wideColumns && <td style={styles.td}>{p.method || "—"}</td>}
                  {wideColumns && <td style={styles.td}>{p.justification || "—"}</td>}
                  {wideColumns && <td style={styles.td}>{p.tz_date ? p.tz_date.slice(0, 10) : "—"}</td>}
                  {wideColumns && <td style={styles.td}>{p.notice_date ? p.notice_date.slice(0, 10) : "—"}</td>}
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
                  {wideColumns && <td style={styles.td}>{p.deadline || "—"}</td>}
                  <td style={styles.td}>{p.okpd2 || "—"}</td>
                  <td style={styles.td}>{statusLabel(p.status)}</td>
                  <td style={{ ...styles.td, whiteSpace: "nowrap" }}>
                    <div style={styles.actionsRow}>
                      {canEdit && (
                        <button type="button" onClick={() => startEdit(p)} style={styles.iconButton} className="icon-btn" title="Изменить">
                          ✏️
                        </button>
                      )}
                      <button type="button" onClick={() => setFilesFor(p)} style={styles.iconButton} className="icon-btn" title="Файлы служебок">
                        📎
                      </button>
                      <button type="button" onClick={() => setNotesFor(p)} style={styles.iconButton} className="icon-btn" title="Заметки">
                        📝
                      </button>
                      {canReview && p.source === "branch" && !p.reviewed_at && (
                        <button type="button" onClick={() => review(p.id)} style={styles.iconButton} className="icon-btn" title="Отметить просмотренным">
                          ✓
                        </button>
                      )}
                      {canReview && p.status === "plan" && (
                        <>
                          <button type="button" onClick={() => transfer(p.id)} style={styles.iconButton} className="icon-btn" title="Перенести в другой квартал">
                            ↷
                          </button>
                          <button
                            type="button"
                            onClick={() => cancelItem(p.id)}
                            style={{ ...styles.iconButton, color: "var(--danger)" }} className="icon-btn"
                            title="Отменить закупку"
                          >
                            ⊘
                          </button>
                        </>
                      )}
                      {canReview && p.status === "cancelled" && (
                        <>
                          <button
                            type="button"
                            onClick={() => restoreItem(p.id)}
                            style={styles.iconButton} className="icon-btn"
                            title="Вернуть из отмены"
                          >
                            ↺
                          </button>
                          <button
                            type="button"
                            onClick={() => deleteItem(p)}
                            style={{ ...styles.iconButton, color: "var(--danger)" }} className="icon-btn"
                            title="Удалить безвозвратно"
                          >
                            🗑
                          </button>
                        </>
                      )}
                      <button
                        type="button"
                        onClick={(e) => openContextMenu(e, p)}
                        style={styles.iconButton} className="icon-btn"
                        title="Ещё действия"
                      >
                        ⋯
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {!loading && items.length > 0 && (
        <div style={styles.statsBar}>
          <div style={styles.statCard}>
            <div style={styles.statLabel}>Итого по странице</div>
            <div style={styles.statValue}>{fmtMoney(stats.total)} ₽</div>
          </div>
          <div style={styles.statCard}>
            <div style={styles.statLabel}>Активных закупок</div>
            <div style={styles.statValue}>{stats.count}</div>
          </div>
          {stats.pendingReview > 0 && (
            <div style={{ ...styles.statCard, borderColor: "var(--highlight-new-border)" }}>
              <div style={styles.statLabel}>Не просмотрено</div>
              <div style={{ ...styles.statValue, color: "var(--warning)" }}>{stats.pendingReview}</div>
            </div>
          )}
          {stats.unplanned > 0 && (
            <div style={{ ...styles.statCard, borderColor: "var(--unplanned-border)" }}>
              <div style={styles.statLabel}>Внеплановых</div>
              <div style={{ ...styles.statValue, color: "var(--danger)" }}>{stats.unplanned}</div>
            </div>
          )}
          {stats.cancelled > 0 && (
            <div style={styles.statCard}>
              <div style={styles.statLabel}>Отменено</div>
              <div style={{ ...styles.statValue, color: "var(--text-muted)" }}>{stats.cancelled}</div>
            </div>
          )}
        </div>
      )}

      {!loading && quarterTotals.length > 0 && (
        <div style={styles.quarterTotalsBar}>
          {quarterTotals.map((qt) => (
            <div key={qt.quarter} style={styles.quarterTotalRow}>
              <strong style={{ color: QUARTER_COLORS[qt.quarter] || "var(--text)" }}>
                Итого {qt.quarter} квартал:
              </strong>
              <span>{fmtMoney(qt.total)} ₽</span>
              <span>·</span>
              <span>по центру: {fmtMoney(qt.center)} ₽</span>
            </div>
          ))}
          {quarterTotals.length > 1 && (
            <div style={{ ...styles.quarterTotalRow, fontWeight: 700, color: "var(--text)" }}>
              <span>Итого за год:</span>
              <span>{fmtMoney(quarterTotals.reduce((s, q) => s + q.total, 0))} ₽</span>
              <span>·</span>
              <span>по центру: {fmtMoney(quarterTotals.reduce((s, q) => s + q.center, 0))} ₽</span>
            </div>
          )}
        </div>
      )}

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

      {notesFor && (
        <NotesModal
          purchase={notesFor}
          onClose={() => setNotesFor(null)}
          onChanged={load}
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

      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          items={contextMenuItems(menu.purchase)}
          onClose={() => setMenu(null)}
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
          <button type="button" onClick={onCancel} style={styles.secondaryButton} className="secondary-btn">Отмена</button>
          <button type="button" onClick={onSave} style={styles.primaryButton} className="primary-btn">Сохранить</button>
        </div>
      </div>
    </div>
  );
}

const styles = {
  header: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, flexWrap: "wrap", gap: 10 },
  title: { margin: 0, fontSize: 20, color: "var(--text)" },
  filterInput: { padding: "7px 10px", borderRadius: "var(--radius-sm)", border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text)", width: 220 },
  primaryButton: { background: "var(--accent)", color: "var(--accent-contrast)", border: "none", borderRadius: "var(--radius-sm)", padding: "8px 14px", cursor: "pointer", fontWeight: 600, transition: "filter 0.15s" },
  secondaryButton: { background: "var(--surface-2)", color: "var(--text)", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", padding: "8px 14px", cursor: "pointer" },
  errorBox: { background: "var(--danger-soft)", color: "var(--danger)", padding: "10px 14px", borderRadius: "var(--radius-sm)", marginBottom: 12 },
  legend: { display: "flex", gap: 18, fontSize: 12, color: "var(--text-secondary)", marginBottom: 10, flexWrap: "wrap", alignItems: "center" },
  legendHint: { marginLeft: "auto", fontStyle: "italic", color: "var(--text-muted)" },
  dot: { display: "inline-block", width: 9, height: 9, borderRadius: "50%", marginRight: 5 },
  tableWrap: { background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius)", overflow: "auto", boxShadow: "var(--shadow-sm)" },
  th: { textAlign: "left", padding: "10px 12px", borderBottom: "1px solid var(--border)", color: "var(--text-secondary)", fontSize: 12, textTransform: "uppercase", letterSpacing: 0.3, whiteSpace: "nowrap" },
  td: { padding: "9px 12px", borderBottom: "1px solid var(--border)", fontSize: 13.5, color: "var(--text)" },
  dragHandleCell: { padding: "9px 4px", textAlign: "center" },
  dragHandle: { cursor: "grab", color: "var(--text-muted)", fontSize: 14, userSelect: "none", display: "inline-block", lineHeight: 1 },
  sharesBreakdown: { fontSize: 11, color: "var(--text-secondary)", marginTop: 2 },
  notesBadge: { marginLeft: 8, fontSize: 11, color: "var(--text-secondary)", background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 10, padding: "1px 7px", whiteSpace: "nowrap" },
  quarterBadge: { fontSize: 12, fontWeight: 700, borderRadius: 10, padding: "2px 9px", whiteSpace: "nowrap" },
  quarterTotalsBar: { marginTop: 10, display: "flex", flexDirection: "column", gap: 4 },
  quarterTotalRow: { fontSize: 13, color: "var(--text-secondary)", display: "flex", gap: 14, flexWrap: "wrap" },
  emptyCell: { padding: 24, textAlign: "center", color: "var(--text-muted)" },
  actionsRow: { display: "flex", gap: 2, alignItems: "center" },
  iconButton: {
    border: "none",
    background: "none",
    color: "var(--text-secondary)",
    cursor: "pointer",
    fontSize: 13,
    padding: "5px 6px",
    borderRadius: "var(--radius-sm)",
    lineHeight: 1,
  },
  statsBar: { display: "flex", gap: 12, marginTop: 14, flexWrap: "wrap" },
  statCard: {
    background: "var(--surface)",
    border: "1px solid var(--border)",
    borderRadius: "var(--radius-sm)",
    padding: "10px 16px",
    minWidth: 140,
    boxShadow: "var(--shadow-sm)",
  },
  statLabel: { fontSize: 11, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: 0.3 },
  statValue: { fontSize: 18, fontWeight: 700, color: "var(--text)", marginTop: 3, fontVariantNumeric: "tabular-nums" },
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