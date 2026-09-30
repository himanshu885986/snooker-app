// Coping with shop Wi-Fi and mobile data: retry reads, explain failures in plain words.

/** True for "the request never got an answer" errors (Chrome: Failed to fetch, Safari: Load failed, Firefox: NetworkError). */
export function isNetworkError(e: unknown): boolean {
  const message = e instanceof Error ? e.message : String(e)
  return /failed to fetch|load failed|networkerror|network request failed|fetch failed|the internet connection appears to be offline/i.test(message)
}

export function friendlyError(e: unknown): string {
  if (isNetworkError(e)) {
    return typeof navigator !== 'undefined' && navigator.onLine === false
      ? 'No internet connection. Check the Wi-Fi or mobile data and try again.'
      : 'Couldn’t reach the server. Check the connection; if you retry, check it wasn’t already saved.'
  }
  return e instanceof Error ? e.message : String(e)
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * fetch that retries reads (GET/HEAD) when the network drops, up to 3 tries.
 * Writes are never retried: a dropped write may already have been saved.
 */
export function retryingFetch(baseFetch: typeof fetch = fetch, delays = [400, 1200]): typeof fetch {
  return async (input, init) => {
    const method = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase()
    const retryable = method === 'GET' || method === 'HEAD'
    for (let attempt = 0; ; attempt++) {
      try {
        return await baseFetch(input, init)
      } catch (e) {
        const aborted = init?.signal?.aborted || (e instanceof DOMException && e.name === 'AbortError')
        if (!retryable || aborted || attempt >= delays.length || !isNetworkError(e)) throw e
        await sleep(delays[attempt])
      }
    }
  }
}
