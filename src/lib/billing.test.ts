import { describe, expect, it } from 'vitest'
import { billableSeconds, billedMinutes, formatMinutes, formatRate, formatRupees, frameAmount, parseRupees, splitAmount } from './billing'

const t = (min: number, sec = 0) => new Date(Date.UTC(2026, 0, 1, 16, min, sec)).toISOString()

describe('billableSeconds', () => {
  it('counts wall-clock time when never paused', () => {
    expect(billableSeconds(t(0), [], Date.parse(t(20)))).toBe(1200)
  })

  it('subtracts finished pauses', () => {
    expect(billableSeconds(t(0), [{ paused_at: t(5), resumed_at: t(10) }], Date.parse(t(25)))).toBe(1200)
  })

  it('freezes while a pause is still open', () => {
    const pauses = [{ paused_at: t(10), resumed_at: null }]
    expect(billableSeconds(t(0), pauses, Date.parse(t(15)))).toBe(600)
    expect(billableSeconds(t(0), pauses, Date.parse(t(40)))).toBe(600)
  })

  it('uses the end time for finished frames', () => {
    expect(billableSeconds(t(0), [], Date.parse(t(59)), t(20))).toBe(1200)
  })
})

const perMinute = (rupees: number) => ({ rate_paise_per_hour: rupees * 6000, block_minutes: 1, min_minutes: 1 })

describe('billedMinutes', () => {
  it('per minute: rounds to the nearest minute with a 1 minute minimum', () => {
    expect(billedMinutes(0)).toBe(1)
    expect(billedMinutes(89)).toBe(1)
    expect(billedMinutes(90)).toBe(2)
    expect(billedMinutes(20 * 60 + 29)).toBe(20)
    expect(billedMinutes(20 * 60 + 30)).toBe(21)
  })

  it('hourly stations: rounds up to whole blocks, never below the minimum', () => {
    const ps = { block_minutes: 15, min_minutes: 30 }
    expect(billedMinutes(10 * 60, ps)).toBe(30)
    expect(billedMinutes(30 * 60, ps)).toBe(30)
    expect(billedMinutes(31 * 60, ps)).toBe(45)
    expect(billedMinutes(47 * 60, ps)).toBe(60)
    expect(billedMinutes(60 * 60 + 20, ps)).toBe(60) // 20 seconds over rounds down to the minute first
  })
})

describe('frameAmount', () => {
  it('per minute: minutes × rate', () => {
    expect(frameAmount(20 * 60, perMinute(7))).toBe(14000)
    expect(frameAmount(15 * 60, perMinute(9))).toBe(13500)
  })

  it('per hour: billed minutes × hourly rate ÷ 60, to the paisa', () => {
    const ps = { rate_paise_per_hour: 10000, block_minutes: 15, min_minutes: 30 }
    expect(frameAmount(47 * 60, ps)).toBe(10000)
    expect(frameAmount(75 * 60, ps)).toBe(12500)
    expect(frameAmount(50 * 60, { rate_paise_per_hour: 10000, block_minutes: 1, min_minutes: 1 })).toBe(8333)
  })
})

describe('rates and durations', () => {
  it('formats', () => {
    expect(formatRate({ rate_paise_per_hour: 42000, rate_unit: 'minute' })).toBe('₹7/min')
    expect(formatRate({ rate_paise_per_hour: 45000, rate_unit: 'minute' })).toBe('₹7.50/min')
    expect(formatRate({ rate_paise_per_hour: 10000, rate_unit: 'hour' })).toBe('₹100/hr')
    expect(formatMinutes(45)).toBe('45 min')
    expect(formatMinutes(60)).toBe('1 hr')
    expect(formatMinutes(90)).toBe('1 hr 30 min')
  })
})

describe('splitAmount', () => {
  it('splits evenly', () => {
    expect(splitAmount(17500, 2)).toEqual([8750, 8750])
  })

  it('gives leftover paise to the first players so the total is exact', () => {
    expect(splitAmount(10000, 3)).toEqual([3334, 3333, 3333])
    expect(splitAmount(701, 2)).toEqual([351, 350])
  })

  it('rejects zero players', () => {
    expect(() => splitAmount(100, 0)).toThrow()
  })
})

describe('formatting', () => {
  it('formats rupees', () => {
    expect(formatRupees(8750)).toBe('₹87.50')
    expect(formatRupees(30500)).toBe('₹305')
    expect(formatRupees(12345600)).toBe('₹1,23,456')
  })

  it('parses rupees typed by staff', () => {
    expect(parseRupees('7')).toBe(700)
    expect(parseRupees('87.5')).toBe(8750)
    expect(parseRupees('')).toBeNull()
    expect(parseRupees('abc')).toBeNull()
    expect(parseRupees('-1')).toBeNull()
  })
})
