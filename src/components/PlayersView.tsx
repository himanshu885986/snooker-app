import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import { useCounter } from '../counter'
import { formatRupees, parseRupees, upiLink, visitTotals } from '../lib/billing'
import { normalizePhone } from '../lib/permissions'
import { foodImageUrl, productImageId } from '../lib/foodImages'
import type { Charge, OpenVisit, PaymentMode } from '../data/types'
import { HistoryView } from './HistoryView'
import { Icon } from './icons'
import { PhoneInput } from './Login'
import { AmountInput, formatTime, MoneyBadge, ModePicker } from './money'
import { Avatar, Button, Input, Modal } from './ui'

export function PlayersView() {
  const { can } = useCounter()
  const [view, setView] = useState<'open' | 'history'>('open')

  return (
    <div className="mx-auto max-w-4xl p-3 sm:p-4">
      {can('collect') && (
        <div className="mb-4 grid grid-cols-2 gap-1 rounded-2xl bg-stone-900/5 p-1 text-sm font-bold">
          {([['open', 'Open bills', 'receipt'], ['history', 'History', 'history']] as const).map(([id, label, icon]) => (
            <button key={id} onClick={() => setView(id)}
              className={`flex items-center justify-center gap-2 rounded-xl py-2.5 transition ${view === id ? 'bg-white text-felt-900 shadow-sm' : 'text-stone-500'}`}>
              <Icon name={icon} className="h-4 w-4" /> {label}
            </button>
          ))}
        </div>
      )}
      {view === 'history' && can('collect') ? <HistoryView /> : <OpenBills />}
    </div>
  )
}

function OpenBills() {
  const { state, can } = useCounter()
  const [openId, setOpenId] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)

  const tableOf = playingTables()
  const total = state.openVisits.reduce((sum, v) => sum + visitTotals(v).due, 0)

  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-3 rounded-3xl bg-felt-900 p-4 text-white shadow-lg shadow-felt-950/10">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-white/60">To collect</p>
          <p className="tabular text-3xl font-extrabold text-brass-300">{formatRupees(total)}</p>
          <p className="text-sm text-white/70">{state.openVisits.length} open {state.openVisits.length === 1 ? 'bill' : 'bills'}</p>
        </div>
        {can('operate') && <Button variant="glass" onClick={() => setAdding(true)}><Icon name="plus" className="h-4 w-4" /> Add player</Button>}
      </div>

      {state.openVisits.length === 0 && (
        <div className="rounded-3xl bg-white p-8 text-center ring-1 ring-stone-900/5">
          <img src="/art/receipt.png" alt="" className="mx-auto mb-3 h-16 w-16" />
          <p className="font-semibold">No open bills</p>
          <p className="text-sm text-stone-500">Players are added when a frame starts, or with “Add player”.</p>
        </div>
      )}

      <ul className="grid gap-2 sm:grid-cols-2">
        {state.openVisits.map((v) => {
          const table = tableOf.get(v.id)
          const items = v.charges.filter((c) => c.source === 'item').reduce((n, c) => n + c.quantity, 0)
          const frames = v.charges.filter((c) => c.source === 'frame').length
          return (
            <li key={v.id}>
              <button onClick={() => setOpenId(v.id)}
                className="flex w-full items-center gap-3 rounded-2xl bg-white p-3 text-left shadow-sm ring-1 ring-stone-900/5 transition hover:ring-felt-600/40 active:scale-[0.99]">
                <Avatar name={v.player_name} className="h-11 w-11 text-sm" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-bold">{v.player_name}</span>
                  <span className="block truncate text-xs text-stone-500">
                    {table
                      ? <span className="font-semibold text-red-700">● Playing on {table}</span>
                      : `${frames} lost ${frames === 1 ? 'frame' : 'frames'} · ${items} ${items === 1 ? 'item' : 'items'}`}
                  </span>
                </span>
                <span className="text-right">
                  <span className="tabular block text-lg font-extrabold">{formatRupees(visitTotals(v).due)}</span>
                  {visitTotals(v).paid > 0 && <span className="block text-[11px] font-semibold text-felt-600">{formatRupees(visitTotals(v).paid)} paid</span>}
                </span>
              </button>
            </li>
          )
        })}
      </ul>

      {openId && <BillDialog visitId={openId} onClose={() => setOpenId(null)} />}
      {adding && <AddPlayerDialog onClose={() => setAdding(false)} />}
    </div>
  )

  function playingTables() {
    const map = new Map<string, string>()
    for (const f of state.activeFrames) {
      const name = state.tables.find((t) => t.id === f.table_id)?.name ?? 'a table'
      for (const p of f.players) map.set(p.visit_id, name)
    }
    return map
  }
}

function AddPlayerDialog({ onClose }: { onClose: () => void }) {
  const { store, state, run, busy } = useCounter()
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  return (
    <Modal title="Add player" onClose={onClose}>
      <p className="mb-3 text-sm text-stone-600">For someone buying items without playing yet, or waiting for a table.</p>
      <form
        className="grid gap-2"
        onSubmit={async (e) => {
          e.preventDefault()
          if (await run(() => store.openVisit(state.branch.id, { player_name: name, phone: phone || null }))) onClose()
        }}
      >
        <Input autoFocus placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} />
        <Input placeholder="Phone (optional)" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
        <Button type="submit" disabled={busy || !name.trim()}>Open bill</Button>
      </form>
    </Modal>
  )
}

function BillDialog({ visitId, onClose }: { visitId: string; onClose: () => void }) {
  const { state } = useCounter()
  const visit = state.openVisits.find((v) => v.id === visitId)
  // Checked out (here or on another device): close the dialog.
  useEffect(() => { if (!visit) onClose() }, [visit, onClose])
  if (!visit) return null
  return <BillBody visit={visit} onClose={onClose} />
}

function BillBody({ visit, onClose }: { visit: OpenVisit; onClose: () => void }) {
  const { store, state, run, busy, can } = useCounter()
  const [view, setView] = useState<'bill' | 'items' | 'upi' | 'cash' | 'part' | 'khata'>('bill')
  const { charged, paid, due } = visitTotals(visit)
  const playing = state.activeFrames.some((f) => f.players.some((p) => p.visit_id === visit.id))
  const khataDue = visit.customer_id ? state.khata.find((c) => c.id === visit.customer_id)?.balance_paise ?? 0 : 0
  const payments = visit.payments.filter((p) => !p.voided_at)

  const checkout = async (mode: PaymentMode) => { if (await run(() => store.checkout(visit.id, mode))) onClose() }

  if (view === 'items') {
    return (
      <Modal title={`Add item · ${visit.player_name}`} onClose={onClose}>
        <ItemPicker visitId={visit.id} />
        <Button variant="primary" className="mt-4 w-full" onClick={() => setView('bill')}>
          <Icon name="check" /> Done · bill is {formatRupees(due)}
        </Button>
      </Modal>
    )
  }

  if (view === 'cash') {
    return (
      <Modal title={`Cash · ${visit.player_name}`} onClose={onClose}>
        <div className="rounded-3xl bg-white p-6 text-center ring-1 ring-stone-900/5">
          <img src="/art/money.png" alt="" className="mx-auto mb-2 h-14 w-14" />
          <p className="text-sm text-stone-500">Collect in cash</p>
          <p className="tabular text-5xl font-extrabold">{formatRupees(due)}</p>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <Button variant="secondary" onClick={() => setView('bill')}>Back</Button>
          <Button disabled={busy} onClick={() => checkout('cash')}><Icon name="check" /> Cash received</Button>
        </div>
      </Modal>
    )
  }

  if (view === 'part') {
    return <PartPayment visit={visit} due={due} onBack={() => setView('bill')} />
  }

  if (view === 'khata') {
    return <PutOnKhata visit={visit} due={due} onBack={() => setView('bill')} onDone={onClose} />
  }

  if (view === 'upi') {
    return (
      <Modal title={`UPI · ${visit.player_name}`} onClose={onClose}>
        <UpiPanel amount={due} note={`${state.branch.name} · ${visit.player_name}`} />
        <div className="mt-4 grid grid-cols-2 gap-2">
          <Button variant="secondary" onClick={() => setView('bill')}>Back</Button>
          <Button disabled={busy || !state.branch.upi_id} onClick={() => checkout('upi')}><Icon name="check" /> UPI received</Button>
        </div>
      </Modal>
    )
  }

  const lines = billLines(visit.charges, state.products)

  return (
    <Modal title={visit.player_name} onClose={onClose}>
      <div className="mb-4 rounded-3xl bg-white p-4 ring-1 ring-stone-900/5">
        {lines.length === 0 ? (
          <p className="py-4 text-center text-stone-500">Nothing to pay yet.</p>
        ) : (
          <ul className="divide-y divide-dashed divide-stone-200">
            {lines.map((line) => (
              <li key={line.key} className="flex items-center gap-3 py-2.5 text-sm">
                {line.image
                  ? <img src={foodImageUrl(line.image)} alt="" className="h-9 w-9 shrink-0" />
                  : <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-felt-800 text-white"><Icon name="clock" className="h-4 w-4" /></span>}
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold">{line.title}{line.quantity > 1 ? ` × ${line.quantity}` : ''}</span>
                  {line.detail && <span className="block text-xs text-stone-500">{line.detail}</span>}
                </span>
                <b className="tabular">{formatRupees(line.amount)}</b>
                {line.removeId && can('adjust') && (
                  <button
                    disabled={busy}
                    onClick={() => run(() => store.removeItem(line.removeId!))}
                    className="rounded-full p-1 text-stone-400 hover:bg-red-50 hover:text-red-700"
                    aria-label={`Remove one ${line.title}`}
                    title="Remove one"
                  ><Icon name="x" className="h-4 w-4" /></button>
                )}
              </li>
            ))}
          </ul>
        )}
        {paid > 0 && (
          <>
            <div className="mt-2 flex justify-between border-t border-stone-200 pt-2 text-sm">
              <span className="text-stone-500">Bill total</span><b className="tabular">{formatRupees(charged)}</b>
            </div>
            <ul className="text-sm">
              {payments.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-2 py-1">
                  <span className="flex items-center gap-2 text-felt-700">
                    <MoneyBadge kind={p.mode}>{p.mode === 'cash' ? 'Cash' : 'UPI'}</MoneyBadge> paid at {formatTime(p.created_at)}
                  </span>
                  <span className="flex items-center gap-1">
                    <b className="tabular text-felt-700">−{formatRupees(p.amount_paise)}</b>
                    {can('collect') && (
                      <button disabled={busy} onClick={() => run(() => store.voidPayment(p.id))}
                        className="rounded-full p-1 text-stone-400 hover:bg-red-50 hover:text-red-700" title="Remove (recorded by mistake)" aria-label="Remove payment">
                        <Icon name="x" className="h-4 w-4" />
                      </button>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
        <div className="mt-2 flex items-baseline justify-between border-t-2 border-stone-900 pt-3">
          <span className="font-bold">{paid > 0 ? 'Left to pay' : 'Total'}</span>
          <span className="tabular text-3xl font-extrabold">{formatRupees(due)}</span>
        </div>
      </div>

      {can('collect') && khataDue > 0 && (
        <p className="mb-3 flex items-center gap-2 rounded-2xl bg-rose-50 p-3 text-sm text-rose-900 ring-1 ring-rose-200">
          <Icon name="book" className="h-4 w-4 shrink-0" />
          <span>{visit.player_name} already owes <b>{formatRupees(khataDue)}</b> on khata. Collect it in the Khata tab.</span>
        </p>
      )}

      {can('operate') && (
        <Button variant="secondary" className="mb-3 w-full" onClick={() => setView('items')}>
          <img src="/food/noodles.png" alt="" className="h-6 w-6" /> Add food, drinks, cigarettes
        </Button>
      )}

      {!can('collect') ? (
        <p className="rounded-2xl bg-stone-100 p-3 text-sm text-stone-600">Only the admin can take payment and close bills.</p>
      ) : playing ? (
        <p className="rounded-2xl bg-amber-100 p-3 text-sm font-medium text-amber-900">
          {visit.player_name} is in a running frame. End that frame before checkout.
        </p>
      ) : due === 0 ? (
        <Button className="w-full" disabled={busy} onClick={() => checkout('cash')}>Close bill (nothing to pay)</Button>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <Button className="py-3" onClick={() => setView('cash')}><Icon name="cash" /> Cash</Button>
          <Button variant="brass" className="py-3" onClick={() => setView('upi')}><Icon name="qr" /> UPI</Button>
          <Button variant="secondary" className="text-sm" onClick={() => setView('part')}>Part payment</Button>
          <Button variant="secondary" className="text-sm" onClick={() => setView('khata')}><Icon name="book" className="h-4 w-4" /> Put on khata</Button>
        </div>
      )}
    </Modal>
  )
}

interface BillLine {
  key: string
  title: string
  detail: string | null
  quantity: number
  amount: number
  /** Picture id for shop items; null for frame charges. */
  image: string | null
  /** Charge removed by the × button: the most recent one of a grouped item. */
  removeId: string | null
}

/** Frame charges one per line; the same shop item bought several times shown as one line ("Cold drink × 2"). */
function billLines(charges: Charge[], products: { id: string; name: string; image: string | null }[]): BillLine[] {
  const lines: BillLine[] = []
  const items = new Map<string, BillLine>()
  for (const c of charges) {
    if (c.source === 'frame') {
      // "Table 1 · lost frame · 20 min (split 2 ways)" → title + detail
      const [table, , rest] = c.description.split(' · ')
      lines.push({ key: c.id, title: `${table} · lost frame`, detail: rest ?? null, quantity: 1, amount: c.amount_paise, image: null, removeId: null })
      continue
    }
    const unit = c.amount_paise / c.quantity
    const groupKey = `${c.product_id}:${c.description}:${unit}`
    const line = items.get(groupKey)
    if (line) {
      line.quantity += c.quantity
      line.amount += c.amount_paise
      line.removeId = c.id
    } else {
      const product = products.find((p) => p.id === c.product_id)
      const created: BillLine = {
        key: c.id, title: c.description, detail: `${formatRupees(unit)} each`, quantity: c.quantity, amount: c.amount_paise,
        image: productImageId(product ?? { name: c.description }), removeId: c.id,
      }
      items.set(groupKey, created)
      lines.push(created)
    }
  }
  return lines
}

function ItemPicker({ visitId }: { visitId: string }) {
  const { store, state, run, busy } = useCounter()
  const [added, setAdded] = useState<Record<string, number>>({})

  if (state.products.length === 0) return <p className="text-stone-500">No products yet. The admin can add them in Settings.</p>

  return (
    <div className="grid grid-cols-3 gap-2">
      {state.products.map((p) => (
        <button
          key={p.id}
          disabled={busy}
          onClick={async () => {
            if (await run(() => store.addItem(visitId, p.id, 1))) setAdded((a) => ({ ...a, [p.id]: (a[p.id] ?? 0) + 1 }))
          }}
          className={`relative flex flex-col items-center rounded-2xl bg-white p-3 text-center shadow-sm ring-1 transition active:scale-95 disabled:opacity-60 ${added[p.id] ? 'ring-2 ring-felt-600' : 'ring-stone-900/5 hover:ring-felt-600/40'}`}
        >
          <img src={foodImageUrl(productImageId(p))} alt="" className="h-14 w-14" loading="lazy" />
          <span className="mt-1.5 line-clamp-2 text-sm font-bold leading-tight">{p.name}</span>
          <span className="text-xs font-semibold text-stone-500">{formatRupees(p.price_paise)}</span>
          {added[p.id] && (
            <span className="absolute right-1.5 top-1.5 grid h-6 min-w-6 place-items-center rounded-full bg-felt-700 px-1.5 text-xs font-bold text-white">+{added[p.id]}</span>
          )}
        </button>
      ))}
    </div>
  )
}

function UpiPanel({ amount, note }: { amount: number; note: string }) {
  const { state } = useCounter()
  const [qr, setQr] = useState<string | null>(null)
  const upiId = state.branch.upi_id

  useEffect(() => {
    if (!upiId) return
    let cancelled = false
    QRCode.toDataURL(upiLink(upiId, state.branch.upi_name, amount, note), { width: 280, margin: 1, color: { dark: '#061f14' } })
      .then((url) => { if (!cancelled) setQr(url) })
    return () => { cancelled = true }
  }, [upiId, state.branch.upi_name, amount, note])

  if (!upiId) {
    return <p className="rounded-2xl bg-amber-100 p-3 text-sm text-amber-900">Add the shop's UPI ID in Settings to show a payment QR code.</p>
  }
  return (
    <div className="rounded-3xl bg-white p-5 text-center ring-1 ring-stone-900/5">
      <p className="tabular text-4xl font-extrabold">{formatRupees(amount)}</p>
      <p className="mb-3 text-sm text-stone-500">Scan with any UPI app · {upiId}</p>
      {qr ? <img src={qr} alt="UPI payment QR code" className="mx-auto h-64 w-64" /> : <div className="mx-auto h-64 w-64 animate-pulse rounded-xl bg-stone-100" />}
      <p className="mt-3 text-xs text-stone-500">Check the payment arrived on the shop's phone, then tap “UPI received”.</p>
    </div>
  )
}

function PartPayment({ visit, due, onBack }: { visit: OpenVisit; due: number; onBack: () => void }) {
  const { store, run, busy } = useCounter()
  const [amount, setAmount] = useState('')
  const [mode, setMode] = useState<PaymentMode>('cash')
  const paise = parseRupees(amount)
  const tooMuch = paise !== null && paise > due
  return (
    <Modal title={`Part payment · ${visit.player_name}`} onClose={onBack}>
      <p className="mb-3 text-sm text-stone-600">Take part of the {formatRupees(due)} now. The bill stays open for the rest.</p>
      <div className="grid gap-2">
        <AmountInput autoFocus value={amount} onChange={setAmount} />
        {tooMuch && <p className="text-sm text-red-700">That is more than the {formatRupees(due)} due.</p>}
        <ModePicker value={mode} onChange={setMode} />
        <div className="mt-2 grid grid-cols-2 gap-2">
          <Button variant="secondary" onClick={onBack}>Back</Button>
          <Button disabled={busy || !paise || paise <= 0 || tooMuch}
            onClick={async () => { if (await run(() => store.recordPayment(visit.id, paise!, mode))) onBack() }}>
            <Icon name="check" /> Received {paise && !tooMuch ? formatRupees(paise) : ''}
          </Button>
        </div>
      </div>
    </Modal>
  )
}

function PutOnKhata({ visit, due, onBack, onDone }: { visit: OpenVisit; due: number; onBack: () => void; onDone: () => void }) {
  const { store, state, run, busy } = useCounter()
  const known = visit.customer_id ? state.khata.find((c) => c.id === visit.customer_id) : undefined
  const [name, setName] = useState(known?.name ?? visit.player_name)
  const [phone, setPhone] = useState(known?.phone ?? visit.phone ?? '')
  const valid = name.trim() !== '' && normalizePhone(phone) !== null
  return (
    <Modal title="Put on khata" onClose={onBack}>
      <div className="mb-4 rounded-3xl bg-rose-50 p-4 text-center ring-1 ring-rose-200">
        <p className="tabular text-4xl font-extrabold text-rose-800">{formatRupees(due)}</p>
        <p className="text-sm text-rose-900">goes on {visit.player_name}’s khata, and this bill closes</p>
      </div>
      <div className="grid gap-2">
        <Input placeholder="Customer name" value={name} onChange={(e) => setName(e.target.value)} />
        <PhoneInput value={phone} onChange={setPhone} placeholder="Customer mobile number (needed for khata)" />
        {known && known.balance_paise > 0 && (
          <p className="text-sm text-stone-600">They already owe {formatRupees(known.balance_paise)}; new total will be {formatRupees(known.balance_paise + due)}.</p>
        )}
        <div className="mt-2 grid grid-cols-2 gap-2">
          <Button variant="secondary" onClick={onBack}>Back</Button>
          <Button disabled={busy || !valid}
            onClick={async () => { if (await run(() => store.closeToKhata(visit.id, name, phone))) onDone() }}>
            <Icon name="book" className="h-4 w-4" /> Put on khata
          </Button>
        </div>
      </div>
    </Modal>
  )
}
