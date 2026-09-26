import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  worker: { format: "es" },
  server: {
    // `pnpm dev:api` serves the Worker on 8787.
    proxy: { "/api": "http://localhost:8787" },
  },
  build: { chunkSizeWarningLimit: 1500 },
});
