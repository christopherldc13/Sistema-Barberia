import { Router } from "express";
import crypto from "node:crypto";
import Client from "../models/Client.js";
import QrToken from "../models/QrToken.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

// Límite simple para que el auto-registro por QR no se preste a spam
// (no es a prueba de balas, pero alcanza para un negocio pequeño).
const lastJoinByIp = new Map();
const JOIN_COOLDOWN_MS = 15000;

// El QR de /pantalla vale por poco tiempo y cambia solo. Así, una foto o
// captura del código deja de servir a los pocos segundos y no se puede
// usar para anotarse sin estar físicamente en el local.
const QR_ROTATE_MS = 45000;

async function getCurrentQrToken() {
  const doc = await QrToken.findById("current");
  const isStale = !doc || Date.now() - doc.updatedAt.getTime() > QR_ROTATE_MS;
  if (!isStale) return doc.value;
  return rotateQrToken();
}

async function rotateQrToken() {
  const value = crypto.randomBytes(16).toString("hex");
  const doc = await QrToken.findByIdAndUpdate(
    "current",
    { value, updatedAt: new Date() },
    { upsert: true, new: true }
  );
  return doc.value;
}

// Pública: el código vigente para armar/validar el QR de auto-registro
router.get("/token", async (req, res) => {
  const token = await getCurrentQrToken();
  res.json({ token });
});

// Pública: cualquiera con el link puede ver la cola (pantalla de la barbería)
router.get("/", async (req, res) => {
  const clients = await Client.find().sort({ createdAt: 1 });
  res.json(clients);
});

// Protegida: agregar cliente al final de la cola (desde el panel del celular)
router.post("/", requireAuth, async (req, res) => {
  const { name } = req.body || {};
  const trimmed = typeof name === "string" ? name.trim() : "";

  if (!trimmed) {
    return res.status(400).json({ error: "El nombre es requerido" });
  }

  const client = await Client.create({ name: trimmed });
  res.status(201).json(client);
});

// Pública: el cliente se auto-inscribe escaneando el QR, sin login
router.post("/join", async (req, res) => {
  const { name, token } = req.body || {};
  const trimmed = typeof name === "string" ? name.trim().slice(0, 40) : "";

  if (!trimmed) {
    return res.status(400).json({ error: "Escribe tu nombre" });
  }

  const currentToken = await getCurrentQrToken();
  if (!token || token !== currentToken) {
    return res.status(400).json({
      error: "El código QR expiró. Pedile a alguien que lo escanee de nuevo desde la pantalla"
    });
  }

  const last = lastJoinByIp.get(req.ip);
  if (last && Date.now() - last < JOIN_COOLDOWN_MS) {
    return res.status(429).json({ error: "Espera unos segundos antes de intentar de nuevo" });
  }
  lastJoinByIp.set(req.ip, Date.now());

  const client = await Client.create({ name: trimmed });
  const position = await Client.countDocuments({ createdAt: { $lte: client.createdAt } });

  // El código recién usado deja de servir de inmediato.
  await rotateQrToken();

  res.status(201).json({ client, position });
});

// Protegida: pasar al siguiente (elimina al primero de la cola)
router.post("/next", requireAuth, async (req, res) => {
  const first = await Client.findOne().sort({ createdAt: 1 });

  if (!first) {
    return res.status(404).json({ error: "No hay clientes en cola" });
  }

  await Client.deleteOne({ _id: first._id });
  res.json(first);
});

export default router;
