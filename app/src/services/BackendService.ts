import type {
  FaceRecognitionResponse,
  PersonRemovalResponse,
  PersonUpdateResponse,
  SimilarityThresholdResponse,
  DatabaseStatsResponse,
  PersonInfo,
} from "../types/recognition"

import { ElectronAdapter } from "./adapters/ElectronAdapter"
import { withLocalBackendHeaders } from "./localBackendScope"
import { dataUrlToBlob } from "@/utils/dataUrl"

interface DetectionResponse {
  faces: {
    bbox: [number, number, number, number]
    confidence: number
    landmarks_5?: number[][]
  }[]
  model_used: string
  session_id?: string
}

interface BackendConfig {
  baseUrl: string
  timeout: number
  retryAttempts: number
}

interface ModelInfo {
  name: string
  description?: string
  version?: string
}

export class BackendService {
  private config: BackendConfig
  private adapter: ElectronAdapter
  private token: string | null = null

  constructor(config?: Partial<BackendConfig>) {
    this.config = {
      baseUrl: "http://127.0.0.1:8700",
      timeout: 30000,
      retryAttempts: 3,
      ...config,
    }

    this.adapter = new ElectronAdapter()
  }

  private async getApiToken(): Promise<string> {
    if (this.token !== null) return this.token
    try {
      const t = await window.electronAPI?.backend?.getToken?.()
      this.token = typeof t === "string" ? t : ""
    } catch {
      this.token = ""
    }
    return this.token
  }

  async isBackendAvailable(): Promise<boolean> {
    try {
      const response = await fetch(`${this.config.baseUrl}/`, {
        method: "GET",
        signal: AbortSignal.timeout(5000),
      })
      return response.ok
    } catch {
      return false
    }
  }

  async checkReadiness(): Promise<{
    ready: boolean
    modelsLoaded: boolean
    error?: string
  }> {
    try {
      const isAvailable = await this.isBackendAvailable()
      if (!isAvailable) {
        return {
          ready: false,
          modelsLoaded: false,
          error: "Backend not available",
        }
      }

      const models = await this.getAvailableModels()
      const requiredModels = ["face_detector", "face_recognizer"]
      const loadedModels = Object.keys(models).filter((key) =>
        requiredModels.some((required) => key.toLowerCase().includes(required.toLowerCase())),
      )

      const modelsLoaded = loadedModels.length >= requiredModels.length

      return {
        ready: modelsLoaded,
        modelsLoaded,
        error: modelsLoaded ? undefined : "Required face recognition models not loaded",
      }
    } catch (error) {
      console.error("Failed to check backend readiness:", error)
      return {
        ready: false,
        modelsLoaded: false,
        error: error instanceof Error ? error.message : "Unknown error",
      }
    }
  }

  async getAvailableModels(): Promise<Record<string, ModelInfo>> {
    try {
      const token = await this.getApiToken()
      const headers: Record<string, string> = {}
      if (token) headers["X-Facenox-Token"] = token

      const response = await fetch(`${this.config.baseUrl}/models`, {
        method: "GET",
        headers: await withLocalBackendHeaders(headers),
        signal: AbortSignal.timeout(this.config.timeout),
      })

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }

      return await response.json()
    } catch (error) {
      console.error("Failed to get available models:", error)
      throw error
    }
  }

  async detectFaces(
    imageData: Blob | string,
    options: {
      model_type?: string
      confidence_threshold?: number
      nms_threshold?: number
      enableLiveness?: boolean
    } = {},
  ): Promise<DetectionResponse> {
    try {
      let imageBlob: Blob
      if (typeof imageData === "string") {
        const dataUrl =
          imageData.startsWith("data:") ? imageData : `data:image/jpeg;base64,${imageData}`
        imageBlob = dataUrlToBlob(dataUrl)
      } else {
        imageBlob = imageData
      }

      const formData = new FormData()
      formData.append("image", imageBlob, "face.jpg")
      formData.append("model_type", options.model_type || "face_detector")
      formData.append("confidence_threshold", (options.confidence_threshold ?? 0.8).toString())
      formData.append("nms_threshold", (options.nms_threshold ?? 0.3).toString())
      formData.append("enable_liveness_detection", (options.enableLiveness ?? false).toString())

      const token = await this.getApiToken()
      const headers: Record<string, string> = {}
      if (token) headers["X-Facenox-Token"] = token

      const response = await fetch(`${this.config.baseUrl}/detect`, {
        method: "POST",
        body: formData,
        headers: await withLocalBackendHeaders(headers),
        signal: AbortSignal.timeout(this.config.timeout),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.detail || `HTTP ${response.status}: ${response.statusText}`)
      }

      return await response.json()
    } catch (error) {
      console.error("Face detection failed:", error)
      throw error
    }
  }

  setLivenessDetection(): void {}

  async recognizeFace(
    imageData: ArrayBuffer,
    bbox: number[],
    groupId: string,
    landmarks_5: number[][],
    enableLiveness: boolean = true,
  ): Promise<FaceRecognitionResponse> {
    try {
      const formData = new FormData()
      const blob = new Blob([imageData], { type: "image/jpeg" })
      formData.append("image", blob, "face.jpg")
      formData.append(
        "metadata",
        JSON.stringify({
          bbox,
          landmarks_5,
          group_id: groupId,
          enable_liveness_detection: enableLiveness,
        }),
      )

      const token = await this.getApiToken()
      const headers: Record<string, string> = {}
      if (token) headers["X-Facenox-Token"] = token

      const response = await fetch(`${this.config.baseUrl}/face/recognize`, {
        method: "POST",
        body: formData,
        headers: await withLocalBackendHeaders(headers),
        signal: AbortSignal.timeout(this.config.timeout),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.detail || `HTTP ${response.status}: ${response.statusText}`)
      }

      return await response.json()
    } catch (error) {
      console.error("Face recognition failed:", error)
      throw error
    }
  }

  async removePerson(personId: string): Promise<PersonRemovalResponse> {
    try {
      return await this.adapter.removePerson(personId)
    } catch (error) {
      console.error("Person removal failed:", error)
      throw error
    }
  }

  async updatePerson(oldPersonId: string, newPersonId: string): Promise<PersonUpdateResponse> {
    try {
      return await this.adapter.updatePerson(oldPersonId, newPersonId)
    } catch (error) {
      console.error("Person update failed:", error)
      throw error
    }
  }

  async getAllPersons(): Promise<PersonInfo[]> {
    try {
      const result = await this.adapter.getAllPersons()
      return result.persons || []
    } catch (error) {
      console.error("Failed to get persons:", error)
      throw error
    }
  }

  async setSimilarityThreshold(threshold: number): Promise<SimilarityThresholdResponse> {
    try {
      return await this.adapter.setThreshold(threshold)
    } catch (error) {
      console.error("Failed to set similarity threshold:", error)
      throw error
    }
  }

  async clearDatabase(): Promise<{ success: boolean; message: string }> {
    try {
      return await this.adapter.clearDatabase()
    } catch (error) {
      console.error("Failed to clear database:", error)
      throw error
    }
  }

  async clearCache(): Promise<{ success: boolean; message: string }> {
    try {
      const token = await this.getApiToken()
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      }
      if (token) headers["X-Facenox-Token"] = token

      const response = await fetch(`${this.config.baseUrl}/face/cache/invalidate`, {
        method: "POST",
        headers: await withLocalBackendHeaders(headers),
        signal: AbortSignal.timeout(this.config.timeout),
      })

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }

      const result = await response.json()
      return {
        success: true,
        message: typeof result?.message === "string" ? result.message : "Cache invalidated",
      }
    } catch (error) {
      console.error("Failed to clear cache:", error)
      return {
        success: false,
        message: `Failed to clear cache: ${error}`,
      }
    }
  }

  async getDatabaseStats(): Promise<DatabaseStatsResponse> {
    try {
      return await this.adapter.getFaceStats()
    } catch (error) {
      console.error("Failed to get database stats:", error)
      throw error
    }
  }
}

export const backendService = new BackendService()
