import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import "../styles/ledger.css";

export default function LoginPage() {
  const { login } = useAuth();
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
    <div className="ledger-page">
      <div className="ledger-sheet">
        <h1 className="ledger-title">Вход в систему</h1>
        <p className="ledger-subtitle">
          Внутренний учёт филиалов. Введите логин и пароль, выданные
          администратором.
        </p>

        {error && <div className="ledger-error">{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="ledger-field">
            <label htmlFor="login">Логин</label>
            <input
              id="login"
              name="login"
              type="text"
              autoComplete="username"
              value={loginValue}
              onChange={(e) => setLoginValue(e.target.value)}
              required
              autoFocus
            />
          </div>

          <div className="ledger-field">
            <label htmlFor="password">Пароль</label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          <button type="submit" className="ledger-button" disabled={isSubmitting}>
            {isSubmitting ? "Проверка…" : "Войти"}
          </button>
        </form>
      </div>
    </div>
  );
}
