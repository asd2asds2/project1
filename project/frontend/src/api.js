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


// Открытие файла «как есть» там, где это умеет браузер (PDF, картинки, текст) —
// в новой вкладке. Остальные форматы (Word, Excel и т.п.) браузер показать не
// может, поэтому они скачиваются под своим именем, и по клику на скачанный файл
// его открывает программа по умолчанию (Word, Excel…).
// Возвращает "opened" (открыто во вкладке) или "downloaded" (скачано).
const VIEWABLE_TYPES = {
  pdf: "application/pdf",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  bmp: "image/bmp",
  svg: "image/svg+xml",
  txt: "text/plain;charset=utf-8",
};

export function isViewableInBrowser(filename) {
  const ext = (filename || "").split(".").pop()?.toLowerCase() || "";
  return Boolean(VIEWABLE_TYPES[ext]);
}

export async function apiOpen(path, filename) {
  const ext = (filename || "").split(".").pop()?.toLowerCase() || "";
  const type = VIEWABLE_TYPES[ext];

  if (!type) {
    await apiDownload(path, filename);
    return "downloaded";
  }

  // Вкладку открываем сразу (по клику), иначе браузер примет window.open
  // после await за всплывающее окно и заблокирует.
  const win = window.open("", "_blank");

  try {
    const token = localStorage.getItem("token");
    const res = await fetch(`${API_URL}${path}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      throw new Error(data?.message || `Ошибка открытия (${res.status})`);
    }
    const blob = new Blob([await res.blob()], { type });
    const url = window.URL.createObjectURL(blob);

    if (win) {
      win.location.href = url;
    } else {
      // Вкладку заблокировали — на крайний случай просто скачиваем.
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
    }
    setTimeout(() => window.URL.revokeObjectURL(url), 60000);
    return win ? "opened" : "downloaded";
  } catch (err) {
    if (win) win.close();
    throw err;
  }
}