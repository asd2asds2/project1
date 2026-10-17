import { useAuth } from "../context/AuthContext";
import { useYear } from "../context/YearContext";

// Показывается вместо страницы, пока не создан ни один год плана.
export default function NoYearNotice() {
  const { user } = useAuth();
  const { loading, error, setCreateOpen } = useYear();
  const isAdmin = user?.role === "admin";

  if (loading) return <div style={styles.box}>Загрузка…</div>;

  return (
    <div style={styles.box}>
      <div style={styles.icon}>🗓️</div>
      <h2 style={styles.title}>План закупок ещё не создан</h2>
      {error ? (
        <p style={{ ...styles.text, color: "var(--danger)" }}>{error}</p>
      ) : isAdmin ? (
        <>
          <p style={styles.text}>Выберите год — разделы плана (Главная, Филиалы, годовой план и кварталы) создадутся по шаблону.</p>
          <button type="button" style={styles.button} onClick={() => setCreateOpen(true)}>
            ＋ Создать план на год
          </button>
        </>
      ) : (
        <p style={styles.text}>Начальник отдела пока не создал план. Обратитесь к нему.</p>
      )}
    </div>
  );
}

const styles = {
  box: {
    maxWidth: 520,
    margin: "60px auto",
    padding: 32,
    textAlign: "center",
    background: "var(--surface)",
    border: "1px solid var(--border)",
    borderRadius: "var(--radius)",
    color: "var(--text)",
  },
  icon: { fontSize: 40, marginBottom: 8 },
  title: { margin: "0 0 8px", fontSize: 20 },
  text: { margin: "0 0 18px", color: "var(--text-secondary)", fontSize: 14, lineHeight: 1.5 },
  button: {
    background: "var(--accent)",
    color: "var(--accent-contrast)",
    border: "none",
    borderRadius: "var(--radius-sm)",
    padding: "10px 18px",
    fontSize: 14,
    fontWeight: 600,
    cursor: "pointer",
  },
};
