import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../theme/ThemeContext";
import { apiFetch } from "../api";
import { colorForBranchId } from "../theme/branchPalette";

const NAV_SECTIONS = [
  {
    label: "Обзор",
    items: [
      { to: "/", label: "Главная", icon: "🏠", end: true },
      { to: "/branches", label: "Филиалы", icon: "🏢" },
    ],
  },
];

// Кварталы вынесены отдельно от NAV_SECTIONS — на них можно перетащить
// строку закупки (перенос в другой квартал), поэтому им нужны свои
// drag-обработчики, а не общий рендер NavLink.
const QUARTERS = [
  { quarter: 1, to: "/plan/q/1", label: "1 квартал", icon: "①" },
  { quarter: 2, to: "/plan/q/2", label: "2 квартал", icon: "②" },
  { quarter: 3, to: "/plan/q/3", label: "3 квартал", icon: "③" },
  { quarter: 4, to: "/plan/q/4", label: "4 квартал", icon: "④" },
];

const SIDEBAR_COLLAPSE_KEY = "sidebar_collapsed";

// Событие, которым таблицы закупок оповещаются о переносе строки на филиал
// или в другой квартал (см. PurchasesTable.jsx), чтобы обновить данные без
// перезагрузки страницы.
export function notifyPurchasesChanged() {
  window.dispatchEvent(new Event("purchases:changed"));
}

export default function Layout() {
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [branches, setBranches] = useState([]);
  const [dropBranchId, setDropBranchId] = useState(null);
  const [dropQuarter, setDropQuarter] = useState(null);
  const [dropMessage, setDropMessage] = useState("");
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem(SIDEBAR_COLLAPSE_KEY) === "1");

  useEffect(() => {
    apiFetch("/api/branches").then((d) => setBranches(d.branches)).catch(() => {});
  }, []);

  function toggleCollapsed() {
    setCollapsed((c) => {
      localStorage.setItem(SIDEBAR_COLLAPSE_KEY, c ? "0" : "1");
      return !c;
    });
  }

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
      await apiFetch(`/api/purchases/${purchaseId}/branch`, {
        method: "PATCH",
        body: JSON.stringify({ branch_id: branch.id }),
      });
      setDropMessage(`Закупка перенесена в «${branch.name}»`);
      notifyPurchasesChanged();
      setTimeout(() => setDropMessage(""), 2500);
    } catch (err) {
      setDropMessage(`Ошибка: ${err.message}`);
      setTimeout(() => setDropMessage(""), 3500);
    }
  }

  async function onQuarterDrop(e, quarterItem) {
    e.preventDefault();
    setDropQuarter(null);
    const purchaseId = e.dataTransfer.getData("application/x-purchase-id");
    if (!purchaseId) return;
    const reason = window.prompt(`Причина переноса в ${quarterItem.label}:`);
    if (!reason) return; // отменили — ничего не переносим
    try {
      await apiFetch(`/api/purchases/${purchaseId}/transfer`, {
        method: "POST",
        body: JSON.stringify({ to_quarter: quarterItem.quarter, reason }),
      });
      setDropMessage(`Закупка перенесена в ${quarterItem.label}`);
      notifyPurchasesChanged();
      setTimeout(() => setDropMessage(""), 2500);
    } catch (err) {
      setDropMessage(`Ошибка: ${err.message}`);
      setTimeout(() => setDropMessage(""), 3500);
    }
  }

  return (
    <div style={styles.shell}>
      <aside style={{ ...styles.sidebar, width: collapsed ? 68 : 260 }}>
        <div style={styles.brandRow}>
          {!collapsed && <div style={styles.brand}>План закупок</div>}
          <button
            type="button"
            onClick={toggleCollapsed}
            style={styles.collapseButton}
            title={collapsed ? "Развернуть меню" : "Свернуть меню"}
          >
            {collapsed ? "»" : "«"}
          </button>
        </div>

        <nav style={styles.nav}>
          {NAV_SECTIONS.map((section) => (
            <div key={section.label} style={styles.navSection}>
              {!collapsed && <div style={styles.navSectionLabel}>{section.label}</div>}
              {section.items.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  title={collapsed ? item.label : undefined}
                  style={({ isActive }) => ({
                    ...styles.navLink,
                    ...(isActive ? styles.navLinkActive : {}),
                    ...(collapsed ? styles.navLinkCollapsed : {}),
                  })}
                >
                  <span style={styles.navIcon}>{item.icon}</span>
                  {!collapsed && <span>{item.label}</span>}
                </NavLink>
              ))}
            </div>
          ))}

          <div style={styles.navSection}>
            {!collapsed && <div style={styles.navSectionLabel}>Планы · перетащите закупку сюда</div>}
            {QUARTERS.map((q) => (
              <NavLink
                key={q.to}
                to={q.to}
                title={collapsed ? q.label : undefined}
                onDragOver={(e) => onDragOverDropZone(e, setDropQuarter, q.quarter)}
                onDragLeave={() => setDropQuarter((cur) => (cur === q.quarter ? null : cur))}
                onDrop={(e) => onQuarterDrop(e, q)}
                style={({ isActive }) => ({
                  ...styles.navLink,
                  ...(isActive ? styles.navLinkActive : {}),
                  ...(collapsed ? styles.navLinkCollapsed : {}),
                  ...(dropQuarter === q.quarter ? styles.navLinkDropActive : {}),
                })}
              >
                <span style={styles.navIcon}>{q.icon}</span>
                {!collapsed && <span>{q.label}</span>}
              </NavLink>
            ))}
            <NavLink
              to="/plan/annual"
              title={collapsed ? "Годовой план 2026" : undefined}
              style={({ isActive }) => ({
                ...styles.navLink,
                ...(isActive ? styles.navLinkActive : {}),
                ...(collapsed ? styles.navLinkCollapsed : {}),
              })}
            >
              <span style={styles.navIcon}>📅</span>
              {!collapsed && <span>Годовой план 2026</span>}
            </NavLink>
          </div>

          {branches.length > 0 && (
            <div style={styles.navSection}>
              {!collapsed && <div style={styles.navSectionLabel}>Филиалы · перетащите закупку сюда</div>}
              {branches.map((b) => (
                <div
                  key={b.id}
                  title={collapsed ? b.name : undefined}
                  onDragOver={(e) => onDragOverDropZone(e, setDropBranchId, b.id)}
                  onDragLeave={() => setDropBranchId((cur) => (cur === b.id ? null : cur))}
                  onDrop={(e) => onBranchDrop(e, b)}
                  style={{
                    ...styles.branchDrop,
                    ...(collapsed ? styles.branchDropCollapsed : {}),
                    ...(dropBranchId === b.id ? styles.branchDropActive : {}),
                  }}
                >
                  <i style={{ ...styles.branchDot, background: colorForBranchId(branches, b.id) }} />
                  {!collapsed && <span style={styles.branchName}>{b.name}</span>}
                </div>
              ))}
            </div>
          )}
        </nav>

        {dropMessage && !collapsed && <div style={styles.dropToast}>{dropMessage}</div>}
      </aside>

      <div style={styles.main}>
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
            <button type="button" onClick={toggleTheme} style={styles.iconButton} title="Сменить тему">
              {theme === "dark" ? "☀️ Светлая" : "🌙 Тёмная"}
            </button>
            <span style={styles.userName}>{user?.full_name}</span>
            <button type="button" onClick={handleLogout} style={styles.logoutButton}>
              Выйти
            </button>
          </div>
        </header>

        <main style={styles.content}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}

const styles = {
  shell: { display: "flex", height: "100vh", background: "var(--bg)" },
  sidebar: {
    flexShrink: 0,
    background: "var(--surface)",
    borderRight: "1px solid var(--border)",
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
    transition: "width 0.18s ease",
  },
  brandRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "16px 14px",
    borderBottom: "1px solid var(--border)",
    flexShrink: 0,
  },
  brand: {
    fontWeight: 700,
    fontSize: 15,
    color: "var(--text)",
    letterSpacing: 0.2,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  collapseButton: {
    border: "1px solid var(--border)",
    background: "var(--surface-2)",
    color: "var(--text-secondary)",
    borderRadius: "var(--radius-sm)",
    width: 26,
    height: 26,
    flexShrink: 0,
    cursor: "pointer",
    fontSize: 13,
    lineHeight: 1,
  },
  // flex + justifyContent:center здесь и держат навигацию не прилипшей к
  // верху, а смещённой к оптической середине сайдбара ("выше середины"),
  // при этом всё ещё можно нормально скроллить, если пунктов много.
  nav: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    justifyContent: "center",
    padding: "14px 10px",
    gap: 20,
    overflowY: "auto",
  },
  navSection: { display: "flex", flexDirection: "column", gap: 3 },
  navSectionLabel: {
    fontSize: 11,
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: 0.6,
    color: "var(--text-muted)",
    padding: "4px 10px 6px",
    whiteSpace: "nowrap",
  },
  navLink: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "9px 12px",
    borderRadius: "var(--radius-sm)",
    color: "var(--text-secondary)",
    textDecoration: "none",
    fontSize: 14,
    border: "1px dashed transparent",
  },
  navLinkCollapsed: { justifyContent: "center", padding: "9px 0" },
  navLinkActive: {
    background: "var(--accent-soft)",
    color: "var(--accent)",
    fontWeight: 600,
  },
  navLinkDropActive: {
    borderColor: "var(--accent)",
    background: "var(--accent-soft)",
    color: "var(--accent)",
  },
  navIcon: { fontSize: 15, width: 18, textAlign: "center", flexShrink: 0 },
  branchDrop: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "8px 12px",
    borderRadius: "var(--radius-sm)",
    fontSize: 13.5,
    color: "var(--text-secondary)",
    border: "1px dashed transparent",
  },
  branchDropCollapsed: { justifyContent: "center", padding: "8px 0" },
  branchDropActive: {
    background: "var(--accent-soft)",
    borderColor: "var(--accent)",
    color: "var(--accent)",
  },
  branchDot: { width: 9, height: 9, borderRadius: "50%", flexShrink: 0 },
  branchName: { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  dropToast: {
    margin: "0 12px 14px",
    padding: "8px 12px",
    borderRadius: "var(--radius-sm)",
    background: "var(--accent-soft)",
    color: "var(--accent)",
    fontSize: 12.5,
    flexShrink: 0,
  },
  main: { flex: 1, display: "flex", flexDirection: "column", minWidth: 0 },
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
  userName: { color: "var(--text-secondary)", fontSize: 13 },
  logoutButton: {
    border: "none",
    background: "transparent",
    color: "var(--danger)",
    cursor: "pointer",
    fontSize: 13,
  },
  content: { flex: 1, overflow: "auto", padding: 24 },
};
