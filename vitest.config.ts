import { defineConfig } from "vitest/config";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "client", "src"),
      "@shared": path.resolve(__dirname, "shared"),
    },
  },
  test: {
    environment: "node",
    include: ["server/__tests__/**/*.test.ts"],
    globalSetup: ["server/__tests__/globalSetup.ts"],
    setupFiles: ["server/__tests__/setup.ts"],
  },
});
