import type { ReactNode } from "react"
import { act, screen, waitFor } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { Sync } from "@/components/settings/sections/Sync"
import { useUIStore } from "@/components/main/stores"
import { createSyncConfig, getElectronAPIMock } from "@/test/mocks/electron"
import { renderWithProviders } from "@/test/utils/renderWithProviders"

vi.mock("@/components/shared", async () => {
  const actual = await vi.importActual<typeof import("@/components/shared")>("@/components/shared")
  return {
    ...actual,
    Tooltip: ({ children }: { children: ReactNode }) => <>{children}</>,
  }
})

// Helper component to render global feedback in tests
function FeedbackDisplay() {
  const success = useUIStore((state) => state.success)
  const error = useUIStore((state) => state.error)
  return (
    <>
      {success && <div>{success}</div>}
      {error && <div>{error}</div>}
    </>
  )
}

describe("Sync", () => {
  it("does not show pairing or request a device code while saved pairing is loading", async () => {
    const api = getElectronAPIMock().sync
    let resolve!: (config: ReturnType<typeof createSyncConfig>) => void
    const pending = new Promise<ReturnType<typeof createSyncConfig>>((complete) => {
      resolve = complete
    })
    api.getConfig.mockReturnValue(pending)
    renderWithProviders(<Sync />)
    expect(screen.getByText("Loading Cloud connection…")).toBeInTheDocument()
    expect(api.initiateReversePairing).not.toHaveBeenCalled()
    await act(async () => {
      resolve(createSyncConfig({ connected: true }))
    })
    expect(await screen.findByText("Connected to Facenox Cloud")).toBeInTheDocument()
    expect(api.initiateReversePairing).not.toHaveBeenCalled()
  })

  it("shows an error and Retry button when configuration cannot be read", async () => {
    const api = getElectronAPIMock().sync
    api.getConfig.mockRejectedValue(new Error("Saved settings unavailable"))
    renderWithProviders(<Sync />)
    expect(await screen.findByText("Saved settings unavailable")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument()
    expect(api.initiateReversePairing).not.toHaveBeenCalled()
  })

  it.each([
    ["Plan limit exceeded", "Plan member limit reached"],
    ["Plan limit exceeded: reached 15 (limit: 10)", "Plan limit reached (15 / 10 members)"],
  ])("renders quota feedback without invented counts: %s", async (message, expected) => {
    getElectronAPIMock().sync.getConfig.mockResolvedValue(
      createSyncConfig({
        connected: true,
        lastSyncStatus: "error",
        lastSyncMessage: message,
      }),
    )
    renderWithProviders(<Sync />)
    expect(await screen.findByText(expected)).toBeInTheDocument()
    expect(screen.queryByText(/0 \/ 0 members/)).not.toBeInTheDocument()
  })

  it.each([
    {
      records: undefined,
      sessions: undefined,
      synced: true,
      expected: "Current sync status unavailable",
    },
    { records: 0, sessions: undefined, synced: true, expected: "Current sync status unavailable" },
    { records: 0, sessions: 0, synced: false, expected: "No completed sync yet" },
    { records: 0, sessions: 0, synced: true, expected: "Last sync completed" },
    { records: 1, sessions: 0, synced: true, expected: "1 record queued for upload" },
    { records: 2, sessions: 0, synced: true, expected: "2 records queued for upload" },
    { records: 0, sessions: 1, synced: true, expected: "Attendance updates queued for upload" },
  ])(
    "shows $expected for the corresponding queue state",
    async ({ records, sessions, synced, expected }) => {
      getElectronAPIMock().sync.getConfig.mockResolvedValue(
        createSyncConfig({
          connected: true,
          lastSyncStatus: synced ? "success" : "idle",
          lastSyncedAt: synced ? "2026-10-23T02:00:00Z" : null,
          unsyncedRecordsCount: records,
          unsyncedSessionsCount: sessions,
        }),
      )
      renderWithProviders(<Sync />)
      expect(await screen.findByText(expected)).toBeInTheDocument()
      expect(screen.queryByText("All records synchronized")).not.toBeInTheDocument()
    },
  )

  it("loads config and notifies onStatusChange across disconnected and connected states", async () => {
    const electronAPI = getElectronAPIMock()
    electronAPI.sync.getConfig.mockResolvedValueOnce(createSyncConfig())

    let syncConfig: {
      connected: boolean
      organizationName?: string
      siteName?: string
    } | null = null
    const { unmount } = renderWithProviders(
      <Sync
        onStatusChange={(cfg) => {
          syncConfig = cfg
        }}
      />,
    )

    await waitFor(() => {
      expect(syncConfig).not.toBeNull()
      expect(syncConfig?.connected).toBe(false)
    })
    expect(screen.getByText("Device not paired")).toBeInTheDocument()

    electronAPI.sync.getConfig.mockResolvedValueOnce(
      createSyncConfig({
        connected: true,
        organizationName: "Facenox Org",
        siteName: "Main Campus",
        deviceId: "device-1",
      }),
    )

    unmount()
    renderWithProviders(
      <Sync
        onStatusChange={(cfg) => {
          syncConfig = cfg
        }}
      />,
    )

    await waitFor(() => {
      expect(syncConfig).not.toBeNull()
      expect(syncConfig?.connected).toBe(true)
      expect(syncConfig?.organizationName).toBe("Facenox Org")
      expect(syncConfig?.siteName).toBe("Main Campus")
    })
  })

  it("reloads config and shows the manual sync result", async () => {
    const electronAPI = getElectronAPIMock()
    electronAPI.sync.getConfig.mockResolvedValue(
      createSyncConfig({
        connected: true,
        organizationName: "Facenox Org",
        siteName: "Main Campus",
      }),
    )
    electronAPI.sync.triggerNow.mockResolvedValue({
      success: true,
      message: "Manual sync complete.",
    })

    const { user } = renderWithProviders(
      <>
        <Sync />
        <FeedbackDisplay />
      </>,
    )

    await user.click(await screen.findByRole("button", { name: /Sync now/i }))

    await waitFor(() => {
      expect(electronAPI.sync.triggerNow).toHaveBeenCalled()
      expect(
        electronAPI.sync.getConfig.mock.calls.filter(
          ([options]) => options?.includeCounts === false,
        ),
      ).toHaveLength(2)
      expect(screen.getByText("Sync completed.")).toBeInTheDocument()
    })
  })

  it("confirms unpair inside advanced settings and shows the disconnect warning when the cloud returns one", async () => {
    const electronAPI = getElectronAPIMock()
    electronAPI.sync.getConfig.mockResolvedValue(
      createSyncConfig({
        connected: true,
        organizationName: "Facenox Org",
        siteName: "Main Campus",
      }),
    )
    electronAPI.sync.disconnectDevice.mockResolvedValue({
      success: true,
      warning: "Cloud cleanup failed",
      config: createSyncConfig(),
    })

    const { user } = renderWithProviders(
      <>
        <Sync />
        <FeedbackDisplay />
      </>,
    )

    expect(await screen.findByText("Connected to Facenox Cloud")).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: /Unpair device/i })).not.toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: /Advanced settings/i }))
    await user.click(screen.getByRole("button", { name: /Unpair device/i }))

    expect(await screen.findByText("Unpair device?")).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: /^Cancel$/i }))
    expect(electronAPI.sync.disconnectDevice).not.toHaveBeenCalled()

    await user.click(screen.getByRole("button", { name: /Unpair device/i }))
    await user.click(await screen.findByRole("button", { name: /^Unpair$/i }))

    expect(
      await screen.findByText("Disconnected locally. Cloud cleanup failed"),
    ).toBeInTheDocument()
  })

  it("offers local pairing recovery when the saved Cloud credential cannot be decrypted", async () => {
    const api = getElectronAPIMock().sync
    api.getConfig
      .mockResolvedValueOnce(
        createSyncConfig({
          connected: false,
          wasEverPaired: true,
          organizationId: "org-1",
          siteId: "site-1",
          deviceId: "device-1",
          credentialError: "Could not unlock saved Cloud credentials.",
        }),
      )
      .mockResolvedValue(createSyncConfig())
    api.disconnectDevice.mockResolvedValue({
      success: true,
      warning: "Remove this device from Cloud > Devices before pairing again.",
      config: createSyncConfig(),
    })

    const { user } = renderWithProviders(
      <>
        <Sync />
        <FeedbackDisplay />
      </>,
    )

    expect(await screen.findByText("Could not unlock saved Cloud credentials.")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "Reset local pairing" }))
    expect(await screen.findByText("Reset local pairing?")).toBeInTheDocument()
    expect(api.disconnectDevice).not.toHaveBeenCalled()
    await user.click(screen.getByRole("button", { name: "Reset pairing" }))
    expect(api.disconnectDevice).toHaveBeenCalledTimes(1)
    expect(
      await screen.findByText(
        "Disconnected locally. Remove this device from Cloud > Devices before pairing again.",
      ),
    ).toBeInTheDocument()
  })

  it("passes clearLocalData when unpairing with the local reset checkbox checked", async () => {
    const api = getElectronAPIMock().sync
    api.getConfig.mockResolvedValue(
      createSyncConfig({
        connected: true,
        organizationName: "Facenox Org",
        siteName: "Main Campus",
        deviceId: "device-1",
      }),
    )
    api.disconnectDevice.mockResolvedValue({ success: true })

    const { user } = renderWithProviders(
      <>
        <Sync />
        <FeedbackDisplay />
      </>,
    )

    expect(await screen.findByText("Connected to Facenox Cloud")).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: /Advanced settings/i }))
    await user.click(screen.getByRole("button", { name: /^Unpair device$/i }))
    expect(await screen.findByText("Unpair device?")).toBeInTheDocument()

    const checkbox = screen.getByRole("checkbox", {
      name: /Also clear local attendance data to connect to another organization/i,
    })
    expect(checkbox).not.toBeChecked()
    await user.click(checkbox)
    expect(checkbox).toBeChecked()

    await user.click(screen.getByRole("button", { name: "Unpair" }))

    await waitFor(() => expect(api.disconnectDevice).toHaveBeenCalledWith({ clearLocalData: true }))
    expect(
      await screen.findByText("Device unpaired and local attendance data cleared."),
    ).toBeInTheDocument()
  })
})
