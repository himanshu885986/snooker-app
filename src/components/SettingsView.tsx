import { useState, type ReactNode } from 'react'
import { useCounter } from '../counter'
import { parseRupees } from '../lib/billing'
import { foodImages, foodImageUrl, productImageId, suggestFoodImage } from '../lib/foodImages'
import { isValidPin, normalizePhone, roleDescriptions, roleLabels } from '../lib/permissions'
import type { Account, AuthApi, Member, Product, Role, Table } from '../data/types'
import { PhoneInput, PinInput } from './Login'
import { Icon } from './icons'
import { Avatar, Button, Input, Select } from './ui'

type StaffRole = Exclude<Role, 'admin'>

const rupees = (paise: number) => String(paise / 100)

export interface SettingsProps {
  account: Account
  auth: AuthApi
  onLogout: () => void
  onSelectOrg: (orgId: string) => void
  onBranchAdded: () => void
}

export function SettingsView(props: SettingsProps) {
  const { store, state, can } = useCounter()
  return (
    <div className="mx-auto grid max-w-2xl gap-4 p-3">
      <AccountSection {...props} />
      {can('manage') && (
        <>
          <StaffSection />
          <ShopSection key={state.branch.id} />
          <Section title="Tables & rates" img="/art/ball.png">
            {state.tables.map((t) => <TableRow key={t.id} table={t} />)}
            <TableRow />
          </Section>
          <Section title="Shop items" img="/food/noodles.png" hint="Tap a picture to change it. New items get a picture from their name.">
            {state.products.map((p) => <ProductRow key={p.id} product={p} />)}
            <ProductRow />
          </Section>
          <Section title="Shops" img="/art/shop.png">
            <p className="text-sm text-stone-600">Switch shops from the top bar. Each shop has its own tables, items and bills.</p>
            <AddShop onAdded={props.onBranchAdded} />
          </Section>
        </>
      )}
      <p className="text-center text-xs text-stone-500">
        {store.mode === 'demo'
          ? 'Demo mode: data is saved only in this browser. Connect Supabase to go live.'
          : 'Connected to the shop database.'}
      </p>
    </div>
  )
}

function AccountSection({ account, auth, onLogout, onSelectOrg }: SettingsProps) {
  const { state } = useCounter()
  const [changingPin, setChangingPin] = useState(false)
  return (
    <Section title="My account" img="/art/lock.png">
      <div className="flex items-center gap-3">
        <Avatar name={account.name} className="h-12 w-12 text-base" />
        <div className="min-w-0 flex-1">
          <p className="truncate font-bold">{account.name}</p>
          <p className="truncate text-sm text-stone-500">{account.phone} · {roleLabels[state.role]} at {state.org.name}</p>
        </div>
        <Button variant="secondary" onClick={onLogout}><Icon name="logout" className="h-4 w-4" /> Log out</Button>
      </div>
      <p className="text-sm text-stone-600">{roleDescriptions[state.role]}</p>

      {account.memberships.length > 1 && (
        <label className="text-sm font-medium">Business
          <Select className="mt-1 w-full" value={state.org.id} onChange={(e) => onSelectOrg(e.target.value)}>
            {account.memberships.map((m) => <option key={m.org_id} value={m.org_id}>{m.org_name} ({roleLabels[m.role]})</option>)}
          </Select>
        </label>
      )}

      {changingPin
        ? <ChangePin auth={auth} onDone={() => setChangingPin(false)} />
        : <Button variant="ghost" className="justify-self-start px-0 text-sm underline" onClick={() => setChangingPin(true)}>Change my PIN</Button>}
    </Section>
  )
}

function ChangePin({ auth, onDone }: { auth: AuthApi; onDone: () => void }) {
  const [oldPin, setOldPin] = useState('')
  const [newPin, setNewPin] = useState('')
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)
  const [busy, setBusy] = useState(false)
  return (
    <form
      className="grid gap-2 rounded-lg border border-stone-200 p-3"
      onSubmit={async (e) => {
        e.preventDefault()
        setBusy(true)
        try {
          await auth.changePin(oldPin, newPin)
          setMessage({ ok: true, text: 'PIN changed.' })
          setOldPin('')
          setNewPin('')
        } catch (err) {
          setMessage({ ok: false, text: err instanceof Error ? err.message : String(err) })
        } finally {
          setBusy(false)
        }
      }}
    >
      <PinInput value={oldPin} onChange={setOldPin} placeholder="Current PIN" />
      <PinInput value={newPin} onChange={setNewPin} placeholder="New PIN (4–6 digits)" autoComplete="new-password" />
      {message && <p className={`text-sm ${message.ok ? 'text-green-700' : 'text-red-700'}`}>{message.text}</p>}
      <div className="grid grid-cols-2 gap-2">
        <Button type="button" variant="secondary" onClick={onDone}>Close</Button>
        <Button type="submit" disabled={busy || !oldPin || !isValidPin(newPin)}>Change PIN</Button>
      </div>
    </form>
  )
}

function StaffSection() {
  const { store, state, run, busy } = useCounter()
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [role, setRole] = useState<StaffRole>('maintainer')
  const [pin, setPin] = useState('')
  const [notice, setNotice] = useState<string | null>(null)
  const valid = name.trim() !== '' && normalizePhone(phone) !== null && isValidPin(pin)

  async function add() {
    let existing = false
    const ok = await run(async () => {
      existing = (await store.addMember(state.org.id, { name: name.trim(), phone, role, pin })).existing
    })
    if (!ok) return
    setNotice(existing
      ? `${normalizePhone(phone)} already had an account, so they log in with their own PIN.`
      : `Added. ${name.trim()} logs in with ${normalizePhone(phone)} and PIN ${pin}. Share it with them privately.`)
    setName('')
    setPhone('')
    setPin('')
  }

  return (
    <Section title="Staff" img="/art/people.png">
      <ul className="divide-y divide-stone-100 overflow-hidden rounded-2xl ring-1 ring-stone-900/5">
        {state.members.map((m) => <MemberRow key={m.user_id} member={m} />)}
      </ul>

      <div className="mt-2 grid gap-2 rounded-2xl bg-chalk p-3">
        <p className="text-sm font-semibold">Add staff</p>
        <div className="grid gap-2 sm:grid-cols-2">
          <Input placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} />
          <PhoneInput value={phone} onChange={setPhone} />
          <Select value={role} onChange={(e) => setRole(e.target.value as StaffRole)} aria-label="Role">
            <option value="maintainer">Maintainer</option>
            <option value="viewer">Viewer</option>
          </Select>
          <PinInput value={pin} onChange={setPin} placeholder="Their PIN (4–6 digits)" autoComplete="new-password" />
        </div>
        <p className="text-xs text-stone-500">{roleDescriptions[role]}</p>
        <Button disabled={busy || !valid} onClick={add}>Add staff member</Button>
        {notice && <p className="rounded bg-green-50 p-2 text-sm text-green-800">{notice}</p>}
      </div>
    </Section>
  )
}

function MemberRow({ member }: { member: Member }) {
  const { store, state, run, busy } = useCounter()
  const [mode, setMode] = useState<'view' | 'pin' | 'remove'>('view')
  const [pin, setPin] = useState('')
  const orgId = state.org.id

  if (member.role === 'admin') {
    return (
      <li className="flex items-center gap-3 p-3">
        <Avatar name={member.name} className="h-9 w-9 text-xs" />
        <span className="min-w-0 flex-1"><b>{member.name}</b> <span className="block text-sm text-stone-500">{member.phone}</span></span>
        <span className="rounded-full bg-felt-100 px-2.5 py-1 text-xs font-bold text-felt-800">Admin</span>
      </li>
    )
  }

  return (
    <li className="grid gap-2 p-3">
      <div className="flex flex-wrap items-center gap-3">
        <Avatar name={member.name} className="h-9 w-9 text-xs" />
        <span className="min-w-0 flex-1"><b>{member.name}</b> <span className="block text-sm text-stone-500">{member.phone}</span></span>
        <Select
          className="py-1.5 text-sm"
          value={member.role}
          disabled={busy}
          onChange={(e) => run(() => store.updateMemberRole(orgId, member.user_id, e.target.value as StaffRole))}
          aria-label={`Role of ${member.name}`}
        >
          <option value="maintainer">Maintainer</option>
          <option value="viewer">Viewer</option>
        </Select>
      </div>
      {mode === 'view' && (
        <div className="flex gap-3 text-sm">
          <button className="text-stone-600 underline" onClick={() => setMode('pin')}>Reset PIN</button>
          <button className="text-red-700 underline" onClick={() => setMode('remove')}>Remove</button>
        </div>
      )}
      {mode === 'pin' && (
        <div className="flex gap-2">
          <PinInput value={pin} onChange={setPin} placeholder="New PIN" autoComplete="new-password" />
          <Button variant="secondary" onClick={() => { setMode('view'); setPin('') }}>Cancel</Button>
          <Button disabled={busy || !isValidPin(pin)}
            onClick={async () => { if (await run(() => store.resetMemberPin(orgId, member.user_id, pin))) { setMode('view'); setPin('') } }}>
            Save
          </Button>
        </div>
      )}
      {mode === 'remove' && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg bg-red-50 p-2 text-sm">
          <span className="flex-1">Remove {member.name}? They will lose access immediately.</span>
          <Button variant="secondary" onClick={() => setMode('view')}>Cancel</Button>
          <Button variant="danger" disabled={busy} onClick={() => run(() => store.removeMember(orgId, member.user_id))}>Remove</Button>
        </div>
      )}
    </li>
  )
}

function Section({ title, img, hint, children }: { title: string; img?: string; hint?: string; children: ReactNode }) {
  return (
    <section className="rounded-3xl bg-white p-4 shadow-sm ring-1 ring-stone-900/5 sm:p-5">
      <div className="mb-4 flex items-center gap-3">
        {img && <img src={img} alt="" className="h-9 w-9" />}
        <div>
          <h2 className="text-lg font-extrabold tracking-tight">{title}</h2>
          {hint && <p className="text-xs text-stone-500">{hint}</p>}
        </div>
      </div>
      <div className="grid gap-2.5">{children}</div>
    </section>
  )
}

function ShopSection() {
  const { store, state, run, busy } = useCounter()
  const [name, setName] = useState(state.branch.name)
  const [upiId, setUpiId] = useState(state.branch.upi_id ?? '')
  const [upiName, setUpiName] = useState(state.branch.upi_name ?? '')
  const dirty = name !== state.branch.name || upiId !== (state.branch.upi_id ?? '') || upiName !== (state.branch.upi_name ?? '')

  return (
    <Section title="This shop" img="/art/phone.png" hint="Customers pay this UPI ID by scanning the QR code on their bill.">
      <label className="text-sm font-medium">Shop name<Input value={name} onChange={(e) => setName(e.target.value)} /></label>
      <label className="text-sm font-medium">UPI ID for payments<Input placeholder="e.g. shopname@okaxis" value={upiId} onChange={(e) => setUpiId(e.target.value)} /></label>
      <label className="text-sm font-medium">Name shown in UPI apps<Input placeholder="e.g. Sharma Snooker" value={upiName} onChange={(e) => setUpiName(e.target.value)} /></label>
      <Button
        disabled={busy || !dirty}
        onClick={() => run(() => store.saveBranch({ ...state.branch, name: name.trim(), upi_id: upiId.trim() || null, upi_name: upiName.trim() || null }))}
      >
        Save
      </Button>
    </Section>
  )
}

function AddShop({ onAdded }: { onAdded: () => void }) {
  const { store, state, run, busy } = useCounter()
  const [name, setName] = useState('')
  return (
    <div className="flex gap-2">
      <Input placeholder="New shop name, e.g. Shop 2" value={name} onChange={(e) => setName(e.target.value)} />
      <Button
        variant="secondary"
        disabled={busy || !name.trim()}
        onClick={async () => {
          if (await run(() => store.saveBranch({ org_id: state.org.id, name: name.trim(), upi_id: null, upi_name: null }))) {
            setName('')
            onAdded()
          }
        }}
      >
        Add
      </Button>
    </div>
  )
}

function TableRow({ table }: { table?: Table }) {
  const { store, state, run, busy } = useCounter()
  const [name, setName] = useState(table?.name ?? '')
  const [rate, setRate] = useState(table ? rupees(table.rate_paise_per_min) : '7')
  const ratePaise = parseRupees(rate)
  const inUse = !!table && state.activeFrames.some((f) => f.table_id === table.id)
  const dirty = !table || name !== table.name || ratePaise !== table.rate_paise_per_min
  const valid = name.trim() !== '' && ratePaise !== null && ratePaise > 0

  const save = async () => {
    const sort = table?.sort ?? Math.max(0, ...state.tables.map((t) => t.sort)) + 1
    const ok = await run(() => store.saveTable({
      id: table?.id, branch_id: state.branch.id, name: name.trim(), rate_paise_per_min: ratePaise!, sort, active: true,
    }))
    if (ok && !table) { setName(''); setRate('7') }
  }

  return (
    <div className="flex items-center gap-2">
      <Input placeholder={table ? 'Name' : 'New table name'} value={name} onChange={(e) => setName(e.target.value)} />
      <span className="flex shrink-0 items-center gap-1 text-sm">₹<Input className="max-w-20" inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value)} />/min</span>
      <Button className="shrink-0" variant={table ? 'secondary' : 'primary'} disabled={busy || !dirty || !valid} onClick={save}>{table ? 'Save' : 'Add'}</Button>
      {table && (
        <Button
          className="shrink-0"
          variant="ghost"
          title={inUse ? 'Table is in use' : 'Remove table'}
          disabled={busy || inUse}
          onClick={() => run(() => store.saveTable({ ...table, active: false }))}
          aria-label={`Remove ${table.name}`}
        >
          <Icon name="x" className="h-4 w-4" />
        </Button>
      )}
    </div>
  )
}

function ProductRow({ product }: { product?: Product }) {
  const { store, state, run, busy } = useCounter()
  const [name, setName] = useState(product?.name ?? '')
  const [price, setPrice] = useState(product ? rupees(product.price_paise) : '')
  const [image, setImage] = useState<string | null>(product?.image ?? null)
  const [picking, setPicking] = useState(false)
  const pricePaise = parseRupees(price)
  const dirty = !product || name !== product.name || pricePaise !== product.price_paise || image !== product.image
  const valid = name.trim() !== '' && pricePaise !== null
  const shown = productImageId({ name, image })

  const save = async (nextImage = image) => {
    const ok = await run(() => store.saveProduct({
      id: product?.id, branch_id: state.branch.id, name: name.trim(), price_paise: pricePaise!, image: nextImage, active: true,
    }))
    if (ok && !product) { setName(''); setPrice(''); setImage(null) }
  }

  const choose = (id: string | null) => {
    setImage(id)
    setPicking(false)
    // Saved products take the new picture straight away.
    if (product && valid) void save(id)
  }

  return (
    <div className={`grid gap-2 ${product ? '' : 'mt-1 rounded-2xl bg-chalk p-2'}`}>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setPicking((p) => !p)}
          className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-chalk ring-1 transition hover:ring-felt-600 ${picking ? 'ring-2 ring-felt-600' : 'ring-stone-900/10'}`}
          aria-label="Choose picture"
          title="Choose picture"
        >
          <img src={foodImageUrl(shown)} alt="" className="h-8 w-8" />
        </button>
        <Input placeholder={product ? 'Name' : 'New item, e.g. Maggi'} value={name} onChange={(e) => setName(e.target.value)} />
        <span className="flex shrink-0 items-center gap-1 text-sm">₹<Input className="max-w-20" inputMode="decimal" placeholder="0" value={price} onChange={(e) => setPrice(e.target.value)} /></span>
        <Button className="shrink-0" variant={product ? 'secondary' : 'primary'} disabled={busy || !dirty || !valid} onClick={() => save()}>{product ? 'Save' : 'Add'}</Button>
        {product && (
          <Button className="shrink-0 px-2.5" variant="ghost" title="Remove item" aria-label={`Remove ${product.name}`} disabled={busy}
            onClick={() => run(() => store.saveProduct({ ...product, active: false }))}>
            <Icon name="x" className="h-4 w-4" />
          </Button>
        )}
      </div>
      {picking && (
        <div className="rounded-2xl bg-chalk p-2 ring-1 ring-stone-900/5">
          <div className="grid grid-cols-6 gap-1 sm:grid-cols-8">
            {foodImages.map((f) => (
              <button
                key={f.id}
                type="button"
                title={f.label}
                aria-label={f.label}
                onClick={() => choose(f.id)}
                className={`grid aspect-square place-items-center rounded-xl transition hover:bg-white ${shown === f.id ? 'bg-white ring-2 ring-felt-600' : ''}`}
              >
                <img src={foodImageUrl(f.id)} alt="" className="h-9 w-9" loading="lazy" />
              </button>
            ))}
          </div>
          <button type="button" className="mt-1 w-full rounded-lg py-1.5 text-xs font-semibold text-stone-600 hover:bg-white"
            onClick={() => choose(null)}>
            Use suggestion from name ({foodImages.find((f) => f.id === suggestFoodImage(name))?.label})
          </button>
        </div>
      )}
    </div>
  )
}
