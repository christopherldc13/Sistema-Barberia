import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import basicSsl from "@vitejs/plugin-basic-ssl";
import legacy from "@vitejs/plugin-legacy";

export default defineConfig({
  plugins: [
    react(),
    basicSsl(),
    // Genera además un bundle ES5 con polyfills para navegadores viejos
    // (ej. el navegador integrado de Smart TVs Samsung/Tizen) que no
    // entienden <script type="module"> y por eso mostraban página en blanco.
    legacy({
      targets: ["defaults", "not IE 11", "Android >= 4.4", "Safari >= 9", "iOS >= 9"]
    })
  ],
  server: {
    host: true,
    port: 5173,
    https: true,
    proxy: {
      "/api": {
        target: "http://localhost:4000",
        changeOrigin: true
      }
    }
  }
});
