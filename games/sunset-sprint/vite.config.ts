import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  base: "./",
  build: {
    emptyOutDir: true,
    outDir: path.resolve(__dirname, "../dist/sunset-sprint"),
  },
  resolve: {
    alias: {
      "@games/kit": path.resolve(__dirname, "../_kit/src/index.ts"),
    },
  },
  server: {
    port: 5173,
    strictPort: false,
  },
});
