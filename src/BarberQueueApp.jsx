import React, { useState, useEffect, useRef, useCallback } from "react";
import { api, clearToken } from "./api";
import Login from "./Login";

/**
 * Panel de control del celular: agregar cliente / pasar siguiente.
 * Protegido con login. Los datos viven en MongoDB vía la API del backend.
 */
export default function BarberQueueApp() {
  const [authed, setAuthed] = useState(api.isAuthenticated());

  if (!authed) {
    return <Login onSuccess={() => setAuthed(true)} />;
  }

  return <ControlPanel onLoggedOut={() => setAuthed(false)} />;
}

function ControlPanel({ onLoggedOut }) {
  const [queue, setQueue] = useState([]);
  const [pendingIds, setPendingIds] = useState(() => new Set());
  const [removingId, setRemovingId] = useState(null);
  const [connectionError, setConnectionError] = useState("");

  const [showModal, setShowModal] = useState(false);
  const [nameInput, setNameInput] = useState("");
  const [saving, setSaving] = useState(false);

  const [speechSupported, setSpeechSupported] = useState(true);
  const [isListening, setIsListening] = useState(false);
  const [micError, setMicError] = useState("");

  const recognitionRef = useRef(null);
  const shouldListenRef = useRef(false);
  const inputRef = useRef(null);
  const transitioningRef = useRef(false);
  const wakeLockRef = useRef(null);

  const fetchQueue = useCallback(async () => {
    try {
      const data = await api.getQueue();
      if (!transitioningRef.current) {
        setQueue(data);
      }
      setConnectionError("");
    } catch (err) {
      if (err.message === "Sesión inválida o expirada" || err.message === "No autorizado") {
        onLoggedOut();
        return;
      }
      setConnectionError("No se pudo conectar con el servidor");
    }
  }, [onLoggedOut]);

  useEffect(() => {
    fetchQueue();
    const interval = setInterval(fetchQueue, 3000);
    return () => clearInterval(interval);
  }, [fetchQueue]);

  useEffect(() => {
    if (showModal && inputRef.current) {
      const t = setTimeout(() => inputRef.current?.focus(), 50);
      return () => clearTimeout(t);
    }
  }, [showModal]);

  useEffect(() => {
    if (pendingIds.size === 0) return;
    let raf2;
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => setPendingIds(new Set()));
    });
    return () => {
      cancelAnimationFrame(raf1);
      if (raf2) cancelAnimationFrame(raf2);
    };
  }, [pendingIds]);

  const addClient = async () => {
    const trimmed = nameInput.trim();
    if (!trimmed || saving) return;
    setSaving(true);
    try {
      const created = await api.addClient(trimmed);
      setQueue((prev) => [...prev, created]);
      setPendingIds((prev) => new Set(prev).add(created._id));
      setNameInput("");
      setShowModal(false);
    } catch (err) {
      setConnectionError(err.message || "No se pudo agregar el cliente");
    } finally {
      setSaving(false);
    }
  };

  const nextClient = useCallback(() => {
    setQueue((currentQueue) => {
      if (currentQueue.length === 0 || transitioningRef.current) return currentQueue;
      const first = currentQueue[0];
      transitioningRef.current = true;
      setRemovingId(first._id);
      api
        .next()
        .catch((err) => setConnectionError(err.message || "No se pudo pasar al siguiente"))
        .finally(() => {
          setTimeout(() => {
            setQueue((q) => q.filter((c) => c._id !== first._id));
            setRemovingId(null);
            transitioningRef.current = false;
          }, 300);
        });
      return currentQueue;
    });
  }, []);

  const nextClientRef = useRef(nextClient);
  useEffect(() => {
    nextClientRef.current = nextClient;
  }, [nextClient]);

  useEffect(() => {
    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      setSpeechSupported(false);
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = "es-ES";
    recognition.continuous = true;
    recognition.interimResults = false;

    recognition.onresult = (event) => {
      // Si llegan resultados, el micrófono está funcionando: limpia
      // cualquier aviso de error transitorio que hubiera quedado.
      setMicError("");
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript.trim().toLowerCase();
        if (transcript.includes("turno listo")) {
          nextClientRef.current();
        }
      }
    };

    recognition.onerror = (event) => {
      if (event.error === "not-allowed" || event.error === "service-not-allowed") {
        setMicError(
          "Permiso de micrófono denegado. Actívalo en la configuración del navegador para usar el comando de voz."
        );
        shouldListenRef.current = false;
        setIsListening(false);
      } else if (
        event.error === "no-speech" ||
        event.error === "aborted" ||
        event.error === "network"
      ) {
        // Transitorio: onend se encarga de reintentar solo, sin asustar
        // con un mensaje de error (esto pasa seguido con datos móviles).
      } else {
        setMicError("Reconectando el micrófono…");
        setTimeout(() => setMicError((current) => (current === "Reconectando el micrófono…" ? "" : current)), 4000);
      }
    };

    recognition.onend = () => {
      if (shouldListenRef.current) {
        try {
          recognition.start();
        } catch {
          // ya estaba iniciado o el navegador lo bloqueó momentáneamente
        }
      } else {
        setIsListening(false);
      }
    };

    recognitionRef.current = recognition;

    return () => {
      shouldListenRef.current = false;
      recognition.onresult = null;
      recognition.onerror = null;
      recognition.onend = null;
      try {
        recognition.stop();
      } catch {
        // noop
      }
    };
  }, []);

  // Evita que la pantalla se apague sola mientras se está escuchando el
  // comando de voz (si el celular bloquea la pantalla, el navegador corta
  // el micrófono de todos modos; esto no puede evitarse desde una web).
  useEffect(() => {
    if (!("wakeLock" in navigator)) return;

    const requestWakeLock = async () => {
      try {
        wakeLockRef.current = await navigator.wakeLock.request("screen");
      } catch {
        // el navegador lo negó (ej. batería baja); seguimos sin bloquear pantalla
      }
    };

    if (isListening) {
      requestWakeLock();
    } else {
      wakeLockRef.current?.release().catch(() => {});
      wakeLockRef.current = null;
    }

    const handleVisibilityChange = () => {
      if (isListening && document.visibilityState === "visible" && !wakeLockRef.current) {
        requestWakeLock();
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [isListening]);

  useEffect(() => {
    return () => {
      wakeLockRef.current?.release().catch(() => {});
    };
  }, []);

  const toggleListening = () => {
    if (!speechSupported || !recognitionRef.current) return;
    setMicError("");
    if (isListening) {
      shouldListenRef.current = false;
      try {
        recognitionRef.current.stop();
      } catch {
        // noop
      }
      setIsListening(false);
    } else {
      shouldListenRef.current = true;
      try {
        recognitionRef.current.start();
        setIsListening(true);
      } catch {
        setMicError("No se pudo iniciar el micrófono. Intenta de nuevo.");
      }
    }
  };

  const handleModalKeyDown = (e) => {
    if (e.key === "Enter") addClient();
    if (e.key === "Escape") setShowModal(false);
  };

  const handleLogout = () => {
    clearToken();
    onLoggedOut();
  };

  return (
    <div className="min-h-[100dvh] w-full bg-zinc-950 text-zinc-100 flex flex-col items-center px-4 py-6 font-sans select-none">
      <div className="w-full max-w-md flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white">Barbería</h1>
          <p className="text-sm text-zinc-400">Turno del día</p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={toggleListening}
            disabled={!speechSupported}
            className={`relative flex items-center justify-center w-12 h-12 rounded-full shadow-md transition-all active:scale-90 ${
              !speechSupported
                ? "bg-zinc-800 text-zinc-600 cursor-not-allowed"
                : isListening
                ? "bg-rose-600 text-white"
                : "bg-zinc-800 text-zinc-300"
            }`}
            aria-label={isListening ? "Detener escucha" : "Activar escucha por voz"}
          >
            {isListening && (
              <span className="absolute inset-0 rounded-full bg-rose-600 animate-ping opacity-75"></span>
            )}
            <MicIcon className="w-5 h-5 relative z-10" muted={!speechSupported} />
          </button>
          <button
            onClick={handleLogout}
            className="w-12 h-12 rounded-full bg-zinc-800 text-zinc-300 flex items-center justify-center active:scale-90 transition-all"
            aria-label="Cerrar sesión"
          >
            <LogoutIcon className="w-5 h-5" />
          </button>
        </div>
      </div>

      <div className="w-full max-w-md mb-3 min-h-[1.25rem]">
        {connectionError && (
          <p className="text-xs text-rose-400/90 text-center">{connectionError}</p>
        )}
        {!connectionError && !speechSupported && (
          <p className="text-xs text-amber-400/90 text-center">
            Este navegador no soporta comandos de voz. La app funciona normal con los botones.
          </p>
        )}
        {!connectionError && speechSupported && micError && (
          <p className="text-xs text-rose-400/90 text-center">{micError}</p>
        )}
        {!connectionError && speechSupported && !micError && isListening && (
          <p className="text-xs text-emerald-400/90 text-center animate-pulse">
            Escuchando… decí “turno listo” para avanzar
          </p>
        )}
      </div>

      <div className="w-full max-w-md grid grid-cols-2 gap-3 mb-6">
        <button
          onClick={() => setShowModal(true)}
          className="rounded-full bg-indigo-600 hover:bg-indigo-500 active:scale-95 transition-all shadow-lg shadow-indigo-950/50 py-4 px-4 font-semibold text-white text-base"
        >
          + Agregar cliente
        </button>
        <button
          onClick={nextClient}
          disabled={queue.length === 0}
          className={`rounded-full active:scale-95 transition-all shadow-lg py-4 px-4 font-semibold text-base ${
            queue.length === 0
              ? "bg-zinc-800 text-zinc-500 cursor-not-allowed shadow-none"
              : "bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-950/50"
          }`}
        >
          Siguiente →
        </button>
      </div>

      <div className="w-full max-w-md flex-1">
        {queue.length === 0 ? (
          <div className="flex flex-col items-center justify-center text-center py-16 text-zinc-500">
            <div className="text-4xl mb-3">💈</div>
            <p className="font-medium text-zinc-300">No hay clientes en cola</p>
            <p className="text-sm mt-1">Tocá “Agregar cliente” para empezar</p>
          </div>
        ) : (
          <ul className="flex flex-col gap-2">
            {queue.map((client, index) => {
              const isEntering = pendingIds.has(client._id);
              const isLeaving = removingId === client._id;
              return (
                <li
                  key={client._id}
                  className={`flex items-center gap-3 rounded-2xl bg-zinc-900 border border-zinc-800 px-4 transition-all duration-300 ease-out overflow-hidden ${
                    isLeaving
                      ? "opacity-0 -translate-x-6 max-h-0 py-0 my-0 border-transparent"
                      : isEntering
                      ? "opacity-0 translate-y-3 scale-95 max-h-20 py-3"
                      : "opacity-100 translate-y-0 scale-100 max-h-20 py-3"
                  }`}
                >
                  <span
                    className={`flex items-center justify-center w-8 h-8 rounded-full text-sm font-bold shrink-0 ${
                      index === 0
                        ? "bg-indigo-500 text-white"
                        : "bg-zinc-800 text-zinc-400"
                    }`}
                  >
                    {index + 1}
                  </span>
                  <span className="text-base font-medium text-zinc-100 truncate">
                    {client.name}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {showModal && (
        <div
          className="fixed inset-0 bg-black/60 flex items-end sm:items-center justify-center z-50 backdrop-blur-sm"
          onClick={() => setShowModal(false)}
        >
          <div
            className="w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-t-3xl sm:rounded-3xl p-5 pb-8 sm:pb-5"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-semibold text-white mb-3">Nuevo cliente</h2>
            <input
              ref={inputRef}
              type="text"
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              onKeyDown={handleModalKeyDown}
              placeholder="Nombre del cliente"
              className="w-full rounded-xl bg-zinc-800 border border-zinc-700 text-white placeholder-zinc-500 px-4 py-3 text-base outline-none focus:border-indigo-500 mb-4"
            />
            <div className="flex gap-3">
              <button
                onClick={() => setShowModal(false)}
                className="flex-1 rounded-full bg-zinc-800 text-zinc-300 py-3 font-medium active:scale-95 transition-all"
              >
                Cancelar
              </button>
              <button
                onClick={addClient}
                disabled={!nameInput.trim() || saving}
                className={`flex-1 rounded-full py-3 font-semibold active:scale-95 transition-all ${
                  nameInput.trim() && !saving
                    ? "bg-indigo-600 hover:bg-indigo-500 text-white"
                    : "bg-zinc-800 text-zinc-500 cursor-not-allowed"
                }`}
              >
                {saving ? "Agregando…" : "Agregar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function MicIcon({ className, muted }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
      <path d="M19 10v1a7 7 0 0 1-14 0v-1" />
      <line x1="12" y1="19" x2="12" y2="23" />
      <line x1="8" y1="23" x2="16" y2="23" />
      {muted && <line x1="2" y1="2" x2="22" y2="22" />}
    </svg>
  );
}

function LogoutIcon({ className }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  );
}
