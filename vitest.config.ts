import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: false,
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
  },
  resolve: {
    alias: {
      // fileURLToPath keeps this correct on Windows (URL.pathname yields /C:/…).
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
