import { resolve } from "path"
import { copyFileSync, existsSync, mkdirSync } from "fs"
import { defineConfig } from "electron-vite"
import react from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"

function copyAssetsPlugin() {
  return {
    name: "copy-assets",
    writeBundle() {
      if (!existsSync("out/main")) mkdirSync("out/main", { recursive: true })
      copyFileSync("src/electron/splash.html", "out/main/splash.html")
      copyFileSync("src/electron/splash.css", "out/main/splash.css")
      copyFileSync("public/icons/logo.png", "out/main/logo.png")
    },
  }
}

export default defineConfig({
  main: {
    plugins: [copyAssetsPlugin()],
    build: {
      externalizeDeps: true,
      lib: {
        entry: "src/electron/main.ts",
      },
    },
  },
  preload: {
    build: {
      externalizeDeps: true,
      lib: {
        entry: "src/electron/preload.ts",
      },
    },
  },
  renderer: {
    root: ".",
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        "@": resolve(__dirname, "src"),
      },
    },
    build: {
      outDir: "out/renderer",
      target: "esnext",
      minify: "terser",
      sourcemap: false,
      assetsInlineLimit: 0,
      rollupOptions: {
        input: resolve(__dirname, "index.html"),
        output: {
          manualChunks: {
            vendor: ["react", "react-dom"],
            ui: ["@fortawesome/fontawesome-free"],
          },
          assetFileNames: (assetInfo) => {
            if (
              assetInfo.name &&
              (assetInfo.name.endsWith(".ttf") ||
                assetInfo.name.endsWith(".woff2") ||
                assetInfo.name.endsWith(".woff"))
            ) {
              return "fonts/[name][extname]"
            }
            return "assets/[name]-[hash][extname]"
          },
        },
      },
    },
    server: {
      port: 3000,
      strictPort: true,
      headers: {
        "Cross-Origin-Opener-Policy": "same-origin",
        "Cross-Origin-Embedder-Policy": "require-corp",
      },
    },
    define: {
      global: "globalThis",
    },
  },
})
