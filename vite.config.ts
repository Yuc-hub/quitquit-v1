import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { handleShareApi } from "./server/share-api.mjs";
export default defineConfig({
  plugins: [react(), tailwindcss(), {
    name: "friend-sharing-api",
    configureServer(server) { server.middlewares.use(handleShareApi); },
    configurePreviewServer(server) { server.middlewares.use(handleShareApi); },
  }],
  server: { host: "127.0.0.1" },
  build: { outDir: "dist" },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    exclude: ["tests/e2e/**", "node_modules/**", "dist/**"],
  },
});
