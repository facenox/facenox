import os from "os"
import fs from "fs"
import path from "path"
import { app } from "electron"
import { backendService } from "../backendService.js"

export interface SystemHealthReport {
  timestamp: string
  appVersion: string
  platform: string
  arch: string
  cpu: {
    model: string
    count: number
    load: number[]
  }
  memory: {
    total: number
    free: number
    usagePercent: number
  }
  backend: {
    isRunning: boolean
    port: number
    url: string
  }
  logs: string[]
}

export class DiagnosticsService {
  async generateHealthReport(): Promise<SystemHealthReport> {
    const totalMem = os.totalmem()
    const freeMem = os.freemem()

    // Get last 100 lines of app.log if it exists
    const logPath = path.join(app.getPath("userData"), "logs", "app.log")
    let logs: string[] = []
    try {
      if (fs.existsSync(logPath)) {
        const content = fs.readFileSync(logPath, "utf8")
        logs = content.split("\n").slice(-100)
      }
    } catch (error) {
      logs = [`Failed to read logs: ${error}`]
    }

    return {
      timestamp: new Date().toISOString(),
      appVersion: app.getVersion(),
      platform: os.platform(),
      arch: os.arch(),
      cpu: {
        model: os.cpus()[0]?.model || "Unknown",
        count: os.cpus().length,
        load: os.loadavg(),
      },
      memory: {
        total: Math.round(totalMem / (1024 * 1024)),
        free: Math.round(freeMem / (1024 * 1024)),
        usagePercent: Math.round(((totalMem - freeMem) / totalMem) * 100),
      },
      backend: {
        isRunning: backendService.getStatus().isRunning,
        port: backendService.getStatus().port,
        url: backendService.getUrl(),
      },
      logs,
    }
  }

  async exportReportToDisk(report: SystemHealthReport): Promise<string> {
    const exportPath = path.join(
      app.getPath("downloads"),
      `facenox_health_${new Date().toISOString().replace(/[:.]/g, "-")}.json`,
    )
    fs.writeFileSync(exportPath, JSON.stringify(report, null, 2))
    return exportPath
  }
}

export const diagnosticsService = new DiagnosticsService()
