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
      copyFileSync("public/icons/logo-transparent.png", "out/main/logo-transparent.png")
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
            react: ["react", "react-dom"],
            motion: ["framer-motion"],
            state: ["zustand", "zod"],
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
      chunkSizeWarningLimit: 700,
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
