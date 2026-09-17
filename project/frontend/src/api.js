const API_URL = import.meta.env.VITE_API_URL || "";

export async function apiFetch(path, options = {}) {
  const token = localStorage.getItem("token");
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
  });

  const data = await res.json().catch(() => null);

  if (!res.ok || !data || data.status !== "ok") {
    throw new Error(data?.message || `Ошибка запроса (${res.status})`);
  }

  return data;
}
