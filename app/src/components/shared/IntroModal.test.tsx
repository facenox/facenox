import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { IntroModal } from "./IntroModal"
import { useUIStore } from "@/components/main/stores/uiStore"
import { createSyncConfig, getElectronAPIMock } from "@/test/mocks/electron"

describe("IntroModal", () => {
  beforeEach(() => {
    useUIStore.setState({
      hasSeenIntro: false,
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
    expect(
      await screen.findByRole("link", { name: /Sign in with Facenox Cloud/i }),
    ).toHaveAttribute("href", "https://facenox.com/pair?code=749120")

    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.assign(navigator, { clipboard: { writeText } })
    fireEvent.click(screen.getByRole("button", { name: "Copy code" }))
    expect(writeText).toHaveBeenCalledWith("749120")
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
    expect(screen.getByPlaceholderText("ABCD2345")).toBeInTheDocument()
  })
})
