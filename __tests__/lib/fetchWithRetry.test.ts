import { fetchWithRetry, concurrentMap } from '@/lib/fetchWithRetry'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

global.fetch = jest.fn()
const mockFetch = global.fetch as jest.MockedFunction<typeof fetch>

/** Build a minimal mock Response. */
function makeRes(status: number, body: any, headers: Record<string, string> = {}): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (k: string) => headers[k.toLowerCase()] ?? null },
    json: () => Promise.resolve(body),
  } as unknown as Response
}

const ok200  = (body: any)                        => makeRes(200, body)
const rate429 = (body: any, retryAfter?: string)  =>
  makeRes(429, body, retryAfter ? { 'retry-after': retryAfter } : {})

beforeEach(() => jest.clearAllMocks())

// ---------------------------------------------------------------------------
// fetchWithRetry
// ---------------------------------------------------------------------------

describe('fetchWithRetry', () => {
  describe('non-429 response', () => {
    it('returns JSON and does not retry', async () => {
      const noSleep = jest.fn()
      mockFetch.mockResolvedValueOnce(ok200({ data: 'ok' }))

      const result = await fetchWithRetry('/url', 3, noSleep)

      expect(result).toEqual({ data: 'ok' })
      expect(mockFetch).toHaveBeenCalledTimes(1)
      expect(noSleep).not.toHaveBeenCalled()
    })
  })

  describe('429 then success', () => {
    it('retries and returns the successful body', async () => {
      const noSleep = jest.fn().mockResolvedValue(undefined)
      mockFetch
        .mockResolvedValueOnce(rate429({ error: 'rate_limited' }, '1'))
        .mockResolvedValueOnce(ok200({ data: 'ok' }))

      const result = await fetchWithRetry('/url', 3, noSleep)

      expect(result).toEqual({ data: 'ok' })
      expect(mockFetch).toHaveBeenCalledTimes(2)
    })

    it('sleeps for Retry-After seconds before retrying', async () => {
      const noSleep = jest.fn().mockResolvedValue(undefined)
      mockFetch
        .mockResolvedValueOnce(rate429({ error: 'rate_limited' }, '45'))
        .mockResolvedValueOnce(ok200({}))

      await fetchWithRetry('/url', 3, noSleep)

      expect(noSleep).toHaveBeenCalledWith(45_000)
    })

    it('falls back to 60 s when Retry-After header is absent', async () => {
      const noSleep = jest.fn().mockResolvedValue(undefined)
      mockFetch
        .mockResolvedValueOnce(rate429({ error: 'rate_limited' }))   // no header
        .mockResolvedValueOnce(ok200({}))

      await fetchWithRetry('/url', 3, noSleep)

      expect(noSleep).toHaveBeenCalledWith(60_000)
    })
  })

  describe('all attempts return 429', () => {
    it('returns the last 429 body after exhausting retries', async () => {
      const noSleep = jest.fn().mockResolvedValue(undefined)
      const limitedBody = { error: 'rate_limited', resetAt: '2024-01-01T01:00:00Z' }
      mockFetch.mockResolvedValue(rate429(limitedBody, '1'))

      const result = await fetchWithRetry('/url', 3, noSleep)

      expect(result).toEqual(limitedBody)
      expect(mockFetch).toHaveBeenCalledTimes(3)
    })

    it('does not sleep after the final failed attempt', async () => {
      const noSleep = jest.fn().mockResolvedValue(undefined)
      mockFetch.mockResolvedValue(rate429({ error: 'rate_limited' }, '30'))

      await fetchWithRetry('/url', 3, noSleep)

      // 3 attempts → 2 sleeps (between attempt 1→2 and 2→3, none after 3)
      expect(noSleep).toHaveBeenCalledTimes(2)
    })
  })

  describe('maxRetries', () => {
    it('respects a custom maxRetries value', async () => {
      const noSleep = jest.fn().mockResolvedValue(undefined)
      mockFetch.mockResolvedValue(rate429({ error: 'rate_limited' }, '1'))

      await fetchWithRetry('/url', 5, noSleep)

      expect(mockFetch).toHaveBeenCalledTimes(5)
      expect(noSleep).toHaveBeenCalledTimes(4)
    })

    it('defaults to 3 attempts', async () => {
      const noSleep = jest.fn().mockResolvedValue(undefined)
      mockFetch.mockResolvedValue(rate429({ error: 'rate_limited' }, '1'))

      await fetchWithRetry('/url', undefined, noSleep)

      expect(mockFetch).toHaveBeenCalledTimes(3)
    })
  })
})

// ---------------------------------------------------------------------------
// concurrentMap
// ---------------------------------------------------------------------------

describe('concurrentMap', () => {
  it('returns results in the same order as items', async () => {
    const result = await concurrentMap([3, 1, 2], async n => n * 10, 3)
    expect(result).toEqual([30, 10, 20])
  })

  it('handles an empty array', async () => {
    const fn = jest.fn()
    const result = await concurrentMap([], fn, 3)
    expect(result).toEqual([])
    expect(fn).not.toHaveBeenCalled()
  })

  it('handles a single item', async () => {
    const result = await concurrentMap(['x'], async s => s + '!', 3)
    expect(result).toEqual(['x!'])
  })

  it('runs at most `concurrency` items in parallel', async () => {
    let inFlight = 0
    let maxInFlight = 0

    const fn = async (item: number) => {
      inFlight++
      maxInFlight = Math.max(maxInFlight, inFlight)
      await Promise.resolve()   // yield so other workers can start
      inFlight--
      return item
    }

    await concurrentMap([1, 2, 3, 4, 5], fn, 3)
    expect(maxInFlight).toBeLessThanOrEqual(3)
  })

  it('still processes all items when concurrency > items.length', async () => {
    const fn = jest.fn(async (n: number) => n * 2)
    const result = await concurrentMap([1, 2], fn, 10)
    expect(result).toEqual([2, 4])
    expect(fn).toHaveBeenCalledTimes(2)
  })

  it('propagates a rejection from fn', async () => {
    const fn = async (n: number) => {
      if (n === 2) throw new Error('boom')
      return n
    }
    await expect(concurrentMap([1, 2, 3], fn, 2)).rejects.toThrow('boom')
  })
})
