import type { ReactNode } from "react"
import { fireEvent, screen, waitFor } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { RemoteSync } from "@/components/settings/sections/RemoteSync"
import { createSyncConfig, getElectronAPIMock } from "@/test/mocks/electron"
import { renderWithProviders } from "@/test/utils/renderWithProviders"

vi.mock("@/components/shared", async () => {
  const actual = await vi.importActual<typeof import("@/components/shared")>("@/components/shared")
  return {
    ...actual,
    Tooltip: ({ children }: { children: ReactNode }) => <>{children}</>,
  }
})

describe("RemoteSync", () => {
  it("loads config and renders both local-only and connected states", async () => {
    const electronAPI = getElectronAPIMock()
    electronAPI.sync.getConfig.mockResolvedValueOnce(createSyncConfig())

    const { unmount } = renderWithProviders(<RemoteSync />)

    await waitFor(() => {
      expect(screen.getByText("Offline Mode")).toBeInTheDocument()
    })

    electronAPI.sync.getConfig.mockResolvedValueOnce(
      createSyncConfig({
        connected: true,
        organizationName: "Acme Org",
        siteName: "Main Campus",
        deviceId: "device-1",
      }),
    )

    unmount()
    renderWithProviders(<RemoteSync />)

    await waitFor(() => {
      expect(screen.getByText("Synced")).toBeInTheDocument()
      expect(screen.getByText("Connected to: Acme Org – Main Campus")).toBeInTheDocument()
    })
  })

  it("keeps the connect button disabled without a pairing code", async () => {
    renderWithProviders(<RemoteSync />)

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
        organizationName: "Acme Org",
        siteName: "Main Campus",
      }),
    })

    const { user } = renderWithProviders(<RemoteSync />)

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

    const { user } = renderWithProviders(<RemoteSync />)

    await user.type(await screen.findByPlaceholderText("ABCD2345"), "CODE1234")
    await user.click(screen.getByRole("button", { name: /Connect/i }))

    expect(await screen.findByText("Paired, but the first sync failed.")).toBeInTheDocument()
  })

  it("shows the correct save message depending on connected state", async () => {
    const electronAPI = getElectronAPIMock()
    electronAPI.sync.updateConfig.mockResolvedValueOnce(createSyncConfig({ connected: false }))
    electronAPI.sync.updateConfig.mockResolvedValueOnce(createSyncConfig({ connected: true }))

    renderWithProviders(<RemoteSync />)

    fireEvent.click(await screen.findByRole("button", { name: /Show Advanced Settings/i }))
    fireEvent.click(screen.getByRole("button", { name: /Save Settings/i }))

    expect(
      await screen.findByText(
        "Remote sync settings saved. You can pair this desktop whenever you're ready.",
      ),
    ).toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: /Show Advanced Settings/i }))
    fireEvent.click(screen.getByRole("button", { name: /Save Settings/i }))

    expect(
      await screen.findByText("Remote sync settings saved. Auto-sync state updated."),
    ).toBeInTheDocument()
  })

  it("reloads config and shows the manual sync result", async () => {
    const electronAPI = getElectronAPIMock()
    electronAPI.sync.getConfig.mockResolvedValue(
      createSyncConfig({
        connected: true,
        organizationName: "Acme Org",
        siteName: "Main Campus",
      }),
    )
    electronAPI.sync.triggerNow.mockResolvedValue({
      success: true,
      message: "Manual sync complete.",
    })

    const { user } = renderWithProviders(<RemoteSync />)

    await user.click(await screen.findByRole("button", { name: /Sync Now/i }))

    await waitFor(() => {
      expect(electronAPI.sync.triggerNow).toHaveBeenCalled()
      expect(electronAPI.sync.getConfig).toHaveBeenCalledTimes(2)
      expect(screen.getByText("Manual sync complete.")).toBeInTheDocument()
    })
  })

  it("shows the disconnect warning when the cloud returns one", async () => {
    const electronAPI = getElectronAPIMock()
    electronAPI.sync.getConfig.mockResolvedValue(
      createSyncConfig({
        connected: true,
        organizationName: "Acme Org",
        siteName: "Main Campus",
      }),
    )
    electronAPI.sync.disconnectDevice.mockResolvedValue({
      success: true,
      warning: "Cloud cleanup failed",
      config: createSyncConfig(),
    })

    const { user } = renderWithProviders(<RemoteSync />)

    await user.click(await screen.findByRole("button", { name: /Disconnect Device/i }))

    expect(
      await screen.findByText(
        "Disconnected locally, but the cloud returned a warning: Cloud cleanup failed",
      ),
    ).toBeInTheDocument()
  })

  it("keeps advanced form state when toggled closed and reopened", async () => {
    const { user } = renderWithProviders(<RemoteSync />)

    await user.click(await screen.findByRole("button", { name: /Show advanced settings/i }))

    fireEvent.change(screen.getByPlaceholderText("Front Desk Desktop"), {
      target: { value: "Reception Desk" },
    })

    await user.click(screen.getByRole("button", { name: /Hide Advanced Settings/i }))
    await user.click(screen.getByRole("button", { name: /Show Advanced Settings/i }))

    expect(screen.getByPlaceholderText("Front Desk Desktop")).toHaveValue("Reception Desk")
  })

  it("keeps the hosted server URL hidden unless a custom override is being used", async () => {
    const { user } = renderWithProviders(<RemoteSync />)

    await user.click(await screen.findByRole("button", { name: /Show Advanced Settings/i }))

    const serverUrlInput = screen.getByPlaceholderText("Leave empty for official sync")
    expect(serverUrlInput).toHaveValue("")
  })
})
