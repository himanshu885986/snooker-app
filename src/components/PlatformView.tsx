import { useCallback, useEffect, useState } from 'react'
import { formatRupees, parseRupees } from '../lib/billing'
import type { PlatformApi, PlatformBusiness, PlatformPayment, PlatformSettings } from '../data/types'
import { Icon, Wordmark } from './icons'
import { formatDate, formatTime } from './money'
import { daysLeft } from './Subscription'
import { Avatar, Button, Input, Modal } from './ui'
import { friendlyError } from '../lib/network'

type View = 'payments' | 'businesses' | 'settings'

/** The platform owner's dashboard: approve UPI payments, see every business, set price and UPI. */
export function PlatformView({ platform, onClose }: { platform: PlatformApi; onClose?: () => void }) {
  const [view, setView] = useState<View>('payments')
  const [payments, setPayments] = useState<PlatformPayment[] | null>(null)
  const [businesses, setBusinesses] = useState<PlatformBusiness[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    try {
      const [p, b] = await Promise.all([platform.payments(), platform.businesses()])
      setPayments(p)
      setBusinesses(b)
      setError(null)
    } catch (e) {
      setError(friendlyError(e))
    }
  }, [platform])
  useEffect(() => { void load() }, [load])

  const act = async (fn: () => Promise<unknown>) => {
    setBusy(true)
    setError(null)
    try { await fn(); await load(); return true } catch (e) { setError(friendlyError(e)); return false } finally { setBusy(false) }
  }

  const pending = payments?.filter((p) => p.status === 'pending') ?? []
  const tabs: [View, string][] = [['payments', `Payments${pending.length ? ` (${pending.length})` : ''}`], ['businesses', 'Businesses'], ['settings', 'Price & UPI']]

  return (
    <div className="min-h-screen pb-10">
      <header className="felt sticky top-0 z-10 px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] text-white">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-3">
          <span><Wordmark light /><span className="text-xs text-white/60">Platform owner</span></span>
          {onClose && <Button variant="glass" className="px-3 py-1.5 text-sm" onClick={onClose}><Icon name="x" className="h-4 w-4" /> Close</Button>}
        </div>
      </header>
      <main className="mx-auto max-w-4xl p-3 sm:p-4">
        <div className="mb-4 grid grid-cols-3 gap-1 rounded-2xl bg-stone-900/5 p-1 text-sm font-bold">
          {tabs.map(([id, label]) => (
            <button key={id} onClick={() => setView(id)} className={`rounded-xl py-2.5 transition ${view === id ? 'bg-white text-felt-900 shadow-sm' : 'text-stone-500'}`}>{label}</button>
          ))}
        </div>
        {error && <p role="alert" className="mb-3 rounded-xl bg-red-50 p-3 text-sm text-red-800">{error}</p>}
        {view === 'payments' && <Payments payments={payments} busy={busy} act={act} platform={platform} />}
        {view === 'businesses' && <Businesses businesses={businesses} busy={busy} act={act} platform={platform} />}
        {view === 'settings' && <SettingsForm platform={platform} />}
      </main>
    </div>
  )
}

type Act = (fn: () => Promise<unknown>) => Promise<boolean>

const statusStyle = {
  pending: 'bg-amber-100 text-amber-900',
  approved: 'bg-felt-100 text-felt-800',
  rejected: 'bg-red-100 text-red-800',
}

function Payments({ payments, busy, act, platform }: { payments: PlatformPayment[] | null; busy: boolean; act: Act; platform: PlatformApi }) {
  const [notes, setNotes] = useState<Record<string, string>>({})
  if (!payments) return <p className="py-6 text-center text-stone-500">Loading…</p>
  if (payments.length === 0) return <p className="rounded-3xl bg-white p-8 text-center text-stone-500 ring-1 ring-stone-900/5">No payments yet.</p>
  return (
    <ul className="grid grid-cols-1 gap-2">
      {payments.map((p) => (
        <li key={p.id} className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-stone-900/5">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="font-bold">{p.org_name}</p>
              <p className="text-sm text-stone-500">
                {p.owner_phone} · {p.months} {p.months === 1 ? 'month' : 'months'} · {formatDate(p.claimed_at)}, {formatTime(p.claimed_at)}
              </p>
              {p.reference && <p className="text-sm">UPI ref: <b className="tabular">{p.reference}</b></p>}
              {p.note && <p className="text-sm text-stone-500">Note: {p.note}</p>}
            </div>
            <div className="text-right">
              <p className="tabular text-xl font-extrabold">{formatRupees(p.amount_paise)}</p>
              <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${statusStyle[p.status]}`}>{p.status}</span>
            </div>
          </div>
          {p.status === 'pending' && (
            <div className="mt-3 grid grid-cols-1 gap-2">
              <p className="text-xs text-stone-500">Check your bank or UPI app for {formatRupees(p.amount_paise)}{p.reference && ` with reference ${p.reference}`}.</p>
              <Input placeholder="Note (optional)" value={notes[p.id] ?? ''} onChange={(e) => setNotes((n) => ({ ...n, [p.id]: e.target.value }))} />
              <div className="grid grid-cols-2 gap-2">
                <Button variant="secondary" disabled={busy} onClick={() => act(() => platform.decide(p.id, false, notes[p.id] ?? ''))}>Not received</Button>
                <Button disabled={busy} onClick={() => act(() => platform.decide(p.id, true, notes[p.id] ?? ''))}><Icon name="check" /> Received</Button>
              </div>
            </div>
          )}
        </li>
      ))}
    </ul>
  )
}

function Businesses({ businesses, busy, act, platform }: { businesses: PlatformBusiness[] | null; busy: boolean; act: Act; platform: PlatformApi }) {
  const [recording, setRecording] = useState<PlatformBusiness | null>(null)
  if (!businesses) return <p className="py-6 text-center text-stone-500">Loading…</p>
  const active = businesses.filter((b) => b.active).length
  return (
    <>
      <p className="mb-3 text-sm text-stone-600">{businesses.length} businesses · {active} with access · soonest to expire first</p>
      <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {businesses.map((b) => {
          const left = daysLeft(b.access_until)
          const trial = !b.paid_until || Date.parse(b.trial_ends_at) >= Date.parse(b.paid_until)
          return (
            <li key={b.id} className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-stone-900/5">
              <div className="flex items-start gap-3">
                <Avatar name={b.name} className="h-10 w-10 text-sm" />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-bold">{b.name}</p>
                  <p className="truncate text-sm text-stone-500">{b.owner_name} · {b.owner_phone}</p>
                  <p className="text-xs text-stone-500">
                    {b.shops} {b.shops === 1 ? 'shop' : 'shops'} · {b.tables} tables · joined {formatDate(b.created_at)}
                    {b.last_played_at && ` · last game ${formatDate(b.last_played_at)}`}
                  </p>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${!b.active ? 'bg-red-100 text-red-800' : left <= 3 ? 'bg-amber-100 text-amber-900' : 'bg-felt-100 text-felt-800'}`}>
                  {!b.active ? `Blocked since ${formatDate(b.access_until)}` : `${trial ? 'Trial' : 'Paid'} · ${left} days left`}
                  {b.pending && ' · payment to check'}
                </span>
                <Button variant="secondary" className="px-3 py-1.5 text-sm" disabled={busy} onClick={() => setRecording(b)}>Record payment</Button>
              </div>
            </li>
          )
        })}
      </ul>
      {recording && <RecordPayment business={recording} onClose={() => setRecording(null)} act={act} platform={platform} busy={busy} />}
    </>
  )
}

function RecordPayment({ business, onClose, act, platform, busy }: { business: PlatformBusiness; onClose: () => void; act: Act; platform: PlatformApi; busy: boolean }) {
  const [amount, setAmount] = useState('')
  const [days, setDays] = useState('30')
  const [note, setNote] = useState('')
  const paise = parseRupees(amount || '0')
  const d = Number(days)
  const valid = paise !== null && Number.isInteger(d) && d >= 1 && d <= 731
  return (
    <Modal title={`Record payment · ${business.name}`} onClose={onClose}>
      <p className="mb-3 text-sm text-stone-600">For money received another way (cash, or a UPI payment they didn’t report), or to give free days (amount ₹0).</p>
      <div className="grid grid-cols-1 gap-2">
        <label className="text-sm font-medium">Amount received (₹)<Input inputMode="decimal" value={amount} placeholder="0" onChange={(e) => setAmount(e.target.value)} /></label>
        <label className="text-sm font-medium">Days of access to add<Input inputMode="numeric" value={days} onChange={(e) => setDays(e.target.value.replace(/\D/g, ''))} /></label>
        <label className="text-sm font-medium">Note<Input value={note} placeholder="e.g. Paid cash" onChange={(e) => setNote(e.target.value)} /></label>
        <Button disabled={busy || !valid} onClick={async () => { if (await act(() => platform.record(business.id, paise!, d, note))) onClose() }}>
          <Icon name="check" /> Add {d || 0} days
        </Button>
      </div>
    </Modal>
  )
}

function SettingsForm({ platform }: { platform: PlatformApi }) {
  const [s, setS] = useState<PlatformSettings | null>(null)
  const [price, setPrice] = useState('')
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    platform.getSettings().then((x) => { setS(x); setPrice(String(x.price_paise / 100)) }, (e: Error) => setMessage({ ok: false, text: friendlyError(e) }))
  }, [platform])

  if (!s) return <p className="py-6 text-center text-stone-500">{message?.text ?? 'Loading…'}</p>
  const num = (key: keyof PlatformSettings, label: string, hint: string) => (
    <label className="text-sm font-medium">{label}
      <Input inputMode="numeric" value={String(s[key] ?? '')} onChange={(e) => setS({ ...s, [key]: Number(e.target.value.replace(/\D/g, '')) })} />
      <span className="text-xs font-normal text-stone-500">{hint}</span>
    </label>
  )
  const pricePaise = parseRupees(price)

  async function save() {
    setBusy(true)
    setMessage(null)
    try {
      await platform.updateSettings({ ...s!, price_paise: pricePaise! })
      setMessage({ ok: true, text: 'Saved.' })
    } catch (e) {
      setMessage({ ok: false, text: friendlyError(e) })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="grid grid-cols-1 gap-3 rounded-3xl bg-white p-4 ring-1 ring-stone-900/5 sm:p-5">
      <label className="text-sm font-medium">Your UPI ID (shops pay this)
        <Input value={s.upi_id ?? ''} placeholder="e.g. yourname@okaxis" onChange={(e) => setS({ ...s, upi_id: e.target.value })} />
      </label>
      <label className="text-sm font-medium">Name shown in UPI apps
        <Input value={s.upi_name ?? ''} placeholder="e.g. PlayKhata" onChange={(e) => setS({ ...s, upi_name: e.target.value })} />
      </label>
      <label className="text-sm font-medium">Price per shop (₹)
        <Input inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} />
      </label>
      <div className="grid grid-cols-2 gap-3">
        {num('period_days', 'Days per period', '30 = monthly')}
        {num('trial_days', 'Free trial days', 'For new businesses')}
        {num('grace_days', 'Grace days', 'Extra days after expiry')}
        {num('provisional_days', 'Days while checking', 'After “I’ve paid”')}
      </div>
      {message && <p className={`text-sm ${message.ok ? 'text-felt-700' : 'text-red-700'}`}>{message.text}</p>}
      <Button disabled={busy || !pricePaise || pricePaise <= 0} onClick={save}><Icon name="check" /> Save</Button>
    </div>
  )
}
