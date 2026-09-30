import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import { formatRupees, upiLink } from '../lib/billing'
import type { Account, DataStore, Subscription } from '../data/types'
import { Icon, Wordmark } from './icons'
import { formatDate } from './money'
import { Button, Input } from './ui'
import { friendlyError } from '../lib/network'

const DAY = 86_400_000
const MONTH_CHOICES = [1, 3, 6, 12]

export function daysLeft(iso: string, now = Date.now()): number {
  return Math.max(0, Math.ceil((Date.parse(iso) - now) / DAY))
}

/** Warning strip shown near the end of a trial or paid period, and while a payment is being checked. */
export function SubscriptionBanner({ sub, onPay }: { sub: Subscription; onPay?: () => void }) {
  const left = daysLeft(sub.access_until)
  let text: string | null = null
  let tone = 'bg-amber-100 text-amber-900 ring-amber-200'
  if (sub.state === 'pending') {
    text = `Payment of ${formatRupees(sub.pending?.amount_paise ?? 0)} is being checked. Access until ${formatDate(sub.access_until)}.`
    tone = 'bg-sky-50 text-sky-900 ring-sky-200'
  } else if (sub.state === 'grace') {
    text = `Payment overdue — access stops on ${formatDate(sub.access_until)}.`
    tone = 'bg-red-50 text-red-900 ring-red-200'
  } else if (sub.state === 'trial') {
    text = left <= 1 ? 'Free trial ends today.' : `Free trial: ${left} days left.`
    if (left > 3) tone = 'bg-felt-50 text-felt-900 ring-felt-200'
  } else if (sub.state === 'active' && left <= 3) {
    text = left <= 1 ? 'Subscription ends today.' : `Subscription ends in ${left} days.`
  }
  if (!text) return null
  const canPay = onPay && sub.role === 'admin' && !sub.pending
  return (
    <div className="px-3 pt-3">
      <div className={`mx-auto flex max-w-6xl items-center gap-3 rounded-2xl px-4 py-2.5 text-sm font-medium ring-1 ${tone}`}>
        <Icon name={sub.state === 'pending' ? 'clock' : 'alert'} className="h-4 w-4 shrink-0" />
        <span className="flex-1">{text}</span>
        {canPay && <button onClick={onPay} className="shrink-0 rounded-full bg-white px-3 py-1 text-xs font-bold ring-1 ring-black/10">Pay now</button>}
      </div>
    </div>
  )
}

/** Pay the platform by UPI, then tell it the payment was made. */
export function PayPanel({ sub, orgName, store, orgId, onClaimed }: {
  sub: Subscription; orgName: string; store: DataStore; orgId: string; onClaimed: (s: Subscription) => void
}) {
  const [months, setMonths] = useState(1)
  const [reference, setReference] = useState('')
  const [qr, setQr] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const amount = sub.price_paise * sub.shops * months
  const monthLabel = (m: number) => m === 12 ? '1 year' : `${m} month${m > 1 ? 's' : ''}`

  useEffect(() => {
    if (!sub.upi_id) return
    let cancelled = false
    QRCode.toDataURL(upiLink(sub.upi_id, sub.upi_name, amount, `PlayKhata · ${orgName} · ${monthLabel(months)}`), { width: 260, margin: 1, color: { dark: '#061f14' } })
      .then((url) => { if (!cancelled) setQr(url) })
    return () => { cancelled = true }
  }, [sub.upi_id, sub.upi_name, amount, orgName, months])

  if (sub.pending) {
    return (
      <div className="rounded-3xl bg-sky-50 p-5 text-center ring-1 ring-sky-200">
        <Icon name="clock" className="mx-auto mb-2 h-8 w-8 text-sky-700" />
        <p className="font-bold">Payment of {formatRupees(sub.pending.amount_paise)} is being checked</p>
        <p className="mt-1 text-sm text-sky-900">
          Sent {formatDate(sub.pending.claimed_at)}{sub.pending.reference && ` · ref ${sub.pending.reference}`}. It’s usually confirmed within a day.
        </p>
      </div>
    )
  }
  if (!sub.upi_id) {
    return <p className="rounded-2xl bg-amber-100 p-4 text-sm text-amber-900">Online payment isn’t set up yet. Please contact support to renew.</p>
  }

  async function claim() {
    setBusy(true)
    setError(null)
    try {
      onClaimed(await store.claimSubscriptionPayment(orgId, months, reference))
    } catch (e) {
      setError(friendlyError(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="grid grid-cols-1 gap-3">
      <div className="grid grid-cols-4 gap-1 rounded-2xl bg-stone-900/5 p-1 text-sm font-bold">
        {MONTH_CHOICES.map((m) => (
          <button key={m} type="button" onClick={() => setMonths(m)}
            className={`rounded-xl py-2 transition ${months === m ? 'bg-white text-felt-900 shadow-sm' : 'text-stone-500'}`}>
            {monthLabel(m)}
          </button>
        ))}
      </div>
      <div className="rounded-3xl bg-white p-5 text-center ring-1 ring-stone-900/5">
        <p className="tabular text-4xl font-extrabold">{formatRupees(amount)}</p>
        <p className="text-sm text-stone-500">
          {sub.shops > 1 && `${sub.shops} shops × ${formatRupees(sub.price_paise)} × `}{monthLabel(months)}
        </p>
        <p className="mb-3 text-sm text-stone-500">Scan with any UPI app · {sub.upi_id}</p>
        {qr ? <img src={qr} alt="UPI payment QR code" className="mx-auto h-56 w-56" /> : <div className="mx-auto h-56 w-56 animate-pulse rounded-xl bg-stone-100" />}
        <a href={upiLink(sub.upi_id, sub.upi_name, amount, `PlayKhata · ${orgName}`)}
          className="mt-3 inline-block text-sm font-semibold text-felt-700 underline sm:hidden">Open UPI app on this phone</a>
      </div>
      <label className="text-sm font-medium">UPI reference number (from your UPI app, optional)
        <Input className="mt-1" placeholder="e.g. 4271 8392 1045" value={reference} onChange={(e) => setReference(e.target.value)} />
      </label>
      {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-800">{error}</p>}
      <Button className="py-3" disabled={busy} onClick={claim}><Icon name="check" /> I’ve paid {formatRupees(amount)}</Button>
      <p className="text-center text-xs text-stone-500">
        We check the payment and confirm it, usually within a day{sub.provisional_days > 0 && `. If your access has ended, you get ${sub.provisional_days} days meanwhile`}.
      </p>
    </div>
  )
}

/** Full-screen block when a business's trial or subscription has ended. */
export function Paywall({ sub, account, orgId, orgName, store, onChanged, onLogout, onSelectOrg }: {
  sub: Subscription; account: Account; orgId: string; orgName: string; store: DataStore
  onChanged: () => void; onLogout: () => void; onSelectOrg: (id: string) => void
}) {
  const others = account.memberships.filter((m) => m.org_id !== orgId)
  return (
    <div className="min-h-screen">
      <header className="felt px-4 pb-6 pt-[max(1rem,env(safe-area-inset-top))] text-white">
        <div className="mx-auto flex max-w-lg items-center justify-between">
          <Wordmark light />
          <Button variant="glass" className="px-3 py-1.5 text-sm" onClick={onLogout}><Icon name="logout" className="h-4 w-4" /> Log out</Button>
        </div>
      </header>
      <main className="mx-auto -mt-3 max-w-lg px-4 pb-10">
        <div className="rise mb-4 rounded-3xl bg-white p-5 text-center shadow-sm ring-1 ring-stone-900/5">
          <img src="/art/lock.png" alt="" className="mx-auto mb-2 h-12 w-12" />
          <h1 className="text-2xl font-extrabold tracking-tight">{orgName}</h1>
          <p className="mt-1 text-stone-600">
            {sub.paid_until ? 'The subscription' : 'The free trial'} ended on {formatDate(sub.access_until)}.
            {' '}Your tables, bills and khata are safe and come back as soon as it’s renewed.
          </p>
        </div>
        {sub.role === 'admin' ? (
          <>
            <p className="mb-2 font-bold">
              Renew: {formatRupees(sub.price_paise)} per shop / {sub.period_days === 30 ? 'month' : `${sub.period_days} days`}
              {sub.shops > 1 && ` · ${sub.shops} shops`}
            </p>
            <PayPanel sub={sub} orgName={orgName} store={store} orgId={orgId} onClaimed={onChanged} />
          </>
        ) : (
          <p className="rounded-2xl bg-stone-100 p-4 text-center text-stone-700">Ask the owner of {orgName} to renew the subscription in the app.</p>
        )}
        {others.length > 0 && (
          <div className="mt-6 text-center text-sm">
            <p className="mb-2 text-stone-500">Your other businesses</p>
            {others.map((m) => <Button key={m.org_id} variant="secondary" className="m-1" onClick={() => onSelectOrg(m.org_id)}>{m.org_name}</Button>)}
          </div>
        )}
      </main>
    </div>
  )
}
