import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useState } from "react";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../theme/ThemeContext";

const NAV_ITEMS = [
  { to: "/", label: "Главная", end: true },
  { to: "/branches", label: "Филиалы" },
  { to: "/plan/annual", label: "Годовой план 2026" },
  { to: "/plan/q/1", label: "1 квартал" },
  { to: "/plan/q/2", label: "2 квартал" },
  { to: "/plan/q/3", label: "3 квартал" },
  { to: "/plan/q/4", label: "4 квартал" },
];

export default function Layout() {
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const [query, setQuery] = useState("");

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

  return (
    <div style={styles.shell}>
      <aside style={styles.sidebar}>
        <div style={styles.brand}>План закупок</div>
        <nav style={styles.nav}>
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              style={({ isActive }) => ({
                ...styles.navLink,
                ...(isActive ? styles.navLinkActive : {}),
              })}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
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
    width: 240,
    flexShrink: 0,
    background: "var(--surface)",
    borderRight: "1px solid var(--border)",
    display: "flex",
    flexDirection: "column",
  },
  brand: {
    padding: "20px 18px",
    fontWeight: 700,
    fontSize: 16,
    borderBottom: "1px solid var(--border)",
    color: "var(--text)",
  },
  nav: { display: "flex", flexDirection: "column", padding: 10, gap: 2 },
  navLink: {
    padding: "9px 12px",
    borderRadius: "var(--radius-sm)",
    color: "var(--text-secondary)",
    textDecoration: "none",
    fontSize: 14,
  },
  navLinkActive: {
    background: "var(--accent-soft)",
    color: "var(--accent)",
    fontWeight: 600,
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
