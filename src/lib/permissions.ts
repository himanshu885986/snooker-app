// Who may do what. The database enforces the same rules (require_role in
// supabase/schema.sql); keep both in sync.

import type { Role } from '../data/types'

export type Action =
  /** Start/pause/resume/end frames, add players, add shop items. */
  | 'operate'
  /** Take payment and close bills. */
  | 'collect'
  /** Change frame time, cancel frames, remove items from bills. */
  | 'adjust'
  /** Shops, tables, rates, prices, staff. */
  | 'manage'

const allowed: Record<Action, Role[]> = {
  operate: ['admin', 'maintainer'],
  collect: ['admin'],
  adjust: ['admin'],
  manage: ['admin'],
}

export function can(role: Role, action: Action): boolean {
  return allowed[action].includes(role)
}

export function assertCan(role: Role, action: Action): void {
  if (can(role, action)) return
  throw new Error(allowed[action].length === 1 ? 'Only the admin can do this' : `Your role (${role}) cannot make changes`)
}

export const roleLabels: Record<Role, string> = {
  admin: 'Admin',
  maintainer: 'Maintainer',
  viewer: 'Viewer',
}

export const roleDescriptions: Record<Role, string> = {
  admin: 'Everything: money, time changes, settings and staff',
  maintainer: 'Runs tables and adds items. Cannot take payment or change times.',
  viewer: 'Can only look at tables and bills',
}

/** Indian mobile number → 10 digits, or null if it isn't one. Same rules as normalize_phone() in SQL. */
export function normalizePhone(input: string): string | null {
  let digits = input.replace(/\D/g, '')
  if (digits.length === 12 && digits.startsWith('91')) digits = digits.slice(2)
  else if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1)
  return /^[6-9]\d{9}$/.test(digits) ? digits : null
}

export function isValidPin(pin: string): boolean {
  return /^\d{4,6}$/.test(pin)
}
