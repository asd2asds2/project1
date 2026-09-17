import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../theme/ThemeContext";

export default function LoginPage() {
  const { login } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();

  const [loginValue, setLoginValue] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setIsSubmitting(true);
    try {
      await login(loginValue, password);
      navigate("/", { replace: true });
    } catch (err) {
      setError(err.message || "Не удалось войти. Проверьте логин и пароль.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div style={styles.page}>
      <button type="button" onClick={toggleTheme} style={styles.themeToggle}>
        {theme === "dark" ? "☀️ Светлая тема" : "🌙 Тёмная тема"}
      </button>

      <div style={styles.card}>
        <h1 style={styles.title}>План закупок</h1>
        <p style={styles.subtitle}>
          Центр + филиалы. Введите логин и пароль, выданные администратором.
        </p>

        {error && <div style={styles.error}>{error}</div>}

        <form onSubmit={handleSubmit}>
          <label style={styles.label} htmlFor="login">Логин</label>
          <input
            id="login"
            name="login"
            type="text"
            autoComplete="username"
            value={loginValue}
            onChange={(e) => setLoginValue(e.target.value)}
            required
            autoFocus
            style={styles.input}
          />

          <label style={styles.label} htmlFor="password">Пароль</label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            style={styles.input}
          />

          <button type="submit" disabled={isSubmitting} style={styles.button}>
            {isSubmitting ? "Проверка…" : "Войти"}
          </button>
        </form>
      </div>
    </div>
  );
}

const styles = {
  page: {
    minHeight: "100vh",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    background: "var(--bg)",
    padding: 20,
  },
  themeToggle: {
    position: "absolute",
    top: 20,
    right: 20,
    border: "1px solid var(--border)",
    background: "var(--surface)",
    color: "var(--text)",
    borderRadius: "var(--radius-sm)",
    padding: "7px 12px",
    cursor: "pointer",
  },
  card: {
    width: 380,
    maxWidth: "100%",
    background: "var(--surface)",
    border: "1px solid var(--border)",
    borderRadius: "var(--radius)",
    boxShadow: "var(--shadow-md)",
    padding: "32px 28px",
  },
  title: { margin: 0, fontSize: 22, color: "var(--text)" },
  subtitle: { margin: "8px 0 24px", fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.5 },
  error: { background: "var(--danger-soft)", color: "var(--danger)", padding: "10px 12px", borderRadius: "var(--radius-sm)", marginBottom: 16, fontSize: 13.5 },
  label: { display: "block", fontSize: 12.5, color: "var(--text-secondary)", marginBottom: 5, marginTop: 14 },
  input: {
    width: "100%", padding: "10px 12px", borderRadius: "var(--radius-sm)",
    border: "1px solid var(--border)", background: "var(--surface-2)", color: "var(--text)",
  },
  button: {
    width: "100%", marginTop: 22, padding: "10px 12px", borderRadius: "var(--radius-sm)",
    border: "none", background: "var(--accent)", color: "var(--accent-contrast)",
    fontWeight: 600, cursor: "pointer", fontSize: 14.5,
  },
};
