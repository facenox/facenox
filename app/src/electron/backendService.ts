import {
  BackendProcessManager,
  type BackendConfig,
  type BackendStartupProgress,
  type BackendStatus,
} from "./backend/BackendProcessManager.js"
import { BackendClient, type ModelsResponse } from "./backend/BackendClient.js"

export type { BackendConfig, BackendStatus, ModelsResponse, BackendStartupProgress }

export class BackendService {
  private config: BackendConfig
  private status: BackendStatus
  private processManager: BackendProcessManager
  private client: BackendClient

  constructor(config: Partial<BackendConfig> = {}) {
    this.config = {
      port: 7400,
      host: "127.0.0.1",
      timeout: 30000,
      maxRetries: 3,
      healthCheckInterval: 10000,
      ...config,
    }

    this.status = {
      isRunning: false,
      port: this.config.port,
    }

    this.processManager = new BackendProcessManager(this.config, this.status)
    this.client = new BackendClient(
      () => this.getUrl(),
      () => this.getToken(),
    )
  }

  async start(): Promise<void> {
    return this.processManager.start()
  }

  async stop(): Promise<void> {
    return this.processManager.stop()
  }

  async restart(): Promise<void> {
    await this.stop()
    // Small delay to ensure cleanup
    await new Promise((r) => setTimeout(r, 100))
    return this.start()
  }

  killSync(): void {
    this.processManager.killSync()
  }

  getStatus(): BackendStatus {
    return this.processManager.getStatus()
  }

  getUrl(): string {
    return this.processManager.getUrl()
  }

  getToken(): string {
    return this.processManager.getToken()
  }

  async isAvailable(): Promise<boolean> {
    const health = await this.client.checkAvailability()
    if (health.available) {
      this.status.isRunning = true
      this.status.error = undefined
    }
    return health.available
  }

  async checkAvailability() {
    const health = await this.client.checkAvailability()
    if (health.available) {
      this.status.isRunning = true
      this.status.error = undefined
    }
    return health
  }

  async checkReadiness() {
    const isHealthy = await this.processManager.checkHealth().catch(() => false)
    return this.client.checkReadiness(isHealthy || this.status.isRunning)
  }

  async getModels(): Promise<ModelsResponse> {
    return this.client.getModels()
  }

  onStartupProgress(listener: (update: BackendStartupProgress) => void): () => void {
    return this.processManager.onStartupProgress(listener)
  }
}

export const backendService = new BackendService()
