import type { Mock } from "vitest"
import { vi } from "vitest"
import { DEFAULT_CLOUD_BASE_URL, DEFAULT_SYNC_INTERVAL_MINUTES } from "@/services/remoteSyncDefaults"

export interface MockSyncConfig {
  enabled: boolean
  cloudBaseUrl: string
  organizationId: string
  organizationName: string
  siteId: string
  siteName: string
  deviceId: string
  deviceName: string
  intervalMinutes: number
  lastSyncedAt: string | null
  lastSyncStatus: "idle" | "success" | "error"
  lastSyncMessage: string | null
  connected: boolean
}

export interface MockElectronAPI extends BackendServiceAPI {
  invoke: Mock
  backend_ready: {
    isReady: Mock
  }
  backend: {
    checkAvailability: Mock
    checkReadiness: Mock
    getToken: Mock
    getModels: Mock
    getFaceStats: Mock
    removePerson: Mock
    updatePerson: Mock
    getAllPersons: Mock
    setThreshold: Mock
    clearDatabase: Mock
  }
  store: {
    get: Mock
    set: Mock
    delete: Mock
    getAll: Mock
    reset: Mock
  }
  updater: {
    checkForUpdates: Mock
    getVersion: Mock
    openReleasePage: Mock
    onUpdateAvailable: Mock
  }
  assets: {
    listRecognitionSounds: Mock
  }
  sync: {
    getConfig: Mock
    updateConfig: Mock
    pairDevice: Mock
    disconnectDevice: Mock
    exportData: Mock
    pickImportFile: Mock
    importData: Mock
    restartManager: Mock
    triggerNow: Mock
  }
}

export interface MockFacenoxElectronAPI extends FacenoxElectronAPI {
  minimize: Mock
  maximize: Mock
  close: Mock
  updateSplashProgress: Mock
  updateSplashDataStep: Mock
  reportSplashRenderedProgress: Mock
  onSplashProgress: Mock
  onMaximize: Mock
  onUnmaximize: Mock
  onMinimize: Mock
  onRestore: Mock
  getSystemStats: Mock
  getVersion: Mock
  onAppReady: Mock
}

export function createSyncConfig(overrides: Partial<MockSyncConfig> = {}): MockSyncConfig {
  return {
    enabled: false,
    cloudBaseUrl: DEFAULT_CLOUD_BASE_URL,
    organizationId: "",
    organizationName: "",
    siteId: "",
    siteName: "",
    deviceId: "",
    deviceName: "Facenox Desktop",
    intervalMinutes: DEFAULT_SYNC_INTERVAL_MINUTES,
    lastSyncedAt: null,
    lastSyncStatus: "idle",
    lastSyncMessage: null,
    connected: false,
    ...overrides,
  }
}

export function createElectronAPIMock(): MockElectronAPI {
  const defaultSyncConfig = createSyncConfig()

  return {
    invoke: vi.fn(),
    backend_ready: {
      isReady: vi.fn().mockResolvedValue(true),
    },
    backend: {
      checkAvailability: vi.fn().mockResolvedValue({ available: true }),
      checkReadiness: vi.fn().mockResolvedValue({ ready: true, modelsLoaded: true }),
      getToken: vi.fn().mockResolvedValue("test-token"),
      getModels: vi.fn().mockResolvedValue({}),
      getFaceStats: vi.fn().mockResolvedValue({ total_persons: 0, persons: [] }),
      removePerson: vi.fn().mockResolvedValue({ success: true, message: "Removed" }),
      updatePerson: vi.fn().mockResolvedValue({
        success: true,
        message: "Updated",
        updated_records: 0,
      }),
      getAllPersons: vi.fn().mockResolvedValue({ success: true, persons: [], total_count: 0 }),
      setThreshold: vi.fn().mockResolvedValue({
        success: true,
        message: "Threshold updated",
        threshold: 0.6,
      }),
      clearDatabase: vi.fn().mockResolvedValue({
        success: true,
        message: "Cleared",
        total_persons: 0,
      }),
    },
    store: {
      get: vi.fn().mockResolvedValue(undefined),
      set: vi.fn().mockResolvedValue(true),
      delete: vi.fn().mockResolvedValue(true),
      getAll: vi.fn().mockResolvedValue({}),
      reset: vi.fn().mockResolvedValue(true),
    },
    updater: {
      checkForUpdates: vi.fn().mockResolvedValue({
        currentVersion: "1.0.0-beta.1",
        latestVersion: "1.0.0-beta.1",
        hasUpdate: false,
        releaseUrl: "https://github.com/facenox/facenox/releases/latest",
        releaseNotes: "",
        publishedAt: "",
        downloadUrl: null,
      }),
      getVersion: vi.fn().mockResolvedValue("1.0.0-beta.1"),
      openReleasePage: vi.fn().mockResolvedValue(true),
      onUpdateAvailable: vi.fn().mockReturnValue(() => undefined),
    },
    assets: {
      listRecognitionSounds: vi.fn().mockResolvedValue([]),
    },
    sync: {
      getConfig: vi.fn().mockResolvedValue(defaultSyncConfig),
      updateConfig: vi.fn().mockResolvedValue(defaultSyncConfig),
      pairDevice: vi.fn().mockResolvedValue({
        success: true,
        message: "Device paired successfully.",
        initialSyncSucceeded: true,
        config: createSyncConfig({ connected: true }),
      }),
      disconnectDevice: vi.fn().mockResolvedValue({
        success: true,
        warning: null,
        config: defaultSyncConfig,
      }),
      exportData: vi.fn().mockResolvedValue({ success: true, filePath: "backup.facenox" }),
      pickImportFile: vi.fn().mockResolvedValue({ canceled: true }),
      importData: vi.fn().mockResolvedValue({ success: true, message: "Imported" }),
      restartManager: vi.fn().mockResolvedValue({ success: true, config: defaultSyncConfig }),
      triggerNow: vi.fn().mockResolvedValue({ success: true, message: "Synced now" }),
    },
  }
}

export function createFacenoxElectronMock(): MockFacenoxElectronAPI {
  return {
    minimize: vi.fn().mockResolvedValue(true),
    maximize: vi.fn().mockResolvedValue(true),
    close: vi.fn().mockResolvedValue(true),
    updateSplashProgress: vi.fn(),
    updateSplashDataStep: vi.fn(),
    reportSplashRenderedProgress: vi.fn(),
    onSplashProgress: vi.fn().mockReturnValue(() => undefined),
    onMaximize: vi.fn().mockReturnValue(() => undefined),
    onUnmaximize: vi.fn().mockReturnValue(() => undefined),
    onMinimize: vi.fn().mockReturnValue(() => undefined),
    onRestore: vi.fn().mockReturnValue(() => undefined),
    getSystemStats: vi.fn().mockResolvedValue({
      cpu: 0,
      memory: { total: 0, free: 0, appUsage: 0 },
    }),
    getVersion: vi.fn().mockResolvedValue("1.0.0-beta.1"),
    onAppReady: vi.fn(),
  }
}

export function getElectronAPIMock(): MockElectronAPI {
  return window.electronAPI as MockElectronAPI
}
