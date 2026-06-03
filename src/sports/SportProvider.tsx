/**
 * SportProvider — React context that tracks the user's active sport.
 *
 * Loads:
 *   - All sport_config rows from DB (cached for the session)
 *   - User's `active_sport` + `sports_enabled` from useProfile
 *
 * Exposes via useSport():
 *   - activeSport:    current SportConfig (theme, labels, feature flags)
 *   - availableSports: SportConfigs the user has access to
 *   - allSports:      every active config in the DB
 *   - setActiveSport(slug):  updates DB + local state
 *   - loading:        true until first fetch completes
 */

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { supabase } from '../lib/supabase'
import {
  DEFAULT_SPORTS,
  DEFAULT_SPORT_KEY,
  getSportFallback,
  type SportConfig,
} from './registry'

interface SportContextValue {
  activeSport: SportConfig
  availableSports: SportConfig[]
  allSports: SportConfig[]
  setActiveSport: (slug: string) => Promise<void>
  loading: boolean
}

const SportContext = createContext<SportContextValue | undefined>(undefined)

interface SportProviderProps {
  userId: string | undefined
  activeSportSlug: string | undefined
  sportsEnabled: string[] | undefined
  children: ReactNode
}

export function SportProvider({
  userId,
  activeSportSlug,
  sportsEnabled,
  children,
}: SportProviderProps) {
  const [allSports, setAllSports] = useState<SportConfig[]>(
    Object.values(DEFAULT_SPORTS),
  )
  const [loading, setLoading] = useState(true)
  const [optimisticSlug, setOptimisticSlug] = useState<string | null>(null)

  // Fetch sport_config once per session
  useEffect(() => {
    let cancelled = false
    async function load() {
      const { data, error } = await supabase
        .from('sport_config')
        .select(
          'slug, display_name, short_name, body_label, game_label, protocol_label, has_techniques, has_schools, has_coach_portal, theme_accent, is_active',
        )
        .eq('is_active', true)
      if (cancelled) return
      if (error) {
        console.warn('sport_config fetch failed, using defaults:', error.message)
        setLoading(false)
        return
      }
      if (data && data.length > 0) {
        setAllSports(data as SportConfig[])
      }
      setLoading(false)
    }
    load()
    return () => {
      cancelled = true
    }
  }, [])

  const effectiveSlug = optimisticSlug ?? activeSportSlug ?? DEFAULT_SPORT_KEY

  const activeSport = useMemo<SportConfig>(() => {
    const found = allSports.find((s) => s.slug === effectiveSlug)
    return found ?? getSportFallback(effectiveSlug)
  }, [allSports, effectiveSlug])

  const availableSports = useMemo<SportConfig[]>(() => {
    const slugs =
      sportsEnabled && sportsEnabled.length > 0
        ? sportsEnabled
        : [DEFAULT_SPORT_KEY]
    return slugs
      .map((slug) => allSports.find((s) => s.slug === slug) ?? getSportFallback(slug))
      .filter((s) => s.is_active)
  }, [allSports, sportsEnabled])

  // Inject theme accent as a CSS variable + data attribute on <html>
  useEffect(() => {
    const root = document.documentElement
    root.dataset.sport = activeSport.slug
    root.dataset.sportAccent = activeSport.theme_accent
  }, [activeSport.slug, activeSport.theme_accent])

  async function setActiveSport(slug: string) {
    if (!userId) return
    setOptimisticSlug(slug)
    const { error } = await supabase
      .from('users')
      .update({ active_sport: slug })
      .eq('id', userId)
    if (error) {
      console.error('Failed to update active_sport:', error.message)
      setOptimisticSlug(null)
    }
  }

  const value: SportContextValue = {
    activeSport,
    availableSports,
    allSports,
    setActiveSport,
    loading,
  }

  return <SportContext.Provider value={value}>{children}</SportContext.Provider>
}

export function useSport(): SportContextValue {
  const ctx = useContext(SportContext)
  if (!ctx) {
    throw new Error('useSport must be used inside <SportProvider>')
  }
  return ctx
}
