import { useState } from "react";
import { apiFetch } from "../api";
import DateInput from "./DateInput";

const money = (n) => Number(n || 0).toLocaleString("ru-RU", { maximumFractionDigits: 2 });
const todayIso = () => new Date().toISOString().slice(0, 10);

// Окно «Отметить исполненной»: фактическая сумма договора → экономия считается на лету.
export default function ExecuteModal({ purchase, onClose, onSaved }) {
  const already = purchase.contract_amount !== null && purchase.contract_amount !== undefined;
  const [amount, setAmount] = useState(already ? String(purchase.contract_amount) : "");
  const [date, setDate] = useState(already && purchase.executed_at ? String(purchase.executed_at).slice(0, 10) : todayIso());
  const [contractNo, setContractNo] = useState(purchase.contract_no || "");
  const [supplier, setSupplier] = useState(purchase.supplier || "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const nmc = Number(purchase.amount);
  const contract = Number(String(amount).replace(/\s/g, "").replace(",", "."));
  const valid = amount !== "" && Number.isFinite(contract) && contract >= 0;
  const diff = valid ? nmc - contract : null;

  async function save() {
    setBusy(true);
    setError("");
    try {
      const res = await apiFetch(`/api/purchases/${purchase.id}/execute`, {
        method: "POST",
        body: JSON.stringify({ contract_amount: contract, executed_at: date, contract_no: contractNo, supplier }),
      });
      onSaved?.(res.purchase);
      onClose();
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  }

  return (
    <div style={styles.overlay} onClick={() => !busy && onClose()}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <h3 style={{ marginTop: 0 }}>{already ? "Изменить исполнение" : "Отметить исполненной"}</h3>
        <div style={styles.name}>{purchase.name}</div>
        <div style={styles.nmc}>НМЦ: <strong>{money(nmc)} ₽</strong></div>

        <label style={styles.label}>
          Сумма договора, ₽
          <input autoFocus value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" style={styles.input} placeholder="0,00" />
        </label>

        {diff !== null && (
          <div style={{ ...styles.diff, color: diff >= 0 ? "var(--success, #1a8a4e)" : "var(--danger)" }}>
            {diff >= 0 ? `Экономия: ${money(diff)} ₽` : `Перерасход: ${money(-diff)} ₽`}
            {nmc > 0 ? ` (${money((Math.abs(diff) / nmc) * 100)}%)` : ""}
          </div>
        )}

        <label style={styles.label}>
          Дата исполнения
          <DateInput value={date} onChange={setDate} style={styles.input} />
        </label>
        <label style={styles.label}>
          № договора (необязательно)
          <input value={contractNo} onChange={(e) => setContractNo(e.target.value)} style={styles.input} />
        </label>
        <label style={styles.label}>
          Поставщик (необязательно)
          <input value={supplier} onChange={(e) => setSupplier(e.target.value)} style={styles.input} />
        </label>

        {error && <div style={styles.err}>{error}</div>}
        <div style={styles.actions}>
          <button type="button" onClick={onClose} disabled={busy} style={styles.secondary}>Отмена</button>
          <button type="button" onClick={save} disabled={busy || !valid || !date} style={{ ...styles.primary, ...(busy || !valid || !date ? { opacity: 0.5, cursor: "not-allowed" } : {}) }}>
            {busy ? "Сохраняю…" : "Сохранить"}
          </button>
        </div>
      </div>
    </div>
  );
}

const styles = {
  overlay: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 60 },
  modal: { background: "var(--surface)", color: "var(--text)", borderRadius: "var(--radius)", padding: 24, width: 440, maxWidth: "92vw", maxHeight: "90vh", overflow: "auto", boxShadow: "var(--shadow-md)", display: "flex", flexDirection: "column", gap: 10 },
  name: { fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.4 },
  nmc: { fontSize: 13.5 },
  label: { display: "flex", flexDirection: "column", gap: 5, fontSize: 12.5, color: "var(--text-secondary)" },
  input: { padding: "8px 10px", borderRadius: "var(--radius-sm)", border: "1px solid var(--border)", background: "var(--surface-2)", color: "var(--text)" },
  diff: { fontWeight: 700, fontSize: 14 },
  err: { background: "var(--danger-soft)", color: "var(--danger)", padding: "8px 12px", borderRadius: "var(--radius-sm)" },
  actions: { display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 8 },
  primary: { background: "var(--accent)", color: "var(--accent-contrast)", border: "none", borderRadius: "var(--radius-sm)", padding: "8px 14px", cursor: "pointer", fontWeight: 600 },
  secondary: { background: "var(--surface-2)", color: "var(--text)", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", padding: "8px 14px", cursor: "pointer" },
};
