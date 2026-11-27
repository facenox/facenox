import { describe, expect, it, vi } from 'vitest'
import { ReversePairingSessionManager, parseRetryAfterSeconds } from './reversePairingSession'

function makePayload(deviceCode: string, expiresIn = 900) {
  return {
    deviceCode,
    userCode: '123456',
    verificationUri: 'https://facenox.com/pair',
    verificationUriComplete: `https://facenox.com/pair?code=${deviceCode}`,
    expiresIn,
    interval: 3
  }
}

describe('ReversePairingSessionManager', () => {
  it('coalesces concurrent StrictMode/mount calls into a single upstream request', async () => {
    const nowMs = 1_000
    const manager = new ReversePairingSessionManager(() => nowMs)
    let resolveFetch!: (val: { success: boolean; data: ReturnType<typeof makePayload> }) => void
    const fetcher = vi.fn(
      () =>
        new Promise<{ success: boolean; data: ReturnType<typeof makePayload> }>((resolve) => {
          resolveFetch = resolve
        })
    )

    const p1 = manager.getOrInitiate({ remoteBaseUrl: 'https://facenox.com', deviceName: 'Front Desk' }, fetcher)
    const p2 = manager.getOrInitiate({ remoteBaseUrl: 'https://facenox.com', deviceName: 'Front Desk' }, fetcher)

    expect(fetcher).toHaveBeenCalledTimes(1)
    resolveFetch({ success: true, data: makePayload('dev-1', 900) })

    const [r1, r2] = await Promise.all([p1, p2])
    expect(r1.data?.deviceCode).toBe('dev-1')
    expect(r2.data?.deviceCode).toBe('dev-1')
  })

  it('reuses unexpired cached session across Back/Next navigation with remaining TTL', async () => {
    let nowMs = 10_000
    const manager = new ReversePairingSessionManager(() => nowMs)
    const fetcher = vi.fn().mockResolvedValue({ success: true, data: makePayload('dev-1', 900) })

    const first = await manager.getOrInitiate({ remoteBaseUrl: 'https://facenox.com', deviceName: 'Kiosk' }, fetcher)
    expect(first.data?.expiresIn).toBe(900)
    expect(fetcher).toHaveBeenCalledTimes(1)

    nowMs += 120_000
    const second = await manager.getOrInitiate({ remoteBaseUrl: 'https://facenox.com', deviceName: 'Kiosk' }, fetcher)
    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(second.data?.deviceCode).toBe('dev-1')
    expect(second.data?.expiresIn).toBe(780)

    // Near expiry (<= 30s remaining) forces a fresh authorization code.
    nowMs = 10_000 + 875_000
    fetcher.mockResolvedValueOnce({ success: true, data: makePayload('dev-2', 900) })
    const third = await manager.getOrInitiate({ remoteBaseUrl: 'https://facenox.com', deviceName: 'Kiosk' }, fetcher)
    expect(fetcher).toHaveBeenCalledTimes(2)
    expect(third.data?.deviceCode).toBe('dev-2')
  })

  it('bypasses cache on forceNew or changed scope and clears on matching deviceCode invalidation', async () => {
    const nowMs = 5_000
    const manager = new ReversePairingSessionManager(() => nowMs)
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce({ success: true, data: makePayload('dev-1') })
      .mockResolvedValueOnce({ success: true, data: makePayload('dev-2') })
      .mockResolvedValueOnce({ success: true, data: makePayload('dev-3') })

    await manager.getOrInitiate({ remoteBaseUrl: 'https://facenox.com', deviceName: 'Gate A' }, fetcher)
    const rotated = await manager.getOrInitiate(
      { remoteBaseUrl: 'https://facenox.com', deviceName: 'Gate A', forceNew: true },
      fetcher
    )
    expect(rotated.data?.deviceCode).toBe('dev-2')

    // Invalidating an unrelated code preserves active cache.
    manager.invalidate({ deviceCode: 'dev-1' })
    const stillActive = await manager.getOrInitiate(
      { remoteBaseUrl: 'https://facenox.com', deviceName: 'Gate A' },
      fetcher
    )
    expect(stillActive.data?.deviceCode).toBe('dev-2')
    expect(fetcher).toHaveBeenCalledTimes(2)

    // Matching invalidation clears cache.
    manager.invalidate({ deviceCode: 'dev-2' })
    const refreshed = await manager.getOrInitiate(
      { remoteBaseUrl: 'https://facenox.com', deviceName: 'Gate A' },
      fetcher
    )
    expect(refreshed.data?.deviceCode).toBe('dev-3')
    expect(fetcher).toHaveBeenCalledTimes(3)
  })

  it('enforces server 429 cooldown per server without hammering upstream before expiry', async () => {
    let nowMs = 1_000
    const manager = new ReversePairingSessionManager(() => nowMs)
    const fetcher = vi.fn().mockResolvedValueOnce({
      success: false,
      error: 'Too many pairing requests. Try again shortly.',
      retryAfterSeconds: 45
    })

    const limited = await manager.getOrInitiate({ remoteBaseUrl: 'https://facenox.com', deviceName: 'Lobby' }, fetcher)
    expect(limited.success).toBe(false)
    expect(limited.retryAfterSeconds).toBe(45)
    expect(fetcher).toHaveBeenCalledTimes(1)

    nowMs += 15_000
    const blocked = await manager.getOrInitiate(
      { remoteBaseUrl: 'https://facenox.com', deviceName: 'Lobby', forceNew: true },
      fetcher
    )
    expect(blocked.success).toBe(false)
    expect(blocked.retryAfterSeconds).toBe(30)
    expect(fetcher).toHaveBeenCalledTimes(1)

    // Different server URL has independent cooldown tracking.
    fetcher.mockResolvedValueOnce({ success: true, data: makePayload('local-dev') })
    const localResult = await manager.getOrInitiate(
      { remoteBaseUrl: 'http://localhost:3000', deviceName: 'Lobby' },
      fetcher
    )
    expect(localResult.success).toBe(true)
    expect(fetcher).toHaveBeenCalledTimes(2)

    // Original server succeeds once cooldown expires.
    nowMs += 31_000
    fetcher.mockResolvedValueOnce({ success: true, data: makePayload('recovered') })
    const recovered = await manager.getOrInitiate(
      { remoteBaseUrl: 'https://facenox.com', deviceName: 'Lobby' },
      fetcher
    )
    expect(recovered.success).toBe(true)
    expect(recovered.data?.deviceCode).toBe('recovered')
    expect(fetcher).toHaveBeenCalledTimes(3)
  })
})

describe('parseRetryAfterSeconds', () => {
  it('reads numeric headers, JSON fallback, and HTTP-date headers', () => {
    expect(parseRetryAfterSeconds(new Headers({ 'Retry-After': '42' }))).toBe(42)
    expect(parseRetryAfterSeconds(new Headers(), { retryAfter: 18 })).toBe(18)
    const futureDate = new Date(1_700_000_030_000).toUTCString()
    expect(parseRetryAfterSeconds(new Headers({ 'Retry-After': futureDate }), null, 1_700_000_000_000)).toBe(30)
    expect(parseRetryAfterSeconds(new Headers())).toBeUndefined()
  })
})
