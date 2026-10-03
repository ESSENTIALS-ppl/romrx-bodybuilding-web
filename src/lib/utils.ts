import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

// Canonical ROMRx Base explainer page. All public new-athlete acquisition and
// assessment entry points route here so that account creation happens in Base
// rather than a standalone sport signup.
export const BASE_ASSESSMENT_URL = 'https://romrx.io/bodybuilding'

// Where a signed-in athlete goes to take or retake the ROM assessment. Base is the
// only app that assesses ROM. Sessions do NOT carry from this domain to romrx.io
// (separate origin, separate storage), so we land on Base My Body: Base's own
// login gate runs first, then a user with no assessment is routed to Base's
// assessment and a user with one sees Retest there.
export const BASE_RETEST_URL = 'https://romrx.io/app/dashboard/my-body'

export function goToBaseAssessment(): void {
  window.location.assign(BASE_RETEST_URL)
}


// Owned-site UTM tags on clickable links to the Base page (Growth, 2026-09-29).
// utm_term is the link placement. Redirects that forward an incoming query
// (/signup edge rule, the Base URL builder) stay untagged so a visitor's
// original campaign params are what reach romrx.io.
const OWNED_SITE_UTM =
  'utm_campaign=ROMRx_Base_Beta_2026&utm_source=owned&utm_medium=site&utm_content=20260929_owned_romrxbb_site_utm'

export function ownedBaseUrl(placement: string): string {
  return `${BASE_ASSESSMENT_URL}?${OWNED_SITE_UTM}&utm_term=${encodeURIComponent(placement)}`
}

// Campaign/attribution params that are safe to forward to Base when redirecting
// a retired /signup hit. Anything not on this list is dropped so arbitrary or
// sensitive params are not carried across to another host.
const SAFE_CAMPAIGN_PARAMS = new Set([
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
  'ref', 'gclid', 'fbclid', 'msclkid',
])

// Build the Base URL, forwarding only the allowlisted campaign params from the
// given query string. The destination host is fixed, so there is no open
// redirect risk.
export function baseAssessmentUrl(search: string): string {
  const incoming = new URLSearchParams(search)
  const kept = new URLSearchParams()
  for (const [key, value] of incoming) {
    if (SAFE_CAMPAIGN_PARAMS.has(key.toLowerCase())) kept.append(key, value)
  }
  const query = kept.toString()
  return query ? `${BASE_ASSESSMENT_URL}?${query}` : BASE_ASSESSMENT_URL
}

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function tierColor(tier: string | null): string {
  switch (tier) {
    case 'GREEN':  return 'tier-green'
    case 'YELLOW': return 'tier-yellow'
    case 'RED':    return 'tier-red'
    default: return 'bg-gray-100 text-gray-600'
  }
}

// DELAY_TECHNIQUE is an internal flag — always surfaces as RED in the UI
export function tierLabel(tier: string | null, flag: string | null): string {
  if (flag === 'DELAY_TECHNIQUE') return 'RED'
  return tier ?? '—'
}

export function formatJoint(key: string): string {
  return key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

export function beltColor(belt: string): string {
  const map: Record<string, string> = {
    white: 'bg-gray-100 text-gray-700',
    blue:  'bg-blue-100 text-blue-800',
    purple:'bg-purple-100 text-purple-800',
    brown: 'bg-amber-900 text-white',
    black: 'bg-gray-900 text-white',
  }
  return map[belt] ?? 'bg-gray-100 text-gray-700'
}

// Bodybuilding tier badge color (Miami palette).
export function bbTierColor(tier: string | null | undefined): string {
  switch ((tier ?? '').toLowerCase()) {
    case 'beginner':     return 'bg-miami-light text-miami-dark'
    case 'intermediate': return 'bg-miami text-white'
    case 'advanced':     return 'bg-gradient-to-r from-miami via-miami-orange to-miami-gold text-white'
    default:             return 'bg-gray-100 text-gray-700'
  }
}

export function bbTierLabel(tier: string | null | undefined): string {
  const t = (tier ?? '').toLowerCase()
  if (!t) return 'Set tier'
  return t.charAt(0).toUpperCase() + t.slice(1)
}
