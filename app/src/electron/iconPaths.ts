import { app } from "electron"
import path from "path"

function iconBaseDir() {
  return app.isPackaged ? process.resourcesPath : path.join(app.getAppPath(), "public")
}

export function getWindowIconPath() {
  const baseDir = iconBaseDir()

  if (process.platform === "linux") {
    return path.join(baseDir, "icons", "logo-transparent.png")
  }

  return path.join(baseDir, "icons", "logo.png")
}

export function getTrayIconPath() {
  const baseDir = iconBaseDir()

  if (process.platform === "linux") {
    return path.join(baseDir, "icons", "logo-transparent.png")
  }

  return path.join(baseDir, "icons", "logo.png")
}
