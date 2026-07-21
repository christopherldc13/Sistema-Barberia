import mongoose from "mongoose";

const clientSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  createdAt: { type: Date, default: Date.now }
});

export default mongoose.model("Client", clientSchema);
