import { useState, type ReactNode } from 'react'
import { useCounter } from '../counter'
import { formatMinutes, formatRate, formatRupees, parseRupees } from '../lib/billing'
import { gameImage, gameKinds, games } from '../lib/games'
import { foodImages, foodImageUrl, productImageId, suggestFoodImage } from '../lib/foodImages'
import { isValidPin, normalizePhone, roleDescriptions, roleLabels } from '../lib/permissions'
import type { Account, AuthApi, Billing, GameKind, Member, PlatformApi, Product, RateUnit, Role, Subscription, Table } from '../data/types'
import { daysLeft } from './Subscription'
import { formatDate } from './money'
import { PlatformView } from './PlatformView'
import { LegalLinks } from './Legal'
import { PhoneInput, PinInput } from './Login'
import { Icon } from './icons'
import { Avatar, Button, Input, Modal, Select } from './ui'
import { friendlyError } from '../lib/network'

type StaffRole = Exclude<Role, 'admin'>

const rupees = (paise: number) => String(paise / 100)

export interface SettingsProps {
  account: Account
  auth: AuthApi
  onLogout: () => void
  onSelectOrg: (orgId: string) => void
  onBranchAdded: () => void
  subscription: Subscription | null
  onPay: () => void
  platform?: PlatformApi
}

export function SettingsView(props: SettingsProps) {
  const { store, state, can } = useCounter()
  return (
    <div className="mx-auto grid max-w-2xl grid-cols-1 gap-4 p-3">
      <AccountSection {...props} />
      {props.platform && <PlatformSection platform={props.platform} />}
      {can('manage') && props.subscription && <SubscriptionSection sub={props.subscription} onPay={props.onPay} />}
      {can('manage') && (
        <>
          <StaffSection />
          <ShopSection key={state.branch.id} />
          <Section title="Tables & stations" img="/art/ball.png" hint="Snooker, pool, PlayStation or any game charged by time.">
            <TableList />
          </Section>
          <Section title="Shop items" img="/food/noodles.png" hint="Put types of one item in a group, e.g. Cigarettes → Gold Flake, Classic.">
            <ProductList />
          </Section>
          <Section title="Shops" img="/art/shop.png">
            <p className="text-sm text-stone-600">Switch shops from the top bar. Each shop has its own tables, items and bills.</p>
            <AddShop onAdded={props.onBranchAdded} />
          </Section>
          <PrivacySection onLogout={props.onLogout} />
        </>
      )}
      <LegalLinks className="justify-center text-xs text-stone-500" />
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
      <MyDataControls auth={auth} onLogout={onLogout} />
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
          setMessage({ ok: false, text: friendlyError(err) })
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
      <div className="grid grid-cols-1 gap-2.5">{children}</div>
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

function Row({ img, title, detail, onEdit }: { img: ReactNode; title: string; detail: string; onEdit: () => void }) {
  return (
    <li>
      <button onClick={onEdit} className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-chalk">
        {img}
        <span className="min-w-0 flex-1">
          <span className="block truncate font-bold">{title}</span>
          <span className="block truncate text-xs text-stone-500">{detail}</span>
        </span>
        <Icon name="pencil" className="h-4 w-4 text-stone-400" />
      </button>
    </li>
  )
}

const listClass = 'divide-y divide-stone-100 overflow-hidden rounded-2xl ring-1 ring-stone-900/5'

// ─── Tables & stations ───────────────────────────────────────────────────────

function tableDetail(t: Table): string {
  const parts = [games[t.kind].label, formatRate(t), t.billing === 'loser' ? 'loser pays' : 'players split']
  if (t.min_minutes > 1) parts.push(`min ${formatMinutes(t.min_minutes)}`)
  if (t.block_minutes > 1) parts.push(`${t.block_minutes}-min blocks`)
  return parts.join(' · ')
}

function TableList() {
  const { state } = useCounter()
  const [editing, setEditing] = useState<Table | 'new' | null>(null)
  return (
    <>
      <ul className={listClass}>
        {state.tables.map((t) => (
          <Row key={t.id} img={<img src={gameImage(t.kind)} alt="" className="h-9 w-9" />} title={t.name} detail={tableDetail(t)} onEdit={() => setEditing(t)} />
        ))}
      </ul>
      <Button variant="secondary" onClick={() => setEditing('new')}><Icon name="plus" className="h-4 w-4" /> Add table or station</Button>
      {editing && <TableEditor table={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </>
  )
}

function TableEditor({ table, onClose }: { table: Table | null; onClose: () => void }) {
  const { store, state, run, busy } = useCounter()
  const [kind, setKind] = useState<GameKind>(table?.kind ?? 'snooker')
  const [name, setName] = useState(table?.name ?? '')
  const [billing, setBilling] = useState<Billing>(table?.billing ?? 'loser')
  const [unit, setUnit] = useState<RateUnit>(table?.rate_unit ?? 'minute')
  const [rate, setRate] = useState(() => rupees(table ? (table.rate_unit === 'minute' ? table.rate_paise_per_hour / 60 : table.rate_paise_per_hour) : 700))
  const [block, setBlock] = useState(String(table?.block_minutes ?? 1))
  const [min, setMin] = useState(String(table?.min_minutes ?? 1))
  const [confirmRemove, setConfirmRemove] = useState(false)
  const inUse = !!table && state.activeFrames.some((f) => f.table_id === table.id)

  const ratePaise = parseRupees(rate)
  const blockN = Number(block)
  const minN = Number(min)
  const perHour = ratePaise === null ? null : unit === 'minute' ? ratePaise * 60 : ratePaise
  const valid = name.trim() !== '' && perHour !== null && perHour > 0
    && Number.isInteger(blockN) && blockN >= 1 && blockN <= 240 && Number.isInteger(minN) && minN >= 1 && minN <= 600

  /** Picking a kind for a new station fills in sensible rules for it. */
  const pickKind = (k: GameKind) => {
    setKind(k)
    if (table) return
    const g = games[k]
    setBilling(g.billing)
    setUnit(g.rate_unit)
    setRate(rupees(g.rate_unit === 'minute' ? g.rate_paise_per_hour / 60 : g.rate_paise_per_hour))
    setBlock(String(g.block_minutes))
    setMin(String(g.min_minutes))
    const count = state.tables.filter((t) => t.kind === k).length
    setName(k === 'snooker' || k === 'pool' ? `Table ${state.tables.length + 1}` : `${k === 'playstation' ? 'PS5' : g.label} ${count + 1}`)
  }

  const save = async () => {
    const sort = table?.sort ?? Math.max(0, ...state.tables.map((t) => t.sort)) + 1
    const ok = await run(() => store.saveTable({
      id: table?.id, branch_id: state.branch.id, name: name.trim(), kind, billing, rate_unit: unit,
      rate_paise_per_hour: perHour!, block_minutes: blockN, min_minutes: minN, sort, active: true,
    }))
    if (ok) onClose()
  }

  const segment = <T extends string>(value: T, set: (v: T) => void, options: [T, string][]) => (
    <div className="grid gap-1 rounded-xl bg-stone-900/5 p-1 text-sm font-bold" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
      {options.map(([v, label]) => (
        <button key={v} type="button" onClick={() => set(v)}
          className={`rounded-lg px-2 py-2 transition ${value === v ? 'bg-white text-felt-900 shadow-sm' : 'text-stone-500'}`}>{label}</button>
      ))}
    </div>
  )

  return (
    <Modal title={table ? `Edit ${table.name}` : 'Add table or station'} onClose={onClose}>
      <div className="grid grid-cols-1 gap-3">
        <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-7">
          {gameKinds.map((k) => (
            <button key={k} type="button" onClick={() => pickKind(k)} title={games[k].label}
              className={`flex flex-col items-center gap-1 rounded-xl p-2 text-[11px] font-semibold leading-tight ring-1 transition ${kind === k ? 'bg-white ring-2 ring-felt-600' : 'ring-stone-900/10 hover:bg-white'}`}>
              <img src={gameImage(k)} alt="" className="h-8 w-8" />{games[k].label.split(' / ')[0]}
            </button>
          ))}
        </div>
        <label className="text-sm font-medium">Name<Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Table 5 or PS5 2" /></label>

        <div className="text-sm font-medium">Rate
          <div className="mt-1 grid grid-cols-[1fr_auto] gap-2">
            <div className="relative">
              <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-stone-400">₹</span>
              <Input className="pl-8" inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value)} />
            </div>
            {segment(unit, (u) => {
              // Keep the same money: ₹7/min ⇄ ₹420/hr
              if (ratePaise !== null) setRate(rupees(u === 'hour' && unit === 'minute' ? ratePaise * 60 : u === 'minute' && unit === 'hour' ? Math.round(ratePaise / 60) : ratePaise))
              setUnit(u)
            }, [['minute', 'per min'], ['hour', 'per hour']])}
          </div>
        </div>

        <div className="text-sm font-medium">Who pays
          <div className="mt-1">{segment(billing, setBilling, [['loser', 'Loser pays'], ['split', 'Players split']])}</div>
          <p className="mt-1 text-xs font-normal text-stone-500">
            {billing === 'loser' ? 'Two sides play; the side that loses pays the whole frame.' : '1–8 players; at the end, the ones you tick share the bill.'}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-2 text-sm font-medium">
          <label>Charge in blocks of
            <div className="mt-1 flex items-center gap-2"><Input inputMode="numeric" value={block} onChange={(e) => setBlock(e.target.value.replace(/\D/g, ''))} /> min</div>
          </label>
          <label>Minimum charge
            <div className="mt-1 flex items-center gap-2"><Input inputMode="numeric" value={min} onChange={(e) => setMin(e.target.value.replace(/\D/g, ''))} /> min</div>
          </label>
        </div>
        {valid && perHour && (
          <p className="rounded-xl bg-chalk p-3 text-xs text-stone-600">
            Example: 47 minutes costs <b>{formatRupees(Math.round(Math.max(minN, Math.ceil(47 / blockN) * blockN) * perHour / 60))}</b>
            {blockN > 1 && ` (charged as ${formatMinutes(Math.max(minN, Math.ceil(47 / blockN) * blockN))})`}.
            {table && ' Games already running keep their old rate.'}
          </p>
        )}

        <Button disabled={busy || !valid} onClick={save}><Icon name="check" /> {table ? 'Save' : 'Add'}</Button>

        {table && (confirmRemove ? (
          <div className="flex flex-wrap items-center gap-2 rounded-2xl bg-red-50 p-3 text-sm">
            <span className="flex-1">Remove {table.name}? Past bills are kept.</span>
            <Button variant="secondary" onClick={() => setConfirmRemove(false)}>Cancel</Button>
            <Button variant="danger" disabled={busy} onClick={async () => { if (await run(() => store.saveTable({ ...table, active: false }))) onClose() }}>Remove</Button>
          </div>
        ) : (
          <Button variant="ghost" className="text-sm text-red-700" disabled={inUse} title={inUse ? 'In use right now' : undefined} onClick={() => setConfirmRemove(true)}>
            {inUse ? 'In use right now, can’t remove' : `Remove ${table.name}`}
          </Button>
        ))}
      </div>
    </Modal>
  )
}

// ─── Shop items ──────────────────────────────────────────────────────────────

function ProductList() {
  const { state } = useCounter()
  const [editing, setEditing] = useState<{ product: Product | null; group: string } | null>(null)
  const byGroup = new Map<string, Product[]>()
  for (const p of state.products) {
    const g = p.group_name?.trim() ?? ''
    byGroup.set(g, [...(byGroup.get(g) ?? []), p])
  }
  const groups = [...byGroup.keys()].filter(Boolean).sort()
  const row = (p: Product) => (
    <Row key={p.id} img={<img src={foodImageUrl(productImageId(p))} alt="" className="h-9 w-9" />}
      title={p.name} detail={formatRupees(p.price_paise)} onEdit={() => setEditing({ product: p, group: p.group_name ?? '' })} />
  )

  return (
    <>
      {groups.map((g) => (
        <div key={g}>
          <div className="mb-1 flex items-center justify-between gap-2 px-1">
            <p className="text-sm font-extrabold">{g} <span className="font-normal text-stone-500">· {byGroup.get(g)!.length} types</span></p>
            <button className="flex items-center gap-1 text-sm font-semibold text-felt-700" onClick={() => setEditing({ product: null, group: g })}>
              <Icon name="plus" className="h-4 w-4" /> Add type
            </button>
          </div>
          <ul className={listClass}>{byGroup.get(g)!.map(row)}</ul>
        </div>
      ))}
      {(byGroup.get('') ?? []).length > 0 && (
        <div>
          {groups.length > 0 && <p className="mb-1 px-1 text-sm font-extrabold">Other items</p>}
          <ul className={listClass}>{byGroup.get('')!.map(row)}</ul>
        </div>
      )}
      <Button variant="secondary" onClick={() => setEditing({ product: null, group: '' })}><Icon name="plus" className="h-4 w-4" /> Add item</Button>
      {editing && <ProductEditor product={editing.product} group={editing.group} groups={groups} onClose={() => setEditing(null)} />}
    </>
  )
}

function ProductEditor({ product, group: initialGroup, groups, onClose }: { product: Product | null; group: string; groups: string[]; onClose: () => void }) {
  const { store, state, run, busy } = useCounter()
  const [name, setName] = useState(product?.name ?? '')
  const [group, setGroup] = useState(initialGroup)
  const [price, setPrice] = useState(product ? rupees(product.price_paise) : '')
  const [image, setImage] = useState<string | null>(product?.image ?? null)
  const [confirmRemove, setConfirmRemove] = useState(false)
  const pricePaise = parseRupees(price)
  const valid = name.trim() !== '' && pricePaise !== null
  // Grouped items show the group's picture on the tile, so suggest from the group name.
  const shown = productImageId({ name: group.trim() || name, image })

  const save = async () => {
    const ok = await run(() => store.saveProduct({
      id: product?.id, branch_id: state.branch.id, name: name.trim(), group_name: group.trim() || null,
      price_paise: pricePaise!, image, active: true,
    }))
    if (ok) onClose()
  }

  return (
    <Modal title={product ? `Edit ${product.name}` : group ? `Add a type of ${group}` : 'Add item'} onClose={onClose}>
      <div className="grid grid-cols-1 gap-3">
        <label className="text-sm font-medium">Group (optional)
          <Input list="item-groups" value={group} onChange={(e) => setGroup(e.target.value)} placeholder="e.g. Cigarettes, Cold drinks" />
          <datalist id="item-groups">{groups.map((g) => <option key={g} value={g} />)}</datalist>
          <span className="mt-1 block text-xs font-normal text-stone-500">Items in the same group show as one tile with a choice of types.</span>
        </label>
        <label className="text-sm font-medium">{group.trim() ? 'Type' : 'Name'}
          <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder={group.trim() ? 'e.g. Gold Flake' : 'e.g. Maggi'} />
        </label>
        <label className="text-sm font-medium">Price
          <div className="relative mt-1">
            <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-stone-400">₹</span>
            <Input className="pl-8" inputMode="decimal" placeholder="0" value={price} onChange={(e) => setPrice(e.target.value)} />
          </div>
        </label>
        <div className="text-sm font-medium">Picture
          <div className="mt-1 grid grid-cols-6 gap-1 rounded-2xl bg-chalk p-2 sm:grid-cols-8">
            {foodImages.map((f) => (
              <button key={f.id} type="button" title={f.label} aria-label={f.label} onClick={() => setImage(f.id)}
                className={`grid aspect-square place-items-center rounded-xl transition hover:bg-white ${shown === f.id ? 'bg-white ring-2 ring-felt-600' : ''}`}>
                <img src={foodImageUrl(f.id)} alt="" className="h-8 w-8" loading="lazy" />
              </button>
            ))}
          </div>
          {image && (
            <button type="button" className="mt-1 text-xs font-semibold text-stone-600 underline" onClick={() => setImage(null)}>
              Use suggestion from name ({foodImages.find((f) => f.id === suggestFoodImage(group.trim() || name))?.label})
            </button>
          )}
        </div>

        <Button disabled={busy || !valid} onClick={save}><Icon name="check" /> {product ? 'Save' : 'Add'}</Button>
        {product && (confirmRemove ? (
          <div className="flex flex-wrap items-center gap-2 rounded-2xl bg-red-50 p-3 text-sm">
            <span className="flex-1">Remove {product.name}? Past bills are kept.</span>
            <Button variant="secondary" onClick={() => setConfirmRemove(false)}>Cancel</Button>
            <Button variant="danger" disabled={busy} onClick={async () => { if (await run(() => store.saveProduct({ ...product, active: false }))) onClose() }}>Remove</Button>
          </div>
        ) : (
          <Button variant="ghost" className="text-sm text-red-700" onClick={() => setConfirmRemove(true)}>Remove {product.name}</Button>
        ))}
      </div>
    </Modal>
  )
}

function SubscriptionSection({ sub, onPay }: { sub: Subscription; onPay: () => void }) {
  const left = daysLeft(sub.access_until)
  const label: Record<Subscription['state'], string> = {
    trial: `Free trial · ${left} ${left === 1 ? 'day' : 'days'} left`,
    active: `Active until ${formatDate(sub.access_until)}`,
    pending: 'Payment being checked',
    grace: `Overdue · access stops ${formatDate(sub.access_until)}`,
    expired: 'Ended',
  }
  return (
    <Section title="Subscription" img="/art/money.png"
      hint={`${formatRupees(sub.price_paise)} per shop / ${sub.period_days === 30 ? 'month' : `${sub.period_days} days`}, paid by UPI.`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-bold">{label[sub.state]}</p>
          <p className="text-sm text-stone-500">
            {sub.shops} {sub.shops === 1 ? 'shop' : 'shops'} · {formatRupees(sub.price_paise * sub.shops)} per {sub.period_days === 30 ? 'month' : 'period'}
          </p>
        </div>
        {!sub.pending && <Button onClick={onPay}>{sub.state === 'trial' ? 'Pay now' : 'Renew'}</Button>}
      </div>
      {sub.pending && (
        <p className="rounded-xl bg-sky-50 p-3 text-sm text-sky-900">
          {formatRupees(sub.pending.amount_paise)} sent {formatDate(sub.pending.claimed_at)}, waiting for confirmation.
        </p>
      )}
      <p className="text-xs text-stone-500">Paying early adds time after the current period ends, so no days are lost. Each new shop is included from the next payment.</p>
    </Section>
  )
}

function PlatformSection({ platform }: { platform: PlatformApi }) {
  const [open, setOpen] = useState(false)
  return (
    <Section title="Platform owner" img="/art/chart.png" hint="Only you see this: every business, their payments and your UPI details.">
      <Button variant="secondary" onClick={() => setOpen(true)}><Icon name="users" className="h-4 w-4" /> Open platform dashboard</Button>
      {open && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-chalk">
          <PlatformView platform={platform} onClose={() => setOpen(false)} />
        </div>
      )}
    </Section>
  )
}

// ─── Privacy & data (DPDP Act rights) ────────────────────────────────────────

/** Save data as a .json file on this device. */
function downloadJson(filename: string, data: unknown) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

const today = () => new Date().toISOString().slice(0, 10)

/** Pinned action with an inline "are you sure" step; runs `action` and shows its error, if any. */
function useConfirmAction() {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const go = async (action: () => Promise<unknown>) => {
    setBusy(true)
    setError(null)
    try { await action(); return true } catch (e) { setError(friendlyError(e)); return false } finally { setBusy(false) }
  }
  return { busy, error, go }
}

function MyDataControls({ auth, onLogout }: { auth: AuthApi; onLogout: () => void }) {
  const [mode, setMode] = useState<'none' | 'logout' | 'delete'>('none')
  const [pin, setPin] = useState('')
  const { busy, error, go } = useConfirmAction()
  return (
    <div className="mt-1 grid grid-cols-1 gap-2 border-t border-stone-100 pt-3">
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
        <button className="text-stone-600 underline" disabled={busy} onClick={() => go(async () => downloadJson(`playkhata-my-data-${today()}.json`, await auth.exportMyData()))}>Download my data</button>
        <button className="text-stone-600 underline" onClick={() => setMode('logout')}>Log out all devices</button>
        <button className="text-red-700 underline" onClick={() => setMode('delete')}>Delete my account</button>
      </div>
      {mode === 'logout' && (
        <div className="flex flex-wrap items-center gap-2 rounded-2xl bg-amber-50 p-3 text-sm">
          <span className="flex-1">Log out on every phone and tablet, including this one? Use this if a device was lost.</span>
          <Button variant="secondary" onClick={() => setMode('none')}>Cancel</Button>
          <Button variant="warning" disabled={busy} onClick={async () => { if (await go(() => auth.logoutEverywhere())) onLogout() }}>Log out everywhere</Button>
        </div>
      )}
      {mode === 'delete' && (
        <div className="grid grid-cols-1 gap-2 rounded-2xl bg-red-50 p-3 text-sm">
          <p>Delete your PlayKhata account (your name, mobile and PIN). You’ll be removed from every business. This can’t be undone.</p>
          <PinInput value={pin} onChange={setPin} placeholder="Your PIN to confirm" />
          <div className="grid grid-cols-2 gap-2">
            <Button variant="secondary" onClick={() => { setMode('none'); setPin('') }}>Cancel</Button>
            <Button variant="danger" disabled={busy || !isValidPin(pin)} onClick={async () => { if (await go(() => auth.deleteAccount(pin))) onLogout() }}>Delete my account</Button>
          </div>
        </div>
      )}
      {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-800">{error}</p>}
    </div>
  )
}

function PrivacySection({ onLogout }: { onLogout: () => void }) {
  const { store, state } = useCounter()
  const [phone, setPhone] = useState('')
  const [erased, setErased] = useState<string | null>(null)
  const [confirmErase, setConfirmErase] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [typedName, setTypedName] = useState('')
  const [pin, setPin] = useState('')
  const { busy, error, go } = useConfirmAction()
  const orgId = state.org.id

  return (
    <Section title="Privacy & data" img="/art/lock.png" hint="Your customers’ data is yours to look after. These tools help you meet the DPDP Act.">
      <div>
        <p className="font-bold">Export all business data</p>
        <p className="mb-2 text-sm text-stone-500">Every shop, table, bill, payment, customer and khata entry, as one file.</p>
        <Button variant="secondary" disabled={busy}
          onClick={() => go(async () => downloadJson(`playkhata-${state.org.name.replace(/\W+/g, '-').toLowerCase()}-${today()}.json`, await store.exportBusiness(orgId)))}>
          Download data
        </Button>
      </div>

      <div className="border-t border-stone-100 pt-3">
        <p className="font-bold">Erase a customer’s personal data</p>
        <p className="mb-2 text-sm text-stone-500">When a customer asks, remove their name and mobile from every bill and the khata. Amounts stay, without the name. Not possible while they owe money.</p>
        {erased && <p className="mb-2 rounded-xl bg-felt-50 p-3 text-sm text-felt-800">Erased {erased}’s personal data.</p>}
        {confirmErase ? (
          <div className="flex flex-wrap items-center gap-2 rounded-2xl bg-red-50 p-3 text-sm">
            <span className="flex-1">Erase the customer with mobile {normalizePhone(phone)}? This can’t be undone.</span>
            <Button variant="secondary" onClick={() => setConfirmErase(false)}>Cancel</Button>
            <Button variant="danger" disabled={busy} onClick={async () => {
              let name = ''
              if (await go(async () => { name = await store.eraseCustomer(orgId, phone) })) { setErased(name); setPhone(''); setConfirmErase(false) }
            }}>Erase</Button>
          </div>
        ) : (
          <div className="flex gap-2">
            <PhoneInput value={phone} onChange={(v) => { setPhone(v); setErased(null) }} placeholder="Customer’s mobile number" />
            <Button variant="secondary" className="shrink-0" disabled={!normalizePhone(phone)} onClick={() => setConfirmErase(true)}>Erase…</Button>
          </div>
        )}
      </div>

      <div className="border-t border-stone-100 pt-3">
        <p className="font-bold text-red-800">Delete this business</p>
        <p className="mb-2 text-sm text-stone-500">Deletes {state.org.name} and everything in it (all shops, bills, khata, staff access). Download your data first if you need it.</p>
        {deleting ? (
          <div className="grid grid-cols-1 gap-2 rounded-2xl bg-red-50 p-3 text-sm">
            <label>Type <b>{state.org.name}</b> to confirm
              <Input className="mt-1" value={typedName} onChange={(e) => setTypedName(e.target.value)} />
            </label>
            <PinInput value={pin} onChange={setPin} placeholder="Your PIN" />
            <div className="grid grid-cols-2 gap-2">
              <Button variant="secondary" onClick={() => { setDeleting(false); setTypedName(''); setPin('') }}>Cancel</Button>
              <Button variant="danger" disabled={busy || typedName.trim() !== state.org.name || !isValidPin(pin)}
                onClick={async () => { if (await go(() => store.deleteBusiness(orgId, pin))) onLogout() }}>
                Delete forever
              </Button>
            </div>
          </div>
        ) : (
          <Button variant="ghost" className="text-red-700" onClick={() => setDeleting(true)}>Delete business…</Button>
        )}
      </div>
      {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-800">{error}</p>}
    </Section>
  )
}
