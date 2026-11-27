/**
 * Retry reads and explicitly replay-safe writes after a network failure.
 */
export async function fetchWithRetry(
  url: string,
  options: RequestInit = {},
  {
    retries = 20,
    backoff = 1.5,
    maxDelay = 3000,
    retryWrite = false
  }: { retries?: number; backoff?: number; maxDelay?: number; retryWrite?: boolean } = {}
): Promise<Response> {
  const method = (options.method ?? 'GET').toUpperCase()
  const safeToRetry = retryWrite || ['GET', 'HEAD', 'OPTIONS'].includes(method)

  const makeRequest = async (attempt: number): Promise<Response> => {
    try {
      return await fetch(url, options)
    } catch (error) {
      // Only retry on network errors (fetch failure)
      if (safeToRetry && error instanceof TypeError && error.message === 'Failed to fetch' && attempt <= retries) {
        const calculatedDelay = 500 * Math.pow(backoff, attempt - 1)
        const delay = Math.min(calculatedDelay, maxDelay)

        await new Promise((resolve) => setTimeout(resolve, delay))
        return makeRequest(attempt + 1)
      }
      throw error
    }
  }

  return makeRequest(1)
}
