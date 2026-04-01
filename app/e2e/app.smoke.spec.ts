import { expect, test, type Page, type Route } from "@playwright/test"

const group = {
  id: "group-1",
  name: "Morning Class",
  created_at: "2026-04-01T00:00:00.000Z",
  is_active: true,
  settings: {
    late_threshold_minutes: 15,
    late_threshold_enabled: false,
    class_start_time: "08:00",
    track_checkout: false,
  },
}

const member = {
  person_id: "member-1",
  group_id: "group-1",
  name: "Alice",
  joined_at: "2026-04-01T00:00:00.000Z",
  is_active: true,
  has_face_data: true,
  has_consent: true,
}

const record = {
  id: "record-1",
  person_id: "member-1",
  group_id: "group-1",
  timestamp: "2026-04-01T08:00:00.000Z",
  confidence: 0.99,
  is_manual: false,
}

const attendanceSettings = {
  late_threshold_minutes: 15,
  enable_location_tracking: false,
  enable_liveness_detection: true,
  confidence_threshold: 0.8,
  attendance_cooldown_seconds: 8,
  max_recognition_faces_per_frame: 6,
  data_retention_days: 0,
}

const timeHealth = {
  source: "system",
  current_time_utc: "2026-04-01T00:00:00.000Z",
  current_time_local: "2026-04-01T08:00:00.000+08:00",
  time_zone_name: "Asia/Manila",
  os_clock_drift_seconds: 0,
  online_verification_status: "ok",
}

function json(route: Route, data: unknown) {
  return route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify(data),
  })
}

async function routeBackend(page: Page) {
  await page.route("http://127.0.0.1:8700/**", async (route) => {
    const url = new URL(route.request().url())

    if (url.pathname === "/attendance/settings") {
      return json(route, attendanceSettings)
    }

    if (url.pathname === "/attendance/groups") {
      return json(route, [group])
    }

    if (url.pathname === "/attendance/groups/group-1/persons") {
      return json(route, [member])
    }

    if (url.pathname === "/attendance/records") {
      return json(route, [record])
    }

    if (url.pathname === "/attendance/settings/time-health") {
      return json(route, timeHealth)
    }

    if (url.pathname === "/attendance/stats") {
      return json(route, {
        total_members: 1,
        present_today: 1,
        absent_today: 0,
        late_today: 0,
      })
    }

    return json(route, {})
  })
}

async function installRuntimeMocks(page: Page, { hasSeenIntro }: { hasSeenIntro: boolean }) {
  await page.addInitScript(
    ({ hasSeenIntro: hasSeenIntroFlag }) => {
      const storeData: Record<string, unknown> = {
        quickSettings: {
          cameraMirrored: true,
          showRecognitionNames: true,
          showLandmarks: true,
        },
        audio: {
          recognitionSoundEnabled: false,
          recognitionSoundUrl: "./assets/sounds/Recognition_Success.mp3",
        },
        ui: {
          hasSeenIntro: hasSeenIntroFlag,
          sidebarCollapsed: false,
          sidebarWidth: 300,
          selectedGroupId: "group-1",
          selectedCamera: "camera-1",
          selectedCameraLabel: "Front Camera",
          groupSidebarCollapsed: false,
          activeGroupSection: "overview",
          lastRegistrationSource: null,
          lastRegistrationMode: null,
        },
      }

      const clone = <T>(value: T): T => {
        return value === undefined ? value : JSON.parse(JSON.stringify(value))
      }

      const getByPath = (target: Record<string, unknown>, key: string) => {
        return key.split(".").reduce<unknown>((current, part) => {
          if (!current || typeof current !== "object") return undefined
          return (current as Record<string, unknown>)[part]
        }, target)
      }

      const setByPath = (target: Record<string, unknown>, key: string, value: unknown) => {
        const parts = key.split(".")
        let current: Record<string, unknown> = target

        for (const part of parts.slice(0, -1)) {
          const next = current[part]
          if (!next || typeof next !== "object") {
            current[part] = {}
          }
          current = current[part] as Record<string, unknown>
        }

        current[parts[parts.length - 1]!] = value
      }

      const deleteByPath = (target: Record<string, unknown>, key: string) => {
        const parts = key.split(".")
        let current: Record<string, unknown> = target

        for (const part of parts.slice(0, -1)) {
          const next = current[part]
          if (!next || typeof next !== "object") {
            return
          }
          current = next as Record<string, unknown>
        }

        delete current[parts[parts.length - 1]!]
      }

      const cleanup = () => undefined

      Object.defineProperty(window, "electronAPI", {
        configurable: true,
        value: {
          invoke: async () => null,
          backend_ready: {
            isReady: async () => true,
          },
          backend: {
            checkAvailability: async () => ({ available: true }),
            checkReadiness: async () => ({ ready: true, modelsLoaded: true }),
            getToken: async () => "smoke-token",
            getModels: async () => ({
              face_detector: { name: "face_detector" },
              face_recognizer: { name: "face_recognizer" },
            }),
            getFaceStats: async () => ({ total_persons: 1, persons: [] }),
            removePerson: async () => ({ success: true, message: "Removed" }),
            updatePerson: async () => ({ success: true, message: "Updated", updated_records: 0 }),
            getAllPersons: async () => ({ success: true, persons: [], total_count: 0 }),
            setThreshold: async () => ({
              success: true,
              message: "Threshold updated",
              threshold: 0.6,
            }),
            clearDatabase: async () => ({ success: true, message: "Cleared", total_persons: 0 }),
          },
          store: {
            get: async (key: string) => clone(getByPath(storeData, key)),
            set: async (key: string, value: unknown) => {
              setByPath(storeData, key, clone(value))
              return true
            },
            delete: async (key: string) => {
              deleteByPath(storeData, key)
              return true
            },
            getAll: async () => clone(storeData),
            reset: async () => true,
          },
          updater: {
            checkForUpdates: async () => ({
              currentVersion: "1.0.0-beta.1",
              latestVersion: "1.0.0-beta.1",
              hasUpdate: false,
              releaseUrl: "https://github.com/facenox/facenox/releases/latest",
              releaseNotes: "",
              publishedAt: "",
              downloadUrl: null,
            }),
            getVersion: async () => "1.0.0-beta.1",
            openReleasePage: async () => true,
            onUpdateAvailable: () => cleanup,
          },
          assets: {
            listRecognitionSounds: async () => [],
          },
          sync: {
            getConfig: async () => ({
              enabled: false,
              cloudBaseUrl: "https://cloud.facenox.test",
              organizationId: "",
              organizationName: "",
              siteId: "",
              siteName: "",
              deviceId: "",
              deviceName: "Facenox Desktop",
              intervalMinutes: 15,
              lastSyncedAt: null,
              lastSyncStatus: "idle",
              lastSyncMessage: null,
              connected: false,
            }),
            updateConfig: async () => ({
              enabled: false,
              cloudBaseUrl: "https://cloud.facenox.test",
              organizationId: "",
              organizationName: "",
              siteId: "",
              siteName: "",
              deviceId: "",
              deviceName: "Facenox Desktop",
              intervalMinutes: 15,
              lastSyncedAt: null,
              lastSyncStatus: "idle",
              lastSyncMessage: null,
              connected: false,
            }),
            pairDevice: async () => ({
              success: true,
              message: "Paired successfully.",
              initialSyncSucceeded: true,
              config: {
                enabled: true,
                cloudBaseUrl: "https://cloud.facenox.test",
                organizationId: "org-1",
                organizationName: "Acme Org",
                siteId: "site-1",
                siteName: "Main Campus",
                deviceId: "device-1",
                deviceName: "Facenox Desktop",
                intervalMinutes: 15,
                lastSyncedAt: null,
                lastSyncStatus: "idle",
                lastSyncMessage: null,
                connected: true,
              },
            }),
            disconnectDevice: async () => ({
              success: true,
              warning: null,
              config: {
                enabled: false,
                cloudBaseUrl: "https://cloud.facenox.test",
                organizationId: "",
                organizationName: "",
                siteId: "",
                siteName: "",
                deviceId: "",
                deviceName: "Facenox Desktop",
                intervalMinutes: 15,
                lastSyncedAt: null,
                lastSyncStatus: "idle",
                lastSyncMessage: null,
                connected: false,
              },
            }),
            exportData: async () => ({ success: true, filePath: "backup.facenox" }),
            pickImportFile: async () => ({ canceled: true }),
            importData: async () => ({ success: true, message: "Imported" }),
            restartManager: async () => ({ success: true }),
            triggerNow: async () => ({ success: true, message: "Synced now" }),
          },
        },
      })

      Object.defineProperty(window, "facenoxElectron", {
        configurable: true,
        value: {
          minimize: async () => true,
          maximize: async () => true,
          close: async () => true,
          updateSplashProgress: () => undefined,
          updateSplashDataStep: () => undefined,
          reportSplashRenderedProgress: () => undefined,
          onSplashProgress: () => cleanup,
          onMaximize: () => cleanup,
          onUnmaximize: () => cleanup,
          onMinimize: () => cleanup,
          onRestore: () => cleanup,
          getSystemStats: async () => ({
            cpu: 0,
            memory: { total: 0, free: 0, appUsage: 0 },
          }),
          getVersion: async () => "1.0.0-beta.1",
          onAppReady: () => {
            ;(window as Window & { __facenoxAppReadyCount?: number }).__facenoxAppReadyCount =
              ((window as Window & { __facenoxAppReadyCount?: number }).__facenoxAppReadyCount ??
                0) + 1
          },
        },
      })

      const mediaDevices = {
        enumerateDevices: async () => [
          {
            kind: "videoinput",
            deviceId: "camera-1",
            label: "Front Camera",
            groupId: "group-1",
          },
        ],
        getUserMedia: async () => ({
          getTracks: () => [],
          getVideoTracks: () => [],
          getAudioTracks: () => [],
        }),
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
      }

      Object.defineProperty(navigator, "mediaDevices", {
        configurable: true,
        value: mediaDevices,
      })

      class MockWebSocket {
        static CONNECTING = 0
        static OPEN = 1
        static CLOSING = 2
        static CLOSED = 3

        url: string
        readyState = MockWebSocket.CONNECTING
        binaryType = "blob"
        onopen: ((event: Event) => void) | null = null
        onmessage: ((event: MessageEvent<string>) => void) | null = null
        onerror: (() => void) | null = null
        onclose: ((event: CloseEvent) => void) | null = null

        constructor(url: string) {
          this.url = url
          setTimeout(() => {
            this.readyState = MockWebSocket.OPEN
            this.onopen?.(new Event("open"))
          }, 0)
        }

        send() {}

        close() {
          this.readyState = MockWebSocket.CLOSED
          this.onclose?.({ code: 1000, reason: "", wasClean: true } as CloseEvent)
        }

        addEventListener() {}

        removeEventListener() {}
      }

      Object.defineProperty(window, "WebSocket", {
        configurable: true,
        value: MockWebSocket,
      })

      const originalPlay = HTMLMediaElement.prototype.play
      HTMLMediaElement.prototype.play = function () {
        void originalPlay
        return Promise.resolve()
      }
    },
    { hasSeenIntro },
  )
}

async function bootApp(page: Page, options: { hasSeenIntro: boolean }) {
  await routeBackend(page)
  await installRuntimeMocks(page, options)
  await page.goto("/")
}

test.describe("renderer smoke", () => {
  test("boots through startup and shows the intro flow for first-run state", async ({ page }) => {
    await bootApp(page, { hasSeenIntro: false })

    await expect(page.getByText("Welcome to Facenox")).toBeVisible()
    await expect(page.getByRole("button", { name: "Next" })).toBeVisible()

    await expect
      .poll(() =>
        page.evaluate(
          () =>
            (window as Window & { __facenoxAppReadyCount?: number }).__facenoxAppReadyCount ?? 0,
        ),
      )
      .toBe(1)
  })

  test("boots into the main shell with a selected group and ready controls", async ({ page }) => {
    await bootApp(page, { hasSeenIntro: true })

    await expect(page.getByText("Morning Class")).toBeVisible()
    await expect(page.getByRole("button", { name: "Start Tracking" })).toBeVisible()
    await expect(page.getByPlaceholder("Search name...")).toBeVisible()
    await expect(page.getByText("Ready")).toBeVisible()

    await expect
      .poll(() =>
        page.evaluate(
          () =>
            (window as Window & { __facenoxAppReadyCount?: number }).__facenoxAppReadyCount ?? 0,
        ),
      )
      .toBe(1)
  })
})
