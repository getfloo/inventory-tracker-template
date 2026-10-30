import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Resolve the "@/" alias from tsconfig so tests import app modules the way the app does.
export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL(".", import.meta.url)) } },
});
