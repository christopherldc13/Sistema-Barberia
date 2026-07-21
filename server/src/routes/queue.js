import { Router } from "express";
import Client from "../models/Client.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

// Pública: cualquiera con el link puede ver la cola (pantalla de la barbería)
router.get("/", async (req, res) => {
  const clients = await Client.find().sort({ createdAt: 1 });
  res.json(clients);
});

// Protegida: agregar cliente al final de la cola
router.post("/", requireAuth, async (req, res) => {
  const { name } = req.body || {};
  const trimmed = typeof name === "string" ? name.trim() : "";

  if (!trimmed) {
    return res.status(400).json({ error: "El nombre es requerido" });
  }

  const client = await Client.create({ name: trimmed });
  res.status(201).json(client);
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
