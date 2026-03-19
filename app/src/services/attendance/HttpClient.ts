import { fetchWithRetry } from "../../utils/http"

export class HttpClient {
  private baseUrl: string
  private readinessPromise: Promise<void> | null = null
  /** Cached per-session API token. `null` = not fetched yet, `""` = unavailable. */
  private token: string | null = null

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl
  }

  getBaseUrl(): string {
    return this.baseUrl
  }

  /** Lazy-fetch the session token from the Electron main process (once per session). */
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

  /**
   * Gatekeeper: Blocks until backend is confirmed ready via IPC.
   * Prevents "Connection Refused" errors by enatracanang we never call fetch() too early.
   */
  private async ensureBackendReady(): Promise<void> {
    if (this.readinessPromise) {
      return this.readinessPromise
    }

    this.readinessPromise = (async () => {
      const maxWaitTime = 300000 // 5 minutes safety
      const checkInterval = 250
      const startTime = Date.now()

      if (!window.electronAPI?.backend_ready) {
        console.warn("[HttpClient] Electron API not found, skipping strict readiness check.")
        return
      }

      while (Date.now() - startTime < maxWaitTime) {
        try {
          const ready = await window.electronAPI.backend_ready.isReady()
          if (ready) {
            return
          }
        } catch {
          // Ignore IPC errors
        }
        await new Promise((resolve) => setTimeout(resolve, checkInterval))
      }

      console.error("[HttpClient] Backend readiness check timed out.")
    })()

    return this.readinessPromise
  }

  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    await this.ensureBackendReady()

    const url = `${this.baseUrl}${endpoint}`
    const method = (options.method || "GET").toUpperCase()
    const headers: Record<string, string> = {
      ...(options.headers as Record<string, string>),
    }

    if ((method === "POST" || method === "PUT" || method === "PATCH") && !headers["Content-Type"]) {
      headers["Content-Type"] = "application/json"
    }

    const token = await this.getApiToken()
    if (token) {
      headers["X-Atracana-Token"] = token
    }

    const response = await fetchWithRetry(url, { ...options, headers })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      const detail = (errorData as { detail?: unknown }).detail
      const normalizedDetail =
        typeof detail === "string" ? detail
        : detail ? JSON.stringify(detail)
        : undefined
      throw new Error(
        normalizedDetail ||
          (errorData as { error?: string }).error ||
          `HTTP ${response.status}: ${response.statusText}`,
      )
    }

    return response.json()
  }

  async get<T>(endpoint: string, params?: Record<string, string>): Promise<T> {
    const url = params ? `${endpoint}?${new URLSearchParams(params).toString()}` : endpoint
    return this.request<T>(url)
  }

  async post<T>(endpoint: string, data?: unknown): Promise<T> {
    return this.request<T>(endpoint, {
      method: "POST",
      body: data ? JSON.stringify(data) : undefined,
    })
  }

  async put<T>(endpoint: string, data?: unknown): Promise<T> {
    return this.request<T>(endpoint, {
      method: "PUT",
      body: data ? JSON.stringify(data) : undefined,
    })
  }

  async delete<T>(endpoint: string): Promise<T> {
    return this.request<T>(endpoint, {
      method: "DELETE",
    })
  }

  async postMultipart<T>(endpoint: string, formData: FormData): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`
    const token = await this.getApiToken()
    const headers: Record<string, string> = {}
    if (token) headers["X-Atracana-Token"] = token

    // Note: Don't set Content-Type for FormData, browser sets it with boundary
    const response = await fetchWithRetry(url, {
      method: "POST",
      body: formData,
      headers,
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      throw new Error(
        (errorData as { detail?: string }).detail ||
          (errorData as { error?: string }).error ||
          `HTTP ${response.status}: ${response.statusText}`,
      )
    }

    return response.json()
  }

  async getText(endpoint: string): Promise<string> {
    await this.ensureBackendReady()
    const url = `${this.baseUrl}${endpoint}`
    const token = await this.getApiToken()
    const headers: Record<string, string> = {}
    if (token) headers["X-Atracana-Token"] = token

    const response = await fetchWithRetry(url, { headers })
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`)
    }
    return response.text()
  }
}
