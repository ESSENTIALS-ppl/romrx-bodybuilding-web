/**
 * Sport Registry — local mirror of the DB `sport_config` table.
 *
 * Defaults are used as a fallback before the DB row arrives (avoids a
 * flash of un-themed UI). Live values come from SportProvider.
 *
 * Keep this file in sync with rows in sport_config.
 *
 * NOTE: This is the romrxbodybuilding.com build. Default sport is bodybuilding.
 */

export interface SportConfig {
  /** PK — short slug, e.g. 'bjj', 'bodybuilding', 'general' */
  slug: string
  /** Human label, e.g. "Brazilian Jiu-Jitsu" */
  display_name: string
  /** Abbreviation for tight spaces, e.g. "BJJ" */
  short_name: string
  /** Section labels (null = section hidden) */
  body_label: string | null
  game_label: string | null
  protocol_label: string | null
  /** Feature flags */
  has_techniques: boolean
  has_schools: boolean
  has_coach_portal: boolean
  /** Tailwind palette name driving UI accent (teal | crimson | miami | slate | ...) */
  theme_accent: string
  is_active: boolean
}

/**
 * Default sport configs — used until the DB fetch completes.
 * MUST match the rows seeded into `sport_config` in PR #2.
 */
export const DEFAULT_SPORTS: Record<string, SportConfig> = {
  bjj: {
    slug: 'bjj',
    display_name: 'Brazilian Jiu-Jitsu',
    short_name: 'BJJ',
    body_label: 'My Body',
    game_label: 'My Game',
    protocol_label: 'My Protocol',
    has_techniques: true,
    has_schools: true,
    has_coach_portal: true,
    theme_accent: 'teal',
    is_active: true,
  },
  bodybuilding: {
    slug: 'bodybuilding',
    display_name: 'Bodybuilding',
    short_name: 'BB',
    body_label: 'My Body',
    game_label: 'My Training',
    protocol_label: 'My Protocol',
    has_techniques: true,
    has_schools: false,
    // Trainers are "in development" — coach portal hidden in v1 BB site
    has_coach_portal: false,
    theme_accent: 'miami',
    is_active: true,
  },
  general: {
    slug: 'general',
    display_name: 'ROMRx General',
    short_name: 'GEN',
    body_label: 'My Body',
    game_label: null,
    protocol_label: 'My Protocol',
    has_techniques: false,
    has_schools: false,
    has_coach_portal: false,
    theme_accent: 'slate',
    is_active: true,
  },
}

/** This site defaults to bodybuilding. (romrxbjj.com keeps DEFAULT_SPORT_KEY='bjj'.) */
export const DEFAULT_SPORT_KEY = 'bodybuilding'

export function getSportFallback(slug: string | undefined | null): SportConfig {
  if (slug && DEFAULT_SPORTS[slug]) return DEFAULT_SPORTS[slug]
  return DEFAULT_SPORTS[DEFAULT_SPORT_KEY]
}
