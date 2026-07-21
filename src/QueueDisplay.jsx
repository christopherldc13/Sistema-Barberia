import React, { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import QRCode from "qrcode";
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
  const [qrDataUrl, setQrDataUrl] = useState("");
  const prevIdsRef = useRef(new Set());
  const prevFrontIdRef = useRef(undefined);
  const announceTimeoutRef = useRef(null);
  const announceTokenRef = useRef(0);

  const joinUrl =
    typeof window !== "undefined" ? `${window.location.origin}/unirse` : "";

  const announce = (name) => {
    if (!speechSupported) return;

    // Algunos navegadores disparan "onend" más de una vez (ej. al mezclarse
    // con cancel()), lo que duplicaba el nombre. Este token invalida
    // cualquier callback que quede de un anuncio anterior o repetido.
    const myToken = ++announceTokenRef.current;
    window.speechSynthesis.cancel();
    if (announceTimeoutRef.current) {
      clearTimeout(announceTimeoutRef.current);
      announceTimeoutRef.current = null;
    }

    const intro = new SpeechSynthesisUtterance("Siguiente cliente");
    intro.lang = "es-ES";
    intro.rate = 0.75;
    intro.onend = () => {
      if (announceTokenRef.current !== myToken) return;
      announceTimeoutRef.current = setTimeout(() => {
        if (announceTokenRef.current !== myToken) return;
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
    if (!joinUrl) return;
    QRCode.toDataURL(joinUrl, {
      margin: 1,
      width: 280,
      color: { dark: "#1e1b4b", light: "#ffffff" }
    })
      .then(setQrDataUrl)
      .catch(() => setQrDataUrl(""));
  }, [joinUrl]);

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
  const dateLabel = now.toLocaleDateString("es-DO", {
    weekday: "long",
    day: "numeric",
    month: "long"
  });

  return (
    <div className="min-h-[100dvh] w-full bg-gradient-to-b from-indigo-50 via-white to-white text-zinc-900 font-sans overflow-x-hidden">
      <div className="max-w-[1600px] mx-auto px-8 sm:px-16 lg:px-24 py-10">
        <header className="flex items-start justify-between mb-12">
          <div className="flex items-center gap-4">
            <span className="text-5xl">💈</span>
            <div>
              <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-zinc-900">
                Barbería
              </h1>
              <p className="text-zinc-500 text-sm capitalize">{dateLabel}</p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="text-right hidden sm:block">
              <div className="flex items-center gap-1.5 justify-end text-xs text-emerald-600 font-semibold">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                EN VIVO
              </div>
              <div className="text-xl font-semibold text-zinc-700 tabular-nums">
                {timeLabel}
              </div>
            </div>
            <Link
              to="/panel"
              className="text-sm font-semibold text-zinc-600 bg-white border border-zinc-200 hover:border-zinc-300 hover:text-zinc-900 shadow-sm rounded-full px-4 py-2 transition-colors"
            >
              Iniciar sesión
            </Link>
          </div>
        </header>

        {connectionError && (
          <p className="text-xs text-rose-500 mb-4 text-center sm:text-left">
            {connectionError}
          </p>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-10 items-start">
          <section>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
                Fila de espera
              </h2>
              {queue.length > 0 && (
                <span className="text-xs font-semibold text-zinc-500 bg-white border border-zinc-200 shadow-sm rounded-full px-3 py-1">
                  {queue.length} {queue.length === 1 ? "persona" : "personas"}
                </span>
              )}
            </div>

            {queue.length === 0 ? (
              <div className="flex flex-col items-center justify-center text-center py-24 text-zinc-500 rounded-3xl border-2 border-dashed border-zinc-200 bg-white/60">
                <div className="text-6xl mb-4">✂️</div>
                <p className="text-2xl font-medium text-zinc-700">No hay clientes en espera</p>
                <p className="mt-2 text-zinc-500">Escaneá el QR para anotarte</p>
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
                          ? "bg-indigo-50 border-indigo-300 shadow-md shadow-indigo-100"
                          : "bg-white border-zinc-200 shadow-sm"
                      } ${
                        isEntering
                          ? "opacity-0 translate-y-4 scale-95"
                          : "opacity-100 translate-y-0 scale-100"
                      }`}
                    >
                      <span
                        className={`flex items-center justify-center w-14 h-14 rounded-full text-xl font-bold shrink-0 ${
                          isNext ? "bg-indigo-600 text-white" : "bg-zinc-100 text-zinc-500"
                        }`}
                      >
                        {index + 1}
                      </span>
                      <span className="text-2xl font-semibold text-zinc-900 truncate flex-1">
                        {client.name}
                      </span>
                      {isNext && (
                        <span className="text-xs font-bold uppercase tracking-wide text-indigo-700 bg-indigo-100 px-3 py-1.5 rounded-full shrink-0">
                          En turno
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <aside className="lg:sticky lg:top-10">
            <div className="rounded-3xl border border-zinc-200 bg-white shadow-sm p-7 flex flex-col items-center text-center">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-zinc-500 mb-4">
                Anotate desde tu celular
              </h3>
              {qrDataUrl ? (
                <img
                  src={qrDataUrl}
                  alt="Código QR para anotarse en la fila"
                  className="w-52 h-52 rounded-2xl bg-white border border-zinc-200 p-2"
                />
              ) : (
                <div className="w-52 h-52 rounded-2xl bg-zinc-100 border border-zinc-200 animate-pulse" />
              )}
              <p className="text-zinc-500 text-sm mt-4">
                Escaneá el código con la cámara y escribí tu nombre
              </p>
            </div>

            <p className="text-center text-xs text-zinc-400 mt-6">
              Esta pantalla se actualiza sola
            </p>
          </aside>
        </div>
      </div>
    </div>
  );
}
