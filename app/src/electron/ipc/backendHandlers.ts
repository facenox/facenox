import { ipcMain } from "electron"
import fs from "node:fs"
import path from "node:path"
import { backendService } from "../backendService.js"
import { withLocalBackendHeaders } from "../localBackendScope.js"

function isSafePath(filePath: string): boolean {
  try {
    const resolved = path.resolve(filePath)
    if (!path.isAbsolute(resolved)) {
      return false
    }
    const parts = resolved.split(path.sep)
    if (parts.some((part) => part.startsWith(".") && part !== "." && part !== "..")) {
      return false
    }
    const systemDirs = [
      "/etc",
      "/var",
      "/boot",
      "/sys",
      "/proc",
      "/dev",
      "/run",
      "/bin",
      "/sbin",
      "/lib",
      "/lib64",
      "/usr/lib",
      "/usr/lib64",
      "/usr/local/lib",
      "/usr/local/sbin",
      "/root",
    ]
    if (systemDirs.some((dir) => resolved === dir || resolved.startsWith(dir + path.sep))) {
      return false
    }
    if (process.platform === "win32") {
      const lowerResolved = resolved.toLowerCase()
      if (lowerResolved.startsWith("c:\\windows") || lowerResolved.startsWith("c:\\system32")) {
        return false
      }
    }
    const stats = fs.lstatSync(resolved)
    if (!stats.isFile()) {
      return false
    }
    return true
  } catch {
    return false
  }
}

/** Build auth headers for all direct fetch calls to the local backend. */
function authHeaders(extra: Record<string, string> = {}): Record<string, string> {
  const token = backendService.getToken()
  return withLocalBackendHeaders(token ? { "X-Facenox-Token": token, ...extra } : { ...extra })
}

export function registerBackendHandlers() {
  ipcMain.handle("backend:get-token", () => {
    return backendService.getToken()
  })

  ipcMain.handle("backend:check-availability", async () => {
    try {
      return await backendService.checkAvailability()
    } catch (error) {
      return {
        available: false,
        error: error instanceof Error ? error.message : String(error),
      }
    }
  })

  ipcMain.handle("backend:check-readiness", async () => {
    try {
      return await backendService.checkReadiness()
    } catch (error) {
      return {
        ready: false,
        modelsLoaded: false,
        error: error instanceof Error ? error.message : String(error),
      }
    }
  })

  ipcMain.handle("backend:get-models", async () => {
    try {
      return await backendService.getModels()
    } catch (error) {
      throw new Error(
        `Failed to get models: ${error instanceof Error ? error.message : String(error)}`,
        { cause: error },
      )
    }
  })

  ipcMain.handle("backend:get-face-stats", async () => {
    const response = await fetch(`${backendService.getUrl()}/face/stats`, {
      headers: authHeaders(),
    })
    if (!response.ok) throw new Error("Failed to get stats")
    return await response.json()
  })

  ipcMain.handle("backend:remove-person", async (_event, personId: string) => {
    const response = await fetch(
      `${backendService.getUrl()}/face/person/${encodeURIComponent(personId)}`,
      { method: "DELETE", headers: authHeaders() },
    )
    return await response.json()
  })

  ipcMain.handle(
    "backend:update-person",
    async (_event, oldPersonId: string, newPersonId: string) => {
      const response = await fetch(`${backendService.getUrl()}/face/person`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({
          old_person_id: oldPersonId,
          new_person_id: newPersonId,
        }),
      })
      return await response.json()
    },
  )

  ipcMain.handle("backend:get-all-persons", async () => {
    const response = await fetch(`${backendService.getUrl()}/face/persons`, {
      headers: authHeaders(),
    })
    return await response.json()
  })

  ipcMain.handle("backend:set-threshold", async (_event, threshold: number) => {
    const response = await fetch(`${backendService.getUrl()}/face/threshold`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ threshold }),
    })
    return await response.json()
  })

  ipcMain.handle("backend:clear-database", async () => {
    const response = await fetch(`${backendService.getUrl()}/face/database`, {
      method: "DELETE",
      headers: authHeaders(),
    })
    return await response.json()
  })

  ipcMain.handle("backend:is-ready", async () => {
    try {
      const result = await backendService.checkReadiness()
      return result.ready && result.modelsLoaded
    } catch {
      return false
    }
  })

  ipcMain.handle(
    "backend:post-multipart",
    async (
      _event,
      endpoint: string,
      files: {
        name: string
        filename: string
        path?: string
        buffer?: ArrayBuffer
        mimeType: string
      }[],
      extraFields?: Record<string, string>,
    ) => {
      try {
        const formData = new FormData()
        for (const file of files) {
          let blob: Blob
          if (file.path) {
            if (!isSafePath(file.path)) {
              throw new Error(`Access Denied: Path is not allowed: ${file.path}`)
            }
            const buffer = fs.readFileSync(file.path)
            blob = new Blob([new Uint8Array(buffer)], { type: file.mimeType })
          } else if (file.buffer) {
            blob = new Blob([new Uint8Array(file.buffer)], { type: file.mimeType })
          } else {
            throw new Error(`File ${file.filename} has no content payload`)
          }
          formData.append(file.name, blob, file.filename)
        }
        if (extraFields) {
          for (const [key, val] of Object.entries(extraFields)) {
            formData.append(key, val)
          }
        }

        const response = await fetch(`${backendService.getUrl()}${endpoint}`, {
          method: "POST",
          body: formData,
          headers: authHeaders(),
        })

        if (!response.ok) {
          const errorData: unknown = await response.json().catch(() => null)
          let message = `HTTP ${response.status}: ${response.statusText}`
          if (errorData && typeof errorData === "object") {
            if ("detail" in errorData && typeof errorData.detail === "string" && errorData.detail) {
              message = errorData.detail
            } else if (
              "error" in errorData &&
              typeof errorData.error === "string" &&
              errorData.error
            ) {
              message = errorData.error
            }
          }
          throw new Error(message)
        }

        return await response.json()
      } catch (handlerError) {
        console.error("Error inside backend:post-multipart IPC handler:", handlerError)
        throw handlerError
      }
    },
  )
}
