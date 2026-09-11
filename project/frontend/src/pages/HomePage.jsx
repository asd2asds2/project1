import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import "../styles/ledger.css";

export default function HomePage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  function handleLogout() {
    logout();
    navigate("/login", { replace: true });
  }

  return (
    <div>
      <header className="ledger-header">
        <span className="ledger-header-brand">Учёт филиалов</span>
        <div className="ledger-header-user">
          {user?.full_name && <span>{user.full_name}</span>}
          <button className="ledger-link-button" onClick={handleLogout}>
            Выйти
          </button>
        </div>
      </header>

      <div className="ledger-empty-state">
        <h2>Здесь пока пусто</h2>
        <p>
          Главная страница готова принимать разделы: филиалы, годовые и
          квартальные планы появятся здесь по мере готовности.
        </p>
      </div>
    </div>
  );
}
