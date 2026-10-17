// Даты в интерфейсе показываем как ДД.ММ.ГГГГ, а в базе/на сервере храним ISO (ГГГГ-ММ-ДД).

// "2026-07-15" или "2026-07-15T00:00:00.000Z" → "15.07.2026" (пусто → "")
export function isoToRu(iso) {
  if (!iso) return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso));
  return m ? `${m[3]}.${m[2]}.${m[1]}` : "";
}

// "15.07.2026" → "2026-07-15"; неполная или несуществующая дата (31.02.2026) → ""
export function ruToIso(ru) {
  const m = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(String(ru || "").trim());
  if (!m) return "";
  const [, dd, mm, yyyy] = m;
  const d = new Date(`${yyyy}-${mm}-${dd}T00:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== `${yyyy}-${mm}-${dd}`) return "";
  return `${yyyy}-${mm}-${dd}`;
}

// Подставляет точки при вводе цифр: "15072026" → "15.07.2026"
export function maskRu(text) {
  const digits = String(text || "").replace(/\D/g, "").slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}.${digits.slice(2)}`;
  return `${digits.slice(0, 2)}.${digits.slice(2, 4)}.${digits.slice(4)}`;
}