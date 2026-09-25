import { useCallback, useEffect, useState } from 'react'
import { useCounter } from '../counter'
import { formatRupees, parseRupees } from '../lib/billing'
import { normalizePhone } from '../lib/permissions'
import type { Customer, KhataEntry, PaymentMode } from '../data/types'
import { Icon } from './icons'
import { AmountInput, formatDate, formatTime, ModePicker } from './money'
import { Avatar, Button, Input, Modal } from './ui'
import { PhoneInput } from './Login'

/** Admin: who owes the shop money, and each customer's ledger. */
export function KhataView() {
  const { state } = useCounter()
  const [search, setSearch] = useState('')
  const [openId, setOpenId] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)

  const owing = state.khata.filter((c) => c.balance_paise > 0)
  const outstanding = owing.reduce((sum, c) => sum + c.balance_paise, 0)
  const q = search.trim().toLowerCase()
  const shown = state.khata.filter((c) => !q || c.name.toLowerCase().includes(q) || c.phone.includes(q))

  return (
    <div className="mx-auto max-w-4xl p-3 sm:p-4">
      <div className="mb-4 flex items-center justify-between gap-3 rounded-3xl bg-felt-900 p-4 text-white shadow-lg shadow-felt-950/10">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-white/60">Owed to you on khata</p>
          <p className="tabular text-3xl font-extrabold text-brass-300">{formatRupees(outstanding)}</p>
          <p className="text-sm text-white/70">{owing.length} {owing.length === 1 ? 'customer' : 'customers'}</p>
        </div>
        <Button variant="glass" onClick={() => setAdding(true)}><Icon name="plus" className="h-4 w-4" /> Old khata</Button>
      </div>

      {state.khata.length > 5 && (
        <div className="relative mb-3">
          <Icon name="search" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
          <Input className="pl-9" placeholder="Search name or mobile" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
      )}

      {state.khata.length === 0 ? (
        <div className="rounded-3xl bg-white p-8 text-center ring-1 ring-stone-900/5">
          <img src="/art/receipt.png" alt="" className="mx-auto mb-3 h-16 w-16" />
          <p className="font-semibold">Nobody owes you anything</p>
          <p className="mx-auto max-w-sm text-sm text-stone-500">
            When a player can’t pay in full, open their bill and choose “Put on khata”. Use “Old khata” to copy balances from your notebook.
          </p>
        </div>
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2">
          {shown.map((c) => (
            <li key={c.id}>
              <button onClick={() => setOpenId(c.id)}
                className="flex w-full items-center gap-3 rounded-2xl bg-white p-3 text-left shadow-sm ring-1 ring-stone-900/5 transition hover:ring-felt-600/40 active:scale-[0.99]">
                <Avatar name={c.name} className="h-11 w-11 text-sm" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-bold">{c.name}</span>
                  <span className="block truncate text-xs text-stone-500">
                    {c.phone}{c.last_activity_at && ` · since ${formatDate(c.last_activity_at)}`}
                  </span>
                </span>
                <span className={`tabular text-lg font-extrabold ${c.balance_paise < 0 ? 'text-felt-700' : 'text-rose-700'}`}>
                  {c.balance_paise < 0 ? `+${formatRupees(-c.balance_paise)}` : formatRupees(c.balance_paise)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {openId && <LedgerDialog customerId={openId} onClose={() => setOpenId(null)} />}
      {adding && <AddKhataDialog onClose={() => setAdding(false)} />}
    </div>
  )
}

function LedgerDialog({ customerId, onClose }: { customerId: string; onClose: () => void }) {
  const { store, state, run, busy } = useCounter()
  const [data, setData] = useState<{ customer: Customer; entries: KhataEntry[] } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [receiving, setReceiving] = useState(false)
  const [amount, setAmount] = useState('')
  const [mode, setMode] = useState<PaymentMode>('cash')

  const load = useCallback(() => store.loadKhata(customerId).then(setData, (e: Error) => setError(e.message)), [store, customerId])
  // Reload whenever shared state changes (a payment here or on another device).
  useEffect(() => { void load() }, [load, state])

  const paise = parseRupees(amount)
  const balance = data?.customer.balance_paise ?? 0

  async function receive() {
    if (await run(() => store.receiveKhata(customerId, state.branch.id, paise!, mode))) {
      setReceiving(false)
      setAmount('')
      void load()
    }
  }

  return (
    <Modal title={data?.customer.name ?? 'Khata'} onClose={onClose}>
      {error && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-800">{error}</p>}
      {!data ? <p className="py-6 text-center text-stone-500">Loading…</p> : (
        <>
          <div className="mb-4 rounded-3xl bg-white p-4 text-center ring-1 ring-stone-900/5">
            <p className="text-sm text-stone-500">{data.customer.phone}</p>
            <p className={`tabular text-4xl font-extrabold ${balance > 0 ? 'text-rose-700' : 'text-felt-700'}`}>
              {formatRupees(Math.abs(balance))}
            </p>
            <p className="text-sm font-semibold text-stone-600">{balance > 0 ? 'owes the shop' : balance < 0 ? 'paid in advance' : 'all settled'}</p>
          </div>

          {receiving ? (
            <div className="mb-4 grid gap-2 rounded-3xl bg-white p-4 ring-1 ring-stone-900/5">
              <p className="font-bold">Receive khata payment</p>
              <AmountInput autoFocus value={amount} onChange={setAmount} placeholder={String(balance / 100)} />
              <div className="flex flex-wrap gap-2">
                {[balance, Math.round(balance / 2)].filter((v, i, a) => v > 0 && a.indexOf(v) === i).map((v) => (
                  <button key={v} type="button" onClick={() => setAmount(String(v / 100))}
                    className="rounded-full bg-chalk px-3 py-1 text-sm font-semibold ring-1 ring-stone-900/10 hover:bg-white">
                    {v === balance ? `Full ${formatRupees(v)}` : `Half ${formatRupees(v)}`}
                  </button>
                ))}
              </div>
              <ModePicker value={mode} onChange={setMode} />
              <div className="grid grid-cols-2 gap-2">
                <Button variant="secondary" onClick={() => setReceiving(false)}>Cancel</Button>
                <Button disabled={busy || !paise || paise <= 0} onClick={receive}><Icon name="check" /> Received {paise ? formatRupees(paise) : ''}</Button>
              </div>
            </div>
          ) : balance > 0 && (
            <Button className="mb-4 w-full py-3" onClick={() => { setReceiving(true); setAmount(String(balance / 100)) }}>
              <Icon name="cash" /> Receive payment
            </Button>
          )}

          <p className="mb-2 text-sm font-bold">Ledger</p>
          <ul className="divide-y divide-dashed divide-stone-200 rounded-3xl bg-white px-4 ring-1 ring-stone-900/5">
            {data.entries.length === 0 && <li className="py-4 text-center text-sm text-stone-500">No entries yet.</li>}
            {data.entries.map((e) => (
              <li key={e.id} className={`flex items-center gap-3 py-3 text-sm ${e.voided_at ? 'opacity-50' : ''}`}>
                <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-full ${e.kind === 'charge' ? 'bg-rose-100 text-rose-700' : 'bg-felt-100 text-felt-700'}`}>
                  <Icon name={e.kind === 'charge' ? 'receipt' : e.mode === 'upi' ? 'qr' : 'cash'} className="h-4 w-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className={`block font-semibold ${e.voided_at ? 'line-through' : ''}`}>
                    {e.kind === 'charge' ? (e.note ?? 'Added to khata') : `Paid by ${e.mode === 'upi' ? 'UPI' : 'cash'}`}
                  </span>
                  <span className="block text-xs text-stone-500">
                    {formatDate(e.created_at)}, {formatTime(e.created_at)}
                    {e.branch_id && state.branches.length > 1 && ` · ${state.branches.find((b) => b.id === e.branch_id)?.name ?? ''}`}
                    {e.voided_at && ' · removed'}
                  </span>
                </span>
                <b className={`tabular ${e.kind === 'charge' ? 'text-rose-700' : 'text-felt-700'}`}>
                  {e.kind === 'charge' ? '+' : '−'}{formatRupees(e.amount_paise)}
                </b>
                {!e.voided_at && !e.visit_id && (
                  <button disabled={busy} onClick={async () => { if (await run(() => store.voidKhataEntry(e.id))) void load() }}
                    className="rounded-full p-1 text-stone-400 hover:bg-red-50 hover:text-red-700" title="Remove (added by mistake)" aria-label="Remove entry">
                    <Icon name="x" className="h-4 w-4" />
                  </button>
                )}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-stone-500">Unpaid bills are removed from khata by reopening the bill in Bills → History.</p>
        </>
      )}
    </Modal>
  )
}

function AddKhataDialog({ onClose }: { onClose: () => void }) {
  const { store, state, run, busy } = useCounter()
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('From old khata notebook')
  const paise = parseRupees(amount)
  const valid = name.trim() !== '' && normalizePhone(phone) !== null && !!paise && paise > 0

  return (
    <Modal title="Add old khata" onClose={onClose}>
      <p className="mb-3 text-sm text-stone-600">Copy what a customer already owes from your notebook. If they’re already on khata, this adds to their balance.</p>
      <form className="grid gap-2" onSubmit={async (e) => {
        e.preventDefault()
        if (await run(() => store.addKhata(state.org.id, state.branch.id, name, phone, paise!, note))) onClose()
      }}>
        <Input autoFocus placeholder="Customer name" value={name} onChange={(e) => setName(e.target.value)} />
        <PhoneInput value={phone} onChange={setPhone} placeholder="Customer mobile number" />
        <AmountInput value={amount} onChange={setAmount} />
        <Input placeholder="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
        <Button type="submit" disabled={busy || !valid}><Icon name="plus" className="h-4 w-4" /> Add {paise ? formatRupees(paise) : ''} to khata</Button>
      </form>
    </Modal>
  )
}
