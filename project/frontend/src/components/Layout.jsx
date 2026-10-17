import { NavLink, Outlet, useNavigate, useLocation } from "react-router-dom";
import { Fragment, useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../theme/ThemeContext";
import { apiFetch } from "../api";
import { colorForBranchId } from "../theme/branchPalette";
import { useYear } from "../context/YearContext";
import CreateYearModal from "./CreateYearModal";

// Пункты меню строятся из шаблона выбранного года (таблицы plan_year_items):
// Главная, Филиалы, Годовой план, 1–4 квартал.
function routeFor(item) {
  switch (item.kind) {
    case "home": return "/";
    case "branches": return "/branches";
    case "annual": return "/plan/annual";
    case "quarter": return `/plan/q/${item.quarter}`;
    default: return "/";
  }
}

// Событие, которым таблицы закупок оповещаются о переносе строки на филиал
// или в другой квартал (см. PurchasesTable.jsx), чтобы обновить данные без
// перезагрузки страницы. detail.purchase, если передан, — свежая версия
// закупки с сервера, чтобы таблица могла обновить её на месте мгновенно.
export function notifyPurchasesChanged(purchase) {
  window.dispatchEvent(new CustomEvent("purchases:changed", { detail: { purchase } }));
}

export default function Layout() {
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();
  const [query, setQuery] = useState("");
  const { years, year, setYear, items, createOpen, setCreateOpen } = useYear();
  const isAdmin = user?.role === "admin";

  // Сбрасываем строку поиска при переходе на любую страницу, кроме поиска
  // (выбор пункта меню, филиала и т.д.). На странице поиска текст остаётся.
  useEffect(() => {
    if (location.pathname !== "/search") setQuery("");
  }, [location.pathname]);
  const [branches, setBranches] = useState([]);
  const [dropBranchId, setDropBranchId] = useState(null);
  const [dropQuarter, setDropQuarter] = useState(null);
  const [dropMessage, setDropMessage] = useState("");

  useEffect(() => {
    apiFetch("/api/branches").then((d) => setBranches(d.branches)).catch(() => {});
  }, []);

  // Подстраховка от «зависшей» пунктирной подсветки зоны сброса: если drag
  // завершился не над зоной (dragend без drop, например ESC или отпустили
  // мимо), сбрасываем оба состояния подсветки в любом случае.
  useEffect(() => {
    function onDragEnd() {
      setDropBranchId(null);
      setDropQuarter(null);
    }
    document.addEventListener("dragend", onDragEnd);
    return () => document.removeEventListener("dragend", onDragEnd);
  }, []);

  function handleSearch(e) {
    e.preventDefault();
    if (query.trim()) {
      navigate(`/search?q=${encodeURIComponent(query.trim())}`);
    }
  }

  function handleLogout() {
    logout();
    navigate("/login", { replace: true });
  }

  function onDragOverDropZone(e, setter, key) {
    if (!e.dataTransfer.types.includes("application/x-purchase-id")) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setter(key);
  }

  async function onBranchDrop(e, branch) {
    e.preventDefault();
    setDropBranchId(null);
    const purchaseId = e.dataTransfer.getData("application/x-purchase-id");
    if (!purchaseId) return;
    try {
      const res = await apiFetch(`/api/purchases/${purchaseId}/branch`, {
        method: "PATCH",
        body: JSON.stringify({ branch_id: branch.id }),
      });
      setDropMessage(`Закупка перенесена в «${branch.name}»`);
      notifyPurchasesChanged(res.purchase);
      setTimeout(() => setDropMessage(""), 2500);
    } catch (err) {
      setDropMessage(`Ошибка: ${err.message}`);
      setTimeout(() => setDropMessage(""), 3500);
    }
  }

  async function onQuarterDrop(e, item) {
    e.preventDefault();
    setDropQuarter(null);
    const purchaseId = e.dataTransfer.getData("application/x-purchase-id");
    if (!purchaseId) return;
    // Причина переноса необязательна — не спрашиваем её при перетаскивании,
    // чтобы не показывать браузерное окно "страница сообщает". Если нужно
    // явно указать причину — это по-прежнему можно сделать через
    // контекстное меню строки ("Перенести в другой квартал").
    try {
      const res = await apiFetch(`/api/purchases/${purchaseId}/transfer`, {
        method: "POST",
        body: JSON.stringify({ to_quarter: item.quarter }),
      });
      setDropMessage(`Закупка перенесена в ${item.label}`);
      notifyPurchasesChanged(res.purchase);
      setTimeout(() => setDropMessage(""), 2500);
    } catch (err) {
      setDropMessage(`Ошибка: ${err.message}`);
      setTimeout(() => setDropMessage(""), 3500);
    }
  }

  return (
    <div style={styles.shell}>
      <header style={styles.topbar}>
        <form onSubmit={handleSearch} style={styles.searchForm}>
          <input
            type="text"
            placeholder="Поиск по закупкам, филиалам, ОКПД2…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            style={styles.searchInput}
          />
        </form>

        <div style={styles.topbarRight}>
          {years.length > 0 && (
            <label style={styles.yearBox} title="Год плана">
              <span style={styles.yearLabel}>Год</span>
              <select value={year ?? ""} onChange={(e) => { setYear(Number(e.target.value)); navigate("/"); }} style={styles.yearSelect}>
                {years.map((y) => <option key={y.year} value={y.year}>{y.year}</option>)}
              </select>
            </label>
          )}
          {isAdmin && (
            <button type="button" onClick={() => setCreateOpen(true)} style={styles.iconButton} title="Создать план на год">
              ＋ Новый год
            </button>
          )}
          <button type="button" onClick={toggleTheme} style={styles.iconButton} title="Сменить тему">
            {theme === "dark" ? "☀️ Светлая" : "🌙 Тёмная"}
          </button>
          <span style={styles.userName}>{user?.full_name}</span>
          <button type="button" onClick={handleLogout} style={styles.logoutButton}>
            Выйти
          </button>
        </div>
      </header>

      {/* Меню — горизонтальной полосой прямо под шапкой, на всю ширину. */}
      <nav style={styles.menuBar}>
        <div style={styles.menuGroup}>
          {items.length === 0 && (
            <span style={styles.menuEmpty}>
              {isAdmin ? "Нажмите «＋ Новый год», чтобы создать план" : "План ещё не создан"}
            </span>
          )}
          {items.map((item, idx) => {
            const to = routeFor(item);
            const isQuarter = item.kind === "quarter";
            const startsPlans =
              (item.kind === "annual" || isQuarter) &&
              idx > 0 && items[idx - 1].kind !== "annual" && items[idx - 1].kind !== "quarter";
            return (
              <Fragment key={`${item.kind}-${item.quarter ?? ""}-${idx}`}>
                {startsPlans && <span style={styles.menuDivider} />}
                <NavLink
                  to={to}
                  end={item.kind === "home"}
                  {...(isQuarter
                    ? {
                        onDragOver: (e) => onDragOverDropZone(e, setDropQuarter, item.quarter),
                        onDragLeave: () => setDropQuarter((cur) => (cur === item.quarter ? null : cur)),
                        onDrop: (e) => onQuarterDrop(e, item),
                      }
                    : {})}
                  style={({ isActive }) => ({
                    ...styles.menuLink,
                    ...(isActive ? styles.menuLinkActive : {}),
                    ...(isQuarter && dropQuarter === item.quarter ? styles.menuLinkDropActive : {}),
                  })}
                >
                  <span style={styles.menuIcon}>{item.icon}</span>
                  <span>{item.label}</span>
                </NavLink>
              </Fragment>
            );
          })}
        </div>

        {branches.length > 0 && (
          <div style={styles.branchStrip}>
            {branches.map((b) => (
              <div
                key={b.id}
                title={`Перетащите закупку сюда, чтобы перенести в «${b.name}»`}
                onDragOver={(e) => onDragOverDropZone(e, setDropBranchId, b.id)}
                onDragLeave={() => setDropBranchId((cur) => (cur === b.id ? null : cur))}
                onDrop={(e) => onBranchDrop(e, b)}
                style={{
                  ...styles.branchChip,
                  ...(dropBranchId === b.id ? styles.branchChipActive : {}),
                }}
              >
                <i style={{ ...styles.branchDot, background: colorForBranchId(branches, b.id) }} />
                <span style={styles.branchName}>{b.name}</span>
              </div>
            ))}
          </div>
        )}
      </nav>

      {dropMessage && <div style={styles.dropToast}>{dropMessage}</div>}
      {createOpen && <CreateYearModal onClose={() => setCreateOpen(false)} />}

      <main style={styles.content}>
        <Outlet />
      </main>
    </div>
  );
}

const styles = {
  shell: { display: "flex", flexDirection: "column", height: "100vh", background: "var(--bg)" },
  topbar: {
    height: 56,
    flexShrink: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "0 20px",
    background: "var(--surface)",
    borderBottom: "1px solid var(--border)",
    gap: 16,
  },
  searchForm: { flex: 1, maxWidth: 420 },
  searchInput: {
    width: "100%",
    padding: "8px 12px",
    borderRadius: "var(--radius-sm)",
    border: "1px solid var(--border)",
    background: "var(--surface-2)",
    color: "var(--text)",
  },
  topbarRight: { display: "flex", alignItems: "center", gap: 14 },
  iconButton: {
    border: "1px solid var(--border)",
    background: "var(--surface-2)",
    color: "var(--text)",
    borderRadius: "var(--radius-sm)",
    padding: "7px 10px",
    cursor: "pointer",
  },
  yearBox: { display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, color: "var(--text-secondary)" },
  yearLabel: { textTransform: "uppercase", letterSpacing: 0.5, fontSize: 11 },
  yearSelect: {
    border: "1px solid var(--border)",
    background: "var(--surface-2)",
    color: "var(--text)",
    borderRadius: "var(--radius-sm)",
    padding: "6px 8px",
    fontWeight: 600,
    cursor: "pointer",
  },
  menuEmpty: { color: "var(--text-muted)", fontSize: 13, padding: "7px 4px" },
  userName: { color: "var(--text-secondary)", fontSize: 13 },
  logoutButton: {
    border: "none",
    background: "transparent",
    color: "var(--danger)",
    cursor: "pointer",
    fontSize: 13,
  },

  // --- Горизонтальное меню под шапкой -------------------------------------
  menuBar: {
    flexShrink: 0,
    display: "flex",
    flexDirection: "column",
    gap: 6,
    padding: "8px 20px",
    background: "var(--surface)",
    borderBottom: "1px solid var(--border)",
  },
  menuGroup: {
    display: "flex",
    alignItems: "center",
    gap: 4,
    flexWrap: "wrap",
  },
  menuDivider: {
    width: 1,
    alignSelf: "stretch",
    background: "var(--border)",
    margin: "4px 6px",
  },
  menuLink: {
    display: "flex",
    alignItems: "center",
    gap: 7,
    padding: "7px 12px",
    borderRadius: "var(--radius-sm)",
    color: "var(--text-secondary)",
    textDecoration: "none",
    fontSize: 13.5,
    border: "1px dashed transparent",
    whiteSpace: "nowrap",
  },
  menuLinkActive: {
    background: "var(--accent-soft)",
    color: "var(--accent)",
    fontWeight: 600,
  },
  menuLinkDropActive: {
    borderColor: "var(--accent)",
    background: "var(--accent-soft)",
    color: "var(--accent)",
  },
  menuIcon: { fontSize: 14, lineHeight: 1 },

  branchStrip: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    flexWrap: "wrap",
    paddingTop: 4,
    borderTop: "1px dashed var(--border)",
  },
  branchChip: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    padding: "4px 10px",
    borderRadius: 999,
    fontSize: 12.5,
    color: "var(--text-secondary)",
    background: "var(--surface-2)",
    border: "1px dashed transparent",
  },
  branchChipActive: {
    background: "var(--accent-soft)",
    borderColor: "var(--accent)",
    color: "var(--accent)",
  },
  branchDot: { width: 8, height: 8, borderRadius: "50%", flexShrink: 0 },
  branchName: { whiteSpace: "nowrap" },

  dropToast: {
    flexShrink: 0,
    margin: "8px 20px 0",
    padding: "8px 12px",
    borderRadius: "var(--radius-sm)",
    background: "var(--accent-soft)",
    color: "var(--accent)",
    fontSize: 12.5,
  },

  content: { flex: 1, overflow: "auto", padding: 24 },
};