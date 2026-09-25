import { describe, expect, it } from 'vitest'
import { can, isValidPin, normalizePhone } from './permissions'

describe('permissions', () => {
  it('matches the role table', () => {
    expect(can('admin', 'collect')).toBe(true)
    expect(can('maintainer', 'operate')).toBe(true)
    expect(can('maintainer', 'collect')).toBe(false)
    expect(can('maintainer', 'adjust')).toBe(false)
    expect(can('viewer', 'operate')).toBe(false)
  })
  it('normalizes Indian mobile numbers', () => {
    expect(normalizePhone('+91 98765 43210')).toBe('9876543210')
    expect(normalizePhone('09876543210')).toBe('9876543210')
    expect(normalizePhone('12345')).toBeNull()
    expect(normalizePhone('5876543210')).toBeNull()
  })
  it('checks PIN format', () => {
    expect(isValidPin('1234')).toBe(true)
    expect(isValidPin('123456')).toBe(true)
    expect(isValidPin('123')).toBe(false)
    expect(isValidPin('12a4')).toBe(false)
  })
})
