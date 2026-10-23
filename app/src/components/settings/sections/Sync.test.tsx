import type { ReactNode } from "react"
import { fireEvent, screen, waitFor } from "@testing-library/react"
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

  it("loads config and renders both local-only and connected states", async () => {
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

  it("keeps the connect button disabled without a pairing code", async () => {
    renderWithProviders(<Sync />)

    const connectButton = await screen.findByRole("button", { name: /Connect/i })
    expect(connectButton).toBeDisabled()
  })

  it("clears the pairing code and shows success after a successful pair", async () => {
    const electronAPI = getElectronAPIMock()
    electronAPI.sync.pairDevice.mockResolvedValue({
      success: true,
      message: "Device connected.",
      initialSyncSucceeded: true,
      config: createSyncConfig({
        connected: true,
        organizationName: "Facenox Org",
        siteName: "Main Campus",
      }),
    })

    const { user } = renderWithProviders(
      <>
        <Sync />
        <FeedbackDisplay />
      </>,
    )

    const pairingInput = await screen.findByPlaceholderText("ABCD2345")
    await user.type(pairingInput, "abcd2345")
    await user.click(screen.getByRole("button", { name: /Connect/i }))

    await waitFor(() => {
      expect(screen.getByText("Device connected.")).toBeInTheDocument()
    })
    expect(screen.queryByPlaceholderText("ABCD2345")).not.toBeInTheDocument()
  })

  it("shows an error-toned banner when pairing succeeds but initial sync fails", async () => {
    const electronAPI = getElectronAPIMock()
    electronAPI.sync.pairDevice.mockResolvedValue({
      success: true,
      message: "Paired, but the first sync failed.",
      initialSyncSucceeded: false,
      config: createSyncConfig({ connected: true }),
    })

    const { user } = renderWithProviders(
      <>
        <Sync />
        <FeedbackDisplay />
      </>,
    )

    await user.type(await screen.findByPlaceholderText("ABCD2345"), "CODE1234")
    await user.click(screen.getByRole("button", { name: /Connect/i }))

    expect(await screen.findByText("Paired, but the first sync failed.")).toBeInTheDocument()
  })

  it("shows save message when settings are saved", async () => {
    const electronAPI = getElectronAPIMock()
    electronAPI.sync.updateConfig.mockResolvedValueOnce(createSyncConfig({ connected: false }))

    renderWithProviders(
      <>
        <Sync />
        <FeedbackDisplay />
      </>,
    )

    fireEvent.click(await screen.findByRole("button", { name: /Advanced settings/i }))
    fireEvent.click(screen.getByRole("button", { name: /Save configuration/i }))

    expect(await screen.findByText("Cloud sync settings saved.")).toBeInTheDocument()
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
      expect(electronAPI.sync.getConfig).toHaveBeenCalledTimes(2)
      expect(screen.getByText("Sync completed.")).toBeInTheDocument()
    })
  })

  it("shows the disconnect warning when the cloud returns one", async () => {
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

    await user.click(await screen.findByRole("button", { name: /Disconnect/i }))

    expect(
      await screen.findByText(
        "Disconnected locally, but Cloud returned a warning: Cloud cleanup failed",
      ),
    ).toBeInTheDocument()
  })

  it("keeps advanced form state when toggled closed and reopened", async () => {
    const { user } = renderWithProviders(<Sync />)

    await user.click(await screen.findByRole("button", { name: /Advanced settings/i }))

    fireEvent.change(screen.getByPlaceholderText("Facenox Desktop"), {
      target: { value: "Reception Desk" },
    })

    await user.click(screen.getByRole("button", { name: /Hide advanced/i }))
    await user.click(screen.getByRole("button", { name: /Advanced settings/i }))

    expect(screen.getByPlaceholderText("Facenox Desktop")).toHaveValue("Reception Desk")
  })

  it("keeps the custom cloud URL hidden by default in advanced settings", async () => {
    const { user } = renderWithProviders(<Sync />)

    await user.click(await screen.findByRole("button", { name: /Advanced settings/i }))

    expect(screen.queryByPlaceholderText("Leave empty for Facenox Cloud")).not.toBeInTheDocument()
    expect(screen.getByPlaceholderText("Facenox Desktop")).toBeInTheDocument()
  })

  it("unlocks custom cloud URL when developer mode is triggered via title clicks", async () => {
    const { user } = renderWithProviders(
      <>
        <Sync />
        <FeedbackDisplay />
      </>,
    )

    const title = await screen.findByText(/Connect to Facenox Cloud/i)
    for (let i = 0; i < 5; i++) {
      await user.click(title)
    }

    expect(await screen.findByText(/Custom endpoint unlocked/i)).toBeInTheDocument()

    const serverUrlInput = screen.getByPlaceholderText("Leave empty for Facenox Cloud")
    expect(serverUrlInput).toBeInTheDocument()

    fireEvent.change(serverUrlInput, { target: { value: "127.0.0.1:7500" } })
    expect(screen.getByText(/Localhost cannot sync across devices/i)).toBeInTheDocument()
  })
})
