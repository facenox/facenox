import { ipcMain } from "electron"
import { backendService } from "../backendService.js"

/** Build auth headers for all direct fetch calls to the local backend. */
function authHeaders(extra: Record<string, string> = {}): Record<string, string> {
  const token = backendService.getToken()
  return token ? { "X-Suri-Token": token, ...extra } : { ...extra }
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
}
