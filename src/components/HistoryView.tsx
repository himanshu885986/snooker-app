import { useCallback, useEffect, useState } from 'react'
import { useCounter } from '../counter'
import { formatRupees, visitTotals } from '../lib/billing'
import { dayRange, localDate, summarize } from '../lib/finance'
import type { ClosedVisit, History } from '../data/types'
import { Icon } from './icons'
import { formatTime, MoneyBadge } from './money'
import { Avatar, Button, Input, Modal } from './ui'

/** Admin: bills closed on a day at this shop, with the day's cash / UPI / khata totals. */
export function HistoryView() {
  const { store, state } = useCounter()
  const [date, setDate] = useState(() => localDate())
  const [history, setHistory] = useState<History | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [openId, setOpenId] = useState<string | null>(null)

  const load = useCallback(() => {
    const { from, to } = dayRange(date)
    return store.loadHistory(state.branch.id, from, to).then((h) => { setHistory(h); setError(null) }, (e: Error) => setError(e.message))
  }, [store, state.branch.id, date])
  // Reload when the day changes or anything changes (e.g. a bill closed on another device).
  useEffect(() => { void load() }, [load, state])

  const today = localDate()
  const yesterday = localDate(-1)
  const summary = history && summarize(history)
  const open = history?.visits.find((v) => v.id === openId)

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {[[today, 'Today'], [yesterday, 'Yesterday']].map(([d, label]) => (
          <button key={d} onClick={() => setDate(d)}
            className={`rounded-full px-4 py-2 text-sm font-bold ring-1 transition ${date === d ? 'bg-felt-800 text-white ring-felt-800' : 'bg-white text-stone-600 ring-stone-900/10 hover:bg-stone-50'}`}>
            {label}
          </button>
        ))}
        <Input type="date" value={date} max={today} onChange={(e) => e.target.value && setDate(e.target.value)} className="w-auto py-2 text-sm" aria-label="Pick a day" />
      </div>

      {error && <p className="mb-3 rounded-xl bg-red-50 p-3 text-sm text-red-800">{error}</p>}

      {summary && (
        <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Stat label="Collected" value={summary.collected} strong />
          <Stat label="Cash" value={summary.cash} />
          <Stat label="UPI" value={summary.upi} />
          <Stat label="Put on khata" value={summary.onKhata} />
          {summary.khataReceived > 0 && (
            <p className="col-span-full text-xs text-stone-500">Includes {formatRupees(summary.khataReceived)} of old khata received today.</p>
          )}
        </div>
      )}

      {!history ? <p className="py-6 text-center text-stone-500">Loading…</p> : history.visits.length === 0 ? (
        <div className="rounded-3xl bg-white p-8 text-center ring-1 ring-stone-900/5">
          <p className="font-semibold">No bills closed {date === today ? 'yet today' : 'on this day'}</p>
          <p className="text-sm text-stone-500">Bills appear here once they are paid or put on khata.</p>
        </div>
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2">
          {history.visits.map((v) => <HistoryRow key={v.id} visit={v} onOpen={() => setOpenId(v.id)} />)}
        </ul>
      )}

      {open && <ClosedBillDialog visit={open} onClose={() => setOpenId(null)} onChanged={load} />}
    </div>
  )
}

function Stat({ label, value, strong = false }: { label: string; value: number; strong?: boolean }) {
  return (
    <div className={`rounded-2xl px-3 py-2.5 ring-1 ${strong ? 'bg-felt-900 text-white ring-felt-900' : 'bg-white ring-stone-900/5'}`}>
      <p className={`tabular text-xl font-extrabold ${strong ? 'text-brass-300' : ''}`}>{formatRupees(value)}</p>
      <p className={`text-xs font-medium ${strong ? 'text-white/70' : 'text-stone-500'}`}>{label}</p>
    </div>
  )
}

function paidBy(visit: ClosedVisit) {
  const sums = { cash: 0, upi: 0 }
  for (const p of visit.payments) if (!p.voided_at) sums[p.mode] += p.amount_paise
  return { ...sums, khata: visitTotals(visit).onKhata }
}

function HistoryRow({ visit, onOpen }: { visit: ClosedVisit; onOpen: () => void }) {
  const { charged } = visitTotals(visit)
  const by = paidBy(visit)
  return (
    <li>
      <button onClick={onOpen}
        className="flex w-full items-center gap-3 rounded-2xl bg-white p-3 text-left shadow-sm ring-1 ring-stone-900/5 transition hover:ring-felt-600/40">
        <Avatar name={visit.player_name} className="h-10 w-10 text-sm" />
        <span className="min-w-0 flex-1">
          <span className="block truncate font-bold">{visit.player_name}</span>
          <span className="mt-0.5 flex flex-wrap items-center gap-1 text-xs text-stone-500">
            {formatTime(visit.closed_at!)}
            {by.cash > 0 && <MoneyBadge kind="cash">Cash {formatRupees(by.cash)}</MoneyBadge>}
            {by.upi > 0 && <MoneyBadge kind="upi">UPI {formatRupees(by.upi)}</MoneyBadge>}
            {by.khata > 0 && <MoneyBadge kind="khata">Khata {formatRupees(by.khata)}</MoneyBadge>}
          </span>
        </span>
        <span className="tabular font-extrabold">{formatRupees(charged)}</span>
      </button>
    </li>
  )
}

function ClosedBillDialog({ visit, onClose, onChanged }: { visit: ClosedVisit; onClose: () => void; onChanged: () => void }) {
  const { store, run, busy } = useCounter()
  const [confirm, setConfirm] = useState(false)
  const { charged } = visitTotals(visit)
  const by = paidBy(visit)

  return (
    <Modal title={visit.player_name} onClose={onClose}>
      <div className="mb-4 rounded-3xl bg-white p-4 ring-1 ring-stone-900/5">
        <p className="mb-2 text-xs text-stone-500">Closed at {formatTime(visit.closed_at!)}</p>
        <ul className="divide-y divide-dashed divide-stone-200 text-sm">
          {visit.charges.map((c) => (
            <li key={c.id} className="flex justify-between gap-3 py-2">
              <span>{c.description}{c.quantity > 1 ? ` × ${c.quantity}` : ''}</span>
              <b className="tabular">{formatRupees(c.amount_paise)}</b>
            </li>
          ))}
        </ul>
        <div className="mt-2 flex items-baseline justify-between border-t-2 border-stone-900 pt-3">
          <span className="font-bold">Total</span>
          <span className="tabular text-2xl font-extrabold">{formatRupees(charged)}</span>
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {by.cash > 0 && <MoneyBadge kind="cash">Cash {formatRupees(by.cash)}</MoneyBadge>}
          {by.upi > 0 && <MoneyBadge kind="upi">UPI {formatRupees(by.upi)}</MoneyBadge>}
          {by.khata > 0 && <MoneyBadge kind="khata">On khata {formatRupees(by.khata)}</MoneyBadge>}
        </div>
      </div>

      {confirm ? (
        <div className="rounded-2xl bg-amber-50 p-3 ring-1 ring-amber-200">
          <p className="mb-2 text-sm">
            Reopen this bill? It goes back to open bills.{by.khata > 0 && ` The ${formatRupees(by.khata)} on khata is taken off their khata.`}
            {' '}Payments already taken stay; remove any that were a mistake from the bill.
          </p>
          <div className="grid grid-cols-2 gap-2">
            <Button variant="secondary" onClick={() => setConfirm(false)}>Cancel</Button>
            <Button variant="warning" disabled={busy}
              onClick={async () => { if (await run(() => store.reopenVisit(visit.id))) { onChanged(); onClose() } }}>
              <Icon name="undo" className="h-4 w-4" /> Reopen
            </Button>
          </div>
        </div>
      ) : (
        <Button variant="secondary" className="w-full" onClick={() => setConfirm(true)}><Icon name="undo" className="h-4 w-4" /> Reopen bill</Button>
      )}
    </Modal>
  )
}
