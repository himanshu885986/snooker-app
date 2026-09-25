// Demo mode: the whole database lives in this browser's localStorage.
// Used when Supabase isn't configured, so the app can be tried without any account.
// It has the same mobile + PIN login and roles as the real app, for one business
// per browser. PINs are kept as plain text here; this is for trying the app only.
// The real database stores them hashed (supabase/migrations).

import { billableMinutes, billableSeconds, formatRupees, frameAmount, splitAmount, visitTotals } from '../lib/billing'
import { assertCan, isValidPin, normalizePhone, type Action } from '../lib/permissions'
import type {
  Account, AuthApi, Branch, BranchState, Charge, ClosedVisit, Customer, DataStore, Frame, FramePause, FramePlayer,
  KhataEntry, Member, NewPlayer, Org, PaymentMode, Payment, Product, Role, Side, Table, Visit,
} from './types'

type DemoMember = Member & { pin: string }
type DemoCustomer = Pick<Customer, 'id' | 'org_id' | 'name' | 'phone'> & { created_at: string }

interface Db {
  org: Org
  members: DemoMember[]
  branches: Branch[]
  tables: Table[]
  products: Product[]
  visits: Visit[]
  frames: Frame[]
  framePlayers: FramePlayer[]
  framePauses: FramePause[]
  charges: Charge[]
  payments: Payment[]
  customers: DemoCustomer[]
  khataEntries: KhataEntry[]
}

export interface KeyValueStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

const STORAGE_KEY = 'snooker-demo-db-v3'
/** user_id of the person logged in on this browser. */
const SESSION_KEY = 'snooker-demo-session'

// crypto.randomUUID only exists on https/localhost; a phone opening the dev server over the LAN needs a fallback.
function newId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 10)
}

function seed(businessName: string, owner: DemoMember): Db {
  const orgId = newId()
  const branchId = newId()
  const tables: Table[] = [1, 2, 3, 4].map((n) => ({
    id: newId(), branch_id: branchId, name: `Table ${n}`, rate_paise_per_min: 700, sort: n, active: true,
  }))
  const products: Product[] = [
    ['Maggi', 4000], ['Tea', 1500], ['Cold drink', 3000], ['Water bottle', 2000], ['Cigarette', 2000], ['Chips', 2000],
  ].map(([name, price]) => ({ id: newId(), branch_id: branchId, name: name as string, price_paise: price as number, image: null, active: true }))
  return {
    org: { id: orgId, name: businessName },
    members: [owner],
    branches: [{ id: branchId, org_id: orgId, name: 'Main shop', upi_id: null, upi_name: null }],
    tables, products, visits: [], frames: [], framePlayers: [], framePauses: [], charges: [], payments: [],
    customers: [], khataEntries: [],
  }
}

export interface LocalStore extends DataStore {
  auth: AuthApi
}

export function createLocalStore(storage: KeyValueStorage, now: () => number = Date.now): LocalStore {
  const listeners = new Set<() => void>()

  function readOrNull(): Db | null {
    const raw = storage.getItem(STORAGE_KEY)
    if (!raw) return null
    const db = JSON.parse(raw) as Db
    // Demo data saved before khata existed.
    db.customers ??= []
    db.khataEntries ??= []
    return db
  }

  function read(): Db {
    const db = readOrNull()
    if (!db) throw new Error('Please log in again')
    return db
  }

  function save(db: Db) {
    storage.setItem(STORAGE_KEY, JSON.stringify(db))
    listeners.forEach((l) => l())
  }

  function me(db: Db | null): DemoMember | null {
    const userId = storage.getItem(SESSION_KEY)
    return db?.members.find((m) => m.user_id === userId) ?? null
  }

  function roleOf(db: Db): Role {
    const member = me(db)
    if (!member) throw new Error('Please log in again')
    return member.role
  }

  function account(db: Db | null): Account | null {
    const member = me(db)
    if (!db || !member) return null
    return {
      id: member.user_id, name: member.name, phone: member.phone,
      memberships: [{ org_id: db.org.id, org_name: db.org.name, role: member.role }],
    }
  }

  /** Apply a change atomically: nothing is saved if `fn` throws. */
  async function write<T>(action: Action, fn: (db: Db, at: string) => T): Promise<T> {
    const db = read()
    assertCan(roleOf(db), action)
    const result = fn(db, new Date(now()).toISOString())
    save(db)
    return result
  }

  const auth: AuthApi = {
    async whoami() {
      return account(readOrNull())
    },

    async login(phone, pin) {
      const db = readOrNull()
      const member = db?.members.find((m) => m.phone === normalizePhone(phone) && m.pin === pin)
      if (!member) throw new Error('Wrong mobile number or PIN')
      storage.setItem(SESSION_KEY, member.user_id)
      return account(db)!
    },

    async register(businessName, ownerName, phone, pin) {
      const existing = readOrNull()
      if (existing) {
        throw new Error(`This browser already has a demo business (${existing.org.name}). Log in instead.`)
      }
      const normalized = normalizePhone(phone)
      if (!normalized) throw new Error('Enter a valid 10-digit mobile number')
      if (!isValidPin(pin)) throw new Error('PIN must be 4 to 6 digits')
      if (!businessName.trim()) throw new Error('Business name is required')
      if (!ownerName.trim()) throw new Error('Your name is required')
      const owner: DemoMember = { user_id: newId(), name: ownerName.trim(), phone: normalized, role: 'admin', pin }
      const db = seed(businessName.trim(), owner)
      storage.setItem(SESSION_KEY, owner.user_id)
      save(db)
      return account(db)!
    },

    async logout() {
      storage.removeItem(SESSION_KEY)
    },

    async changePin(oldPin, newPin) {
      const db = read()
      const member = me(db)
      if (!member) throw new Error('Please log in again')
      if (member.pin !== oldPin) throw new Error('Current PIN is wrong')
      if (!isValidPin(newPin)) throw new Error('PIN must be 4 to 6 digits')
      member.pin = newPin
      save(db)
    },
  }

  function staff(db: Db, userId: string): DemoMember {
    const member = db.members.find((m) => m.user_id === userId && m.role !== 'admin')
    if (!member) throw new Error('Staff member not found')
    return member
  }

  function due(db: Db, visitId: string): number {
    return visitTotals({
      charges: db.charges.filter((c) => c.visit_id === visitId),
      payments: db.payments.filter((p) => p.visit_id === visitId),
      khata: db.khataEntries.filter((k) => k.visit_id === visitId),
    }).due
  }

  function openBill(db: Db, visitId: string): Visit {
    const visit = db.visits.find((v) => v.id === visitId)
    if (!visit) throw new Error('Player not found')
    if (visit.status !== 'open') throw new Error('This bill is already closed')
    return visit
  }

  function notPlaying(db: Db, visit: Visit) {
    if (isPlaying(db, visit.id)) throw new Error(`${visit.player_name} is still in a running frame. End the frame first.`)
  }

  function balance(db: Db, customerId: string): number {
    return db.khataEntries
      .filter((e) => e.customer_id === customerId && !e.voided_at)
      .reduce((sum, e) => sum + (e.kind === 'charge' ? e.amount_paise : -e.amount_paise), 0)
  }

  function customerWithBalance(db: Db, c: DemoCustomer): Customer {
    const live = db.khataEntries.filter((e) => e.customer_id === c.id && !e.voided_at)
    return {
      id: c.id, org_id: c.org_id, name: c.name, phone: c.phone, balance_paise: balance(db, c.id),
      last_activity_at: live.map((e) => e.created_at).sort().at(-1) ?? null,
    }
  }

  function findOrCreateCustomer(db: Db, name: string, phone: string, at: string): string {
    const existing = db.customers.find((c) => c.phone === phone)
    if (existing) return existing.id
    const id = newId()
    db.customers.push({ id, org_id: db.org.id, name: name.trim(), phone, created_at: at })
    return id
  }

  function checkAmount(amountPaise: number) {
    if (!Number.isInteger(amountPaise) || amountPaise <= 0) throw new Error('Enter an amount more than ₹0')
  }

  function activeFrame(db: Db, frameId: string): Frame {
    const frame = db.frames.find((f) => f.id === frameId)
    if (!frame || (frame.status !== 'running' && frame.status !== 'paused')) throw new Error('This frame has already finished')
    return frame
  }

  function isPlaying(db: Db, visitId: string): boolean {
    return db.framePlayers.some((fp) => fp.visit_id === visitId &&
      db.frames.some((f) => f.id === fp.frame_id && (f.status === 'running' || f.status === 'paused')))
  }

  return {
    mode: 'demo',
    auth,

    async load(_orgId, branchId) {
      const db = read()
      const role = roleOf(db)
      const branch = db.branches.find((b) => b.id === branchId) ?? db.branches[0]
      const activeFrames = db.frames
        .filter((f) => f.branch_id === branch.id && (f.status === 'running' || f.status === 'paused'))
        .map((f) => ({
          ...f,
          players: db.framePlayers.filter((p) => p.frame_id === f.id),
          pauses: db.framePauses.filter((p) => p.frame_id === f.id),
        }))
      const openVisits = db.visits
        .filter((v) => v.branch_id === branch.id && v.status === 'open')
        .map((v) => ({
          ...v,
          charges: db.charges.filter((c) => c.visit_id === v.id),
          payments: db.payments.filter((p) => p.visit_id === v.id),
        }))
      return {
        org: db.org,
        role,
        members: role === 'admin' ? db.members.map(({ pin: _pin, ...m }) => m) : [],
        khata: role === 'admin'
          ? db.customers.map((c) => customerWithBalance(db, c)).filter((c) => c.balance_paise !== 0)
          : [],
        branches: db.branches,
        branch,
        tables: db.tables.filter((t) => t.branch_id === branch.id && t.active).sort((a, b) => a.sort - b.sort),
        products: db.products.filter((p) => p.branch_id === branch.id && p.active),
        activeFrames,
        openVisits,
      } satisfies BranchState
    },

    subscribe(onChange) {
      listeners.add(onChange)
      // Another tab on the same device changed the data.
      const onStorage = (e: StorageEvent) => { if (e.key === STORAGE_KEY) onChange() }
      if (typeof window !== 'undefined') window.addEventListener('storage', onStorage)
      return () => {
        listeners.delete(onChange)
        if (typeof window !== 'undefined') window.removeEventListener('storage', onStorage)
      }
    },

    openVisit(branchId, player: NewPlayer) {
      return write('operate', (db, at) => {
        const name = player.player_name.trim()
        if (!name) throw new Error('Player name is required')
        const id = newId()
        const phone = normalizePhone(player.phone ?? '')
        db.visits.push({
          id, branch_id: branchId, player_name: name, phone: player.phone?.trim() || null, opened_at: at, closed_at: null,
          status: 'open', customer_id: phone ? findOrCreateCustomer(db, name, phone, at) : null,
        })
        return id
      })
    },

    startFrame(tableId, sideA, sideB) {
      return write('operate', (db, at) => {
        const table = db.tables.find((t) => t.id === tableId)
        if (!table) throw new Error('Table not found')
        if (db.frames.some((f) => f.table_id === tableId && (f.status === 'running' || f.status === 'paused'))) {
          throw new Error(`${table.name} already has a frame running`)
        }
        validateSides(sideA, sideB)
        for (const visitId of [...sideA, ...sideB]) {
          const visit = db.visits.find((v) => v.id === visitId)
          if (!visit || visit.status !== 'open') throw new Error('Player has already checked out')
          if (isPlaying(db, visitId)) throw new Error(`${visit.player_name} is already playing on another table`)
        }
        const frameId = newId()
        db.frames.push({
          id: frameId, branch_id: table.branch_id, table_id: tableId, started_at: at, ended_at: null,
          rate_paise_per_min: table.rate_paise_per_min, status: 'running', losing_side: null, billable_seconds: null, amount_paise: null,
          time_adjusted: false,
        })
        for (const v of sideA) db.framePlayers.push({ frame_id: frameId, visit_id: v, side: 'A' })
        for (const v of sideB) db.framePlayers.push({ frame_id: frameId, visit_id: v, side: 'B' })
      })
    },

    pauseFrame(frameId) {
      return write('operate', (db, at) => {
        const frame = activeFrame(db, frameId)
        if (frame.status === 'paused') return
        frame.status = 'paused'
        db.framePauses.push({ id: newId(), frame_id: frameId, paused_at: at, resumed_at: null })
      })
    },

    resumeFrame(frameId) {
      return write('operate', (db, at) => {
        const frame = activeFrame(db, frameId)
        if (frame.status === 'running') return
        frame.status = 'running'
        for (const p of db.framePauses) if (p.frame_id === frameId && !p.resumed_at) p.resumed_at = at
      })
    },

    adjustFrameTime(frameId, playedSeconds) {
      return write('adjust', (db, at) => {
        const frame = activeFrame(db, frameId)
        if (!Number.isInteger(playedSeconds) || playedSeconds < 0 || playedSeconds > 24 * 3600) {
          throw new Error('Played time must be between 0 and 24 hours')
        }
        const nowMs = Date.parse(at)
        const pausedMs = db.framePauses
          .filter((p) => p.frame_id === frameId)
          .reduce((sum, p) => sum + ((p.resumed_at ? Date.parse(p.resumed_at) : nowMs) - Date.parse(p.paused_at)), 0)
        frame.started_at = new Date(nowMs - playedSeconds * 1000 - pausedMs).toISOString()
        frame.time_adjusted = true
      })
    },

    endFrame(frameId, losingSide: Side) {
      return write('operate', (db, at) => {
        const frame = activeFrame(db, frameId)
        const pauses = db.framePauses.filter((p) => p.frame_id === frameId)
        for (const p of pauses) if (!p.resumed_at) p.resumed_at = at
        const seconds = billableSeconds(frame.started_at, pauses, Date.parse(at), at)
        const amount = frameAmount(seconds, frame.rate_paise_per_min)
        const tableName = db.tables.find((t) => t.id === frame.table_id)?.name ?? 'Table'
        const losers = db.framePlayers.filter((p) => p.frame_id === frameId && p.side === losingSide)
        const shares = splitAmount(amount, losers.length)
        losers.forEach((loser, i) => {
          db.charges.push({
            id: newId(), visit_id: loser.visit_id, source: 'frame', frame_id: frameId, product_id: null,
            description: frameDescription(tableName, seconds, losers.length),
            quantity: 1, amount_paise: shares[i], created_at: at,
          })
        })
        Object.assign(frame, { status: 'ended', ended_at: at, losing_side: losingSide, billable_seconds: seconds, amount_paise: amount })
      })
    },

    cancelFrame(frameId) {
      return write('adjust', (db, at) => {
        const frame = activeFrame(db, frameId)
        for (const p of db.framePauses) if (p.frame_id === frameId && !p.resumed_at) p.resumed_at = at
        Object.assign(frame, { status: 'cancelled', ended_at: at })
      })
    },

    addItem(visitId, productId, quantity) {
      return write('operate', (db, at) => {
        if (!Number.isInteger(quantity) || quantity < 1) throw new Error('Quantity must be at least 1')
        const visit = db.visits.find((v) => v.id === visitId)
        if (!visit || visit.status !== 'open') throw new Error('Player has already checked out')
        const product = db.products.find((p) => p.id === productId)
        if (!product) throw new Error('Product not found')
        db.charges.push({
          id: newId(), visit_id: visitId, source: 'item', frame_id: null, product_id: productId,
          description: product.name, quantity, amount_paise: product.price_paise * quantity, created_at: at,
        })
      })
    },

    removeItem(chargeId) {
      return write('adjust', (db) => {
        const charge = db.charges.find((c) => c.id === chargeId)
        if (!charge || charge.source !== 'item') throw new Error('Only shop items can be removed')
        const visit = db.visits.find((v) => v.id === charge.visit_id)
        if (visit?.status !== 'open') throw new Error('Player has already checked out')
        db.charges = db.charges.filter((c) => c.id !== chargeId)
      })
    },

    checkout(visitId, mode: PaymentMode) {
      return write('collect', (db, at) => {
        const visit = openBill(db, visitId)
        notPlaying(db, visit)
        const owed = due(db, visitId)
        if (owed > 0) db.payments.push({ id: newId(), visit_id: visitId, amount_paise: owed, mode, created_at: at, voided_at: null })
        Object.assign(visit, { status: 'closed', closed_at: at })
      })
    },

    recordPayment(visitId, amountPaise, mode) {
      return write('collect', (db, at) => {
        openBill(db, visitId)
        checkAmount(amountPaise)
        const owed = due(db, visitId)
        if (amountPaise > owed) throw new Error(`That is more than the ${formatRupees(owed)} due`)
        db.payments.push({ id: newId(), visit_id: visitId, amount_paise: amountPaise, mode, created_at: at, voided_at: null })
      })
    },

    closeToKhata(visitId, name, phone) {
      return write('collect', (db, at) => {
        const visit = openBill(db, visitId)
        notPlaying(db, visit)
        const owed = due(db, visitId)
        if (owed <= 0) throw new Error('Nothing is due on this bill')
        const normalized = normalizePhone(phone)
        if (!normalized) throw new Error('Enter a valid 10-digit mobile number')
        if (!name.trim()) throw new Error('Customer name is required')
        const customerId = findOrCreateCustomer(db, name, normalized, at)
        db.khataEntries.push({
          id: newId(), customer_id: customerId, branch_id: visit.branch_id, kind: 'charge', amount_paise: owed,
          mode: null, visit_id: visitId, note: 'Unpaid bill', created_at: at, voided_at: null,
        })
        Object.assign(visit, { customer_id: customerId, phone: normalized, status: 'closed', closed_at: at })
      })
    },

    reopenVisit(visitId) {
      return write('collect', (db, at) => {
        const visit = db.visits.find((v) => v.id === visitId)
        if (!visit) throw new Error('Bill not found')
        if (visit.status !== 'closed') throw new Error('This bill is already open')
        for (const e of db.khataEntries) if (e.visit_id === visitId && !e.voided_at) e.voided_at = at
        Object.assign(visit, { status: 'open', closed_at: null })
      })
    },

    voidPayment(paymentId) {
      return write('collect', (db, at) => {
        const payment = db.payments.find((p) => p.id === paymentId)
        if (!payment) throw new Error('Payment not found')
        if (payment.voided_at) throw new Error('This payment was already removed')
        if (db.visits.find((v) => v.id === payment.visit_id)?.status !== 'open') throw new Error('Reopen the bill first')
        payment.voided_at = at
      })
    },

    async loadHistory(branchId, fromIso, toIso) {
      const db = read()
      assertCan(roleOf(db), 'collect')
      const inRange = (iso: string | null) => !!iso && iso >= fromIso && iso < toIso
      const visits: ClosedVisit[] = db.visits
        .filter((v) => v.branch_id === branchId && v.status === 'closed' && inRange(v.closed_at))
        .sort((a, b) => b.closed_at!.localeCompare(a.closed_at!))
        .map((v) => ({
          ...v,
          charges: db.charges.filter((c) => c.visit_id === v.id),
          payments: db.payments.filter((p) => p.visit_id === v.id),
          khata: db.khataEntries.filter((k) => k.visit_id === v.id),
        }))
      const khataPayments = db.khataEntries.filter((e) => e.kind === 'payment' && e.branch_id === branchId && inRange(e.created_at))
      return { visits, khataPayments }
    },

    async loadKhata(customerId) {
      const db = read()
      assertCan(roleOf(db), 'collect')
      const c = db.customers.find((x) => x.id === customerId)
      if (!c) throw new Error('Customer not found')
      const entries = db.khataEntries
        .filter((e) => e.customer_id === customerId)
        .sort((a, b) => b.created_at.localeCompare(a.created_at))
      return { customer: customerWithBalance(db, c), entries }
    },

    receiveKhata(customerId, branchId, amountPaise, mode) {
      return write('collect', (db, at) => {
        if (!db.customers.some((c) => c.id === customerId)) throw new Error('Customer not found')
        checkAmount(amountPaise)
        const owed = balance(db, customerId)
        if (amountPaise > owed) throw new Error(`That is more than the ${formatRupees(Math.max(0, owed))} on khata`)
        db.khataEntries.push({
          id: newId(), customer_id: customerId, branch_id: branchId, kind: 'payment', amount_paise: amountPaise,
          mode, visit_id: null, note: null, created_at: at, voided_at: null,
        })
      })
    },

    addKhata(_orgId, branchId, name, phone, amountPaise, note) {
      return write('collect', (db, at) => {
        const normalized = normalizePhone(phone)
        if (!normalized) throw new Error('Enter a valid 10-digit mobile number')
        if (!name.trim()) throw new Error('Customer name is required')
        checkAmount(amountPaise)
        const customerId = findOrCreateCustomer(db, name, normalized, at)
        db.khataEntries.push({
          id: newId(), customer_id: customerId, branch_id: branchId, kind: 'charge', amount_paise: amountPaise,
          mode: null, visit_id: null, note: note.trim() || null, created_at: at, voided_at: null,
        })
      })
    },

    voidKhataEntry(entryId) {
      return write('collect', (db, at) => {
        const entry = db.khataEntries.find((e) => e.id === entryId)
        if (!entry) throw new Error('Entry not found')
        if (entry.voided_at) throw new Error('This entry was already removed')
        if (entry.visit_id) throw new Error('Reopen the bill to undo this')
        entry.voided_at = at
      })
    },

    saveBranch(branch) {
      return write('manage', (db) => {
        if (!branch.name.trim()) throw new Error('Shop name is required')
        const i = db.branches.findIndex((b) => b.id === branch.id)
        if (branch.id && i >= 0) db.branches[i] = { ...branch, id: branch.id }
        else db.branches.push({ ...branch, id: newId(), org_id: db.org.id })
      })
    },

    saveTable(table) {
      return write('manage', (db) => {
        if (!table.name.trim()) throw new Error('Table name is required')
        if (table.rate_paise_per_min <= 0) throw new Error('Rate must be more than ₹0')
        if (table.id) {
          const i = db.tables.findIndex((t) => t.id === table.id)
          db.tables[i] = { ...db.tables[i], ...table, id: table.id }
        } else {
          db.tables.push({ ...table, id: newId() })
        }
      })
    },

    saveProduct(product) {
      return write('manage', (db) => {
        if (!product.name.trim()) throw new Error('Product name is required')
        if (product.price_paise < 0) throw new Error('Price cannot be negative')
        if (product.id) {
          const i = db.products.findIndex((p) => p.id === product.id)
          db.products[i] = { ...db.products[i], ...product, id: product.id }
        } else {
          db.products.push({ ...product, id: newId() })
        }
      })
    },

    addMember(_orgId, member) {
      return write('manage', (db) => {
        const phone = normalizePhone(member.phone)
        if (!phone) throw new Error('Enter a valid 10-digit mobile number')
        if (!member.name.trim()) throw new Error('Name is required')
        if (!isValidPin(member.pin)) throw new Error('PIN must be 4 to 6 digits')
        if (member.role !== 'maintainer' && member.role !== 'viewer') throw new Error('Staff role must be maintainer or viewer')
        if (db.members.some((m) => m.phone === phone)) throw new Error('This number is already on your staff')
        db.members.push({ user_id: newId(), name: member.name.trim(), phone, role: member.role, pin: member.pin })
        return { existing: false }
      })
    },

    updateMemberRole(_orgId, userId, newRole) {
      return write('manage', (db) => { staff(db, userId).role = newRole })
    },

    removeMember(_orgId, userId) {
      return write('manage', (db) => {
        staff(db, userId)
        db.members = db.members.filter((m) => m.user_id !== userId)
      })
    },

    resetMemberPin(_orgId, userId, pin) {
      return write('manage', (db) => {
        if (!isValidPin(pin)) throw new Error('PIN must be 4 to 6 digits')
        staff(db, userId).pin = pin
      })
    },
  }
}

export function validateSides(sideA: string[], sideB: string[]) {
  for (const side of [sideA, sideB]) {
    if (side.length < 1 || side.length > 2) throw new Error('Each side needs 1 or 2 players')
  }
  if (new Set([...sideA, ...sideB]).size !== sideA.length + sideB.length) {
    throw new Error('A player cannot be on both sides')
  }
}

export function frameDescription(tableName: string, seconds: number, losers: number): string {
  const minutes = billableMinutes(seconds)
  return `${tableName} · lost frame · ${minutes} min${losers > 1 ? ` (split ${losers} ways)` : ''}`
}
