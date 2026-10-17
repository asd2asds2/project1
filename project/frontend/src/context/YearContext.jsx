import { createContext, useContext, useState, useEffect, useCallback, useMemo } from "react";
import { apiFetch } from "../api";

// Выбранный год плана + список созданных годов/шаблонов/отделов.
// Страницы берут год отсюда (useYear), а не из константы 2026.
const YearContext = createContext(null);
const STORAGE_KEY = "activeYear";

export function YearProvider({ children }) {
  const [data, setData] = useState({ years: [], templates: [], departments: [], department_id: null });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [stored, setStored] = useState(() => Number(localStorage.getItem(STORAGE_KEY)) || null);

  const reload = useCallback(async () => {
    try {
      const d = await apiFetch("/api/years");
      setData(d);
      setError("");
      return d;
    } catch (e) {
      setError(e.message);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  // Активный год — сохранённый, если он ещё существует, иначе самый свежий.
  const year = useMemo(() => {
    if (!data.years.length) return null;
    return data.years.some((y) => y.year === stored) ? stored : data.years[0].year;
  }, [data.years, stored]);

  const setYear = useCallback((y) => {
    localStorage.setItem(STORAGE_KEY, String(y));
    setStored(y);
  }, []);

  const createYear = useCallback(
    async (payload) => {
      const res = await apiFetch("/api/years", {
        method: "POST",
        body: JSON.stringify({ ...payload, department_id: data.department_id }),
      });
      setData((d) => ({ ...d, years: res.years }));
      setYear(res.year.year);
      return res.year;
    },
    [data.department_id, setYear]
  );

  const deleteYear = useCallback(
    async (y) => {
      const res = await apiFetch(`/api/years/${y}?department_id=${data.department_id}`, { method: "DELETE" });
      setData((d) => ({ ...d, years: res.years }));
    },
    [data.department_id]
  );

  const items = useMemo(() => data.years.find((y) => y.year === year)?.items || [], [data.years, year]);

  const value = {
    ...data,
    departmentId: data.department_id,
    year,
    items,
    setYear,
    loading,
    error,
    reload,
    createYear,
    deleteYear,
    createOpen,
    setCreateOpen,
  };

  return <YearContext.Provider value={value}>{children}</YearContext.Provider>;
}

export function useYear() {
  const ctx = useContext(YearContext);
  if (!ctx) throw new Error("useYear должен вызываться внутри <YearProvider>");
  return ctx;
}
