import { ipcMain, shell } from "electron"
import { diagnosticsService } from "../services/DiagnosticsService.js"

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
}
