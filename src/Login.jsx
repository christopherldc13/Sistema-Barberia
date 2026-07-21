import React, { useState } from "react";
import { api, setToken } from "./api";

export default function Login({ onSuccess }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!password || loading) return;
    setLoading(true);
    setError("");
    try {
      const { token } = await api.login(password);
      setToken(token);
      onSuccess();
    } catch (err) {
      setError(err.message || "No se pudo iniciar sesión");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[100dvh] w-full bg-zinc-950 text-zinc-100 flex flex-col items-center justify-center px-6 font-sans">
      <div className="text-4xl mb-3">💈</div>
      <h1 className="text-xl font-bold text-white mb-1">Barbería</h1>
      <p className="text-sm text-zinc-400 mb-6">Acceso del personal</p>

      <form onSubmit={handleSubmit} className="w-full max-w-xs">
        <input
          type="password"
          autoFocus
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Contraseña"
          className="w-full rounded-xl bg-zinc-900 border border-zinc-800 text-white placeholder-zinc-500 px-4 py-3 text-base outline-none focus:border-indigo-500 mb-3"
        />
        {error && (
          <p className="text-sm text-rose-400 text-center mb-3">{error}</p>
        )}
        <button
          type="submit"
          disabled={!password || loading}
          className={`w-full rounded-full py-3 font-semibold active:scale-95 transition-all ${
            !password || loading
              ? "bg-zinc-800 text-zinc-500 cursor-not-allowed"
              : "bg-indigo-600 hover:bg-indigo-500 text-white"
          }`}
        >
          {loading ? "Entrando…" : "Entrar"}
        </button>
      </form>
    </div>
  );
}
