import React, { useRef, useState } from "react";
import { api } from "./api";

/**
 * Página pública a la que se llega escaneando el QR de /pantalla.
 * El cliente escribe su nombre y se anota solo en la cola, sin login.
 */
export default function SelfCheckIn() {
  const [name, setName] = useState("");
  const [status, setStatus] = useState("idle"); // idle | saving | done | error
  const [error, setError] = useState("");
  const [position, setPosition] = useState(null);
  const inputRef = useRef(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || status === "saving") return;

    setStatus("saving");
    setError("");
    try {
      const { position: pos } = await api.join(trimmed);
      setPosition(pos);
      setStatus("done");
    } catch (err) {
      setError(err.message || "No se pudo completar el registro");
      setStatus("error");
    }
  };

  const handleAgain = () => {
    setName("");
    setStatus("idle");
    setPosition(null);
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  if (status === "done") {
    return (
      <div className="min-h-[100dvh] w-full bg-zinc-950 text-zinc-100 flex flex-col items-center justify-center px-6 font-sans text-center">
        <div className="text-6xl mb-4">✅</div>
        <h1 className="text-2xl font-bold text-white mb-1">¡Listo, {name.trim()}!</h1>
        <p className="text-zinc-400 mb-6">
          Sos el número <span className="text-indigo-400 font-bold">{position}</span> en la
          fila
        </p>
        <button
          onClick={handleAgain}
          className="text-sm text-zinc-500 hover:text-zinc-300 transition-colors"
        >
          Anotar a otra persona
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] w-full bg-zinc-950 text-zinc-100 flex flex-col items-center justify-center px-6 font-sans">
      <div className="text-4xl mb-3">💈</div>
      <h1 className="text-xl font-bold text-white mb-1">Barbería</h1>
      <p className="text-sm text-zinc-400 mb-6">Anotate en la fila</p>

      <form onSubmit={handleSubmit} className="w-full max-w-xs">
        <input
          ref={inputRef}
          type="text"
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Tu nombre"
          maxLength={40}
          className="w-full rounded-xl bg-zinc-900 border border-zinc-800 text-white placeholder-zinc-500 px-4 py-3 text-base outline-none focus:border-indigo-500 mb-3"
        />
        {error && <p className="text-sm text-rose-400 text-center mb-3">{error}</p>}
        <button
          type="submit"
          disabled={!name.trim() || status === "saving"}
          className={`w-full rounded-full py-3 font-semibold active:scale-95 transition-all ${
            !name.trim() || status === "saving"
              ? "bg-zinc-800 text-zinc-500 cursor-not-allowed"
              : "bg-indigo-600 hover:bg-indigo-500 text-white"
          }`}
        >
          {status === "saving" ? "Anotando…" : "Unirme a la fila"}
        </button>
      </form>
    </div>
  );
}
