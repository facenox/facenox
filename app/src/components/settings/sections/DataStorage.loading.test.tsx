import { act, screen, waitFor } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { DataStorage } from "./DataStorage"
import { createSyncConfig, getElectronAPIMock } from "@/test/mocks/electron"
import { renderWithProviders } from "@/test/utils/renderWithProviders"
import type { AttendanceGroup } from "@/types/recognition"

vi.mock("./hooks/useDatabaseManagement", () => ({
  useDatabaseManagement: () => ({
    handleClearAllGroups: vi.fn(),
    handlePurgeHistory: vi.fn(),
    isPurgingHistory: false,
    deletingGroup: null,
  }),
}))

const props = {
  systemData: { totalPersons: 1, totalMembers: 1, lastUpdated: "" },
  groups: [{ id: "group", name: "Group" }] as AttendanceGroup[],
  isLoading: false,
  onClearDatabase: vi.fn(),
  onNavigateToSync: vi.fn(),
}

describe("Data & storage initial configuration", () => {
  it("does not advertise Cloud setup or enable restricted actions before pairing is known", async () => {
    type Config = ReturnType<typeof createSyncConfig> & { allowKioskDirectoryManagement: boolean }
    let resolve!: (value: Config) => void
    const pending = new Promise<Config>((complete) => {
      resolve = complete
    })
    getElectronAPIMock().sync.getConfig.mockReturnValue(pending)
    renderWithProviders(<DataStorage {...props} />)
    expect(
      screen.queryByText("Want to review synced records from a browser?"),
    ).not.toBeInTheDocument()
    const danger = screen.getByRole("button", { name: /Danger zone/i })
    await act(async () => {
      danger.click()
    })
    expect(screen.getByRole("button", { name: "Delete directory" })).toBeDisabled()
    expect(screen.getByRole("button", { name: "Clear face data" })).toBeDisabled()
    await act(async () => {
      resolve({ ...createSyncConfig({ connected: true }), allowKioskDirectoryManagement: false })
    })
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Delete directory" })).toBeDisabled(),
    )
    expect(
      screen.queryByText("Want to review synced records from a browser?"),
    ).not.toBeInTheDocument()
  })

  it("does not render an Off switch before the saved auto-export state loads", async () => {
    type Config = {
      enabled: boolean
      time: string
      directory: string
      format: "combined_csv"
      lastExportedDate: null
    }
    let resolve!: (value: Config) => void
    getElectronAPIMock().autoExport.getConfig.mockReturnValue(
      new Promise<Config>((complete) => {
        resolve = complete
      }),
    )
    renderWithProviders(<DataStorage {...props} />)
    expect(
      screen.queryByRole("switch", { name: "Enable daily auto-export" }),
    ).not.toBeInTheDocument()
    expect(screen.getByText("Loading schedule…")).toBeInTheDocument()
    await act(async () => {
      resolve({
        enabled: true,
        time: "18:00",
        directory: "/reports",
        format: "combined_csv",
        lastExportedDate: null,
      })
    })
    expect(await screen.findByRole("switch", { name: "Enable daily auto-export" })).toBeChecked()
  })
})
