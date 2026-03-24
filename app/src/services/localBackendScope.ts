const ORGANIZATION_HEADER = "X-Facenox-Organization"

async function getStoreValue(key: string): Promise<unknown> {
  try {
    return await window.electronAPI?.store?.get?.(key)
  } catch {
    return undefined
  }
}

export async function getCurrentOrganizationId(): Promise<string> {
  const organizationId = await getStoreValue("sync.organizationId")
  return typeof organizationId === "string" ? organizationId.trim() : ""
}

export async function withLocalBackendHeaders(
  headers: Record<string, string> = {},
): Promise<Record<string, string>> {
  const organizationId = await getCurrentOrganizationId()
  if (!organizationId) {
    return headers
  }

  return { ...headers, [ORGANIZATION_HEADER]: organizationId }
}

export async function appendOrganizationId(url: URL): Promise<URL> {
  const organizationId = await getCurrentOrganizationId()
  if (organizationId) {
    url.searchParams.set("organization_id", organizationId)
  }
  return url
}
