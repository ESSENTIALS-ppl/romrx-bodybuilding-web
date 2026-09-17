import { useAuth } from '../hooks/useAuth'
import { useProfile } from '../hooks/useProfile'
import type { Assessment } from '../hooks/useProfile'
import { PageHeader } from '../components/PageHeader'
import { SectionCard } from '../components/SectionCard'
import { EmptyState } from '../components/EmptyState'
import { Spinner } from '../components/Spinner'
import { RadarChart, Radar, PolarGrid, PolarAngleAxis, ResponsiveContainer, Tooltip } from 'recharts'
import { cn, bbTierColor, bbTierLabel, formatJoint } from '../lib/utils'
import { AlertTriangle, Activity, TrendingUp } from 'lucide-react'

// ── Position Readiness Score ──────────────────────────────────────────────────
const PRS_BILATERAL = [
  { l: 'hip_er_l',       r: 'hip_er_r',        riskBelow: 40,  normalMin: 40  },
  { l: 'hip_ir_l',       r: 'hip_ir_r',        riskBelow: 30,  normalMin: 30  },
  { l: 'hip_abd_l',      r: 'hip_abd_r',       riskBelow: 25,  normalMin: 35  },
  { l: 'hip_flex_l',     r: 'hip_flex_r',      riskBelow: 100, normalMin: 100 },
  { l: 'shoulder_er_l',  r: 'shoulder_er_r',   riskBelow: 60,  normalMin: 60  },
  { l: 'shoulder_flex_l',r: 'shoulder_flex_r', riskBelow: 120, normalMin: 140 },
  { l: 'ankle_df_l',     r: 'ankle_df_r',      riskBelow: 10,  normalMin: 10  },
  { l: 'cervical_lat_l', r: 'cervical_lat_r',  riskBelow: 30,  normalMin: 40  },
]
const PRS_UNILATERAL = [
  { key: 'lumbar_flex',   riskBelow: 40, normalMin: 40 },
  { key: 'lumbar_ext',    riskBelow: 15, normalMin: 20 },
  { key: 'cervical_flex', riskBelow: 35, normalMin: 45 },
  { key: 'cervical_ext',  riskBelow: 40, normalMin: 55 },
]

function computePRS(a: Assessment): number {
  let score = 100
  for (const j of PRS_BILATERAL) {
    const l = (a as unknown as Record<string, number | null>)[j.l]
    const r = (a as unknown as Record<string, number | null>)[j.r]
    if (l != null && r != null) {
      const minVal = Math.min(l, r)
      const gap    = Math.abs(l - r)
      if (minVal < j.riskBelow) score -= 8
      else if (minVal < j.normalMin) score -= 4
      if (gap >= 15) score -= 6
      else if (gap >= 8) score -= 3
    }
  }
  for (const j of PRS_UNILATERAL) {
    const v = (a as unknown as Record<string, number | null>)[j.key]
    if (v != null) {
      if (v < j.riskBelow) score -= 6
      else if (v < j.normalMin) score -= 3
    }
  }
  return Math.max(0, Math.min(100, Math.round(score)))
}

function getPRSTier(s: number) {
  if (s >= 85) return { label: 'ELITE',      color: 'text-miami',      bg: 'bg-miami-light',     ring: 'border-miami/40' }
  if (s >= 70) return { label: 'STRONG',     color: 'text-miami',      bg: 'bg-miami-light',     ring: 'border-miami/40' }
  if (s >= 55) return { label: 'DEVELOPING', color: 'text-yellow-tier', bg: 'bg-yellow-tier-bg',  ring: 'border-yellow-tier/40' }
  if (s >= 40) return { label: 'RESTRICTED', color: 'text-yellow-tier', bg: 'bg-yellow-tier-bg',  ring: 'border-yellow-tier/40' }
  return              { label: 'AT RISK',    color: 'text-red-tier',   bg: 'bg-red-tier-bg',     ring: 'border-red-tier/40' }
}

const OPTIMAL: Record<string, number> = {
  'Hip ER': 55, 'Hip IR': 40, 'Hip Abd': 50, 'Hip Flex': 110,
  'Shoulder ER': 80, 'Shoulder Flex': 165, 'Ankle DF': 15,
  'Lumbar Flex': 50, 'Lumbar Ext': 25,
  'Cervical Lat': 45, 'Cervical Flex': 55, 'Cervical Ext': 65,
}

function buildRadar(a: Assessment) {
  return [
    { joint: 'Hip ER',       value: Math.max(a.hip_er_l ?? 0, a.hip_er_r ?? 0) },
    { joint: 'Hip IR',       value: Math.max(a.hip_ir_l ?? 0, a.hip_ir_r ?? 0) },
    { joint: 'Hip Abd',      value: Math.max(a.hip_abd_l ?? 0, a.hip_abd_r ?? 0) },
    { joint: 'Hip Flex',     value: Math.max(a.hip_flex_l ?? 0, a.hip_flex_r ?? 0) },
    { joint: 'Shoulder ER',  value: Math.max(a.shoulder_er_l ?? 0, a.shoulder_er_r ?? 0) },
    { joint: 'Shoulder Flex',value: Math.max(a.shoulder_flex_l ?? 0, a.shoulder_flex_r ?? 0) },
    { joint: 'Ankle DF',     value: Math.max(a.ankle_df_l ?? 0, a.ankle_df_r ?? 0) },
    { joint: 'Lumbar Flex',  value: a.lumbar_flex ?? 0 },
    { joint: 'Lumbar Ext',   value: a.lumbar_ext ?? 0 },
    { joint: 'Cervical Lat', value: Math.max(a.cervical_lat_l ?? 0, a.cervical_lat_r ?? 0) },
  ]
}

function JointBar({ label, left, right, midline, optimal }: {
  label: string; left?: number | null; right?: number | null
  midline?: number | null; optimal: number
}) {
  const best = midline ?? Math.max(left ?? 0, right ?? 0)
  const pct  = Math.min(100, Math.round((best / optimal) * 100))
  const asym = left != null && right != null ? Math.abs(left - right) : 0
  const isBad = pct < 75

  return (
    <div className="flex items-center gap-3 py-2">
      <div className="w-32 shrink-0">
        <p className={cn('text-xs font-medium', isBad ? 'text-red-tier' : 'text-charcoal')}>{label}</p>
        {asym > 10 && (
          <p className="text-xs text-gold flex items-center gap-0.5 mt-0.5">
            <AlertTriangle size={9} /> {asym}° gap
          </p>
        )}
      </div>
      <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
        <div
          className={cn('h-full rounded-full transition-all duration-500',
            pct >= 100 ? 'bg-miami' : pct >= 75 ? 'bg-miami-orange' : 'bg-red-400')}
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="w-20 text-right shrink-0 text-xs text-charcoal-light">
        {midline != null ? `${midline}°` : `${left ?? 0}° / ${right ?? 0}°`}
      </div>
      <div className="w-8 text-right shrink-0">
        <span className={cn('text-xs font-bold',
          pct >= 100 ? 'text-miami' : pct >= 75 ? 'text-miami-orange' : 'text-red-tier')}>
          {pct}%
        </span>
      </div>
    </div>
  )
}

export function MyBody() {
  const { user } = useAuth()
  const { profile, assessment, loading } = useProfile(user?.id)

  if (loading) return <Spinner />

  if (!assessment) return (
    <EmptyState
      icon={Activity}
      title="No assessment on file"
      description="Complete your ROM self-assessment to see your body map, joint breakdown, and technique readiness."
      action={<a href="/dashboard/settings" className="btn-primary text-sm">Get started</a>}
    />
  )

  const radarData = buildRadar(assessment)
  const bbTier = profile?.active_bb_tier ?? null
  const prs = computePRS(assessment)
  const tier = getPRSTier(prs)

  return (
    <div className="space-y-5">
      <PageHeader
        title="My Body"
        subtitle={`Assessed ${new Date(assessment.assessed_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}`}
        badge={bbTierLabel(bbTier)}
        badgeColor={bbTierColor(bbTier)}
      />

      {/* Movement Readiness Score */}
      <div className={cn('flex items-center gap-4 rounded-2xl border p-4', tier.bg, tier.ring.replace('border-', 'border ').replace('/40', ''))}>
        <div className={cn('w-16 h-16 rounded-full border-2 flex flex-col items-center justify-center shrink-0', tier.ring)}>
          <span className={cn('font-display font-bold text-2xl leading-none', tier.color)}>{prs}</span>
          <span className={cn('text-[10px] font-bold', tier.color)}>/100</span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <TrendingUp size={13} className={tier.color} />
            <span className={cn('text-xs font-bold uppercase tracking-wider', tier.color)}>Movement Readiness Score</span>
          </div>
          <p className={cn('text-lg font-bold leading-tight', tier.color)}>{tier.label}</p>
          <p className="text-xs text-charcoal-light mt-0.5">Retest every 6 weeks to track progress</p>
        </div>
      </div>

      {assessment.red_flag_triggered && (
        <div className="flex items-start gap-3 bg-red-tier-bg border border-red-200 rounded-2xl p-4">
          <AlertTriangle size={18} className="text-red-tier mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-semibold text-red-tier">Movement red flags detected</p>
            <p className="text-xs text-red-tier/80 mt-0.5 leading-relaxed">
              {assessment.red_flag_reasons?.join(' · ')}
            </p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <SectionCard title="ROM Profile">
          <ResponsiveContainer width="100%" height={260}>
            <RadarChart data={radarData} margin={{ top: 4, right: 20, bottom: 4, left: 20 }}>
              <PolarGrid stroke="#ffd0e0" />
              <PolarAngleAxis dataKey="joint" tick={{ fontSize: 10, fill: '#5a7070', fontFamily: 'Inter' }} />
              <Radar dataKey="value" stroke="#FF2D78" fill="#FF2D78" fillOpacity={0.2} dot={{ fill: '#FF2D78', r: 3 }} />
              <Tooltip
                contentStyle={{ fontSize: 12, borderRadius: 10, border: '1px solid #ffd0e0', fontFamily: 'Inter' }}
                formatter={(v) => [`${v}°`, 'ROM']}
              />
            </RadarChart>
          </ResponsiveContainer>
        </SectionCard>

        <SectionCard title="Summary">
          <div className="space-y-3 mt-2">
            {assessment.worst_joints && assessment.worst_joints.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-charcoal-light uppercase tracking-wide mb-2">Priority joints</p>
                <div className="flex flex-wrap gap-1.5">
                  {assessment.worst_joints.map(j => (
                    <span key={j} className="text-xs bg-red-tier-bg text-red-tier px-2.5 py-1 rounded-full font-medium">
                      {formatJoint(j)}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {assessment.rom_total != null && (
              <div className="flex justify-between items-center py-2.5 border-t border-miami-light">
                <span className="text-sm text-charcoal-light">ROM Total Score</span>
                <span className="text-sm font-bold text-charcoal">{assessment.rom_total}</span>
              </div>
            )}
            {assessment.rom_percentile != null && (
              <div className="flex justify-between items-center py-2.5 border-t border-miami-light">
                <span className="text-sm text-charcoal-light">Percentile</span>
                <span className="text-sm font-bold text-charcoal">{assessment.rom_percentile}th</span>
              </div>
            )}
          </div>
        </SectionCard>
      </div>

      <SectionCard title="Joint Breakdown" subtitle="Best side shown · % of optimal range">
        <div className="divide-y divide-miami-light/60">
          <JointBar label="Hip ER"         left={assessment.hip_er_l}        right={assessment.hip_er_r}        optimal={OPTIMAL['Hip ER']} />
          <JointBar label="Hip IR"         left={assessment.hip_ir_l}        right={assessment.hip_ir_r}        optimal={OPTIMAL['Hip IR']} />
          <JointBar label="Hip Abduction"  left={assessment.hip_abd_l}       right={assessment.hip_abd_r}       optimal={OPTIMAL['Hip Abd']} />
          <JointBar label="Hip Flexion"    left={assessment.hip_flex_l}      right={assessment.hip_flex_r}      optimal={OPTIMAL['Hip Flex']} />
          <JointBar label="Shoulder ER"    left={assessment.shoulder_er_l}   right={assessment.shoulder_er_r}   optimal={OPTIMAL['Shoulder ER']} />
          <JointBar label="Shoulder Flex"  left={assessment.shoulder_flex_l} right={assessment.shoulder_flex_r} optimal={OPTIMAL['Shoulder Flex']} />
          <JointBar label="Ankle DF"       left={assessment.ankle_df_l}      right={assessment.ankle_df_r}      optimal={OPTIMAL['Ankle DF']} />
          <JointBar label="Lumbar Flex"    midline={assessment.lumbar_flex}   optimal={OPTIMAL['Lumbar Flex']} />
          <JointBar label="Lumbar Ext"     midline={assessment.lumbar_ext}    optimal={OPTIMAL['Lumbar Ext']} />
          <JointBar label="Cervical Lateral" left={assessment.cervical_lat_l} right={assessment.cervical_lat_r} optimal={OPTIMAL['Cervical Lat']} />
          <JointBar label="Cervical Flexion"  midline={assessment.cervical_flex} optimal={OPTIMAL['Cervical Flex']} />
          <JointBar label="Cervical Extension" midline={assessment.cervical_ext} optimal={OPTIMAL['Cervical Ext']} />
        </div>
      </SectionCard>
    </div>
  )
}
