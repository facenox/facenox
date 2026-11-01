import { ipcMain, app } from "electron"
import path from "node:path"
import fs from "node:fs/promises"
import { existsSync } from "node:fs"
import { fileURLToPath } from "node:url"
import isDev from "../util.js"

const asset_filename = fileURLToPath(import.meta.url)
const asset_dirname = path.dirname(asset_filename)

export function getRecognitionSoundsDir(): string {
  const candidates =
    isDev() ?
      [
        path.join(asset_dirname, "../../public/assets/sounds"),
        path.join(app.getAppPath(), "public/assets/sounds"),
        path.join(asset_dirname, "../renderer/assets/sounds"),
      ]
    : [
        path.join(asset_dirname, "../renderer/assets/sounds"),
        path.join(app.getAppPath(), "out/renderer/assets/sounds"),
        path.join(asset_dirname, "../../public/assets/sounds"),
      ]

  for (const dir of candidates) {
    if (existsSync(dir)) {
      return dir
    }
  }

  return isDev() ?
      path.join(asset_dirname, "../../public/assets/sounds")
    : path.join(asset_dirname, "../renderer/assets/sounds")
}

export function registerAssetHandlers() {
  ipcMain.handle("assets:list-recognition-sounds", async () => {
    const soundsDir = getRecognitionSoundsDir()

    try {
      const entries = await fs.readdir(soundsDir, { withFileTypes: true })
      const allowedExt = new Set([".mp3", ".wav", ".ogg", ".m4a"])

      const files = entries
        .filter((e) => e.isFile())
        .map((e) => e.name)
        .filter((name) => allowedExt.has(path.extname(name).toLowerCase()))
        .sort((a, b) => a.localeCompare(b))

      return files.map((fileName) => {
        const url = `./assets/sounds/${encodeURIComponent(fileName)}`
        return { fileName, url }
      })
    } catch {
      return []
    }
  })
}
