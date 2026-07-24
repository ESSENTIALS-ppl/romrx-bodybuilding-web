import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

// Canonical ROMRx Base explainer page. All public new-athlete acquisition and
// assessment entry points route here so that account creation happens in Base
// rather than a standalone sport signup.
export const BASE_ASSESSMENT_URL = 'https://romrx.io/bodybuilding'

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
