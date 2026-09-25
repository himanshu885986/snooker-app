import { describe, expect, it } from 'vitest'
import { billableMinutes, billableSeconds, formatRupees, frameAmount, parseRupees, splitAmount } from './billing'

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

describe('billableMinutes', () => {
  it('rounds to the nearest minute with a 1 minute minimum', () => {
    expect(billableMinutes(0)).toBe(1)
    expect(billableMinutes(89)).toBe(1)
    expect(billableMinutes(90)).toBe(2)
    expect(billableMinutes(20 * 60 + 29)).toBe(20)
    expect(billableMinutes(20 * 60 + 30)).toBe(21)
  })
})

describe('frameAmount', () => {
  it('charges minutes × table rate', () => {
    expect(frameAmount(20 * 60, 700)).toBe(14000)
    expect(frameAmount(15 * 60, 900)).toBe(13500)
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
