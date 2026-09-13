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
      message: "Paired successfully.",
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
      expect(screen.getByText("Paired successfully.")).toBeInTheDocument()
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

  it("shows the correct save message depending on connected state", async () => {
    const electronAPI = getElectronAPIMock()
    electronAPI.sync.updateConfig.mockResolvedValueOnce(createSyncConfig({ connected: false }))
    electronAPI.sync.updateConfig.mockResolvedValueOnce(createSyncConfig({ connected: true }))

    renderWithProviders(
      <>
        <Sync />
        <FeedbackDisplay />
      </>,
    )

    fireEvent.click(await screen.findByRole("button", { name: /Advanced Settings/i }))
    fireEvent.click(screen.getByRole("button", { name: /Save Configuration/i }))

    expect(
      await screen.findByText(
        "Cloud sync settings saved. You can connect this desktop whenever you're ready.",
      ),
    ).toBeInTheDocument()

    fireEvent.click(await screen.findByRole("button", { name: /Advanced Settings/i }))
    fireEvent.click(screen.getByRole("button", { name: /Save Configuration/i }))

    expect(
      await screen.findByText("Cloud sync settings saved. Auto-sync state updated."),
    ).toBeInTheDocument()
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

    await user.click(await screen.findByRole("button", { name: /Sync Now/i }))

    await waitFor(() => {
      expect(electronAPI.sync.triggerNow).toHaveBeenCalled()
      expect(electronAPI.sync.getConfig).toHaveBeenCalledTimes(2)
      expect(screen.getByText("Sync completed successfully.")).toBeInTheDocument()
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
        "Disconnected locally, but the cloud returned a warning: Cloud cleanup failed",
      ),
    ).toBeInTheDocument()
  })

  it("keeps advanced form state when toggled closed and reopened", async () => {
    const { user } = renderWithProviders(<Sync />)

    await user.click(await screen.findByRole("button", { name: /Advanced Settings/i }))

    fireEvent.change(screen.getByPlaceholderText("Facenox Desktop"), {
      target: { value: "Reception Desk" },
    })

    await user.click(screen.getByRole("button", { name: /Hide Advanced/i }))
    await user.click(screen.getByRole("button", { name: /Advanced Settings/i }))

    expect(screen.getByPlaceholderText("Facenox Desktop")).toHaveValue("Reception Desk")
  })

  it("keeps the hosted server URL hidden unless a custom override is being used", async () => {
    const { user } = renderWithProviders(<Sync />)

    await user.click(await screen.findByRole("button", { name: /Advanced Settings/i }))

    const serverUrlInput = screen.getByPlaceholderText("Leave empty for official sync")
    expect(serverUrlInput).toHaveValue("")
  })
})
