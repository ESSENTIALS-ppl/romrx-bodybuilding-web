import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { supabase, SUPABASE_URL, SUPABASE_ANON } from '../lib/supabase'
import { Spinner } from '../components/Spinner'
import { AlertTriangle, CheckCircle, Unlock, TrendingUp } from 'lucide-react'
import { cn } from '../lib/utils'

const CHECKOUT_URL = `${SUPABASE_URL}/functions/v1/create-checkout-session`

// ── PRS scoring algorithm ─────────────────────────────────────────────────────
const BILATERAL_JOINTS = [
  { l: 'hip_er_l',       r: 'hip_er_r',       riskBelow: 40,  normalMin: 40  },
  { l: 'hip_ir_l',       r: 'hip_ir_r',       riskBelow: 30,  normalMin: 30  },
  { l: 'hip_abd_l',      r: 'hip_abd_r',      riskBelow: 30,  normalMin: 40  },
  { l: 'hip_flex_l',     r: 'hip_flex_r',     riskBelow: 100, normalMin: 100 },
  { l: 'shoulder_er_l',  r: 'shoulder_er_r',  riskBelow: 60,  normalMin: 60  },
  { l: 'shoulder_flex_l',r: 'shoulder_flex_r', riskBelow: 120, normalMin: 140 },
  { l: 'ankle_df_l',     r: 'ankle_df_r',     riskBelow: 10,  normalMin: 10  },
  { l: 'cervical_rot_l', r: 'cervical_rot_r', riskBelow: 60,  normalMin: 70  },
]
const UNILATERAL_JOINTS = [
  { key: 'lumbar_flex', riskBelow: 40, normalMin: 40 },
  { key: 'lumbar_ext',  riskBelow: 15, normalMin: 20 },
  { key: 'thoracic_rot',riskBelow: 30, normalMin: 40 },
]
const JOINT_LABELS: Record<string, string> = {
  hip_er: 'Hip External Rotation', hip_ir: 'Hip Internal Rotation',
  hip_abd: 'Hip Abduction', hip_flex: 'Hip Flexion',
  shoulder_er: 'Shoulder External Rotation', shoulder_flex: 'Shoulder Flexion',
  ankle_df: 'Ankle Dorsiflexion', cervical_rot: 'Cervical Rotation',
  lumbar_flex: 'Lumbar Flexion', lumbar_ext: 'Lumbar Extension', thoracic_rot: 'Thoracic Rotation',
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function computePRS(assessment: Record<string, any>): number {
  let score = 100
  for (const j of BILATERAL_JOINTS) {
    const l = assessment[j.l], r = assessment[j.r]
    if (l != null && r != null) {
      const minVal = Math.min(l, r)
      const gap = Math.abs(l - r)
      if (minVal < j.riskBelow) score -= 8
      else if (minVal < j.normalMin) score -= 4
      if (gap >= 15) score -= 6
      else if (gap >= 8) score -= 3
    }
  }
  for (const j of UNILATERAL_JOINTS) {
    const v = assessment[j.key]
    if (v != null) {
      if (v < j.riskBelow) score -= 6
      else if (v < j.normalMin) score -= 3
    }
  }
  return Math.max(0, Math.min(100, Math.round(score)))
}

function getPRSTier(score: number): { label: string; color: string; bg: string; desc: string } {
  if (score >= 85) return { label: 'ELITE',       color: 'text-miami',       bg: 'bg-miami-light',       desc: 'Exceptional ROM profile. Train hard and retest regularly.' }
  if (score >= 70) return { label: 'STRONG',      color: 'text-miami',       bg: 'bg-miami-light',       desc: 'Good mobility foundation. A few gaps to address.' }
  if (score >= 55) return { label: 'DEVELOPING',  color: 'text-yellow-tier', bg: 'bg-yellow-tier-bg',  desc: 'ROM limitations are affecting your technique readiness.' }
  if (score >= 40) return { label: 'RESTRICTED',  color: 'text-yellow-tier', bg: 'bg-yellow-tier-bg',  desc: 'Significant mobility restrictions. Prioritize your protocol.' }
  return                  { label: 'AT RISK',     color: 'text-red-tier',   bg: 'bg-red-tier-bg',     desc: 'Multiple AT RISK joints. Prioritize injury prevention immediately.' }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getTopAsymmetries(assessment: Record<string, any>): Array<{ joint: string; gap: number; left: number; right: number }> {
  return BILATERAL_JOINTS
    .map(j => {
      const l = assessment[j.l], r = assessment[j.r]
      if (l == null || r == null) return null
      return { joint: JOINT_LABELS[j.l.replace('_l', '')] ?? j.l, gap: Math.abs(l - r), left: l, right: r }
    })
    .filter(Boolean)
    .sort((a, b) => b!.gap - a!.gap)
    .slice(0, 3) as Array<{ joint: string; gap: number; left: number; right: number }>
}

export function ResultsPreview() {
  const { user, session } = useAuth()
  const navigate = useNavigate()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [assessment, setAssessment] = useState<Record<string, any> | null>(null)
  const [loading, setLoading]       = useState(true)
  const [paying, setPaying]         = useState(false)
  const [error, setError]           = useState('')

  useEffect(() => {
    if (!user) return
    ;(async () => {
      // Check if already paid
      const { data: userRow } = await supabase
        .from('users')
        .select('subscription_status')
        .eq('id', user.id)
        .maybeSingle()

      if (userRow?.subscription_status === 'active') {
        navigate('/dashboard/my-body', { replace: true })
        return
      }

      // Load latest assessment
      const { data } = await supabase
        .from('assessments')
        .select('*')
        .eq('user_id', user.id)
        .order('assessed_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      setAssessment(data ?? null)
      setLoading(false)
    })()
  }, [user, navigate])

  const handleUnlock = async () => {
    if (!session) return
    setPaying(true)
    setError('')
    try {
      const res = await fetch(CHECKOUT_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
          'apikey': SUPABASE_ANON,
        },
        body: JSON.stringify({ email: user?.email, plan: 'athlete' }),
      })
      const { url, error: err } = await res.json()
      if (url) { window.location.href = url; return }
      setError(err ?? 'Payment setup failed. Please try again.')
    } catch (e) {
      setError('Something went wrong. Please try again.')
    } finally {
      setPaying(false)
    }
  }

  if (loading) return <Spinner />

  if (!assessment) return (
    <div className="min-h-screen bg-surface flex items-center justify-center px-4">
      <div className="text-center max-w-sm space-y-4">
        <p className="text-charcoal font-semibold">No assessment found.</p>
        <button onClick={() => navigate('/onboarding/assessment')} className="btn-primary">Take Assessment</button>
      </div>
    </div>
  )

  const prs = computePRS(assessment)
  const tier = getPRSTier(prs)
  const asymmetries = getTopAsymmetries(assessment)

  return (
    <div className="min-h-screen bg-miami-bg py-10 px-4">
      <div className="max-w-lg mx-auto space-y-6">

        {/* Header */}
        <div className="text-center">
          <h1 className="font-display font-bold text-miami-text text-2xl">Your Results Are In</h1>
          <p className="text-sm text-miami-text/60 mt-1">Know What Your Body Can Lift — by ROMRxBB</p>
        </div>

        {/* PRS Score Card */}
        <div className="bg-miami-ink rounded-2xl border border-miami/30 p-6 text-center">
          <p className="text-xs font-bold text-miami uppercase tracking-widest mb-4">ROM Readiness Score</p>
          <div className={cn('inline-flex items-center justify-center w-32 h-32 rounded-full border-4 mb-4', tier.bg, tier.color === 'text-miami' ? 'border-miami/40' : tier.color === 'text-yellow-tier' ? 'border-yellow-tier/40' : 'border-red-tier/40')}>
            <div>
              <span className={cn('font-display font-bold text-5xl leading-none block', tier.color)}>{prs}</span>
              <span className={cn('text-xs font-bold uppercase tracking-wide', tier.color)}>/ 100</span>
            </div>
          </div>
          <div className={cn('inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-sm font-bold mb-3', tier.bg, tier.color)}>
            <TrendingUp size={14} />
            {tier.label}
          </div>
          <p className="text-sm text-miami-text/70 leading-relaxed">{tier.desc}</p>
        </div>

        {/* Top asymmetries */}
        {asymmetries.length > 0 && (
          <div className="bg-miami-ink rounded-2xl border border-yellow-tier/30 p-5 space-y-3">
            <div className="flex items-center gap-2 mb-1">
              <AlertTriangle size={15} className="text-yellow-tier" />
              <p className="text-sm font-bold text-yellow-tier">Top Asymmetry Flags</p>
            </div>
            {asymmetries.map((a, i) => (
              <div key={i} className="flex items-center justify-between">
                <span className="text-sm text-miami-text/80">{a.joint}</span>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-miami-text/50">L {a.left}° / R {a.right}°</span>
                  <span className={cn('text-xs font-bold px-2 py-0.5 rounded-full', a.gap >= 15 ? 'bg-red-tier-bg text-red-tier' : 'bg-yellow-tier-bg text-yellow-tier')}>
                    {a.gap}° gap
                  </span>
                </div>
              </div>
            ))}
            <p className="text-xs text-miami-text/40 pt-1">Asymmetry is the #1 predictor of injury under heavy load. Fix it before it fixes you.</p>
          </div>
        )}

        {/* Teaser — locked content */}
        <div className="bg-miami-ink rounded-2xl border border-miami/20 p-5 space-y-3 relative overflow-hidden">
          <div className="absolute inset-0 bg-miami-bg/60 backdrop-blur-sm flex items-center justify-center z-10 rounded-2xl">
            <div className="text-center space-y-2">
              <Unlock size={28} className="text-gold mx-auto" />
              <p className="text-sm font-bold text-miami-text">Unlock Your Full Dashboard</p>
              <p className="text-xs text-miami-text/60">132 technique ratings, full protocol, ROMBot</p>
            </div>
          </div>
          <p className="text-xs font-bold text-miami uppercase tracking-wide mb-2">My Game — Technique Readiness</p>
          <div className="flex gap-2">
            <span className="text-xs bg-miami/20 text-miami px-3 py-1 rounded-full font-bold">?? GREEN</span>
            <span className="text-xs bg-yellow-tier-bg text-yellow-tier px-3 py-1 rounded-full font-bold">?? YELLOW</span>
            <span className="text-xs bg-red-tier-bg text-red-tier px-3 py-1 rounded-full font-bold">?? RED</span>
          </div>
          <div className="space-y-2">
            {['My Protocol — Top 3 Priority Joints', 'My Game — Offense + Defense Flow', 'ROMBot — Ask anything about your data'].map(item => (
              <div key={item} className="flex items-center gap-2">
                <CheckCircle size={14} className="text-miami/40" />
                <span className="text-sm text-miami-text/40 blur-sm select-none">{item}</span>
              </div>
            ))}
          </div>
        </div>

        {/* CTA */}
        {error && <p className="text-xs text-center text-red-tier bg-red-tier-bg rounded-xl px-3 py-2">{error}</p>}
        <button
          onClick={handleUnlock}
          disabled={paying}
          className="w-full py-4 bg-gold text-charcoal font-display font-bold text-base rounded-2xl hover:bg-gold-hover transition-colors flex items-center justify-center gap-2"
        >
          {paying ? 'Setting up payment...' : <>
            <Unlock size={18} /> Unlock My Full Dashboard — $149/yr
          </>}
        </button>
        <p className="text-center text-xs text-miami-text/30">
          Cancel anytime · Promo codes accepted at checkout · Results saved permanently
        </p>
      </div>
    </div>
  )
}
