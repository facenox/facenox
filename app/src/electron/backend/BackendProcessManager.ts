import { spawn, exec, execSync, type ChildProcess } from "child_process"
import { randomBytes } from "crypto"
import { app } from "electron"
import path from "path"
import fs from "fs"
import { promisify } from "util"
import isDev from "../util.js"

const sleep = promisify(setTimeout)
const execAsync = promisify(exec)

export interface BackendConfig {
  port: number
  host: string
  timeout: number
  maxRetries: number
  healthCheckInterval: number
}

export interface BackendStatus {
  isRunning: boolean
  port: number
  pid?: number
  startTime?: Date
  lastHealthCheck?: Date
  error?: string
}

export class BackendProcessManager {
  private process: ChildProcess | null = null
  private config: BackendConfig
  private status: BackendStatus
  private healthCheckTimer: NodeJS.Timeout | null = null
  private startupPromise: Promise<void> | null = null
  /** Session token injected into the Python process via FACENOX_API_TOKEN. */
  private token: string = ""

  constructor(config: BackendConfig, status: BackendStatus) {
    this.config = config
    this.status = status
  }

  /** Return the per-session API token so callers can include it as X-Facenox-Token. */
  getToken(): string {
    return this.token
  }

  async start(): Promise<void> {
    if (this.startupPromise) return this.startupPromise
    this.startupPromise = this._start()
    return this.startupPromise
  }

  private async _start(): Promise<void> {
    if (this.status.isRunning) return

    // Generate a fresh per-session token before spawning the backend.
    this.token = randomBytes(32).toString("hex")

    await this.killAllBackendProcesses()

    try {
      const executablePath = this.getBackendExecutablePath()
      let command: string
      let args: string[]

      if (isDev()) {
        command = await this.findPythonExecutable()
        args = [executablePath, "--port", this.config.port.toString(), "--host", this.config.host]
      } else {
        command = executablePath
        args = ["--port", this.config.port.toString(), "--host", this.config.host]
      }

      const env: Record<string, string | undefined> = {
        ...process.env,
        ENVIRONMENT: isDev() ? "development" : "production",
        FACENOX_API_TOKEN: this.token,
      }

      // In production, force data to AppData. In dev, let backend use repo root/data
      if (!isDev()) {
        env.FACENOX_DATA_DIR = app.getPath("userData")
      }

      this.process = spawn(command, args, {
        stdio: "pipe",
        detached: false,
        windowsHide: true,
        env,
      })

      const logDir = isDev() ? path.join(process.cwd(), "..", "data") : app.getPath("userData")
      const logFile = path.join(logDir, "backend-startup.log")
      fs.writeFileSync(logFile, `[${new Date().toISOString()}] Backend starting...\n`)
      const logStream = fs.createWriteStream(logFile, { flags: "a" })

      this.process.stdout?.on("data", (data) => {
        const str = data.toString()
        logStream.write(`[STDOUT] ${str}`)
        if (isDev()) console.log(`[Backend] ${str.trim()}`)
      })

      this.process.stderr?.on("data", (data) => {
        const msg = data.toString()
        logStream.write(`[STDERR] ${msg}`)
        if (/(\bERROR\b|\bCRITICAL\b|Traceback|Exception)/.test(msg)) {
          console.error(`[Backend Error] ${msg.trim()}`)
        } else {
          console.log(`[Backend] ${msg.trim()}`)
        }
      })

      this.setupProcessHandlers()
      await this.waitForBackendReady()

      this.status.isRunning = true
      this.status.pid = this.process.pid
      this.status.startTime = new Date()
      this.status.error = undefined

      this.startHealthMonitoring()
    } catch (error) {
      console.error(`[BackendProcessManager] Failed to start: ${error}`)
      this.status.error = error instanceof Error ? error.message : String(error)
      this.cleanup()
      throw error
    } finally {
      this.startupPromise = null
    }
  }

  private setupProcessHandlers(): void {
    if (!this.process) return

    this.process.on("error", (error) => {
      console.error(`[BackendProcessManager] Process error: ${error.message}`)
      this.status.error = error.message
      this.status.isRunning = false
    })

    this.process.on("exit", (code, signal) => {
      console.log(
        `[BackendProcessManager] Process exited with code ${code}${signal ? ` and signal ${signal}` : ""}`,
      )
      this.status.isRunning = false
      if (this.process !== null) this.cleanup()
    })
  }

  private async waitForBackendReady(): Promise<void> {
    const startTime = Date.now()
    const safetyTimeout = this.config.timeout

    while (Date.now() - startTime < safetyTimeout) {
      if (this.process?.exitCode !== null && this.process?.exitCode !== undefined) {
        throw new Error(`Backend process exited unexpectedly with code ${this.process.exitCode}`)
      }

      if (await this.healthCheck()) return
      await sleep(250)
    }

    throw new Error(`Backend failed to start within safety timeout (${safetyTimeout}ms)`)
  }

  private async healthCheck(): Promise<boolean> {
    try {
      const response = await fetch(`http://${this.config.host}:${this.config.port}/`, {
        method: "GET",
        signal: AbortSignal.timeout(5000),
      })

      if (response.ok) {
        this.status.lastHealthCheck = new Date()
        return true
      }
      return false
    } catch {
      return false
    }
  }

  private startHealthMonitoring(): void {
    if (this.healthCheckTimer) clearInterval(this.healthCheckTimer)

    this.healthCheckTimer = setInterval(async () => {
      if (this.status.isRunning) {
        if (!(await this.healthCheck())) {
          this.status.isRunning = false
        }
      }
    }, this.config.healthCheckInterval)
  }

  async stop(): Promise<void> {
    const pid = this.process?.pid ?? (await this.findListeningPid())
    if (pid) {
      await this.terminatePid(pid)
    }

    this.process = null
    this.status.isRunning = false
    this.status.pid = undefined
    this.cleanup()
  }

  killSync(): void {
    const pid = this.process?.pid ?? this.findListeningPidSync()
    if (pid) {
      this.terminatePidSync(pid)
    }

    this.process = null
    this.status.isRunning = false
    this.status.pid = undefined
    this.cleanup()
  }

  /**
   * Kills only the backend process we own, or the process currently holding the
   * configured backend port after an unclean previous shutdown.
   */
  private async killAllBackendProcesses(): Promise<void> {
    const ownedPid = this.process?.pid
    if (ownedPid) {
      await this.terminatePid(ownedPid)
    }

    const listeningPid = await this.findListeningPid()
    if (listeningPid && listeningPid !== ownedPid) {
      await this.terminatePid(listeningPid)
    }
  }

  private async terminatePid(pid: number): Promise<void> {
    try {
      if (process.platform === "win32") {
        await execAsync(`taskkill /F /PID ${pid} /T`)
        return
      }

      try {
        process.kill(pid, "SIGTERM")
      } catch {
        return
      }

      const exited = await this.waitForPidExit(pid, 1500)
      if (!exited) {
        try {
          process.kill(pid, "SIGKILL")
        } catch {
          /* silent */
        }
      }
    } catch (error: unknown) {
      const err = error as { message?: string }
      if (!err?.message?.includes("not found")) {
        console.error(`[BackendProcessManager] Failed to terminate PID ${pid}:`, error)
      }
    }
  }

  private terminatePidSync(pid: number): void {
    try {
      if (process.platform === "win32") {
        execSync(`taskkill /F /PID ${pid} /T`, {
          stdio: "ignore",
          timeout: 3000,
        })
        return
      }

      try {
        process.kill(pid, "SIGTERM")
      } catch {
        return
      }

      const deadline = Date.now() + 1500
      while (Date.now() < deadline && this.isPidAlive(pid)) {
        // Short busy wait only during forced app shutdown.
      }

      if (this.isPidAlive(pid)) {
        try {
          process.kill(pid, "SIGKILL")
        } catch {
          /* silent */
        }
      }
    } catch {
      /* silent */
    }
  }

  private async waitForPidExit(pid: number, timeoutMs: number): Promise<boolean> {
    const start = Date.now()
    while (Date.now() - start < timeoutMs) {
      if (!this.isPidAlive(pid)) return true
      await sleep(100)
    }
    return !this.isPidAlive(pid)
  }

  private isPidAlive(pid: number): boolean {
    try {
      process.kill(pid, 0)
      return true
    } catch {
      return false
    }
  }

  private async findListeningPid(): Promise<number | null> {
    try {
      if (process.platform === "win32") {
        const { stdout } = await execAsync("netstat -ano -p TCP")
        return this.parseWindowsNetstatPid(stdout)
      }

      try {
        const { stdout } = await execAsync(`lsof -nP -iTCP:${this.config.port} -sTCP:LISTEN -t`)
        return this.parseFirstPid(stdout)
      } catch {
        const { stdout } = await execAsync(`ss -ltnp 'sport = :${this.config.port}'`)
        return this.parseUnixSocketPid(stdout)
      }
    } catch {
      return null
    }
  }

  private findListeningPidSync(): number | null {
    try {
      if (process.platform === "win32") {
        const stdout = execSync("netstat -ano -p TCP", {
          encoding: "utf8",
          timeout: 3000,
        })
        return this.parseWindowsNetstatPid(stdout)
      }

      try {
        const stdout = execSync(`lsof -nP -iTCP:${this.config.port} -sTCP:LISTEN -t`, {
          encoding: "utf8",
          timeout: 3000,
        })
        return this.parseFirstPid(stdout)
      } catch {
        const stdout = execSync(`ss -ltnp 'sport = :${this.config.port}'`, {
          encoding: "utf8",
          timeout: 3000,
        })
        return this.parseUnixSocketPid(stdout)
      }
    } catch {
      return null
    }
  }

  private parseWindowsNetstatPid(output: string): number | null {
    const portSuffix = `:${this.config.port}`
    for (const rawLine of output.split(/\r?\n/)) {
      const line = rawLine.trim()
      if (!line) continue
      const parts = line.split(/\s+/)
      if (parts.length < 5) continue

      const [protocol, localAddress, , state, pidText] = parts
      if (protocol !== "TCP" || state !== "LISTENING" || !localAddress.endsWith(portSuffix)) {
        continue
      }

      const pid = Number(pidText)
      if (Number.isInteger(pid) && pid > 0) return pid
    }

    return null
  }

  private parseUnixSocketPid(output: string): number | null {
    const match = /pid=(\d+)/.exec(output)
    if (!match) return null
    const pid = Number(match[1])
    return Number.isInteger(pid) && pid > 0 ? pid : null
  }

  private parseFirstPid(output: string): number | null {
    const firstLine = output
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find(Boolean)

    if (!firstLine) return null

    const pid = Number(firstLine)
    return Number.isInteger(pid) && pid > 0 ? pid : null
  }

  private cleanup(): void {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer)
      this.healthCheckTimer = null
    }
  }

  private getBackendExecutablePath(): string {
    if (isDev()) {
      return path.join(app.getAppPath(), "..", "server", "run.py")
    }

    const platform = process.platform
    const executableName = platform === "win32" ? "server.exe" : "server"
    const possiblePaths = [
      path.join(process.resourcesPath, "server", executableName),
      path.join(process.resourcesPath, executableName),
      path.join(app.getAppPath(), "server", executableName),
      path.join(app.getAppPath(), "resources", "server", executableName),
    ]

    for (const execPath of possiblePaths) {
      if (fs.existsSync(execPath)) return execPath
    }

    throw new Error(`Server executable not found. Searched paths: ${possiblePaths.join(", ")}`)
  }

  private async findPythonExecutable(): Promise<string> {
    const possiblePaths = [
      path.join(process.cwd(), "..", "venv", "Scripts", "python.exe"),
      path.join(process.cwd(), "..", "venv", "bin", "python"),
      path.join(process.cwd(), "venv", "Scripts", "python.exe"),
      path.join(process.cwd(), "venv", "bin", "python"),
      "python",
      "python3",
      "python.exe",
      "C:\\Python39\\python.exe",
      "C:\\Python310\\python.exe",
      "C:\\Python311\\python.exe",
      "C:\\Python312\\python.exe",
      "/usr/bin/python3",
      "/usr/local/bin/python3",
      "/opt/homebrew/bin/python3",
    ]

    for (const p of possiblePaths) {
      try {
        if (fs.existsSync(p)) {
          const result = await execAsync(`"${p}" --version`)
          if (result.stdout.includes("Python")) return p
        } else if (!p.includes("\\") && !p.includes("/")) {
          try {
            const result = await execAsync(`${p} --version`)
            if (result.stdout.includes("Python")) return p
          } catch {
            /* silent */
          }
        }
      } catch {
        /* silent */
      }
    }

    throw new Error(
      "Python executable not found. Please ensure Python is installed and accessible.",
    )
  }

  getUrl(): string {
    return `http://${this.config.host}:${this.config.port}`
  }

  getStatus(): BackendStatus {
    return { ...this.status }
  }
}
