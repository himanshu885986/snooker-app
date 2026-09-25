// Billing rules. Keep in sync with the SQL functions in supabase/schema.sql
// (end_frame), which apply the same rules on the server.

export interface PauseSpan {
  paused_at: string
  resumed_at: string | null
}

/** Minimum minutes charged for a frame that was actually played. */
export const MIN_BILLABLE_MINUTES = 1

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

/** Minutes charged: rounded to the nearest minute, like reading entry/exit times off a clock. */
export function billableMinutes(seconds: number): number {
  return Math.max(MIN_BILLABLE_MINUTES, Math.round(seconds / 60))
}

export function frameAmount(seconds: number, ratePaisePerMin: number): number {
  return billableMinutes(seconds) * ratePaisePerMin
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

export function visitTotals(visit: { charges: { amount_paise: number }[]; payments: { amount_paise: number }[] }) {
  const charged = visit.charges.reduce((sum, c) => sum + c.amount_paise, 0)
  const paid = visit.payments.reduce((sum, p) => sum + p.amount_paise, 0)
  return { charged, paid, due: charged - paid }
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
