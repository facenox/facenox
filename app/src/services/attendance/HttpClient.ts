import { fetchWithRetry } from "@/utils/http"
import { withLocalBackendHeaders } from "../localBackendScope"

export class HttpClient {
  private baseUrl: string
  /** Cached per-session API token. `null` = not fetched yet, `""` = unavailable. */
  private token: string | null = null

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl
  }

  getBaseUrl(): string {
    return this.baseUrl
  }

  /** Fetch the session token from the Electron main process (refreshing if empty or invalidated). */
  private async getApiToken(): Promise<string> {
    if (this.token) return this.token
    try {
      const t = await window.electronAPI?.backend?.getToken?.()
      this.token = typeof t === "string" && t.length > 0 ? t : null
      return this.token ?? ""
    } catch {
      this.token = null
      return ""
    }
  }

  /**
   * Gatekeeper: No-op.
   * The sequential Electron boot flow guarantees that the background C++ / ONNX
   * services are fully warmed and active before this Chromium renderer window is loaded.
   */
  private async ensureBackendReady(): Promise<void> {
    return
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {},
    retryWrite = false,
  ): Promise<T> {
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
      headers["X-Facenox-Token"] = token
    }
    const scopedHeaders = await withLocalBackendHeaders(headers)

    const response = await fetchWithRetry(
      url,
      { ...options, headers: scopedHeaders },
      { retryWrite },
    )

    if (response.status === 401) {
      this.token = null
    }

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

  async post<T>(
    endpoint: string,
    data?: unknown,
    { retryWrite = false }: { retryWrite?: boolean } = {},
  ): Promise<T> {
    return this.request<T>(
      endpoint,
      {
        method: "POST",
        body: data ? JSON.stringify(data) : undefined,
      },
      retryWrite,
    )
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
    if (window.electronAPI?.backend?.postMultipart) {
      const files: {
        name: string
        filename: string
        path?: string
        buffer?: ArrayBuffer
        mimeType: string
      }[] = []
      const extraFields: Record<string, string> = {}

      for (const [key, value] of formData.entries()) {
        if (value instanceof File) {
          const electronFile = value as File & { path?: string }
          if (electronFile.path) {
            files.push({
              name: key,
              filename: value.name,
              path: electronFile.path,
              mimeType: value.type,
            })
          } else {
            const buffer = await value.arrayBuffer()
            files.push({
              name: key,
              filename: value.name,
              buffer,
              mimeType: value.type,
            })
          }
        } else if (typeof value !== "string") {
          const blob = value as unknown as Blob & { path?: string }
          if (blob.path) {
            files.push({
              name: key,
              filename: "blob",
              path: blob.path,
              mimeType: blob.type,
            })
          } else {
            const buffer = await blob.arrayBuffer()
            files.push({
              name: key,
              filename: "blob",
              buffer,
              mimeType: blob.type,
            })
          }
        } else {
          extraFields[key] = value
        }
      }

      return (await window.electronAPI.backend.postMultipart(endpoint, files, extraFields)) as T
    }

    const url = `${this.baseUrl}${endpoint}`
    const token = await this.getApiToken()
    const headers: Record<string, string> = {}
    if (token) headers["X-Facenox-Token"] = token
    const scopedHeaders = await withLocalBackendHeaders(headers)

    // Note: Don't set Content-Type for FormData, browser sets it with boundary
    const response = await fetchWithRetry(url, {
      method: "POST",
      body: formData,
      headers: scopedHeaders,
    })

    if (response.status === 401) {
      this.token = null
    }

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
    if (token) headers["X-Facenox-Token"] = token
    const scopedHeaders = await withLocalBackendHeaders(headers)

    const response = await fetchWithRetry(url, { headers: scopedHeaders })
    if (response.status === 401) {
      this.token = null
    }

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`)
    }
    return response.text()
  }
}
