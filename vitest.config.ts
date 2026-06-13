import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    include: ["src/**/*.test.{ts,tsx}"],
    exclude: ["tests/e2e/**"],
    globals: true,
    environment: "jsdom",
    setupFiles: "./src/test/setup.ts"
  }
});
