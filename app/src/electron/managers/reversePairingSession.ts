export interface ReversePairingPayload {
  deviceCode: string
  userCode: string
  verificationUri: string
  verificationUriComplete: string
  expiresIn: number
  interval: number
}

export interface ReversePairingResult {
  success: boolean
  error?: string
  retryAfterSeconds?: number
  data?: ReversePairingPayload
}

export interface PendingMismatchPairing {
  remoteBaseUrl: string
  deviceName: string
  payload: Record<string, unknown>
}

export class DirectoryOriginMismatchError extends Error {
  constructor(
    message = 'This local directory belongs to another Cloud location. Reconnect to its original location or use a separate local data profile.'
  ) {
    super(message)
    this.name = 'DirectoryOriginMismatchError'
  }
}

interface CachedReversePairingSession {
  key: string
  data: ReversePairingPayload
  expiresAtMs: number
}

interface InFlightReversePairingRequest {
  key: string
  seq: number
  promise: Promise<ReversePairingResult>
}

interface RateLimitCooldown {
  untilMs: number
  message: string
}

const MIN_REUSE_TTL_MS = 30_000

/** Parses Retry-After HTTP headers or JSON retryAfter seconds into a positive integer delay. */
export function parseRetryAfterSeconds(
  headers?: Pick<Headers, 'get'> | null,
  body?: { retryAfter?: unknown } | null,
  nowEpochMs: number = Date.now()
): number | undefined {
  if (typeof body?.retryAfter === 'number' && Number.isFinite(body.retryAfter) && body.retryAfter > 0) {
    return Math.ceil(body.retryAfter)
  }

  const rawHeader = headers?.get('Retry-After')?.trim()
  if (!rawHeader) return undefined

  const asNumericSeconds = Number(rawHeader)
  if (Number.isFinite(asNumericSeconds) && asNumericSeconds > 0) {
    return Math.ceil(asNumericSeconds)
  }

  const parsedDateMs = Date.parse(rawHeader)
  if (Number.isFinite(parsedDateMs)) {
    const deltaSeconds = Math.ceil((parsedDateMs - nowEpochMs) / 1000)
    if (deltaSeconds > 0) {
      return deltaSeconds
    }
  }

  return undefined
}

/**
 * Owns the active reverse-pairing authorization session in Electron Main so
 * React StrictMode double-mounts, HMR reloads, and step/tab switches reuse
 * unexpired codes instead of re-hitting Cloud rate limits.
 */
export class ReversePairingSessionManager {
  private active: CachedReversePairingSession | null = null
  private inFlight: InFlightReversePairingRequest | null = null
  private pendingMismatch: PendingMismatchPairing | null = null
  private cooldowns = new Map<string, RateLimitCooldown>()
  private generation = 0
  private readonly now: () => number

  constructor(now: () => number = () => performance.now()) {
    this.now = now
  }

  private buildScopeKey(remoteBaseUrl: string, deviceName: string): string {
    return `${remoteBaseUrl}::${deviceName}`
  }

  async getOrInitiate(
    options: {
      remoteBaseUrl: string
      deviceName: string
      forceNew?: boolean
    },
    fetcher: () => Promise<ReversePairingResult>
  ): Promise<ReversePairingResult> {
    const { remoteBaseUrl, deviceName, forceNew = false } = options
    const scopeKey = this.buildScopeKey(remoteBaseUrl, deviceName)
    const currentNow = this.now()

    const activeCooldown = this.cooldowns.get(remoteBaseUrl)
    if (activeCooldown) {
      if (activeCooldown.untilMs > currentNow) {
        const remainingSeconds = Math.max(1, Math.ceil((activeCooldown.untilMs - currentNow) / 1000))
        return {
          success: false,
          error: activeCooldown.message,
          retryAfterSeconds: remainingSeconds
        }
      }
      this.cooldowns.delete(remoteBaseUrl)
    }

    if (!forceNew && this.active && this.active.key === scopeKey) {
      const remainingMs = this.active.expiresAtMs - currentNow
      if (remainingMs > MIN_REUSE_TTL_MS) {
        return {
          success: true,
          data: {
            ...this.active.data,
            expiresIn: Math.max(1, Math.floor(remainingMs / 1000))
          }
        }
      }
      this.active = null
    }

    if (forceNew) {
      this.active = null
      this.generation += 1
    } else if (this.inFlight && this.inFlight.key === scopeKey) {
      return this.inFlight.promise
    }

    const requestSeq = ++this.generation
    const requestPromise = (async () => {
      try {
        const result = await fetcher()
        const finishedNow = this.now()

        if (result.success && result.data) {
          this.cooldowns.delete(remoteBaseUrl)
          if (this.generation === requestSeq) {
            const ttlMs = Math.max(60, result.data.expiresIn || 900) * 1000
            this.active = {
              key: scopeKey,
              data: result.data,
              expiresAtMs: finishedNow + ttlMs
            }
          }
        } else if (result.retryAfterSeconds && result.retryAfterSeconds > 0) {
          this.cooldowns.set(remoteBaseUrl, {
            untilMs: finishedNow + result.retryAfterSeconds * 1000,
            message: result.error || 'Too many pairing requests. Try again shortly.'
          })
        }

        return result
      } finally {
        if (this.inFlight?.seq === requestSeq) {
          this.inFlight = null
        }
      }
    })()

    this.inFlight = {
      key: scopeKey,
      seq: requestSeq,
      promise: requestPromise
    }

    return requestPromise
  }

  invalidate(options?: { deviceCode?: string; clearCooldown?: boolean; remoteBaseUrl?: string }): void {
    const targetDeviceCode = options?.deviceCode
    if (!targetDeviceCode || this.active?.data.deviceCode === targetDeviceCode) {
      this.active = null
      this.generation += 1
      this.inFlight = null
    }

    if (options?.clearCooldown) {
      if (options.remoteBaseUrl) {
        this.cooldowns.delete(options.remoteBaseUrl)
      } else {
        this.cooldowns.clear()
      }
    }
  }

  getPendingMismatch(): PendingMismatchPairing | null {
    return this.pendingMismatch
  }

  /**
   * Stores a Cloud-approved credential that paused on a local directory origin mismatch,
   * returning any previously held mismatch entry so the caller can unpair it cleanly.
   */
  replacePendingMismatch(entry: PendingMismatchPairing): PendingMismatchPairing | null {
    const previous = this.pendingMismatch
    this.pendingMismatch = entry
    return previous
  }

  takePendingMismatch(remoteBaseUrl?: string): PendingMismatchPairing | null {
    const current = this.pendingMismatch
    if (!current) return null
    if (remoteBaseUrl && current.remoteBaseUrl !== remoteBaseUrl) {
      return null
    }
    this.pendingMismatch = null
    return current
  }

  async discardPendingMismatch(unpair: (entry: PendingMismatchPairing) => Promise<void>): Promise<void> {
    const current = this.pendingMismatch
    if (!current) return
    this.pendingMismatch = null
    await unpair(current)
  }
}

export const reversePairingSession = new ReversePairingSessionManager()
