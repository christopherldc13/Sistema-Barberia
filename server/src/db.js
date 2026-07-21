import dns from "node:dns";
import tls from "node:tls";
import mongoose from "mongoose";

// Algunos nodos de Atlas alcanzados desde ciertas redes fallan el
// handshake de TLS 1.3 (alerta "internal error") con el intercambio de
// claves post-cuántico por defecto de OpenSSL 3.5+/Node 25+. Forzamos 1.2.
tls.DEFAULT_MAX_VERSION = "TLSv1.2";

// El resolver DNS del sistema en algunas redes no resuelve bien los
// registros SRV que usa "mongodb+srv://". No aplica en Vercel, cuyo
// entorno de red administrado ya resuelve DNS correctamente.
if (!process.env.VERCEL) {
  dns.setServers(["8.8.8.8", "1.1.1.1"]);
}

// En funciones serverless, cachea la conexión entre invocaciones cálidas
// del mismo contenedor para no reconectar en cada request.
const globalForMongoose = globalThis;
let cached = globalForMongoose._mongooseCache;
if (!cached) {
  cached = globalForMongoose._mongooseCache = { conn: null, promise: null };
}

export async function connectDB() {
  if (cached.conn) return cached.conn;
  if (!cached.promise) {
    cached.promise = mongoose.connect(process.env.MONGODB_URI);
  }
  cached.conn = await cached.promise;
  return cached.conn;
}
