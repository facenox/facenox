import type {
  WebSocketDetectionResponse,
  WebSocketConnectionMessage,
  WebSocketErrorMessage,
} from "../components/main/types"
import { appendOrganizationId } from "./localBackendScope"

export type WebSocketStatus = "disconnected" | "connecting" | "connected" | "error"

export interface WebSocketEventMap {
  connection: WebSocketConnectionMessage
  detection_response: WebSocketDetectionResponse
  error: WebSocketErrorMessage
  config_ack: { success: boolean; timestamp: number }
  pong: { client_id: string; timestamp: number }
  attendance_event: import("../components/main/types").AttendanceEvent
}

interface WebSocketConfig {
  baseUrl: string
}

export class WebSocketService {
  private config: WebSocketConfig
  private ws: WebSocket | null = null
  private wsStatus: WebSocketStatus = "disconnected"
  private messageHandlers = new Map<keyof WebSocketEventMap, Set<(data: unknown) => void>>()
  private clientId: string
  private token: string | null = null

  constructor(config?: Partial<WebSocketConfig>) {
    this.config = {
      baseUrl: "http://127.0.0.1:8700",
      ...config,
    }
    this.clientId = `client_${crypto.randomUUID()}`
  }

  getWebSocketStatus(): WebSocketStatus {
    return this.wsStatus
  }

  isWebSocketReady(): boolean {
    return this.wsStatus === "connected" && this.ws?.readyState === WebSocket.OPEN
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

  async connectWebSocket(): Promise<void> {
    if (this.wsStatus === "connected" || this.wsStatus === "connecting") {
      return
    }

    return new Promise((resolve, reject) => {
      void (async () => {
        try {
          const token = await this.getApiToken()
          const wsBaseUrl = this.config.baseUrl.replace(/^http/, "ws")
          const wsUrl = new URL(`/ws/detect/${this.clientId}`, `${wsBaseUrl}/`)
          await appendOrganizationId(wsUrl)
          if (token) {
            wsUrl.searchParams.set("token", token)
          }

          this.wsStatus = "connecting"
          this.ws = new WebSocket(wsUrl.toString())
          this.ws.binaryType = "arraybuffer"

          this.ws.onopen = () => {
            this.wsStatus = "connected"
            this.notifyHandlers("connection", {
              status: "connected",
              message: "Connected to detector",
            })
            resolve()
          }

          this.ws.onmessage = (event) => {
            try {
              const data = JSON.parse(event.data)
              if (data.type) {
                this.notifyHandlers(data.type, data)
              } else if (data.faces || data.model_used) {
                // Legacy/Direct detection response
                this.notifyHandlers("detection_response", data)
              }
            } catch (e) {
              console.error("Failed to parse WebSocket message:", e)
            }
          }

          this.ws.onclose = () => {
            const prevStatus = this.wsStatus
            this.wsStatus = "disconnected"
            this.ws = null
            if (prevStatus !== "disconnected") {
              this.notifyHandlers("connection", {
                status: "disconnected",
                message: "Disconnected from detector",
              })
            }
          }

          this.ws.onerror = (error) => {
            this.wsStatus = "error"
            this.notifyHandlers("error", { message: "WebSocket error occurred" })
            reject(error)
          }
        } catch (error) {
          this.wsStatus = "error"
          reject(error)
        }
      })()
    })
  }

  disconnect(): void {
    if (this.ws) {
      this.wsStatus = "disconnected"
      this.ws.close()
      this.ws = null
    }
  }

  onMessage<K extends keyof WebSocketEventMap>(
    topic: K,
    handler: (data: WebSocketEventMap[K]) => void,
  ): void {
    if (!this.messageHandlers.has(topic)) {
      this.messageHandlers.set(topic, new Set())
    }
    this.messageHandlers.get(topic)!.add(handler as (data: unknown) => void)
  }

  offMessage<K extends keyof WebSocketEventMap>(
    topic: K,
    handler?: (data: WebSocketEventMap[K]) => void,
  ): void {
    if (!handler) {
      this.messageHandlers.delete(topic)
    } else {
      const handlers = this.messageHandlers.get(topic)
      if (handlers) {
        handlers.delete(handler as (data: unknown) => void)
        if (handlers.size === 0) {
          this.messageHandlers.delete(topic)
        }
      }
    }
  }

  private notifyHandlers<K extends keyof WebSocketEventMap>(
    topic: K,
    data: WebSocketEventMap[K],
  ): void {
    const handlers = this.messageHandlers.get(topic)
    if (handlers) {
      handlers.forEach((handler) => {
        try {
          handler(data)
        } catch (e) {
          console.error(`Error in WebSocket handler for ${topic}:`, e)
        }
      })
    }
  }

  async sendDetectionRequest(frameData: ArrayBuffer): Promise<void> {
    if (!this.isWebSocketReady()) {
      throw new Error("WebSocket not ready")
    }

    this.ws!.send(frameData)
  }

  updateLiveConfig(config: {
    enableLivenessDetection?: boolean
    groupId?: string | null
    maxRecognitionFacesPerFrame?: number
  }): void {
    if (this.isWebSocketReady()) {
      this.ws!.send(
        JSON.stringify({
          type: "config",
          ...(config.enableLivenessDetection !== undefined && {
            enable_liveness_detection: config.enableLivenessDetection,
          }),
          ...(config.groupId !== undefined && {
            group_id: config.groupId,
          }),
          ...(config.maxRecognitionFacesPerFrame !== undefined && {
            max_recognition_faces_per_frame: config.maxRecognitionFacesPerFrame,
          }),
        }),
      )
    }
  }

  setLivenessDetection(enabled: boolean): void {
    this.updateLiveConfig({ enableLivenessDetection: enabled })
  }
}

export const webSocketService = new WebSocketService()
