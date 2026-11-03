import { act, fireEvent, screen, waitFor } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { Sync } from "./Sync"
import { createSyncConfig, getElectronAPIMock } from "@/test/mocks/electron"
import { renderWithProviders } from "@/test/utils/renderWithProviders"

describe("Cloud pairing state boundaries", () => {
  it("shows a credential error without offering fresh pairing", async () => {
    const api = getElectronAPIMock().sync
    api.getConfig.mockResolvedValue(
      createSyncConfig({
        connected: false,
        credentialError: "Unlock the system keyring.",
      }),
    )
    renderWithProviders(<Sync />)
    expect(await screen.findByText("Unlock the system keyring.")).toBeInTheDocument()
    expect(screen.queryByText("Connect to Facenox Cloud")).not.toBeInTheDocument()
    expect(api.initiateReversePairing).not.toHaveBeenCalled()
  })

  it("cannot restore a stale connected snapshot when an old save finishes after navigation", async () => {
    const api = getElectronAPIMock().sync
    let current = createSyncConfig({ connected: true })
    api.getConfig.mockImplementation(async () => current)
    let finish!: (value: typeof current) => void
    api.updateConfig.mockReturnValue(
      new Promise<typeof current>((resolve) => {
        finish = resolve
      }),
    )
    const first = renderWithProviders(<Sync />)
    fireEvent.click(await screen.findByRole("button", { name: "Advanced settings" }))
    fireEvent.click(screen.getByRole("button", { name: "Save configuration" }))
    await waitFor(() => expect(api.updateConfig).toHaveBeenCalled())
    const obsolete = current
    first.unmount()
    current = createSyncConfig({ connected: false })
    renderWithProviders(<Sync />)
    expect(await screen.findByText("Connect to Facenox Cloud")).toBeInTheDocument()
    await act(async () => {
      finish(obsolete)
    })
    expect(screen.queryByText("Connected to Facenox Cloud")).not.toBeInTheDocument()
  })

  it("discards an in-flight code when the custom endpoint is edited", async () => {
    const api = getElectronAPIMock().sync
    api.getConfig.mockResolvedValue(
      createSyncConfig({ connected: false, remoteBaseUrl: "https://first.example.test" }),
    )
    type Result = Awaited<ReturnType<SyncAPI["initiateReversePairing"]>>
    let finish!: (value: Result) => void
    api.initiateReversePairing.mockReturnValue(
      new Promise<Result>((resolve) => {
        finish = resolve
      }),
    )
    renderWithProviders(<Sync />)
    await waitFor(() => expect(api.initiateReversePairing).toHaveBeenCalledTimes(1))
    fireEvent.click(screen.getByRole("button", { name: "Advanced settings" }))
    fireEvent.change(await screen.findByPlaceholderText("Leave empty for Facenox Cloud"), {
      target: { value: "https://second.example.test" },
    })
    await act(async () => {
      finish({
        success: true,
        data: {
          deviceCode: "obsolete",
          userCode: "OLD-CODE",
          verificationUri: "https://first.example.test/pair",
          verificationUriComplete: "https://first.example.test/pair?code=OLD-CODE",
          expiresIn: 900,
          interval: 3,
        },
      })
    })
    expect(screen.queryByText("OLD-CODE")).not.toBeInTheDocument()
    expect(
      await screen.findByText("Save configuration to generate a device code for this server."),
    ).toBeInTheDocument()
    expect(api.initiateReversePairing).toHaveBeenCalledTimes(1)
    expect(api.pollDeviceAuthorization).not.toHaveBeenCalled()
  })
})
