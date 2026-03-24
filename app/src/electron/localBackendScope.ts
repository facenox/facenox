import { persistentStore } from "./persistentStore.js"

const ORGANIZATION_HEADER = "X-Facenox-Organization"

export function getCurrentOrganizationId(): string {
  const organizationId = persistentStore.get("sync.organizationId")
  return typeof organizationId === "string" ? organizationId.trim() : ""
}

export function withLocalBackendHeaders(
  headers: Record<string, string> = {},
): Record<string, string> {
  const organizationId = getCurrentOrganizationId()
  if (!organizationId) {
    return headers
  }

  return { ...headers, [ORGANIZATION_HEADER]: organizationId }
}
