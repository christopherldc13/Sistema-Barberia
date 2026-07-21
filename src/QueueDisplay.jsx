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
  const [qrToken, setQrToken] = useState("");
  const prevIdsRef = useRef(new Set());
  const prevFrontIdRef = useRef(undefined);
  const announceTimeoutRef = useRef(null);
  const announceFallbackRef = useRef(null);
  const announceTokenRef = useRef(0);
  const voicesRef = useRef([]);

  // Algunos navegadores (típico en Smart TV) no traen una voz en español
  // instalada; si solo fijamos "lang" y no hay voz que matchee, se quedan
  // mudos en silencio. Elegimos la voz explícitamente, con reserva a
  // cualquier voz disponible antes que no decir nada.
  useEffect(() => {
    if (!speechSupported) return;
    const updateVoices = () => {
      voicesRef.current = window.speechSynthesis.getVoices();
    };
    updateVoices();
    window.speechSynthesis.onvoiceschanged = updateVoices;
    return () => {
      if (window.speechSynthesis.onvoiceschanged === updateVoices) {
        window.speechSynthesis.onvoiceschanged = null;
      }
    };
  }, []);

  const pickVoice = () => {
    const voices = voicesRef.current;
    if (!voices || voices.length === 0) return null;
    return voices.find((v) => /^es/i.test(v.lang)) || voices[0];
  };

  const announce = (name) => {
    if (!speechSupported) return;
    const voice = pickVoice();

    // Algunos navegadores disparan "onend" más de una vez (ej. al mezclarse
    // con cancel()), lo que duplicaba el nombre. Este token invalida
    // cualquier callback que quede de un anuncio anterior o repetido.
    const myToken = ++announceTokenRef.current;
    window.speechSynthesis.cancel();
    if (announceTimeoutRef.current) {
      clearTimeout(announceTimeoutRef.current);
      announceTimeoutRef.current = null;
    }
    if (announceFallbackRef.current) {
      clearTimeout(announceFallbackRef.current);
      announceFallbackRef.current = null;
    }

    // Bug conocido de Chrome: si la página pasa un rato sin hablar, el
    // motor de voz se "duerme" y a veces nunca dispara "onend", dejando el
    // anuncio a medias. speakName() es a prueba de doble llamado, así que
    // dejamos una red de seguridad que igual dice el nombre si eso pasa.
    let nameSpoken = false;
    const speakName = () => {
      if (announceTokenRef.current !== myToken || nameSpoken) return;
      nameSpoken = true;
      const nameUtterance = new SpeechSynthesisUtterance(name);
      nameUtterance.lang = "es-ES";
      nameUtterance.rate = 0.75;
      if (voice) nameUtterance.voice = voice;
      window.speechSynthesis.speak(nameUtterance);
    };

    const intro = new SpeechSynthesisUtterance("Siguiente cliente");
    intro.lang = "es-ES";
    intro.rate = 1.1;
    if (voice) intro.voice = voice;
    intro.onend = () => {
      if (announceTokenRef.current !== myToken) return;
      announceTimeoutRef.current = setTimeout(speakName, 700);
    };
    intro.onerror = () => {
      if (announceTokenRef.current !== myToken) return;
      speakName();
    };
    window.speechSynthesis.speak(intro);
    announceFallbackRef.current = setTimeout(speakName, 3500);
  };

  // Latido: evita que el motor de voz de Chrome se quede "dormido" cuando
  // pasa un buen rato sin anunciar nada (típico en una TV con poco tráfico).
  useEffect(() => {
    if (!speechSupported) return;
    const heartbeat = setInterval(() => {
      if (!window.speechSynthesis.speaking) {
        window.speechSynthesis.resume();
      }
    }, 8000);
    return () => clearInterval(heartbeat);
  }, []);

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

  // El token del QR vence y rota solo (ver backend), así una foto o link
  // compartido del código deja de servir a los pocos segundos: solo sirve
  // escanearlo estando físicamente frente a la pantalla.
  useEffect(() => {
    let cancelled = false;

    const fetchToken = async () => {
      try {
        const { token } = await api.getQrToken();
        if (!cancelled) setQrToken(token);
      } catch {
        // si falla, el QR simplemente se queda con el último válido
      }
    };

    fetchToken();
    const interval = setInterval(fetchToken, 3000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    if (!qrToken || typeof window === "undefined") return;
    const joinUrl = `${window.location.origin}/unirse?token=${qrToken}`;
    QRCode.toDataURL(joinUrl, {
      margin: 1,
      width: 280,
      color: { dark: "#1e1b4b", light: "#ffffff" }
    })
      .then(setQrDataUrl)
      .catch(() => setQrDataUrl(""));
  }, [qrToken]);

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

  // Estilos en línea en vez de clases de Tailwind: algunos navegadores de
  // Smart TV interpretan mal la hoja de estilos externa (bordes redondeados,
  // sombras y colores de fondo no se aplicaban) aunque el layout con flex sí
  // funcionaba. Escribiendo el CSS directo sobre cada elemento evitamos
  // depender de cómo ese navegador procese el archivo .css.
  const s = {
    page: {
      minHeight: "100vh",
      width: "100%",
      background: "#f5f6ff",
      color: "#18181b",
      fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif"
    },
    container: {
      maxWidth: "1600px",
      margin: "0 auto",
      padding: "40px 64px"
    },
    header: {
      display: "flex",
      alignItems: "flex-start",
      justifyContent: "space-between",
      marginBottom: "48px",
      flexWrap: "wrap",
      gap: "16px"
    },
    brand: { display: "flex", alignItems: "center", gap: "16px" },
    logo: { fontSize: "48px" },
    title: { fontSize: "32px", fontWeight: 700, margin: 0, color: "#18181b" },
    subtitle: { color: "#71717a", fontSize: "14px", margin: "4px 0 0", textTransform: "capitalize" },
    headerRight: { display: "flex", alignItems: "center", gap: "16px" },
    liveWrap: { textAlign: "right" },
    liveRow: {
      display: "flex",
      alignItems: "center",
      gap: "6px",
      justifyContent: "flex-end",
      fontSize: "12px",
      color: "#059669",
      fontWeight: 600
    },
    liveDot: {
      width: "8px",
      height: "8px",
      borderRadius: "8px",
      backgroundColor: "#10b981",
      display: "inline-block"
    },
    clock: { fontSize: "20px", fontWeight: 600, color: "#3f3f46" },
    loginLink: {
      fontSize: "14px",
      fontWeight: 600,
      color: "#52525b",
      backgroundColor: "#ffffff",
      border: "1px solid #e4e4e7",
      borderRadius: "999px",
      padding: "8px 16px",
      textDecoration: "none",
      display: "inline-block"
    },
    error: { fontSize: "12px", color: "#e11d48", marginBottom: "16px" },
    columns: {
      display: "flex",
      flexWrap: "wrap",
      gap: "40px",
      alignItems: "flex-start"
    },
    main: { flex: "1 1 480px", minWidth: 0 },
    sectionHead: {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: "16px"
    },
    sectionTitle: {
      fontSize: "13px",
      fontWeight: 600,
      textTransform: "uppercase",
      letterSpacing: "0.05em",
      color: "#71717a",
      margin: 0
    },
    countBadge: {
      fontSize: "12px",
      fontWeight: 600,
      color: "#71717a",
      backgroundColor: "#ffffff",
      border: "1px solid #e4e4e7",
      borderRadius: "999px",
      padding: "4px 12px"
    },
    emptyBox: {
      textAlign: "center",
      padding: "96px 24px",
      color: "#71717a",
      borderRadius: "24px",
      border: "2px dashed #e4e4e7",
      backgroundColor: "rgba(255,255,255,0.6)"
    },
    emptyIcon: { fontSize: "60px", marginBottom: "16px" },
    emptyTitle: { fontSize: "22px", fontWeight: 500, color: "#3f3f46", margin: 0 },
    emptySubtitle: { marginTop: "8px", color: "#71717a" },
    list: { listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: "12px" },
    item: (isNext, visible) => ({
      display: "flex",
      alignItems: "center",
      gap: "20px",
      borderRadius: "24px",
      padding: "20px 24px",
      border: `1px solid ${isNext ? "#a5b4fc" : "#e4e4e7"}`,
      backgroundColor: isNext ? "#eef2ff" : "#ffffff",
      transition: "opacity 0.4s ease-out, transform 0.4s ease-out",
      opacity: visible ? 1 : 0,
      transform: visible ? "translateY(0)" : "translateY(12px)"
    }),
    numberBadge: (isNext) => ({
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      width: "56px",
      height: "56px",
      borderRadius: "56px",
      fontSize: "20px",
      fontWeight: 700,
      flexShrink: 0,
      backgroundColor: isNext ? "#4f46e5" : "#f4f4f5",
      color: isNext ? "#ffffff" : "#71717a"
    }),
    clientName: {
      fontSize: "24px",
      fontWeight: 600,
      color: "#18181b",
      flex: 1,
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap"
    },
    nextPill: {
      fontSize: "12px",
      fontWeight: 700,
      textTransform: "uppercase",
      letterSpacing: "0.05em",
      color: "#4338ca",
      backgroundColor: "#e0e7ff",
      padding: "6px 12px",
      borderRadius: "999px",
      flexShrink: 0
    },
    aside: { flex: "0 1 340px", minWidth: "280px" },
    qrCard: {
      borderRadius: "24px",
      border: "1px solid #e4e4e7",
      backgroundColor: "#ffffff",
      padding: "28px",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      textAlign: "center"
    },
    qrTitle: {
      fontSize: "13px",
      fontWeight: 600,
      textTransform: "uppercase",
      letterSpacing: "0.05em",
      color: "#71717a",
      margin: "0 0 16px"
    },
    qrImage: {
      width: "208px",
      height: "208px",
      borderRadius: "16px",
      backgroundColor: "#ffffff",
      border: "1px solid #e4e4e7",
      padding: "8px"
    },
    qrPlaceholder: {
      width: "208px",
      height: "208px",
      borderRadius: "16px",
      backgroundColor: "#f4f4f5",
      border: "1px solid #e4e4e7"
    },
    qrCaption: { color: "#71717a", fontSize: "14px", marginTop: "16px" },
    footerNote: { textAlign: "center", fontSize: "12px", color: "#a1a1aa", marginTop: "24px" }
  };

  return (
    <div style={s.page}>
      <div style={s.container}>
        <header style={s.header}>
          <div style={s.brand}>
            <span style={s.logo}>💈</span>
            <div>
              <h1 style={s.title}>Barbería</h1>
              <p style={s.subtitle}>{dateLabel}</p>
            </div>
          </div>

          <div style={s.headerRight}>
            <div style={s.liveWrap}>
              <div style={s.liveRow}>
                <span style={s.liveDot} />
                EN VIVO
              </div>
              <div style={s.clock}>{timeLabel}</div>
            </div>
            <Link to="/panel" style={s.loginLink}>
              Iniciar sesión
            </Link>
          </div>
        </header>

        {connectionError && <p style={s.error}>{connectionError}</p>}

        <div style={s.columns}>
          <section style={s.main}>
            <div style={s.sectionHead}>
              <h2 style={s.sectionTitle}>Fila de espera</h2>
              {queue.length > 0 && (
                <span style={s.countBadge}>
                  {queue.length} {queue.length === 1 ? "persona" : "personas"}
                </span>
              )}
            </div>

            {queue.length === 0 ? (
              <div style={s.emptyBox}>
                <div style={s.emptyIcon}>✂️</div>
                <p style={s.emptyTitle}>No hay clientes en espera</p>
                <p style={s.emptySubtitle}>Escaneá el QR para anotarte</p>
              </div>
            ) : (
              <ul style={s.list}>
                {queue.map((client, index) => {
                  const isEntering = enteringIds.has(client._id);
                  const isNext = index === 0;
                  return (
                    <li key={client._id} style={s.item(isNext, !isEntering)}>
                      <span style={s.numberBadge(isNext)}>{index + 1}</span>
                      <span style={s.clientName}>{client.name}</span>
                      {isNext && <span style={s.nextPill}>En turno</span>}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <aside style={s.aside}>
            <div style={s.qrCard}>
              <h3 style={s.qrTitle}>Anotate desde tu celular</h3>
              {qrDataUrl ? (
                <img src={qrDataUrl} alt="Código QR para anotarse en la fila" style={s.qrImage} />
              ) : (
                <div style={s.qrPlaceholder} />
              )}
              <p style={s.qrCaption}>Escaneá el código con la cámara y escribí tu nombre</p>
            </div>

            <p style={s.footerNote}>Esta pantalla se actualiza sola</p>
          </aside>
        </div>
      </div>
    </div>
  );
}
