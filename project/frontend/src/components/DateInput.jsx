import { useEffect, useState } from "react";
import { isoToRu, ruToIso, maskRu } from "../utils/date";

// Поле даты в формате ДД.ММ.ГГГГ (не зависит от языка браузера).
// value / onChange работают с ISO-строкой "ГГГГ-ММ-ДД" (или ""), как <input type="date">.
export default function DateInput({ value, onChange, style, placeholder = "дд.мм.гггг", ...rest }) {
  const [text, setText] = useState(isoToRu(value));

  // Если значение изменили снаружи (например, авто-расчёт даты извещения) — обновляем текст.
  useEffect(() => {
    if (ruToIso(text) !== (value || "")) setText(isoToRu(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  function handleChange(e) {
    const masked = maskRu(e.target.value);
    setText(masked);
    // Неполная/неверная дата → "" (чтобы не сохранить старое значение по ошибке)
    onChange(ruToIso(masked));
  }

  const invalid = text.length === 10 && !ruToIso(text);

  return (
    <input
      {...rest}
      type="text"
      inputMode="numeric"
      maxLength={10}
      placeholder={placeholder}
      value={text}
      onChange={handleChange}
      style={{ ...style, ...(invalid ? { borderColor: "var(--danger)" } : {}) }}
      title={invalid ? "Такой даты нет" : rest.title}
    />
  );
}