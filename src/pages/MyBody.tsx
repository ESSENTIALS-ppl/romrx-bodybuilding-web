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
import { useHipFlexCutover } from '../lib/hipFlexCutover'
import { computePRS, readinessBand, scoredView } from '../lib/readiness'
import { jointDisplayRowsForAssessment, formatMeasure, type JointDisplayRow } from '../lib/mobilityBands'
import { isLumbarKey } from '../lib/lumbarFlag'
import { BAND_FULL } from '../lib/mobilityBands'

// ── Position Readiness Score ──────────────────────────────────────────────────
// computePRS lives in ../lib/readiness (hip flexion is not in the score).

function getPRSTier(a: object) {
  // FG-37 J1: Base bands (Steady / Building / Needs focus) from the same worst-joint rule as Base mobilityBands.ts
  const band = readinessBand(a)
  if (band === 3) return { label: BAND_FULL[3],      color: 'text-miami',      bg: 'bg-miami-light',     ring: 'border-miami/40' }
  if (band === 2) return { label: BAND_FULL[2], color: 'text-yellow-tier', bg: 'bg-yellow-tier-bg',  ring: 'border-yellow-tier/40' }
  return { label: BAND_FULL[1],    color: 'text-red-tier',   bg: 'bg-red-tier-bg',     ring: 'border-red-tier/40' }
}

function buildRadar(a: Assessment) {
  return [
    { joint: 'Hip ER',       value: Math.max(a.hip_er_l ?? 0, a.hip_er_r ?? 0) },
    { joint: 'Hip IR',       value: Math.max(a.hip_ir_l ?? 0, a.hip_ir_r ?? 0) },
    { joint: 'Hip Abd',      value: Math.max(a.hip_abd_l ?? 0, a.hip_abd_r ?? 0) },
    { joint: 'Shoulder ER',  value: Math.max(a.shoulder_er_l ?? 0, a.shoulder_er_r ?? 0) },
    { joint: 'Shoulder Flex',value: Math.max(a.shoulder_flex_l ?? 0, a.shoulder_flex_r ?? 0) },
    { joint: 'Ankle DF',     value: Math.max(a.ankle_df_l ?? 0, a.ankle_df_r ?? 0) },
    { joint: 'Cervical Lat', value: Math.max(a.cervical_lat_l ?? 0, a.cervical_lat_r ?? 0) },
  ]
}

// Joint names stay as this site already shows them; Base's row label is the fallback.
const JOINT_LABEL: Record<string, string> = { cervical_lat: 'Cervical Lateral', cervical_flex: 'Cervical Flexion', cervical_ext: 'Cervical Extension' }

// Hip flexion is hidden (unmeasured) for assessments saved before the FG-36 cutover.
const hipView = (a: Assessment) => scoredView(a) as Assessment

function JointBar({ row, label }: { row: JointDisplayRow; label: string }) {
  // Base's own per-joint rows (worse side, % of the Base target, Base band). A joint the user did not measure draws nothing.
  const { left, right, midline, pct, band, unit } = row
  if (pct == null) return null
  const asym = left != null && right != null ? Math.abs(left - right) : 0
  const isBad = band === 1

  return (
    <div className="flex items-center gap-3 py-2">
      <div className="w-32 shrink-0">
        <p className={cn('text-xs font-medium', isBad ? 'text-red-tier' : 'text-charcoal')}>{label}</p>
        {asym > 10 && (
          <p className="text-xs text-gold flex items-center gap-0.5 mt-0.5">
            <AlertTriangle size={9} /> {formatMeasure(asym)}{unit} gap
          </p>
        )}
      </div>
      <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
        <div
          className={cn('h-full rounded-full transition-all duration-500',
            band === 3 ? 'bg-miami' : band === 2 ? 'bg-miami-orange' : 'bg-red-400')}
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="w-20 text-right shrink-0 text-xs text-charcoal-light">
        {midline != null ? `${formatMeasure(midline)}${unit}` : `${formatMeasure(left)}${unit} / ${formatMeasure(right)}${unit}`}
      </div>
      <div className="w-8 text-right shrink-0">
        <span className={cn('text-xs font-bold',
          band === 3 ? 'text-miami' : band === 2 ? 'text-miami-orange' : 'text-red-tier')}>
          {pct}%
        </span>
      </div>
    </div>
  )
}

export function MyBody() {
  useHipFlexCutover() // re-render when the FG-36 cutover is read
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
  const tier = getPRSTier(assessment)
  // Older rows may still list hip flexion; it is never a priority joint or a red flag.
  const priorityJoints = (assessment.worst_joints ?? [])
  const redFlagReasons = (assessment.red_flag_reasons ?? [])

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

      {assessment.red_flag_triggered && redFlagReasons.length > 0 && (
        <div className="flex items-start gap-3 bg-red-tier-bg border border-red-200 rounded-2xl p-4">
          <AlertTriangle size={18} className="text-red-tier mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-semibold text-red-tier">Notes from your assessment</p>
            <p className="text-xs text-red-tier/80 mt-0.5 leading-relaxed">
              {redFlagReasons.join(' · ')}
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
            {priorityJoints.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-charcoal-light uppercase tracking-wide mb-2">Priority joints</p>
                <div className="flex flex-wrap gap-1.5">
                  {priorityJoints.map(j => (
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

      <SectionCard title="Joint Breakdown" subtitle="Worse side shown - % of your Base target">
        <div className="divide-y divide-miami-light/60">
          {jointDisplayRowsForAssessment(hipView(assessment))
            .filter(r => !isLumbarKey(r.key))
            .map(r => <JointBar key={r.key} row={r} label={JOINT_LABEL[r.key] ?? r.label} />)}
        </div>
      </SectionCard>
    </div>
  )
}
