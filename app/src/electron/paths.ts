import { app } from "electron"
import path from "node:path"
import isDev from "./util.js"

export function getDataDirectory(): string {
  return isDev() ?
      path.join(app.getAppPath(), "..", "data")
    : path.join(app.getPath("userData"), "data")
}

export function getLogDirectory(): string {
  return isDev() ?
      path.join(app.getAppPath(), "..", "data")
    : path.join(app.getPath("userData"), "logs")
}
