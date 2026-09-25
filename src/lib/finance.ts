// Day totals for the payment history screen.

import { visitTotals } from './billing'
import type { History, PaymentMode } from '../data/types'

export interface DaySummary {
  bills: number
  /** Value of all bills closed in the period. */
  billed: number
  cash: number
  upi: number
  /** Left unpaid and moved to customers' khata. */
  onKhata: number
  /** Khata money received (already included in cash / upi). */
  khataReceived: number
  /** cash + upi */
  collected: number
}

export function summarize(history: History): DaySummary {
  const byMode: Record<PaymentMode, number> = { cash: 0, upi: 0 }
  let billed = 0
  let onKhata = 0
  for (const visit of history.visits) {
    const totals = visitTotals(visit)
    billed += totals.charged
    onKhata += totals.onKhata
    for (const p of visit.payments) if (!p.voided_at) byMode[p.mode] += p.amount_paise
  }
  let khataReceived = 0
  for (const e of history.khataPayments) {
    if (e.voided_at || !e.mode) continue
    byMode[e.mode] += e.amount_paise
    khataReceived += e.amount_paise
  }
  return {
    bills: history.visits.length, billed, onKhata, khataReceived,
    cash: byMode.cash, upi: byMode.upi, collected: byMode.cash + byMode.upi,
  }
}

/** Local-time day boundaries as ISO strings, for a yyyy-mm-dd date. */
export function dayRange(date: string): { from: string; to: string } {
  const [y, m, d] = date.split('-').map(Number)
  const start = new Date(y, m - 1, d)
  const end = new Date(y, m - 1, d + 1)
  return { from: start.toISOString(), to: end.toISOString() }
}

/** Today's date as yyyy-mm-dd in local time. */
export function localDate(offsetDays = 0, now = new Date()): string {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offsetDays)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
