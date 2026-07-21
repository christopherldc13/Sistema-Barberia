import React, { useEffect, useRef, useState } from "react";
import { api } from "./api";

/**
 * Pantalla pública de la cola (ej. TV/tablet en la sala de espera).
 * Solo lectura, sin login, se actualiza sola por polling.
 */
const speechSupported =
  typeof window !== "undefined" && "speechSynthesis" in window;

export default function QueueDisplay() {
  const [queue, setQueue] = useState([]);
  const [connectionError, setConnectionError] = useState("");
  const [now, setNow] = useState(() => new Date());
  const [enteringIds, setEnteringIds] = useState(() => new Set());
  const prevIdsRef = useRef(new Set());
  const prevFrontIdRef = useRef(undefined);
  const announceTimeoutRef = useRef(null);

  const announce = (name) => {
    if (!speechSupported) return;
    window.speechSynthesis.cancel();
    if (announceTimeoutRef.current) clearTimeout(announceTimeoutRef.current);

    const intro = new SpeechSynthesisUtterance("Siguiente cliente");
    intro.lang = "es-ES";
    intro.rate = 0.75;
    intro.onend = () => {
      announceTimeoutRef.current = setTimeout(() => {
        const nameUtterance = new SpeechSynthesisUtterance(name);
        nameUtterance.lang = "es-ES";
        nameUtterance.rate = 0.75;
        window.speechSynthesis.speak(nameUtterance);
      }, 700);
    };
    window.speechSynthesis.speak(intro);
  };

  // Algunos navegadores móviles solo permiten reproducir audio después de
  // la primera interacción del usuario con la página. En vez de pedirlo
  // con un botón, aprovechamos en silencio el primer toque/clic/tecla que
  // ocurra de forma natural (sin mostrar ningún aviso).
  useEffect(() => {
    if (!speechSupported) return;

    const primeAudio = () => {
      window.speechSynthesis.speak(new SpeechSynthesisUtterance(" "));
      window.removeEventListener("pointerdown", primeAudio);
      window.removeEventListener("keydown", primeAudio);
    };

    window.addEventListener("pointerdown", primeAudio);
    window.addEventListener("keydown", primeAudio);
    return () => {
      window.removeEventListener("pointerdown", primeAudio);
      window.removeEventListener("keydown", primeAudio);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const fetchQueue = async () => {
      try {
        const data = await api.getQueue();
        if (cancelled) return;

        const currentIds = new Set(data.map((c) => c._id));
        const newIds = [...currentIds].filter((id) => !prevIdsRef.current.has(id));
        prevIdsRef.current = currentIds;

        const front = data[0];
        if (
          prevFrontIdRef.current !== undefined &&
          front &&
          front._id !== prevFrontIdRef.current
        ) {
          announce(front.name);
        }
        prevFrontIdRef.current = front ? front._id : null;

        setQueue(data);
        setConnectionError("");

        if (newIds.length > 0) {
          setEnteringIds((prev) => new Set([...prev, ...newIds]));
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              setEnteringIds((prev) => {
                const next = new Set(prev);
                newIds.forEach((id) => next.delete(id));
                return next;
              });
            });
          });
        }
      } catch {
        if (!cancelled) setConnectionError("Sin conexión con el servidor");
      }
    };

    fetchQueue();
    const interval = setInterval(fetchQueue, 2500);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    const clock = setInterval(() => setNow(new Date()), 1000 * 30);
    return () => clearInterval(clock);
  }, []);

  const timeLabel = now.toLocaleTimeString("es-DO", {
    hour: "2-digit",
    minute: "2-digit"
  });

  return (
    <div className="min-h-[100dvh] w-full bg-zinc-950 text-zinc-100 flex flex-col items-center px-6 py-10 font-sans overflow-hidden relative">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_-10%,rgba(99,102,241,0.25),transparent_60%)]" />

      <div className="w-full max-w-2xl flex items-center justify-between mb-10 relative">
        <div>
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-white flex items-center gap-3">
            💈 Barbería
          </h1>
          <p className="text-zinc-400 mt-1">Cola de turnos en vivo</p>
        </div>
        <div className="text-right">
          <div className="text-2xl font-semibold text-zinc-200 tabular-nums">{timeLabel}</div>
          {connectionError && (
            <p className="text-xs text-rose-400 mt-1">{connectionError}</p>
          )}
        </div>
      </div>

      <div className="w-full max-w-2xl relative flex-1">
        {queue.length === 0 ? (
          <div className="flex flex-col items-center justify-center text-center py-24 text-zinc-500">
            <div className="text-6xl mb-4">✂️</div>
            <p className="text-2xl font-medium text-zinc-300">No hay clientes en espera</p>
            <p className="mt-2 text-zinc-500">Acércate al mostrador para anotarte</p>
          </div>
        ) : (
          <ul className="flex flex-col gap-3">
            {queue.map((client, index) => {
              const isEntering = enteringIds.has(client._id);
              const isNext = index === 0;
              return (
                <li
                  key={client._id}
                  className={`flex items-center gap-5 rounded-3xl px-6 py-5 border transition-all duration-500 ease-out ${
                    isNext
                      ? "bg-indigo-600/20 border-indigo-500/60 shadow-lg shadow-indigo-950/40"
                      : "bg-zinc-900 border-zinc-800"
                  } ${
                    isEntering
                      ? "opacity-0 translate-y-4 scale-95"
                      : "opacity-100 translate-y-0 scale-100"
                  }`}
                >
                  <span
                    className={`flex items-center justify-center w-14 h-14 rounded-full text-xl font-bold shrink-0 ${
                      isNext ? "bg-indigo-500 text-white" : "bg-zinc-800 text-zinc-400"
                    }`}
                  >
                    {index + 1}
                  </span>
                  <span className="text-2xl font-semibold text-zinc-100 truncate flex-1">
                    {client.name}
                  </span>
                  {isNext && (
                    <span className="text-xs font-bold uppercase tracking-wide text-indigo-300 bg-indigo-950/60 px-3 py-1.5 rounded-full shrink-0">
                      En turno
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
