import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it } from "vitest"
import { IntroModal } from "./IntroModal"
import { useUIStore } from "@/components/main/stores/uiStore"
import { createSyncConfig, getElectronAPIMock } from "@/test/mocks/electron"

describe("IntroModal", () => {
  beforeEach(() => {
    useUIStore.setState({
      hasSeenIntro: false,
      pendingCloudSetup: false,
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
    expect(screen.queryByRole("button", { name: /Continue with local data/i })).not.toBeInTheDocument()
    expect(screen.queryByText("Required to continue")).not.toBeInTheDocument()

    await waitFor(() => expect(api.initiateReversePairing).toHaveBeenCalledTimes(1))
    expect(await screen.findByRole("link", { name: /Sign in with Facenox Cloud/i })).toHaveAttribute(
      "href",
      "https://facenox.cloud/pair?code=749120",
    )
  })

  it("allows continuing with local data for existing beta installations", async () => {
    const api = getElectronAPIMock().sync
    api.getConfig.mockResolvedValue(createSyncConfig({ connected: false }))

    render(<IntroModal initialStep={2} allowLocalContinue={true} />)

    const continueButton = await screen.findByRole("button", {
      name: "Continue with local data",
    })
    expect(continueButton).toBeInTheDocument()

    fireEvent.click(continueButton)
    await waitFor(() => expect(useUIStore.getState().hasSeenIntro).toBe(true), {
      timeout: 1000,
    })
  })
})
