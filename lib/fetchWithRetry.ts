/**
 * Fetch `url`, retrying on HTTP 429 up to `maxRetries` times.
 * Waits for the number of seconds in the `Retry-After` response header
 * (falls back to 60 s when the header is absent) before each retry.
 * After all retries are exhausted the last response body is returned as-is,
 * so the caller still receives the `{ error: 'rate_limited', resetAt }` shape
 * and can surface it appropriately.
 *
 * The `sleep` parameter is injectable for testing; in production it defaults
 * to a real setTimeout-based delay.
 */
export async function fetchWithRetry(
  url: string,
  maxRetries = 3,
  sleep: (ms: number) => Promise<void> = (ms) => new Promise(resolve => setTimeout(resolve, ms)),
): Promise<any> {
  let lastBody: any = { error: 'rate_limited' }

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const res = await fetch(url)
    if (res.status !== 429) return res.json()

    lastBody = await res.json()
    if (attempt < maxRetries - 1) {
      const retryAfterSec = parseInt(res.headers.get('Retry-After') ?? '60', 10)
      await sleep(retryAfterSec * 1_000)
    }
  }

  return lastBody
}

/**
 * Like `Promise.all(items.map(fn))` but with at most `concurrency`
 * in-flight calls at any one time.  Results are returned in the same
 * order as `items`.
 *
 * Uses a shared-index worker-pool pattern: each worker atomically claims
 * the next unclaimed index, so the pool stays saturated without
 * over-shooting the limit.
 */
export async function concurrentMap<T, R>(
  items: T[],
  fn: (item: T) => Promise<R>,
  concurrency: number,
): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let index = 0

  async function worker(): Promise<void> {
    while (index < items.length) {
      const i = index++
      results[i] = await fn(items[i])
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, worker),
  )
  return results
}
