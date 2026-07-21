// Tanto en producción (Vercel) como en desarrollo (proxy de Vite a
// localhost:4000, ver vite.config.js) el frontend llama a la API con rutas
// relativas al mismo origen, así que no hace falta una URL fija.
const API_URL = import.meta.env.VITE_API_URL || "";

const TOKEN_KEY = "barberia_token";

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token) {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
}

async function request(path, options = {}) {
  const token = getToken();
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers
    }
  });

  if (res.status === 401) {
    clearToken();
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Error ${res.status}`);
  }

  return res.status === 204 ? null : res.json();
}

export const api = {
  login: (password) =>
    request("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ password })
    }),
  getQueue: () => request("/api/queue"),
  addClient: (name) =>
    request("/api/queue", { method: "POST", body: JSON.stringify({ name }) }),
  next: () => request("/api/queue/next", { method: "POST" }),
  join: (name) =>
    request("/api/queue/join", { method: "POST", body: JSON.stringify({ name }) }),
  isAuthenticated: () => !!getToken()
};
