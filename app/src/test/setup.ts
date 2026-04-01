import "@testing-library/jest-dom/vitest"
import { cleanup } from "@testing-library/react"
import { afterEach, beforeEach, vi } from "vitest"
import { createElectronAPIMock, createFacenoxElectronMock } from "@/test/mocks/electron"

beforeEach(() => {
  if (typeof window === "undefined") {
    return
  }

  Object.defineProperty(window, "electronAPI", {
    configurable: true,
    writable: true,
    value: createElectronAPIMock(),
  })

  Object.defineProperty(window, "facenoxElectron", {
    configurable: true,
    writable: true,
    value: createFacenoxElectronMock(),
  })

  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  })
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  vi.restoreAllMocks()
})
