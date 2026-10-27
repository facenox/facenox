import { ipcMain, shell, app } from "electron"
import path from "path"
import fs from "node:fs"
import { diagnosticsService } from "../services/DiagnosticsService.js"
import { getDataDirectory, getLogDirectory } from "../paths.js"

export function registerSystemHandlers() {
  ipcMain.handle("system:get-stats", () => {
    const cpu = process.getCPUUsage()
    const memory = process.getSystemMemoryInfo()

    return {
      cpu: cpu.percentCPUUsage,
      memory: {
        total: memory.total,
        free: memory.free,
        appUsage: process.memoryUsage().rss,
      },
    }
  })

  ipcMain.handle("system:export-health", async () => {
    const report = await diagnosticsService.generateHealthReport()
    const path = await diagnosticsService.exportReportToDisk(report)
    shell.showItemInFolder(path)
    return { success: true, path }
  })

  ipcMain.handle("system:open-data-dir", async () => {
    const dataPath = getDataDirectory()
    fs.mkdirSync(dataPath, { recursive: true })
    const error = await shell.openPath(dataPath)
    return error ? { success: false, path: dataPath, error } : { success: true, path: dataPath }
  })

  ipcMain.handle("system:open-install-dir", async () => {
    const installPath = app.isPackaged ? path.dirname(process.execPath) : app.getAppPath()
    await shell.openPath(installPath)
    return { success: true, path: installPath }
  })

  ipcMain.handle("system:open-log-file", async () => {
    const logDir = getLogDirectory()
    const logFile = path.join(logDir, "facenox.log")
    if (!fs.existsSync(logFile)) {
      if (!fs.existsSync(logDir)) {
        fs.mkdirSync(logDir, { recursive: true })
      }
      fs.writeFileSync(logFile, "")
    }
    const errorMsg = await shell.openPath(logFile)
    if (errorMsg) {
      shell.showItemInFolder(logFile)
    }
    return errorMsg ?
        { success: false, path: logFile, error: errorMsg }
      : { success: true, path: logFile }
  })
}
