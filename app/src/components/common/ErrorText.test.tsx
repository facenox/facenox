import { act, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { ErrorText } from "./ErrorText"
import { ErrorMessage } from "./ErrorMessage"
import { FloatingAlert } from "./FloatingAlert"
import { useUIStore } from "@/components/main/stores/uiStore"

afterEach(() => {
  useUIStore.getState().setError(null)
  vi.useRealTimers()
})

describe("error presentation verification", () => {
  it.each([
    "HTTP 500: Internal Server Error",
    "TypeError: Failed to fetch",
    "Backend not available",
  ])("keeps %s collapsed with the original diagnostic intact", (message) => {
    const { container } = render(<ErrorText message={message} />)
    expect(screen.getByText("Facenox could not complete the request.")).toBeInTheDocument()
    expect(container.querySelector("details")).not.toHaveAttribute("open")
    expect(container.querySelector("pre")?.textContent).toBe(message)
  })

  it("renders HTML diagnostics as inert text", () => {
    const message = "<html><script>window.__unsafe = true</script></html>"
    const { container } = render(<ErrorMessage message={message} />)
    expect(container.querySelector("script")).toBeNull()
    expect(container.querySelector("pre")?.textContent).toBe(message)
    expect(screen.getByRole("alert")).toBeInTheDocument()
  })

  it("does not hide actionable partial-failure messages", () => {
    const message = "Local attendance was cleared, but face templates could not be removed."
    const { container } = render(<ErrorText message={message} />)
    expect(screen.getByText(message)).toBeInTheDocument()
    expect(container.querySelector("details")).toBeNull()
  })

  it("preserves a supplied recovery instruction", () => {
    render(
      <ErrorText
        message="<html>502</html>"
        summary="Check the server address in Cloud sync settings."
      />,
    )
    expect(screen.getByText("Check the server address in Cloud sync settings.")).toBeInTheDocument()
  })

  it("reproduces the existing global-error expiry while details are open", () => {
    vi.useFakeTimers()
    function Feedback() {
      const message = useUIStore((state) => state.error)
      return message ?
          <FloatingAlert
            message={message}
            variant="error"
            onDismiss={() => useUIStore.getState().setError(null)}
          />
        : null
    }
    const { container } = render(<Feedback />)
    act(() => useUIStore.getState().setError("HTTP 500: diagnostic"))
    container.querySelector("details")!.open = true
    act(() => vi.advanceTimersByTime(4500))
    expect(useUIStore.getState().error).toBeNull()
    expect(container.querySelector("details")).toBeNull()
  })
})
