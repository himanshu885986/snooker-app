// All money is stored as integer paise (₹1 = 100 paise) to avoid rounding errors.

export type Side = 'A' | 'B'
export type FrameStatus = 'running' | 'paused' | 'ended' | 'cancelled'
export type PaymentMode = 'cash' | 'upi'
export type Role = 'admin' | 'maintainer' | 'viewer'

/** A business using the app (one SaaS customer). It can have several shops (branches). */
export interface Org {
  id: string
  name: string
}

export interface Membership {
  org_id: string
  org_name: string
  role: Role
}

/** The person logged in on this device. */
export interface Account {
  id: string
  name: string
  phone: string
  memberships: Membership[]
}

/** A staff member of a business, as the admin sees them. */
export interface Member {
  user_id: string
  name: string
  phone: string
  role: Role
}

export interface NewMember {
  name: string
  phone: string
  role: Exclude<Role, 'admin'>
  pin: string
}

export interface Branch {
  id: string
  org_id: string
  name: string
  upi_id: string | null
  upi_name: string | null
}

export interface Table {
  id: string
  branch_id: string
  name: string
  rate_paise_per_min: number
  sort: number
  active: boolean
}

export interface Product {
  id: string
  branch_id: string
  name: string
  price_paise: number
  /** Picture id from src/lib/foodImages.ts; null = suggest from the name. */
  image: string | null
  active: boolean
}

/** One player's open bill for the day. */
export interface Visit {
  id: string
  branch_id: string
  player_name: string
  phone: string | null
  opened_at: string
  closed_at: string | null
  status: 'open' | 'closed'
  /** Linked regular customer (set when a valid mobile number is given). */
  customer_id: string | null
}

export interface Frame {
  id: string
  branch_id: string
  table_id: string
  started_at: string
  ended_at: string | null
  rate_paise_per_min: number
  status: FrameStatus
  losing_side: Side | null
  billable_seconds: number | null
  amount_paise: number | null
  time_adjusted: boolean
}

export interface FramePlayer {
  frame_id: string
  visit_id: string
  side: Side
}

export interface FramePause {
  id: string
  frame_id: string
  paused_at: string
  resumed_at: string | null
}

export interface Charge {
  id: string
  visit_id: string
  source: 'frame' | 'item'
  frame_id: string | null
  product_id: string | null
  description: string
  quantity: number
  amount_paise: number
  created_at: string
}

export interface Payment {
  id: string
  visit_id: string
  amount_paise: number
  mode: PaymentMode
  created_at: string
  /** Set when the admin removed a payment recorded by mistake. */
  voided_at: string | null
}

/** A regular customer and what they owe on khata. */
export interface Customer {
  id: string
  org_id: string
  name: string
  phone: string
  /** Positive = they owe the shop. */
  balance_paise: number
  last_activity_at: string | null
}

export interface KhataEntry {
  id: string
  customer_id: string
  branch_id: string | null
  /** charge = money owed, payment = money received against it. */
  kind: 'charge' | 'payment'
  amount_paise: number
  mode: PaymentMode | null
  visit_id: string | null
  note: string | null
  created_at: string
  voided_at: string | null
}

/** A closed bill, for payment history. */
export interface ClosedVisit extends Visit {
  charges: Charge[]
  payments: Payment[]
  khata: KhataEntry[]
}

export interface History {
  visits: ClosedVisit[]
  /** Khata money received at this shop in the period. */
  khataPayments: KhataEntry[]
}

/** A frame that is currently on a table, with everything needed to show it. */
export interface ActiveFrame extends Frame {
  players: FramePlayer[]
  pauses: FramePause[]
}

export interface OpenVisit extends Visit {
  charges: Charge[]
  payments: Payment[]
}

/** Everything the counter screen needs for one branch. */
export interface BranchState {
  org: Org
  /** The logged-in person's role in this business. */
  role: Role
  /** Staff list; only loaded for the admin. */
  members: Member[]
  branches: Branch[]
  branch: Branch
  tables: Table[]
  products: Product[]
  activeFrames: ActiveFrame[]
  openVisits: OpenVisit[]
  /** Customers who owe money; only loaded for the admin. */
  khata: Customer[]
}

export interface NewPlayer {
  player_name: string
  phone: string | null
}

export interface DataStore {
  mode: 'demo' | 'supabase'
  load(orgId: string, branchId: string | null): Promise<BranchState>
  /** Called whenever data changes (here or on another device). Returns an unsubscribe function. */
  subscribe(onChange: () => void): () => void

  openVisit(branchId: string, player: NewPlayer): Promise<string>
  startFrame(tableId: string, sideA: string[], sideB: string[]): Promise<void>
  pauseFrame(frameId: string): Promise<void>
  resumeFrame(frameId: string): Promise<void>
  /** Admin: set how long a live frame has been played. */
  adjustFrameTime(frameId: string, playedSeconds: number): Promise<void>
  endFrame(frameId: string, losingSide: Side): Promise<void>
  cancelFrame(frameId: string): Promise<void>
  addItem(visitId: string, productId: string, quantity: number): Promise<void>
  removeItem(chargeId: string): Promise<void>
  /** Pay everything due and close the bill. */
  checkout(visitId: string, mode: PaymentMode): Promise<void>
  /** Take part of the bill; it stays open. */
  recordPayment(visitId: string, amountPaise: number, mode: PaymentMode): Promise<void>
  /** Put what is still due on the customer's khata and close the bill. */
  closeToKhata(visitId: string, name: string, phone: string): Promise<void>
  reopenVisit(visitId: string): Promise<void>
  voidPayment(paymentId: string): Promise<void>

  /** Bills closed at this shop between two times (ISO), with khata money received there. */
  loadHistory(branchId: string, fromIso: string, toIso: string): Promise<History>
  loadKhata(customerId: string): Promise<{ customer: Customer; entries: KhataEntry[] }>
  receiveKhata(customerId: string, branchId: string, amountPaise: number, mode: PaymentMode): Promise<void>
  /** Record an amount owed from outside the app, e.g. the old paper khata. */
  addKhata(orgId: string, branchId: string, name: string, phone: string, amountPaise: number, note: string): Promise<void>
  voidKhataEntry(entryId: string): Promise<void>

  saveBranch(branch: Omit<Branch, 'id'> & { id?: string }): Promise<void>
  saveTable(table: Omit<Table, 'id'> & { id?: string }): Promise<void>
  saveProduct(product: Omit<Product, 'id'> & { id?: string }): Promise<void>

  /** Returns existing: true when the number already had an account (they keep their own PIN). */
  addMember(orgId: string, member: NewMember): Promise<{ existing: boolean }>
  updateMemberRole(orgId: string, userId: string, role: Exclude<Role, 'admin'>): Promise<void>
  removeMember(orgId: string, userId: string): Promise<void>
  resetMemberPin(orgId: string, userId: string, pin: string): Promise<void>
}

/** Login and account actions. Only the real database has these; demo mode has no login. */
export interface AuthApi {
  whoami(): Promise<Account | null>
  login(phone: string, pin: string): Promise<Account>
  register(businessName: string, ownerName: string, phone: string, pin: string): Promise<Account>
  logout(): Promise<void>
  changePin(oldPin: string, newPin: string): Promise<void>
}
