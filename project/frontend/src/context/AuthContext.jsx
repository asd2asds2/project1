import { createContext, useContext, useState, useCallback } from "react";

// Базовый адрес backend. На проде можно оставить пустым — если фронт и бэк
// ходят через один и тот же домен/reverse-proxy, относительный путь /api
// работает сам по себе. Если backend на отдельном порту, задай
// REACT_APP_API_URL в .env фронтенда.
const API_URL = process.env.REACT_APP_API_URL || "";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => localStorage.getItem("token"));
  const [user, setUser] = useState(() => {
    const raw = localStorage.getItem("user");
    return raw ? JSON.parse(raw) : null;
  });

  const login = useCallback(async (loginValue, password) => {
    const res = await fetch(`${API_URL}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ login: loginValue, password }),
    });

    const data = await res.json().catch(() => null);

    if (!res.ok || !data || data.status !== "ok") {
      throw new Error(data?.message || "Неверный логин или пароль");
    }

    localStorage.setItem("token", data.token);
    if (data.user) {
      localStorage.setItem("user", JSON.stringify(data.user));
      setUser(data.user);
    }
    setToken(data.token);
    return data;
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    setToken(null);
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ token, user, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth должен вызываться внутри <AuthProvider>");
  }
  return ctx;
}
