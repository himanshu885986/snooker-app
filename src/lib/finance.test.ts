import { describe, expect, it } from 'vitest'
import { dayRange, localDate } from './finance'

describe('dates', () => {
  it('gives local-day boundaries', () => {
    const { from, to } = dayRange('2026-09-26')
    expect(new Date(to).getTime() - new Date(from).getTime()).toBe(24 * 3600_000)
    expect(new Date(from).getDate()).toBe(26)
    expect(new Date(from).getHours()).toBe(0)
  })

  it('formats today and yesterday', () => {
    const now = new Date(2026, 0, 1, 10)
    expect(localDate(0, now)).toBe('2026-01-01')
    expect(localDate(-1, now)).toBe('2025-12-31')
  })
})
