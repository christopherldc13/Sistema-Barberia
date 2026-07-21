import mongoose from "mongoose";

// Documento único que guarda el código vigente del QR de auto-registro.
const qrTokenSchema = new mongoose.Schema({
  _id: { type: String, default: "current" },
  value: { type: String, required: true },
  updatedAt: { type: Date, default: Date.now }
});

export default mongoose.model("QrToken", qrTokenSchema);
