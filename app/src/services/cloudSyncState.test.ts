import { act, renderHook, waitFor } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { createSyncConfig, getElectronAPIMock } from "@/test/mocks/electron"
import { useCloudSyncConfig, type RemoteSyncConfig } from "./cloudSyncState"

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((complete) => {
    resolve = complete
  })
  return { promise, resolve }
}

describe("shared Cloud connection state", () => {
  it("retains the last known pairing across navigation while revalidating", async () => {
    const api = getElectronAPIMock().sync
    api.getConfig.mockResolvedValue(createSyncConfig({ connected: true }))
    const first = renderHook(useCloudSyncConfig)
    await waitFor(() => expect(first.result.current.status).toBe("ready"))
    first.unmount()
    api.getConfig.mockReturnValue(new Promise(() => undefined))
    const second = renderHook(useCloudSyncConfig)
    expect(second.result.current.status).toBe("ready")
    expect(second.result.current.config?.connected).toBe(true)
  })

  it("loads pairing before counters and shares the loaded state across consumers", async () => {
    const api = getElectronAPIMock().sync
    const pairing = deferred<RemoteSyncConfig>()
    const counts = deferred<RemoteSyncConfig>()
    api.getConfig.mockImplementation((options) =>
      options?.includeCounts === false ? pairing.promise : counts.promise,
    )
    const first = renderHook(useCloudSyncConfig)
    expect(first.result.current.status).toBe("loading")
    expect(first.result.current.config).toBeNull()
    await act(async () => {
      pairing.resolve(createSyncConfig({ connected: true }))
    })
    expect(first.result.current.status).toBe("ready")
    expect(first.result.current.config?.connected).toBe(true)
    const second = renderHook(useCloudSyncConfig)
    expect(second.result.current.config?.connected).toBe(true)
    expect(api.onDataChanged).toHaveBeenCalledTimes(1)
    expect(api.getConfig).toHaveBeenCalledTimes(2)
    await act(async () => {
      counts.resolve(
        createSyncConfig({ connected: true, unsyncedRecordsCount: 3, unsyncedSessionsCount: 1 }),
      )
    })
    expect(second.result.current.config?.unsyncedRecordsCount).toBe(3)
    first.unmount()
    expect(second.result.current.config?.connected).toBe(true)
  })

  it("does not let a slow older read overwrite a later connection change", async () => {
    const api = getElectronAPIMock().sync
    const oldRead = deferred<RemoteSyncConfig>()
    let changed!: () => void
    api.onDataChanged.mockImplementation((callback) => {
      changed = callback
      return vi.fn()
    })
    api.getConfig.mockResolvedValue(createSyncConfig({ connected: false }))
    api.getConfig.mockImplementationOnce(() => oldRead.promise)
    const { result } = renderHook(useCloudSyncConfig)
    await act(async () => {
      changed()
    })
    expect(result.current.status).toBe("ready")
    expect(result.current.config?.connected).toBe(false)
    await act(async () => {
      oldRead.resolve(createSyncConfig({ connected: true }))
    })
    expect(result.current.config?.connected).toBe(false)
  })

  it("does not let pending counters overwrite a newer native connection read", async () => {
    const api = getElectronAPIMock().sync
    const oldCounts = deferred<RemoteSyncConfig>()
    let changed!: () => void
    api.onDataChanged.mockImplementation((callback) => {
      changed = callback
      return vi.fn()
    })
    api.getConfig.mockImplementation((options) =>
      options?.includeCounts === false ?
        Promise.resolve(createSyncConfig({ connected: true, deviceId: "previous-device" }))
      : oldCounts.promise,
    )
    const { result } = renderHook(useCloudSyncConfig)
    await waitFor(() => expect(result.current.status).toBe("ready"))
    api.getConfig.mockResolvedValue(createSyncConfig({ connected: false, unsyncedRecordsCount: 2 }))
    await act(async () => {
      changed()
    })
    await act(async () => {
      oldCounts.resolve(createSyncConfig({ connected: false, unsyncedRecordsCount: 99 }))
    })
    expect(result.current.config?.connected).toBe(false)
    expect(result.current.config?.unsyncedRecordsCount).toBe(2)
  })

  it("treats a native credential failure as an error, not an unpaired configuration", async () => {
    getElectronAPIMock().sync.getConfig.mockResolvedValue({
      ...createSyncConfig({ connected: false }),
      credentialError: "Unlock the system keyring.",
    })
    const { result } = renderHook(useCloudSyncConfig)
    await waitFor(() => expect(result.current.status).toBe("error"))
    expect(result.current.error).toBe("Unlock the system keyring.")
  })

  it("reports read errors rather than confirming standalone mode", async () => {
    getElectronAPIMock().sync.getConfig.mockRejectedValue(new Error("Settings unavailable"))
    const { result } = renderHook(useCloudSyncConfig)
    await waitFor(() => expect(result.current.status).toBe("error"))
    expect(result.current.config).toBeNull()
    expect(result.current.error).toBe("Settings unavailable")
  })
})
