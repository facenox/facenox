import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import type { ReactNode } from "react"
import { Sidebar } from "./Sidebar"

vi.mock("@/components/shared", () => ({
  Dropdown: () => null,
  Tooltip: ({ children }: { children: ReactNode }) => <>{children}</>,
}))
vi.mock("@/services", () => ({ updaterService: { getVersion: async () => "test" } }))

describe("Sidebar group creation", () => {
  it.each(["groups", "attendance", "group"])(
    "preserves the current %s page",
    async (activeSection) => {
      vi.spyOn(window.electronAPI.sync, "getConfig").mockResolvedValue({
        connected: false,
      } as Awaited<ReturnType<typeof window.electronAPI.sync.getConfig>>)
      const open = vi.fn()
      const navigate = vi.fn()
      const groupSection = vi.fn()
      const enrollment = vi.fn()
      const trigger = vi.fn()
      render(
        <Sidebar
          activeSection={activeSection}
          setActiveSection={navigate}
          groupInitialSection="members"
          setGroupInitialSection={groupSection}
          dropdownGroups={[]}
          dropdownValue={null}
          onCreateGroup={open}
          setTriggerCreateGroup={trigger}
          setEnrollmentState={enrollment}
          sections={[]}
          groupSections={[]}
        />,
      )
      const create = screen.getByRole("button", { name: "Create group" })
      await waitFor(() => expect(create).toBeEnabled())
      fireEvent.click(create)
      expect(open).toHaveBeenCalledOnce()
      expect(navigate).not.toHaveBeenCalled()
      expect(groupSection).not.toHaveBeenCalled()
      expect(enrollment).not.toHaveBeenCalled()
      expect(trigger).not.toHaveBeenCalled()
    },
  )
})
