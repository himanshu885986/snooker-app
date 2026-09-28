// All money is stored as integer paise (₹1 = 100 paise) to avoid rounding errors.

export type Side = 'A' | 'B'
export type FrameStatus = 'running' | 'paused' | 'ended' | 'cancelled'
export type PaymentMode = 'cash' | 'upi'
export type Role = 'admin' | 'maintainer' | 'viewer'
export type GameKind = 'snooker' | 'pool' | 'playstation' | 'tabletennis' | 'boardgame' | 'foosball' | 'other'
/** loser = the losing side pays (sides A and B); split = the players who played share it. */
export type Billing = 'loser' | 'split'
export type RateUnit = 'minute' | 'hour'

/** How time is charged. Stored per hour so both ₹7/min and ₹100/hr are exact. */
export interface RateRules {
  rate_paise_per_hour: number
  /** Minutes are rounded up to a whole block (1 = per minute). */
  block_minutes: number
  min_minutes: number
}

/** A business using the app (one SaaS customer). It can have several shops (branches). */
export interface Org {
  id: string
  name: string
}

export interface Membership {
  org_id: string
  org_name: string
  role: Role
  /** False when the business's trial or subscription has ended. */
  active?: boolean
}

/** The person logged in on this device. */
export interface Account {
  id: string
  name: string
  phone: string
  memberships: Membership[]
  /** The person running the platform (approves subscription payments). */
  is_platform_admin?: boolean
}

/**
 * trial / active = has access; pending = paid, waiting for approval (provisional access);
 * grace = past due but still inside the grace days; expired = blocked.
 */
export type SubscriptionState = 'trial' | 'active' | 'pending' | 'grace' | 'expired'

export interface Subscription {
  state: SubscriptionState
  access_until: string
  trial_ends_at: string
  paid_until: string | null
  /** Per shop, per period. */
  price_paise: number
  /** Shops (branches) in the business; the bill is price × shops × months. */
  shops: number
  period_days: number
  /** Where shop owners pay (the platform owner's UPI). */
  upi_id: string | null
  upi_name: string | null
  provisional_days: number
  role: Role
  pending: { id: string; amount_paise: number; months: number; reference: string | null; claimed_at: string } | null
}

export interface PlatformSettings {
  upi_id: string | null
  upi_name: string | null
  price_paise: number
  period_days: number
  trial_days: number
  grace_days: number
  provisional_days: number
}

export interface PlatformBusiness {
  id: string
  name: string
  created_at: string
  trial_ends_at: string
  paid_until: string | null
  access_until: string
  active: boolean
  owner_name: string | null
  owner_phone: string | null
  shops: number
  tables: number
  last_played_at: string | null
  pending: boolean
}

export interface PlatformPayment {
  id: string
  org_id: string
  org_name: string
  owner_phone: string | null
  amount_paise: number
  months: number
  reference: string | null
  status: 'pending' | 'approved' | 'rejected'
  claimed_at: string
  decided_at: string | null
  period_end: string | null
  note: string | null
}

/** Only for the platform owner. */
export interface PlatformApi {
  businesses(): Promise<PlatformBusiness[]>
  payments(): Promise<PlatformPayment[]>
  decide(paymentId: string, approve: boolean, note: string): Promise<void>
  record(orgId: string, amountPaise: number, days: number, note: string): Promise<void>
  getSettings(): Promise<PlatformSettings>
  updateSettings(settings: PlatformSettings): Promise<void>
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

/** A snooker/pool table, PlayStation, or any other station charged by time. */
export interface Table extends RateRules {
  id: string
  branch_id: string
  name: string
  kind: GameKind
  billing: Billing
  /** How the rate is shown and typed. */
  rate_unit: RateUnit
  sort: number
  active: boolean
}

export interface Product {
  id: string
  branch_id: string
  name: string
  price_paise: number
  /** Items with the same group show as one tile with a choice of types, e.g. Cigarettes → Gold Flake. */
  group_name: string | null
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

/** One timed game on a table or station (a frame, or a session on hourly stations). */
export interface Frame extends RateRules {
  id: string
  branch_id: string
  table_id: string
  started_at: string
  ended_at: string | null
  billing: Billing
  status: FrameStatus
  losing_side: Side | null
  billable_seconds: number | null
  amount_paise: number | null
  time_adjusted: boolean
}

export interface FramePlayer {
  frame_id: string
  visit_id: string
  /** null in split sessions. */
  side: Side | null
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
  /** Works even when access has ended, so the app can show the payment screen. */
  subscription(orgId: string): Promise<Subscription>
  /** The owner says they paid by UPI; the platform owner approves it. */
  claimSubscriptionPayment(orgId: string, months: number, reference: string): Promise<Subscription>
  load(orgId: string, branchId: string | null): Promise<BranchState>
  /** Called whenever data changes (here or on another device). Returns an unsubscribe function. */
  subscribe(onChange: () => void): () => void

  openVisit(branchId: string, player: NewPlayer): Promise<string>
  /** Loser-pays tables: two sides. Split stations: all players in sideA, sideB empty. */
  startFrame(tableId: string, sideA: string[], sideB: string[]): Promise<void>
  pauseFrame(frameId: string): Promise<void>
  resumeFrame(frameId: string): Promise<void>
  /** Admin: set how long a live frame has been played. */
  adjustFrameTime(frameId: string, playedSeconds: number): Promise<void>
  /** Loser-pays: the losing side pays. Split: `payers` share it (default: everyone who played). */
  endFrame(frameId: string, losingSide: Side | null, payers?: string[]): Promise<void>
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
