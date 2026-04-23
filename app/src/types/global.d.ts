import type {
  PersonRemovalResponse,
  DatabaseStatsResponse,
  SimilarityThresholdResponse,
  PersonUpdateResponse,
  PersonListResponse,
  DatabaseClearResponse,
} from "@/types/recognition"

export {}

export interface UpdateInfo {
  currentVersion: string
  latestVersion: string
  hasUpdate: boolean
  releaseUrl: string
  releaseNotes: string
  publishedAt: string
  downloadUrl: string | null
  error?: string
  isOffline?: boolean
}

declare global {
  interface FacenoxWSClientAPI {
    connect: (url?: string) => Promise<void>
    send: (msg: unknown) => void
    sendRequest: (action: string, payload?: unknown, timeoutMs?: number) => Promise<unknown>
    onMessage: (handler: (msg: Record<string, unknown>) => void) => () => void
    close: () => void
  }

  interface FacenoxVideoAPI {
    start: (opts?: {
      device?: number
      width?: number
      height?: number
      fps?: number
      annotate?: boolean
    }) => Promise<boolean>
    startFast: (opts?: {
      device?: number
      width?: number
      height?: number
      fps?: number
      annotate?: boolean
    }) => Promise<boolean>
    stop: () => Promise<boolean>
    pause: () => Promise<boolean>
    resume: () => Promise<boolean>
    setDevice: (device: number) => Promise<boolean>
    onFrame: (handler: (buf: ArrayBuffer | Uint8Array) => void) => () => void
    onEvent: (handler: (evt: Record<string, unknown>) => void) => () => void
    onWebSocketBroadcast: (handler: (evt: Record<string, unknown>) => void) => () => void
  }

  interface FacenoxElectronAPI {
    minimize: () => Promise<boolean>
    maximize: () => Promise<boolean>
    close: () => Promise<boolean>
    updateSplashProgress: (progress: number) => void
    updateSplashDataStep: (step: number) => void
    reportSplashRenderedProgress: (progress: number) => void
    onSplashProgress: (callback: (update: { progress: number }) => void) => () => void
    onMaximize: (callback: () => void) => () => void
    onUnmaximize: (callback: () => void) => () => void
    getSystemStats: () => Promise<{
      cpu: number
      memory: { total: number; free: number; appUsage: number }
    }>
    getVersion: () => Promise<string>
    onAppReady: () => void
  }

  interface UpdaterAPI {
    checkForUpdates: (force?: boolean) => Promise<UpdateInfo>
    getVersion: () => Promise<string>
    openReleasePage: (url?: string) => Promise<boolean>
    onUpdateAvailable: (callback: (updateInfo: UpdateInfo) => void) => () => void
  }

  export interface DetectionOptions {
    model_type?: string
    confidence_threshold?: number
    nms_threshold?: number
    enableLiveness?: boolean
  }

  interface BackendAPI {
    getToken: () => Promise<string>
    checkAvailability: () => Promise<{
      available: boolean
      status?: number
      error?: string
    }>
    checkReadiness: () => Promise<{
      ready: boolean
      modelsLoaded: boolean
      error?: string
    }>
    getModels: () => Promise<
      Record<
        string,
        {
          name: string
          type: string
          version: string
          loaded: boolean
          size?: number
          accuracy?: number
        }
      >
    >
    getFaceStats: () => Promise<DatabaseStatsResponse>
    removePerson: (personId: string) => Promise<PersonRemovalResponse>
    updatePerson: (oldPersonId: string, newPersonId: string) => Promise<PersonUpdateResponse>
    getAllPersons: () => Promise<PersonListResponse>
    setThreshold: (threshold: number) => Promise<SimilarityThresholdResponse>
    clearDatabase: () => Promise<DatabaseClearResponse>
  }

  interface BackendReadyAPI {
    isReady: () => Promise<boolean>
  }

  interface StoreAPI {
    get: (key: string) => Promise<unknown>
    set: (key: string, value: unknown) => Promise<boolean>
    delete: (key: string) => Promise<boolean>
    getAll: () => Promise<Record<string, unknown>>
    reset: () => Promise<boolean>
  }

  interface AssetsAPI {
    listRecognitionSounds: () => Promise<{ fileName: string; url: string }[]>
  }

  interface SyncAPI {
    getConfig: () => Promise<{
      enabled: boolean
      remoteBaseUrl: string
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
    }>
    updateConfig: (updates: {
      enabled?: boolean
      remoteBaseUrl?: string
      deviceName?: string
      intervalMinutes?: number
    }) => Promise<{
      enabled: boolean
      remoteBaseUrl: string
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
    }>
    pairDevice: (input: {
      remoteBaseUrl?: string
      pairingCode: string
      deviceName?: string
    }) => Promise<{
      success: boolean
      message?: string
      error?: string
      initialSyncSucceeded?: boolean
      config?: {
        enabled: boolean
        remoteBaseUrl: string
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
    }>
    disconnectDevice: () => Promise<{
      success: boolean
      warning?: string | null
      config: {
        enabled: boolean
        remoteBaseUrl: string
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
    }>
    exportData: (password: string) => Promise<{
      success: boolean
      canceled?: boolean
      filePath?: string
      error?: string
    }>
    pickImportFile: () => Promise<{
      canceled: boolean
      filePath?: string
      error?: string
    }>
    importData: (
      password: string,
      filePath: string,
      overwrite?: boolean,
    ) => Promise<{
      success: boolean
      canceled?: boolean
      message?: string
      error?: string
    }>
    restartManager: () => Promise<{
      success: boolean
      config: {
        enabled: boolean
        remoteBaseUrl: string
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
    }>
    triggerNow: () => Promise<{
      success: boolean
      message: string
      syncedAt?: string
    }>
  }

  interface BackendServiceAPI {
    saveFaceDatabase: (databaseData: Record<string, number[]>) => Promise<unknown>
    loadFaceDatabase: () => Promise<unknown>
    removeFacePerson: (personId: string) => Promise<unknown>
    getAllFacePersons: () => Promise<unknown>
    invoke: (channel: string, ...args: unknown[]) => Promise<unknown>
    backend_ready: BackendReadyAPI
    backend: BackendAPI
    store: StoreAPI
    updater: UpdaterAPI
    assets: AssetsAPI
    sync: SyncAPI
  }

  interface Window {
    facenoxWS?: FacenoxWSClientAPI
    facenoxVideo?: FacenoxVideoAPI
    facenoxElectron?: FacenoxElectronAPI
    electronAPI: BackendServiceAPI
    __facenoxOffFrame?: () => void
  }
}
