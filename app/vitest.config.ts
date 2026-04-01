import { resolve } from "node:path"
import { defineConfig } from "vitest/config"
import react from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": resolve(__dirname, "src"),
    },
  },
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.{ts,tsx}"],
    setupFiles: ["./src/test/setup.ts"],
    globals: false,
    clearMocks: true,
    restoreMocks: true,
    css: true,
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: ["src/**/*.{ts,tsx}"],
      exclude: [
        "src/**/*.d.ts",
        "src/main.tsx",
        "src/App.tsx",
        "src/electron/main.ts",
        "src/electron/preload.ts",
        "src/electron/window/**",
        "src/electron/tray/**",
        "src/electron/ipc/**",
        "src/electron/backend/**",
        "src/electron/managers/**",
        "src/electron/State.ts",
        "src/electron/util.ts",
      ],
    },
  },
})
