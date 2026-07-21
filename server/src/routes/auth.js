import { Router } from "express";
import jwt from "jsonwebtoken";

const router = Router();

router.post("/login", (req, res) => {
  const { password } = req.body || {};

  if (typeof password !== "string" || password !== process.env.ADMIN_PASSWORD) {
    return res.status(401).json({ error: "Contraseña incorrecta" });
  }

  const token = jwt.sign({ role: "staff" }, process.env.JWT_SECRET, {
    expiresIn: "12h"
  });

  res.json({ token });
});

export default router;
