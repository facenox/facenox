export interface ModelInfo {
  model_name?: string
  model_path: string
  input_size: number[] | [number, number]
  conf_threshold?: number
  nms_threshold?: number
  top_k?: number
  backend_id?: number
  target_id?: number
  embedding_dimension?: number
  similarity_threshold?: number
  providers?: string[]
  description?: string
  version?: string
  supported_formats?: string[]
}

export interface ModelEntry {
  available: boolean
  info?: ModelInfo
}

export interface ModelsResponse {
  models: {
    face_detector?: ModelEntry
    liveness_detector?: ModelEntry
    face_recognizer?: ModelEntry
  }
}

export class BackendClient {
  private getBaseUrl: () => string
  private getToken: () => string

  constructor(getBaseUrl: () => string, getToken: () => string) {
    this.getBaseUrl = getBaseUrl
    this.getToken = getToken
  }

  private getUrl(path: string): string {
    return `${this.getBaseUrl()}${path}`
  }

  private authHeaders(): Record<string, string> {
    const token = this.getToken()
    return token ? { "X-Atracana-Token": token } : {}
  }

  async checkAvailability(): Promise<{
    available: boolean
    status?: number
    error?: string
  }> {
    try {
      const response = await fetch(this.getUrl("/"), {
        method: "GET",
        signal: AbortSignal.timeout(5000),
      })
      return { available: response.ok, status: response.status }
    } catch (error) {
      return {
        available: false,
        error: error instanceof Error ? error.message : String(error),
      }
    }
  }

  async getModels(): Promise<ModelsResponse> {
    const response = await fetch(this.getUrl("/models"), {
      method: "GET",
      headers: this.authHeaders(),
      signal: AbortSignal.timeout(10000),
    })

    if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`)
    return await response.json()
  }

  // Helper method for health check status
  async checkReadiness(
    isRunning: boolean,
  ): Promise<{ ready: boolean; modelsLoaded: boolean; error?: string }> {
    try {
      if (!isRunning)
        return {
          ready: false,
          modelsLoaded: false,
          error: "Backend service not started",
        }

      const health = await this.checkAvailability()
      if (!health.available)
        return {
          ready: false,
          modelsLoaded: false,
          error: "Backend health check failed",
        }

      const modelsData = await this.getModels()
      const faceDetectorAvailable = modelsData.models.face_detector?.available || false
      const faceRecognizerAvailable = modelsData.models.face_recognizer?.available || false
      const modelsLoaded = faceDetectorAvailable && faceRecognizerAvailable

      return {
        ready: modelsLoaded,
        modelsLoaded,
        error: modelsLoaded ? undefined : "Face recognition models not fully loaded",
      }
    } catch (error) {
      return {
        ready: false,
        modelsLoaded: false,
        error: error instanceof Error ? error.message : String(error),
      }
    }
  }
}
