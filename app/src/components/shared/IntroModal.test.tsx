import { act, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { IntroModal } from "./IntroModal"
import { useUIStore } from "@/components/main/stores/uiStore"
import { createSyncConfig, getElectronAPIMock } from "@/test/mocks/electron"

describe("IntroModal", () => {
  beforeEach(() => {
    useUIStore.setState({
      hasSeenIntro: false,
      error: null,
    })
  })

  it("requires Cloud connection on step 3 for fresh installs without a Skip button", async () => {
    const api = getElectronAPIMock().sync
    api.getConfig.mockResolvedValue(createSyncConfig({ connected: false }))

    render(<IntroModal />)

    expect(screen.getByText("Welcome to Facenox")).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Next" }))
    expect(await screen.findByText("Encrypted face templates")).toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: "Next" }))
    expect(await screen.findByText("Connect to Facenox Cloud")).toBeInTheDocument()

    expect(screen.queryByRole("button", { name: /Skip/i })).not.toBeInTheDocument()
    expect(
      screen.queryByRole("button", { name: /Continue with local data/i }),
    ).not.toBeInTheDocument()
    expect(screen.queryByText("Required to continue")).not.toBeInTheDocument()

    await waitFor(() => expect(api.initiateReversePairing).toHaveBeenCalledTimes(1))
    expect(await screen.findByRole("link", { name: /^Sign in$/i })).toHaveAttribute(
      "href",
      "https://facenox.com/pair?code=749120",
    )

    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.assign(navigator, { clipboard: { writeText } })
    fireEvent.click(screen.getByRole("button", { name: "Copy code" }))
    expect(writeText).toHaveBeenCalledWith("749120")
  })

  it("loads a saved custom destination before starting device authorization", async () => {
    const api = getElectronAPIMock().sync
    api.getConfig.mockResolvedValue(
      createSyncConfig({
        connected: false,
        remoteBaseUrl: "https://sync.example.test",
        deviceName: "Reception",
      }),
    )

    render(<IntroModal initialStep={2} />)

    await waitFor(() =>
      expect(api.initiateReversePairing).toHaveBeenCalledWith({
        remoteBaseUrl: "https://sync.example.test",
        deviceName: "Reception",
      }),
    )
    expect(api.initiateReversePairing).toHaveBeenCalledTimes(1)
  })

  it("completes onboarding when reverse pairing approves even if onDataChanged flips connected mid-poll", async () => {
    const api = getElectronAPIMock().sync
    let dataChangedListener: (() => void) | undefined
    api.onDataChanged.mockImplementation((cb) => {
      dataChangedListener = cb
      return () => {
        dataChangedListener = undefined
      }
    })
    api.getConfig.mockResolvedValue(createSyncConfig({ connected: false }))
    api.pollDeviceAuthorization.mockImplementation(async () => {
      const connectedConfig = createSyncConfig({ connected: true })
      api.getConfig.mockResolvedValue(connectedConfig)
      dataChangedListener?.()
      return {
        status: "approved",
        success: true,
        config: connectedConfig,
        initialSyncSucceeded: true,
        message: "Device connected.",
      }
    })

    render(<IntroModal initialStep={2} />)

    await waitFor(() => expect(api.pollDeviceAuthorization).toHaveBeenCalled(), { timeout: 5000 })
    await waitFor(() => expect(useUIStore.getState().hasSeenIntro).toBe(true), {
      timeout: 2000,
    })
  })

  it("keeps the manual pairing fallback available even when initiating reverse pairing fails", async () => {
    const api = getElectronAPIMock().sync
    api.getConfig.mockResolvedValue(createSyncConfig({ connected: false }))
    api.initiateReversePairing.mockResolvedValue({
      success: false,
      error: "Request failed",
    })

    render(<IntroModal initialStep={2} />)

    expect(await screen.findByText("Request failed")).toBeInTheDocument()
    const manualButton = screen.getByRole("button", {
      name: /Have a pairing code already/i,
    })
    expect(manualButton).toBeInTheDocument()
    fireEvent.click(manualButton)

    const connectButton = await screen.findByRole("button", { name: "Connect" })
    expect(connectButton).toBeDisabled()
    expect(await screen.findByPlaceholderText("ABCD2345")).toBeInTheDocument()
  })

  it("pairs via manual code and surfaces initial sync failure warning", async () => {
    const api = getElectronAPIMock().sync
    api.getConfig.mockResolvedValue(createSyncConfig({ connected: false }))
    api.pairDevice.mockImplementation(async () => {
      const config = createSyncConfig({ connected: true })
      api.getConfig.mockResolvedValue(config)
      return {
        success: true,
        message: "Paired, but the first sync failed.",
        initialSyncSucceeded: false,
        config,
      }
    })

    render(<IntroModal initialStep={2} />)

    fireEvent.click(await screen.findByRole("button", { name: /Have a pairing code already/i }))
    fireEvent.change(await screen.findByPlaceholderText("ABCD2345"), {
      target: { value: "code1234" },
    })
    fireEvent.click(await screen.findByRole("button", { name: "Connect" }))

    await waitFor(() => {
      expect(api.pairDevice).toHaveBeenCalledWith(
        expect.objectContaining({ pairingCode: "CODE1234" }),
      )
      expect(useUIStore.getState().error).toBe("Paired, but the first sync failed.")
    })
  })

  it("unlocks Dev endpoint on 5 heading clicks and discards stale in-flight codes on endpoint change", async () => {
    const api = getElectronAPIMock().sync
    api.getConfig.mockResolvedValue(createSyncConfig({ connected: false }))
    type Result = Awaited<ReturnType<SyncAPI["initiateReversePairing"]>>
    let finish!: (value: Result) => void
    api.initiateReversePairing.mockReturnValue(
      new Promise<Result>((resolve) => {
        finish = resolve
      }),
    )

    render(<IntroModal initialStep={2} />)

    await waitFor(() => expect(api.initiateReversePairing).toHaveBeenCalledTimes(1))
    expect(screen.queryByPlaceholderText("https://facenox.com")).not.toBeInTheDocument()

    const heading = screen.getByRole("heading", { name: "Connect to Facenox Cloud" })
    for (let i = 0; i < 5; i++) {
      fireEvent.click(heading)
    }

    const endpointInput = await screen.findByPlaceholderText("https://facenox.com")
    expect(endpointInput).toBeInTheDocument()

    const updatedConfig = createSyncConfig({
      connected: false,
      remoteBaseUrl: "http://localhost:3000",
    })
    api.updateConfig.mockResolvedValue(updatedConfig)
    api.getConfig.mockResolvedValue(updatedConfig)

    fireEvent.click(screen.getByRole("button", { name: "Localhost" }))

    await act(async () => {
      finish({
        success: true,
        data: {
          deviceCode: "obsolete",
          userCode: "OLD999",
          verificationUri: "https://facenox.com/pair",
          verificationUriComplete: "https://facenox.com/pair?code=OLD999",
          expiresIn: 900,
          interval: 3,
        },
      })
    })

    expect(screen.queryByText("OLD999")).not.toBeInTheDocument()
  })

  it("offers inline local directory reset when pairing hits a Cloud location mismatch and restarts pairing", async () => {
    const api = getElectronAPIMock().sync
    api.getConfig.mockResolvedValue(createSyncConfig({ connected: false }))
    api.initiateReversePairing.mockResolvedValue({
      success: true,
      data: {
        deviceCode: "dev-1",
        userCode: "MISMATCH",
        verificationUri: "https://facenox.com/pair",
        verificationUriComplete: "https://facenox.com/pair?code=MISMATCH",
        expiresIn: 900,
        interval: 1,
      },
    })
    api.pollDeviceAuthorization.mockResolvedValueOnce({
      status: "error",
      error:
        "This local directory belongs to another Cloud location. Reconnect to its original location or use a separate local data profile.",
    })
    api.resetLocalDirectory.mockResolvedValue({ success: true })

    render(<IntroModal initialStep={2} />)

    await waitFor(() => expect(api.pollDeviceAuthorization).toHaveBeenCalled(), { timeout: 5000 })
    const resetPromptBtn = await screen.findByRole(
      "button",
      { name: "Clear local data & switch location" },
      { timeout: 5000 },
    )
    fireEvent.click(resetPromptBtn)

    const confirmResetBtn = await screen.findByRole("button", {
      name: "Yes, clear local data",
    })
    fireEvent.click(confirmResetBtn)

    await waitFor(() => expect(api.resetLocalDirectory).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(api.initiateReversePairing).toHaveBeenCalledTimes(2))
  })

  it("shows only one reset prompt even if both reverse and manual pairing hit a Cloud location mismatch", async () => {
    const api = getElectronAPIMock().sync
    const mismatchMsg =
      "This local directory belongs to another Cloud location. Reconnect to its original location or use a separate local data profile."
    api.getConfig.mockResolvedValue(createSyncConfig({ connected: false }))
    api.initiateReversePairing.mockResolvedValue({
      success: true,
      data: {
        deviceCode: "dev-1",
        userCode: "MISMATCH",
        verificationUri: "https://facenox.com/pair",
        verificationUriComplete: "https://facenox.com/pair?code=MISMATCH",
        expiresIn: 900,
        interval: 1,
      },
    })
    api.pollDeviceAuthorization.mockResolvedValueOnce({
      status: "error",
      error: mismatchMsg,
    })
    api.pairDevice.mockResolvedValueOnce({
      success: false,
      error: mismatchMsg,
    })

    render(<IntroModal initialStep={2} />)

    await waitFor(() => expect(api.pollDeviceAuthorization).toHaveBeenCalled(), { timeout: 5000 })
    expect(
      await screen.findAllByRole("button", { name: "Clear local data & switch location" }),
    ).toHaveLength(1)

    fireEvent.click(screen.getByRole("button", { name: /Have a pairing code already/i }))
    fireEvent.change(await screen.findByPlaceholderText("ABCD2345"), {
      target: { value: "ABCD2345" },
    })
    fireEvent.click(screen.getByRole("button", { name: "Connect" }))

    await waitFor(() => expect(api.pairDevice).toHaveBeenCalledTimes(1))
    expect(
      screen.getAllByRole("button", { name: "Clear local data & switch location" }),
    ).toHaveLength(1)
  })

  it("displays local directory counts, exports backup, and supports explicit migration", async () => {
    const api = getElectronAPIMock().sync
    api.getConfig.mockResolvedValue(createSyncConfig({ connected: false }))
    api.getLocalDirectorySummary.mockResolvedValue({
      success: true,
      counts: { groups: 3, members: 42, records: 120, sessions: 60 },
    })
    api.initiateReversePairing.mockResolvedValue({
      success: true,
      data: {
        deviceCode: "dev-1",
        userCode: "MISMATCH",
        verificationUri: "https://facenox.com/pair",
        verificationUriComplete: "https://facenox.com/pair?code=MISMATCH",
        expiresIn: 900,
        interval: 1,
      },
    })
    api.pollDeviceAuthorization.mockResolvedValueOnce({
      status: "error",
      error:
        "This local directory belongs to another Cloud location. Reconnect to its original location or use a separate local data profile.",
    })
    api.exportData.mockResolvedValue({ success: true, filePath: "/tmp/backup.facenox" })
    api.migrateLocalDirectory.mockResolvedValue({ success: true })

    render(<IntroModal initialStep={2} />)

    await waitFor(() => expect(api.getLocalDirectorySummary).toHaveBeenCalled(), { timeout: 5000 })
    expect(
      await screen.findByText(/42 members, 3 groups, 180 attendance logs/i),
    ).toBeInTheDocument()

    // Test backup export flow
    fireEvent.click(screen.getByRole("button", { name: "Export backup" }))
    fireEvent.change(screen.getByPlaceholderText("Backup encryption password"), {
      target: { value: "secret-pass" },
    })
    fireEvent.click(screen.getByRole("button", { name: "Save .facenox backup" }))
    await waitFor(() => expect(api.exportData).toHaveBeenCalledWith("secret-pass"))
    expect(await screen.findByText("Backup saved.")).toBeInTheDocument()

    // Test explicit migrate confirmation flow
    fireEvent.click(screen.getByRole("button", { name: "Migrate local data" }))
    const confirmMigrateBtn = screen.getByRole("button", { name: /Yes, migrate & pair/i })
    expect(confirmMigrateBtn).toBeDisabled()

    fireEvent.click(
      screen.getByRole("checkbox", {
        name: /I confirm these local members and logs belong to this new Cloud location/i,
      }),
    )
    expect(confirmMigrateBtn).toBeEnabled()
    fireEvent.click(confirmMigrateBtn)

    await waitFor(() => expect(api.migrateLocalDirectory).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(api.initiateReversePairing).toHaveBeenCalledTimes(2))
  })
})
