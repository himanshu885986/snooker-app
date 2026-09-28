// Billing rules. Keep in sync with the SQL functions in supabase/migrations
// (end_frame), which apply the same rules on the server.

import type { RateRules, RateUnit } from '../data/types'

export interface PauseSpan {
  paused_at: string
  resumed_at: string | null
}

/** Playing time in whole seconds: wall-clock time minus paused time. An open pause counts up to `now`. */
export function billableSeconds(startedAt: string, pauses: PauseSpan[], now: number, endedAt?: string | null): number {
  const end = endedAt ? Date.parse(endedAt) : now
  let paused = 0
  for (const p of pauses) {
    const from = Date.parse(p.paused_at)
    const to = p.resumed_at ? Date.parse(p.resumed_at) : end
    paused += Math.max(0, to - from)
  }
  return Math.max(0, Math.floor((end - Date.parse(startedAt) - paused) / 1000))
}

/** Minutes played: seconds rounded to the nearest minute, like reading a clock. */
export function playedMinutes(seconds: number): number {
  return Math.round(seconds / 60)
}

/** Minutes charged: rounded up to a whole block, and never less than the minimum (or 1). */
export function billedMinutes(seconds: number, rules: Pick<RateRules, 'block_minutes' | 'min_minutes'> = { block_minutes: 1, min_minutes: 1 }): number {
  const block = Math.max(1, rules.block_minutes)
  return Math.max(1, rules.min_minutes, Math.ceil(playedMinutes(seconds) / block) * block)
}

export function frameAmount(seconds: number, rules: RateRules): number {
  return Math.round(billedMinutes(seconds, rules) * rules.rate_paise_per_hour / 60)
}

export function formatMinutes(minutes: number): string {
  if (minutes < 60) return `${minutes} min`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m ? `${h} hr ${m} min` : `${h} hr`
}

/** "₹7/min" or "₹100/hr" */
export function formatRate(rule: { rate_paise_per_hour: number; rate_unit: RateUnit }): string {
  return rule.rate_unit === 'minute'
    ? `${formatRupees(rule.rate_paise_per_hour / 60)}/min`
    : `${formatRupees(rule.rate_paise_per_hour)}/hr`
}

/**
 * Split an amount between `count` players so the shares always add up exactly.
 * Leftover paise go to the first players (e.g. ₹100 / 3 → 33.34, 33.33, 33.33).
 */
export function splitAmount(totalPaise: number, count: number): number[] {
  if (count < 1) throw new Error('Cannot split between zero players')
  const base = Math.floor(totalPaise / count)
  const remainder = totalPaise - base * count
  return Array.from({ length: count }, (_, i) => base + (i < remainder ? 1 : 0))
}

type Amount = { amount_paise: number; voided_at?: string | null }

/** Removed (voided) payments don't count. */
const live = <T extends Amount>(rows: T[]) => rows.filter((r) => !r.voided_at)
const total = (rows: Amount[]) => rows.reduce((sum, r) => sum + r.amount_paise, 0)

export function visitTotals(visit: { charges: Amount[]; payments: Amount[]; khata?: (Amount & { kind: string })[] }) {
  const charged = total(visit.charges)
  const paid = total(live(visit.payments))
  const onKhata = total(live(visit.khata ?? []).filter((k) => k.kind === 'charge'))
  return { charged, paid, onKhata, due: charged - paid - onKhata }
}

export function formatRupees(paise: number): string {
  const rupees = paise / 100
  return '₹' + rupees.toLocaleString('en-IN', {
    minimumFractionDigits: paise % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  })
}

export function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  const mm = String(m).padStart(2, '0')
  const ss = String(s).padStart(2, '0')
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`
}

/** Parse a rupee amount typed by staff ("7", "87.5") into paise. Returns null if invalid. */
export function parseRupees(input: string): number | null {
  const value = Number(input.trim())
  if (!input.trim() || !Number.isFinite(value) || value < 0) return null
  return Math.round(value * 100)
}

/** UPI deep link that any UPI app can pay, with the amount pre-filled. */
export function upiLink(upiId: string, payeeName: string | null, paise: number, note: string): string {
  const params = new URLSearchParams({
    pa: upiId,
    pn: payeeName || upiId,
    am: (paise / 100).toFixed(2),
    cu: 'INR',
    tn: note,
  })
  return `upi://pay?${params.toString()}`
}
