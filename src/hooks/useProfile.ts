import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

export interface Profile {
  id: string
  email: string
  full_name: string | null
  belt: string
  portal_role: string
  subscription_status: string
  subscription_tier: string
  platforms: string[]
  /** Slug of the sport this user is currently focused on (FK -> sport_config.sport). Added in PR #2. */
  active_sport: string
  /** Slugs of every sport this user can access. Mirrors platforms via DB trigger. Added in PR #2. */
  sports_enabled: string[]
  /** Bodybuilding tier — beginner / intermediate / advanced. Null for non-BB users. */
  active_bb_tier: string | null
}

export interface Assessment {
  id: string
  user_id: string
  assessed_at: string
  hip_er_l: number | null
  hip_er_r: number | null
  hip_ir_l: number | null
  hip_ir_r: number | null
  hip_abd_l: number | null
  hip_abd_r: number | null
  hip_flex_l: number | null
  hip_flex_r: number | null
  shoulder_er_l: number | null
  shoulder_er_r: number | null
  shoulder_flex_l: number | null
  shoulder_flex_r: number | null
  ankle_df_l: number | null
  ankle_df_r: number | null
  lumbar_flex: number | null
  lumbar_ext: number | null
  cervical_lat_l: number | null
  cervical_lat_r: number | null
  cervical_flex: number | null
  cervical_ext: number | null
  thoracic_rot_l: number | null
  thoracic_rot_r: number | null
  // legacy columns kept for historical assessments
  cervical_rot_l: number | null
  cervical_rot_r: number | null
  thoracic_rot: number | null
  rom_total: number | null
  rom_percentile: number | null
  worst_joints: string[] | null
  red_flag_triggered: boolean
  red_flag_reasons: string[] | null
}

export interface TechniqueEligibility {
  id: string
  technique_id: string
  technique_code: string
  tier: string
  flag: string | null
  limiting_joints: string[] | null
  techniques: {
    code: string
    name: string
    belt: string
    category: string
  }
}

export function useProfile(userId: string | undefined) {
  const [profile, setProfile]       = useState<Profile | null>(null)
  const [assessment, setAssessment] = useState<Assessment | null>(null)
  const [eligibility, setEligibility] = useState<TechniqueEligibility[]>([])
  const [loading, setLoading]       = useState(true)

  useEffect(() => {
    if (!userId) return

    async function load() {
      setLoading(true)

      // Use SECURITY DEFINER function — bypasses RLS entirely,
      // filters by auth.uid() server-side so it's still secure.
      const { data, error } = await supabase.rpc('get_my_profile')

      if (error) {
        console.error('get_my_profile error:', error.message)
        setLoading(false)
        return
      }

      const result = data as {
        profile: Profile | null
        assessment: Assessment | null
        eligibility: TechniqueEligibility[]
      }

      setProfile(result.profile)
      setAssessment(result.assessment)
      setEligibility(result.eligibility ?? [])
      setLoading(false)
    }

    load()
  }, [userId])

  return { profile, assessment, eligibility, loading }
}
