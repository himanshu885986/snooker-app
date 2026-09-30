import { describe, expect, it, vi } from 'vitest'
import { friendlyError, isNetworkError, retryingFetch } from './network'

const ok = () => new Response('ok')
const dropped = () => Promise.reject(new TypeError('Load failed'))

describe('network', () => {
  it('recognises dropped connections from every browser', () => {
    expect(isNetworkError(new TypeError('Failed to fetch'))).toBe(true)
    expect(isNetworkError(new TypeError('Load failed'))).toBe(true)
    expect(isNetworkError(new TypeError('NetworkError when attempting to fetch resource.'))).toBe(true)
    expect(isNetworkError(new Error('Only the admin can do this'))).toBe(false)
    expect(friendlyError(new Error('Only the admin can do this'))).toBe('Only the admin can do this')
    expect(friendlyError(new TypeError('Load failed'))).toMatch(/connection/)
  })

  it('retries reads that drop, up to 3 tries', async () => {
    const base = vi.fn().mockImplementationOnce(dropped).mockImplementationOnce(dropped).mockImplementation(async () => ok())
    const res = await retryingFetch(base as typeof fetch, [0, 0])('https://x/rest/v1/tables')
    expect(await res.text()).toBe('ok')
    expect(base).toHaveBeenCalledTimes(3)
  })

  it('gives up after 3 tries', async () => {
    const base = vi.fn().mockImplementation(dropped)
    await expect(retryingFetch(base as typeof fetch, [0, 0])('https://x/rest/v1/tables')).rejects.toThrow('Load failed')
    expect(base).toHaveBeenCalledTimes(3)
  })

  it('never retries writes, which may already have been saved', async () => {
    const base = vi.fn().mockImplementation(dropped)
    await expect(retryingFetch(base as typeof fetch, [0, 0])('https://x/rest/v1/rpc/end_frame', { method: 'POST' })).rejects.toThrow()
    expect(base).toHaveBeenCalledTimes(1)
  })

  it('does not retry real errors or cancelled requests', async () => {
    const real = vi.fn().mockRejectedValue(new Error('boom'))
    await expect(retryingFetch(real as typeof fetch, [0, 0])('https://x')).rejects.toThrow('boom')
    expect(real).toHaveBeenCalledTimes(1)
    const controller = new AbortController()
    controller.abort()
    const cancelled = vi.fn().mockImplementation(dropped)
    await expect(retryingFetch(cancelled as typeof fetch, [0, 0])('https://x', { signal: controller.signal })).rejects.toThrow()
    expect(cancelled).toHaveBeenCalledTimes(1)
  })
})
