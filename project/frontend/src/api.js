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

// Загрузка файла (multipart) — Content-Type не задаём вручную, браузер сам
// проставит правильный boundary для FormData.
export async function apiUpload(path, formData) {
  const token = localStorage.getItem("token");
  const res = await fetch(`${API_URL}${path}`, {
    method: "POST",
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: formData,
  });

  const data = await res.json().catch(() => null);

  if (!res.ok || !data || data.status !== "ok") {
    throw new Error(data?.message || `Ошибка запроса (${res.status})`);
  }

  return data;
}

// Скачивание файла с авторизацией (обычная ссылка <a href> не подставит
// токен, поэтому качаем как blob и подсовываем браузеру "виртуальный клик").
export async function apiDownload(path, filename) {
  const token = localStorage.getItem("token");
  const res = await fetch(`${API_URL}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });

  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new Error(data?.message || `Ошибка скачивания (${res.status})`);
  }

  const blob = await res.blob();
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(url);
}
