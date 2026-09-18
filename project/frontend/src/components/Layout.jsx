import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../theme/ThemeContext";
import { apiFetch } from "../api";
import { colorForBranchId } from "../theme/branchPalette";

// Порядок пунктов планов: сначала годовой план целиком, потом кварталы по
// порядку — как попросили.
const PLAN_ITEMS = [
  { to: "/plan/annual", label: "Годовой план 2026", icon: "🗓️" },
  { quarter: 1, to: "/plan/q/1", label: "1 квартал", icon: "1️⃣" },
  { quarter: 2, to: "/plan/q/2", label: "2 квартал", icon: "2️⃣" },
  { quarter: 3, to: "/plan/q/3", label: "3 квартал", icon: "3️⃣" },
  { quarter: 4, to: "/plan/q/4", label: "4 квартал", icon: "4️⃣" },
];

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

  useEffect(() => {
    apiFetch("/api/branches").then((d) => setBranches(d.branches)).catch(() => {});
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

  async function onQuarterDrop(e, item) {
    e.preventDefault();
    setDropQuarter(null);
    const purchaseId = e.dataTransfer.getData("application/x-purchase-id");
    if (!purchaseId) return;
    const reason = window.prompt(`Причина переноса в ${item.label}:`);
    if (!reason) return; // отменили — ничего не переносим
    try {
      await apiFetch(`/api/purchases/${purchaseId}/transfer`, {
        method: "POST",
        body: JSON.stringify({ to_quarter: item.quarter, reason }),
      });
      setDropMessage(`Закупка перенесена в ${item.label}`);
      notifyPurchasesChanged();
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
          <NavLink
            to="/"
            end
            style={({ isActive }) => ({ ...styles.menuLink, ...(isActive ? styles.menuLinkActive : {}) })}
          >
            <span style={styles.menuIcon}>📊</span>
            <span>Главная</span>
          </NavLink>
          <NavLink
            to="/branches"
            style={({ isActive }) => ({ ...styles.menuLink, ...(isActive ? styles.menuLinkActive : {}) })}
          >
            <span style={styles.menuIcon}>🏬</span>
            <span>Филиалы</span>
          </NavLink>

          <span style={styles.menuDivider} />

          {PLAN_ITEMS.map((item) =>
            item.quarter ? (
              <NavLink
                key={item.to}
                to={item.to}
                onDragOver={(e) => onDragOverDropZone(e, setDropQuarter, item.quarter)}
                onDragLeave={() => setDropQuarter((cur) => (cur === item.quarter ? null : cur))}
                onDrop={(e) => onQuarterDrop(e, item)}
                style={({ isActive }) => ({
                  ...styles.menuLink,
                  ...(isActive ? styles.menuLinkActive : {}),
                  ...(dropQuarter === item.quarter ? styles.menuLinkDropActive : {}),
                })}
              >
                <span style={styles.menuIcon}>{item.icon}</span>
                <span>{item.label}</span>
              </NavLink>
            ) : (
              <NavLink
                key={item.to}
                to={item.to}
                style={({ isActive }) => ({ ...styles.menuLink, ...(isActive ? styles.menuLinkActive : {}) })}
              >
                <span style={styles.menuIcon}>{item.icon}</span>
                <span>{item.label}</span>
              </NavLink>
            )
          )}
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
