import { useEffect, useRef } from "react";

// items: [{ label, icon?, onClick, danger?, disabled? } | { divider: true }]
export default function ContextMenu({ x, y, items, onClose }) {
  const ref = useRef(null);

  useEffect(() => {
    function handlePointerDown(e) {
      if (ref.current && !ref.current.contains(e.target)) onClose();
    }
    function handleKey(e) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKey);
    document.addEventListener("scroll", onClose, true);
    window.addEventListener("resize", onClose);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKey);
      document.removeEventListener("scroll", onClose, true);
      window.removeEventListener("resize", onClose);
    };
  }, [onClose]);

  const menuHeight = items.reduce((h, it) => h + (it.divider ? 9 : 34), 16);
  const left = Math.min(x, window.innerWidth - 230);
  const top = Math.min(y, window.innerHeight - menuHeight - 12);

  return (
    <div ref={ref} style={{ ...styles.menu, left, top }}>
      {items.map((item, idx) =>
        item.divider ? (
          <div key={idx} style={styles.divider} />
        ) : (
          <button
            key={idx}
            type="button"
            disabled={item.disabled}
            onClick={() => {
              if (item.disabled) return;
              onClose();
              item.onClick();
            }}
            onMouseOver={(e) => {
              if (!item.disabled) e.currentTarget.style.background = "var(--surface-2)";
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.background = "none";
            }}
            style={{
              ...styles.item,
              color: item.danger ? "var(--danger)" : "var(--text)",
              opacity: item.disabled ? 0.4 : 1,
              cursor: item.disabled ? "default" : "pointer",
            }}
          >
            {item.icon && <span style={styles.icon}>{item.icon}</span>}
            {item.label}
          </button>
        )
      )}
    </div>
  );
}

const styles = {
  menu: {
    position: "fixed",
    zIndex: 200,
    minWidth: 210,
    background: "var(--surface)",
    border: "1px solid var(--border)",
    borderRadius: "var(--radius-sm)",
    boxShadow: "var(--shadow-md)",
    padding: 6,
    display: "flex",
    flexDirection: "column",
  },
  item: {
    display: "flex",
    alignItems: "center",
    gap: 9,
    border: "none",
    background: "none",
    textAlign: "left",
    padding: "8px 10px",
    borderRadius: "var(--radius-sm)",
    fontSize: 13.5,
    width: "100%",
  },
  icon: { width: 16, display: "inline-flex", justifyContent: "center", flexShrink: 0 },
  divider: { height: 1, background: "var(--border)", margin: "4px 4px" },
};
