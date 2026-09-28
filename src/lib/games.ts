// The kinds of tables and stations a parlour can run, with sensible starting rules.

import type { Billing, GameKind, RateUnit } from '../data/types'

export interface GameInfo {
  label: string
  /** "frame" for cue sports, "session" for the rest. */
  noun: 'frame' | 'session'
  billing: Billing
  rate_unit: RateUnit
  rate_paise_per_hour: number
  block_minutes: number
  min_minutes: number
}

export const games: Record<GameKind, GameInfo> = {
  snooker: { label: 'Snooker', noun: 'frame', billing: 'loser', rate_unit: 'minute', rate_paise_per_hour: 42000, block_minutes: 1, min_minutes: 1 },
  pool: { label: 'Pool', noun: 'frame', billing: 'loser', rate_unit: 'minute', rate_paise_per_hour: 30000, block_minutes: 1, min_minutes: 1 },
  playstation: { label: 'PlayStation', noun: 'session', billing: 'split', rate_unit: 'hour', rate_paise_per_hour: 10000, block_minutes: 15, min_minutes: 30 },
  tabletennis: { label: 'Table tennis', noun: 'session', billing: 'split', rate_unit: 'hour', rate_paise_per_hour: 8000, block_minutes: 15, min_minutes: 30 },
  boardgame: { label: 'Carrom / board game', noun: 'session', billing: 'split', rate_unit: 'hour', rate_paise_per_hour: 5000, block_minutes: 15, min_minutes: 30 },
  foosball: { label: 'Foosball', noun: 'session', billing: 'split', rate_unit: 'hour', rate_paise_per_hour: 6000, block_minutes: 15, min_minutes: 30 },
  other: { label: 'Other', noun: 'session', billing: 'split', rate_unit: 'hour', rate_paise_per_hour: 10000, block_minutes: 1, min_minutes: 1 },
}

export const gameKinds = Object.keys(games) as GameKind[]

export function gameImage(kind: GameKind): string {
  return `/games/${kind}.png`
}

/** "frame" or "session" for a table, based on its kind. */
export function nounFor(table: { kind: GameKind }): string {
  return games[table.kind]?.noun ?? 'session'
}
