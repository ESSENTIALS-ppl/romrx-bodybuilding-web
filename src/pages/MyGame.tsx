import { useState, useCallback, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { useProfile } from '../hooks/useProfile'
import type { TechniqueEligibility } from '../hooks/useProfile'
import { PageHeader } from '../components/PageHeader'
import { SectionCard } from '../components/SectionCard'
import { EmptyState } from '../components/EmptyState'
import { Spinner } from '../components/Spinner'
import { TierBadge } from '../components/ui/TierBadge'
import { formatJoint, beltColor, cn } from '../lib/utils'
import { supabase } from '../lib/supabase'
import {
  Search, Layers, AlertTriangle, Swords, Shield,
  RefreshCw, ChevronDown, MapPin, Trophy, ArrowDown,
  Wand2, PenLine, CheckCircle2,
  Flame, Brain, Zap, Footprints, CircleDot,
  Bookmark, Share2, Trash2, Check, Lock,
  ChevronLeft, Star, Dumbbell, X,
  Printer, GitBranch, Medal, ChevronRight,
} from 'lucide-react'

// ── Position labels ───────────────────────────────────────────────────────────
const POS: Record<string, string> = {
  standing:     'Standing',
  top_passing:  'Guard vs. Top',
  dominant_top: 'Dominant Position',
  bottom_guard: 'Guard (Bottom)',
  finish:       'Submission',
}

// Category → from/to position
const CAT_FROM: Record<string, string> = {
  'Throws':       'standing',
  'Guards':       'bottom_guard',
  'Passes':       'top_passing',
  'Sweeps':       'bottom_guard',
  'Controls':     'dominant_top',
  'Submissions':  'dominant_top',
}
const CAT_TO: Record<string, string> = {
  'Throws':       'top_passing',
  'Guards':       'bottom_guard',
  'Passes':       'dominant_top',
  'Sweeps':       'top_passing',
  'Controls':     'dominant_top',
  'Submissions':  'finish',
}

// Sequence for each path
const OFFENSE_SEQ = ['Throws', 'Passes', 'Controls', 'Submissions'] as const
const DEFENSE_SEQ = ['Guards', 'Sweeps', 'Controls', 'Submissions'] as const

// AI path sequences
const STANDING_SEQ = ['Throws', 'Passes', 'Controls', 'Submissions'] as const
const ONTOP_SEQ    = ['Passes', 'Controls', 'Submissions'] as const
const ONBOTTOM_SEQ = ['Guards', 'Sweeps', 'Controls', 'Submissions'] as const

type PathMode       = 'offense' | 'defense'
type GenMode        = 'quick' | 'custom' | 'ai' | 'competition'
type Tab            = 'gameplan' | 'myflows' | 'library' | 'coachpicks'
type AIStart        = 'standing' | 'ontop' | 'onbottom'
type AIFinish       = 'chokes' | 'arm' | 'legs'
type AIStyle        = 'explosive' | 'technical'

// Competition mode types
type CompFormat   = 'points' | 'submission' | 'mma'
type CompDuration = 'under5' | '5to8' | 'over8'
type CompThreat   = 'takedown' | 'guard' | 'leglock'

// ── Saved plan shape ──────────────────────────────────────────────────────────
interface FlowTech {
  id: string
  name: string
  code: string
  tier: string
  flag: string | null
  category: string
  belt: string
  limiting_joints?: string[]
  is_branch?: boolean
}

interface SavedPlan {
  id: string
  name: string
  description: string
  createdAt: string
  pathMode: string
  techniques: FlowTech[]
}

// DB row shape from game_plans table
interface GamePlanRow {
  id: string
  user_id: string
  name: string
  description: string
  path_mode: string
  techniques: FlowTech[]
  created_at: string
  updated_at: string
}

// Drill session row
interface DrillSession {
  id: string
  game_plan_id: string
  technique_name: string
  category: string
  notes: string | null
  drilled_at: string
}

// Branch point for If/Then branching
interface BranchPoint {
  stepIndex: number
  primaryTech: FlowTech
  altTech: FlowTech | null
}

function rowToSavedPlan(row: GamePlanRow): SavedPlan {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    createdAt: row.created_at,
    pathMode: row.path_mode,
    techniques: row.techniques,
  }
}

// ── Game plan name map ────────────────────────────────────────────────────────
function getAIPlanName(start: AIStart, finish: AIFinish, style: AIStyle): string {
  if (start === 'standing' && finish === 'chokes' && style === 'explosive') return 'The Takedown Finisher'
  if (start === 'standing' && finish === 'chokes' && style === 'technical') return 'The Judo Strangler'
  if (start === 'standing' && finish === 'arm'    && style === 'explosive') return 'The Combat Wrestler'
  if (start === 'standing' && finish === 'arm'    && style === 'technical') return 'The Chain Attacker'
  if (start === 'standing' && finish === 'legs')                            return 'The Standing Leg Hunter'
  if (start === 'ontop'    && finish === 'chokes' && style === 'explosive') return 'The Pressure Strangler'
  if (start === 'ontop'    && finish === 'chokes' && style === 'technical') return 'The Steady Grinder'
  if (start === 'ontop'    && finish === 'arm'    && style === 'explosive') return 'The Smash Passer'
  if (start === 'ontop'    && finish === 'arm'    && style === 'technical') return 'The Control Specialist'
  if (start === 'ontop'    && finish === 'legs')                            return 'The Leg Hunter'
  if (start === 'onbottom' && finish === 'chokes' && style === 'explosive') return 'The Guard Shark'
  if (start === 'onbottom' && finish === 'chokes' && style === 'technical') return 'The Technical Wrapper'
  if (start === 'onbottom' && finish === 'arm'    && style === 'explosive') return 'The Hip Escape Finisher'
  if (start === 'onbottom' && finish === 'arm'    && style === 'technical') return 'The Guard Technician'
  if (start === 'onbottom' && finish === 'legs')                            return 'The Leg Lace Specialist'
  return 'Custom Game Plan'
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function pick<T>(arr: T[]): T | null {
  return arr.length ? arr[Math.floor(Math.random() * arr.length)] : null
}

function eligibleInCat(eligibility: TechniqueEligibility[], cat: string) {
  return eligibility.filter(e => {
    const t = e.techniques as { category: string }
    return (e.tier === 'GREEN' || e.tier === 'YELLOW') && !e.flag &&
      t.category.toLowerCase() === cat.toLowerCase()
  })
}

// GREEN-only eligible techniques for competition mode
function greenOnlyInCat(eligibility: TechniqueEligibility[], cat: string) {
  return eligibility.filter(e => {
    const t = e.techniques as { category: string }
    return e.tier === 'GREEN' && !e.flag &&
      t.category.toLowerCase() === cat.toLowerCase()
  })
}

function limitingJoints(eligibility: TechniqueEligibility[], cat: string): string[] {
  const reds = eligibility.filter(e => {
    const t = e.techniques as { category: string }
    return (e.tier === 'RED' || e.flag === 'DELAY_TECHNIQUE') &&
      t.category.toLowerCase() === cat.toLowerCase()
  })
  const joints = new Set<string>()
  reds.forEach(e => (e.limiting_joints ?? []).forEach(j => joints.add(j)))
  return Array.from(joints).slice(0, 3)
}

function pickByFinish(eligible: TechniqueEligibility[], finish: AIFinish): TechniqueEligibility | null {
  if (eligible.length === 0) return null

  const keywords: Record<AIFinish, string[]> = {
    chokes: ['choke', 'strangle', 'naked', 'triangle', 'guillotine'],
    arm:    ['armbar', 'kimura', 'americana', 'arm'],
    legs:   ['heel', 'kneebar', 'ankle', 'leg'],
  }

  const kws = keywords[finish]
  const preferred = eligible.filter(e => {
    const name = (e.techniques as { name: string }).name.toLowerCase()
    return kws.some(k => name.includes(k))
  })

  if (preferred.length > 0) return pick(preferred)

  // fall back: GREEN first, then YELLOW
  const greens = eligible.filter(e => e.tier === 'GREEN')
  if (greens.length > 0) return pick(greens)
  return pick(eligible)
}

function eligToFlowTech(e: TechniqueEligibility): FlowTech {
  const t = e.techniques as { code: string; name: string; belt: string; category: string }
  return {
    id:              e.id,
    name:            t.name,
    code:            t.code,
    tier:            e.tier,
    flag:            e.flag,
    category:        t.category,
    belt:            t.belt,
    limiting_joints: e.limiting_joints ?? [],
  }
}

// ── PrintButton component ─────────────────────────────────────────────────────
function PrintButton({ planName: _planName }: { planName?: string }) {
  return (
    <button
      onClick={() => window.print()}
      className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-teal-light text-sm font-semibold text-charcoal hover:bg-surface transition-colors"
      title="Save as PDF via browser print dialog"
    >
      <Printer size={14} />
      Save as PDF
    </button>
  )
}

// Print CSS injected once at module level (avoids re-injection)
const PRINT_STYLE = `
@media print {
  /* Hide everything by default */
  body > * { display: none !important; }
  /* Show only the print target */
  .print-flow-root, .print-flow-root * { display: revert !important; }
  .print-flow-root { display: block !important; }
  /* Hide non-flow elements inside the page */
  .no-print { display: none !important; }
  /* Node cards don't break across pages */
  .flow-node-card { break-inside: avoid; page-break-inside: avoid; }
  /* Plan header styling */
  .print-plan-header {
    font-size: 18px;
    font-weight: bold;
    margin-bottom: 4px;
  }
  .print-plan-desc {
    font-size: 12px;
    color: #555;
    margin-bottom: 16px;
  }
}
`

// Inject print style once
if (typeof document !== 'undefined') {
  const existing = document.getElementById('romrx-print-style')
  if (!existing) {
    const style = document.createElement('style')
    style.id = 'romrx-print-style'
    style.textContent = PRINT_STYLE
    document.head.appendChild(style)
  }
}

// ── VisualFlow component ──────────────────────────────────────────────────────
interface VisualFlowStep {
  tech: FlowTech | null
  category: string
}

function tierBorderClass(tier: string | null): string {
  if (tier === 'GREEN')  return 'border-l-4 border-l-teal'
  if (tier === 'YELLOW') return 'border-l-4 border-l-yellow-400'
  return 'border-l-4 border-l-gray-200'
}

function FlowNode({
  step, index, totalSteps, eligibility, drillCount,
}: {
  step: VisualFlowStep
  index: number
  totalSteps: number
  eligibility: TechniqueEligibility[]
  drillCount?: number
}) {
  const isFirst  = index === 0
  const isLast   = index === totalSteps - 1
  const fromPos  = CAT_FROM[step.category] ?? 'standing'
  const toPos    = CAT_TO[step.category]   ?? 'finish'
  const isFinish = isLast && toPos === 'finish'
  const joints   = step.tech?.limiting_joints ?? []

  if (!step.tech) {
    const locked = limitingJoints(eligibility, step.category)
    return (
      <div>
        {isFirst && (
          <div className="flex items-center gap-2 py-2 pl-1">
            <MapPin size={13} className="text-teal shrink-0" />
            <span className="text-xs font-bold text-teal uppercase tracking-wider">{POS[fromPos] ?? fromPos}</span>
          </div>
        )}
        <div className="flex items-center gap-1 text-charcoal-light my-1 ml-3">
          <ArrowDown size={12} />
          <span className="text-[10px] uppercase tracking-widest font-semibold">{step.category}</span>
        </div>
        <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4 border-l-4 border-l-gray-300">
          <div className="flex items-center gap-2">
            <Lock size={14} className="text-gray-400 shrink-0" />
            <div>
              <p className="text-sm font-semibold text-gray-500">No {step.category} available</p>
              {locked.length > 0 && (
                <p className="text-xs text-gray-400 mt-0.5">
                  Work on {locked.map(j => formatJoint(j)).join(', ')} to unlock {step.category} techniques.
                </p>
              )}
            </div>
          </div>
        </div>
        {isLast && (
          <div className="flex items-center gap-2 py-2 pl-1 mt-1">
            <Trophy size={13} className="text-teal shrink-0" />
            <span className="text-xs font-bold text-teal uppercase tracking-wider">Submission</span>
          </div>
        )}
      </div>
    )
  }

  const effectiveTier = step.tech.flag === 'DELAY_TECHNIQUE' ? 'RED' : step.tech.tier
  const isReady = (drillCount ?? 0) >= 5
  const hasDrills = (drillCount ?? 0) > 0

  return (
    <div>
      {isFirst && (
        <div className="flex items-center gap-2 py-2 pl-1">
          <MapPin size={13} className="text-teal shrink-0" />
          <span className="text-xs font-bold text-teal uppercase tracking-wider">{POS[fromPos] ?? fromPos}</span>
        </div>
      )}
      <div className="flex items-center gap-1 text-charcoal-light my-1 ml-3">
        <ArrowDown size={12} />
        <span className="text-[10px] uppercase tracking-widest font-semibold">{step.category}</span>
      </div>
      <div className={cn(
        'rounded-2xl border border-teal-light bg-white overflow-hidden relative flow-node-card',
        tierBorderClass(effectiveTier),
        isFinish && 'border border-yellow-300 bg-yellow-50',
      )}>
        {isFinish && (
          <div className="flex items-center gap-1.5 px-4 pt-3 pb-0">
            <Trophy size={13} className="text-yellow-600" />
            <span className="text-[10px] font-bold text-yellow-700 uppercase tracking-wider">Submission</span>
          </div>
        )}
        <div className="px-4 py-3">
          <p className="text-[10px] font-mono text-charcoal-light uppercase tracking-wider">{step.tech.code}</p>
          <p className="text-sm font-semibold text-charcoal leading-snug mt-0.5">{step.tech.name}</p>
          <div className="flex gap-1.5 mt-2 flex-wrap items-center">
            <span className={cn('text-[11px] px-2 py-0.5 rounded-full capitalize font-medium', beltColor(step.tech.belt))}>
              {step.tech.belt}
            </span>
            <TierBadge tier={effectiveTier} flag={step.tech.flag} size="sm" />
          </div>
          {joints.length > 0 && (
            <div className="flex items-center gap-1 mt-2 flex-wrap">
              <AlertTriangle size={10} className="text-yellow-600 shrink-0" />
              {joints.map(j => (
                <span key={j} className="text-[10px] bg-yellow-50 text-yellow-700 px-1.5 py-0.5 rounded-full">
                  {formatJoint(j)}
                </span>
              ))}
            </div>
          )}
        </div>
        {/* Drill progress badge — bottom right */}
        {hasDrills && (
          <div className="absolute bottom-2 right-2">
            {isReady ? (
              <span className="flex items-center gap-1 text-[10px] font-bold bg-teal text-white px-2 py-0.5 rounded-full">
                <Check size={9} /> Ready
              </span>
            ) : (
              <span className="text-[10px] font-semibold bg-green-100 text-green-700 px-2 py-0.5 rounded-full">
                {drillCount} {drillCount === 1 ? 'drill' : 'drills'}
              </span>
            )}
          </div>
        )}
      </div>
      {isLast && (
        <div className="flex items-center gap-2 py-2 pl-1 mt-1">
          {isFinish
            ? <Trophy size={13} className="text-teal shrink-0" />
            : <MapPin size={13} className="text-teal shrink-0" />}
          <span className="text-xs font-bold text-teal uppercase tracking-wider">
            {isFinish ? 'Submission' : (POS[toPos] ?? toPos)}
          </span>
        </div>
      )}
    </div>
  )
}

function VisualFlow({
  steps, eligibility, planId, planName, planDescription, isCompetition,
}: {
  steps: VisualFlowStep[]
  eligibility: TechniqueEligibility[]
  planId?: string
  planName?: string
  planDescription?: string
  isCompetition?: boolean
}) {
  const [drillCounts, setDrillCounts] = useState<Record<string, number>>({})

  useEffect(() => {
    if (!planId) return
    supabase.from('drill_sessions')
      .select('technique_name')
      .eq('game_plan_id', planId)
      .then(({ data }) => {
        const counts: Record<string, number> = {}
        data?.forEach(d => { counts[d.technique_name] = (counts[d.technique_name] ?? 0) + 1 })
        setDrillCounts(counts)
      })
  }, [planId])

  return (
    <div className="print-flow-root">
      {/* Print-only header */}
      {planName && (
        <div className="hidden print-plan-header">{planName}</div>
      )}
      {planDescription && (
        <div className="hidden print-plan-desc">{planDescription}</div>
      )}
      <div className="space-y-1 bg-white rounded-2xl border border-teal-light p-5">
        {isCompetition && (
          <div className="flex items-center gap-1.5 mb-3">
            <span className="flex items-center gap-1.5 text-[11px] font-bold bg-red-500 text-white px-2.5 py-1 rounded-full">
              <Medal size={11} /> Competition
            </span>
            <span className="text-[11px] text-charcoal-light">GREEN techniques only</span>
          </div>
        )}
        {steps.map((step, i) => (
          <FlowNode
            key={`${step.category}-${i}`}
            step={step}
            index={i}
            totalSteps={steps.length}
            eligibility={eligibility}
            drillCount={drillCounts[step.tech?.name ?? '']}
          />
        ))}
      </div>
    </div>
  )
}

// ── Position pill (used in custom builder) ────────────────────────────────────
function PositionPill({ pos, isFinish }: { pos: string; isFinish?: boolean }) {
  return (
    <div className="flex items-center gap-2 py-2 pl-1">
      {isFinish
        ? <Trophy size={13} className="text-teal shrink-0" />
        : <MapPin size={13} className="text-teal shrink-0" />}
      <span className="text-xs font-bold text-teal uppercase tracking-wider">
        {isFinish ? 'Submission' : (POS[pos] ?? pos)}
      </span>
    </div>
  )
}

// ── Custom Builder — one step selector ────────────────────────────────────────
function StepSelector({ category, eligible, selected, onSelect }: {
  category: string
  eligible: TechniqueEligibility[]
  selected: TechniqueEligibility | null
  onSelect: (t: TechniqueEligibility | null) => void
}) {
  const [open, setOpen] = useState(false)
  const selectedTech = selected?.techniques as { name: string; code: string } | undefined

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className={cn(
          'w-full flex items-center justify-between gap-3 px-4 py-3 rounded-2xl border-2 text-left transition-all',
          selected
            ? 'border-teal bg-teal/5'
            : 'border-teal-light bg-white hover:border-teal/30'
        )}
      >
        <div className="flex items-center gap-3 min-w-0">
          {selected
            ? <CheckCircle2 size={16} className="text-teal shrink-0" />
            : <div className="w-4 h-4 rounded-full border-2 border-charcoal-light shrink-0" />}
          <div className="min-w-0">
            {selected ? (
              <>
                <p className="text-[10px] text-charcoal-light font-mono uppercase tracking-wider">{selectedTech?.code}</p>
                <p className="text-sm font-semibold text-charcoal leading-tight truncate">{selectedTech?.name}</p>
              </>
            ) : (
              <p className="text-sm text-charcoal-light">Choose a {category} technique...</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {selected && <TierBadge tier={selected.tier} flag={selected.flag} size="sm" />}
          <ChevronDown size={14} className={cn('text-charcoal-light transition-transform', open && 'rotate-180')} />
        </div>
      </button>

      {open && (
        <div className="absolute z-20 top-full left-0 right-0 mt-1 bg-white rounded-2xl border border-teal-light shadow-lg overflow-hidden max-h-60 overflow-y-auto">
          {eligible.length === 0 ? (
            <div className="px-4 py-3 text-xs text-charcoal-light">
              No GREEN or YELLOW {category} available yet.
            </div>
          ) : (
            eligible.map(e => {
              const t = e.techniques as { code: string; name: string; belt: string }
              return (
                <button
                  key={e.id}
                  onClick={() => { onSelect(e); setOpen(false) }}
                  className={cn(
                    'w-full flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-surface transition-colors border-b border-teal-light/50 last:border-0',
                    selected?.id === e.id && 'bg-teal/5'
                  )}
                >
                  <div>
                    <p className="text-[10px] font-mono text-charcoal-light uppercase tracking-wider">{t.code}</p>
                    <p className="text-sm font-semibold text-charcoal leading-snug">{t.name}</p>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${beltColor(t.belt)}`}>{t.belt}</span>
                  </div>
                  <TierBadge tier={e.tier} flag={e.flag} size="sm" />
                </button>
              )
            })
          )}
        </div>
      )}
    </div>
  )
}

// ── Technique library card ────────────────────────────────────────────────────
const CATEGORIES = ['All', 'Throws', 'Passes', 'Guards', 'Sweeps', 'Controls', 'Submissions', 'Submission defense']
const TIERS = ['All', 'GREEN', 'YELLOW', 'RED'] as const

function TechCard({ item }: { item: TechniqueEligibility }) {
  const tech = item.techniques as { code: string; name: string; belt: string; category: string }
  const isDelay = item.flag === 'DELAY_TECHNIQUE'
  return (
    <div className="bg-white rounded-2xl border border-teal-light p-4 flex flex-col gap-2.5 hover:border-teal/40 transition-colors">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <span className="text-[10px] font-mono text-charcoal-light uppercase tracking-wider">{tech.code}</span>
          <p className="text-sm font-semibold text-charcoal leading-snug mt-0.5 line-clamp-2">{tech.name}</p>
        </div>
        <TierBadge tier={isDelay ? 'RED' : item.tier} flag={item.flag} size="sm" />
      </div>
      <div className="flex flex-wrap gap-1.5">
        <span className="text-[11px] bg-surface text-charcoal-light px-2 py-0.5 rounded-full capitalize">{tech.category}</span>
        <span className={`text-[11px] px-2 py-0.5 rounded-full capitalize font-medium ${beltColor(tech.belt)}`}>{tech.belt}</span>
      </div>
      {item.limiting_joints && item.limiting_joints.length > 0 && (
        <div className="pt-2 border-t border-teal-light/60">
          <div className="flex items-center gap-1 mb-1.5">
            <AlertTriangle size={10} className="text-yellow-600" />
            <span className="text-[10px] font-semibold text-charcoal-light uppercase tracking-wide">Limiting</span>
          </div>
          <div className="flex flex-wrap gap-1">
            {item.limiting_joints.map(j => (
              <span key={j} className="text-[11px] bg-yellow-tier-bg text-yellow-tier px-2 py-0.5 rounded-full">{formatJoint(j)}</span>
            ))}
          </div>
        </div>
      )}
      {isDelay && (
        <div className="pt-2 border-t border-red-100">
          <p className="text-[11px] text-red-tier bg-red-tier-bg rounded-lg px-2.5 py-1.5 leading-snug">
            Build prerequisite mobility before attempting this technique.
          </p>
        </div>
      )}
    </div>
  )
}

// ── Log Drill Form ────────────────────────────────────────────────────────────
function LogDrillForm({
  plan,
  userId,
  onClose,
  onLogged,
}: {
  plan: SavedPlan
  userId: string
  onClose: () => void
  onLogged: () => void
}) {
  const techOptions = plan.techniques.map(t => ({ name: t.name, category: t.category }))
  const [selectedTech, setSelectedTech] = useState(techOptions[0]?.name ?? '')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)

  async function handleSubmit() {
    if (!selectedTech) return
    setSaving(true)
    try {
      const chosen = plan.techniques.find(t => t.name === selectedTech)
      await supabase.from('drill_sessions').insert({
        user_id: userId,
        game_plan_id: plan.id,
        technique_name: selectedTech,
        category: chosen?.category ?? '',
        notes: notes.trim() || null,
      })
      onLogged()
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mt-3 pt-3 border-t border-teal-light space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-bold text-charcoal uppercase tracking-wide">Log a Drill</p>
        <button onClick={onClose} className="text-charcoal-light hover:text-charcoal transition-colors">
          <X size={14} />
        </button>
      </div>
      <div className="space-y-2">
        <select
          value={selectedTech}
          onChange={e => setSelectedTech(e.target.value)}
          className="w-full px-3 py-2 text-sm rounded-xl border border-teal-light bg-white focus:outline-none focus:border-teal transition-colors"
        >
          {techOptions.map(t => (
            <option key={t.name} value={t.name}>{t.name}</option>
          ))}
        </select>
        <textarea
          value={notes}
          onChange={e => setNotes(e.target.value)}
          rows={2}
          placeholder="Optional notes..."
          className="w-full px-3 py-2 text-sm rounded-xl border border-teal-light bg-white focus:outline-none focus:border-teal transition-colors resize-none"
        />
        <button
          onClick={handleSubmit}
          disabled={saving || !selectedTech}
          className="w-full py-2 rounded-xl bg-teal text-white text-sm font-semibold hover:bg-teal/90 transition-colors disabled:opacity-60"
        >
          {saving ? 'Logging...' : 'Log Drill'}
        </button>
      </div>
    </div>
  )
}

// ── Saved Plan Card ───────────────────────────────────────────────────────────
function SavedPlanCard({
  plan,
  userId,
  onLoad,
  onDelete,
}: {
  plan: SavedPlan
  userId: string
  onLoad: (plan: SavedPlan) => void
  onDelete: (id: string) => void
}) {
  const [copied, setCopied] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [showLogForm, setShowLogForm] = useState(false)
  const [drillSessions, setDrillSessions] = useState<DrillSession[]>([])
  const [drillCount, setDrillCount] = useState(0)
  const [sessionsLoaded, setSessionsLoaded] = useState(false)

  const loadDrillSessions = useCallback(async () => {
    const { data: countData } = await supabase
      .from('drill_sessions')
      .select('id', { count: 'exact', head: true })
      .eq('game_plan_id', plan.id)
    setDrillCount(countData?.length ?? 0)

    const { data } = await supabase
      .from('drill_sessions')
      .select('*')
      .eq('game_plan_id', plan.id)
      .order('drilled_at', { ascending: false })
      .limit(3)
    setDrillSessions((data as DrillSession[]) ?? [])
    setSessionsLoaded(true)
  }, [plan.id])

  useEffect(() => {
    loadDrillSessions()
  }, [loadDrillSessions])

  // Re-fetch actual count
  useEffect(() => {
    async function fetchCount() {
      const { count } = await supabase
        .from('drill_sessions')
        .select('*', { count: 'exact', head: true })
        .eq('game_plan_id', plan.id)
      setDrillCount(count ?? 0)
    }
    fetchCount()
  }, [plan.id])

  const g = plan.techniques.filter(t => t.tier === 'GREEN' && !t.flag).length
  const y = plan.techniques.filter(t => t.tier === 'YELLOW' && !t.flag).length
  const r = plan.techniques.filter(t => t.tier === 'RED' || t.flag === 'DELAY_TECHNIQUE').length

  const handleShare = () => {
    const url = window.location.href + '#plan=' + btoa(JSON.stringify(plan))
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  const dateStr = new Date(plan.createdAt).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  })

  return (
    <div className="bg-white rounded-2xl border border-teal-light p-4 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-bold text-charcoal text-sm">{plan.name}</p>
            {plan.pathMode === 'competition' && (
              <span className="flex items-center gap-1 text-[10px] font-bold bg-red-500 text-white px-2 py-0.5 rounded-full">
                <Medal size={9} /> Competition
              </span>
            )}
            {drillCount > 0 && (
              <span className="text-[10px] bg-teal-light text-teal px-2 py-0.5 rounded-full font-semibold shrink-0">
                {drillCount} {drillCount === 1 ? 'session' : 'sessions'}
              </span>
            )}
          </div>
          <p className="text-xs text-charcoal-light mt-0.5">{dateStr}</p>
        </div>
        <div className="flex gap-1 shrink-0">
          <button
            onClick={handleShare}
            className="p-1.5 rounded-lg text-charcoal-light hover:text-teal hover:bg-teal-light transition-colors"
            title="Copy share link"
          >
            {copied ? <Check size={14} className="text-teal" /> : <Share2 size={14} />}
          </button>
          {confirmDelete ? (
            <div className="flex gap-1 items-center">
              <button
                onClick={() => onDelete(plan.id)}
                className="text-[11px] bg-red-500 text-white px-2 py-1 rounded-lg font-semibold"
              >
                Confirm
              </button>
              <button
                onClick={() => setConfirmDelete(false)}
                className="text-[11px] bg-gray-100 text-charcoal-light px-2 py-1 rounded-lg"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              onClick={() => setConfirmDelete(true)}
              className="p-1.5 rounded-lg text-charcoal-light hover:text-red-500 hover:bg-red-50 transition-colors"
              title="Delete plan"
            >
              <Trash2 size={14} />
            </button>
          )}
        </div>
      </div>

      {/* Technique chain */}
      <p className="text-xs text-charcoal-light leading-relaxed">
        {plan.techniques.map(t => t.name).join(' \u2192 ')}
      </p>

      {/* Tier strip */}
      <div className="flex gap-1.5 flex-wrap">
        {g > 0 && <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full tier-green">{g} GREEN</span>}
        {y > 0 && <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full tier-yellow">{y} YELLOW</span>}
        {r > 0 && <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full tier-red">{r} RED</span>}
      </div>

      {/* Drill sessions */}
      {sessionsLoaded && drillSessions.length > 0 && (
        <div className="space-y-1.5 pt-1 border-t border-teal-light/60">
          <p className="text-[10px] font-semibold text-charcoal-light uppercase tracking-wide flex items-center gap-1">
            <Dumbbell size={10} className="text-teal" /> Recent Drills
          </p>
          {drillSessions.map(ds => (
            <div key={ds.id} className="flex items-start justify-between gap-2 text-xs bg-surface rounded-xl px-3 py-1.5">
              <div className="min-w-0">
                <p className="font-medium text-charcoal truncate">{ds.technique_name}</p>
                {ds.notes && (
                  <p className="text-charcoal-light truncate mt-0.5">{ds.notes}</p>
                )}
              </div>
              <span className="text-charcoal-light shrink-0">
                {new Date(ds.drilled_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              </span>
            </div>
          ))}
        </div>
      )}

      <div className="flex gap-2">
        <button
          onClick={() => onLoad(plan)}
          className="flex-1 py-2 rounded-xl bg-teal text-white text-sm font-semibold hover:bg-teal/90 transition-colors"
        >
          Load Plan
        </button>
        <button
          onClick={() => setShowLogForm(o => !o)}
          className={cn(
            'flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-semibold transition-colors border',
            showLogForm
              ? 'bg-teal text-white border-teal'
              : 'border-teal-light text-charcoal hover:bg-surface'
          )}
          title="Log a drill session"
        >
          <Dumbbell size={14} />
          Log Drill
        </button>
      </div>

      {showLogForm && (
        <LogDrillForm
          plan={plan}
          userId={userId}
          onClose={() => setShowLogForm(false)}
          onLogged={loadDrillSessions}
        />
      )}
    </div>
  )
}

// ── BranchNode — a single node in the branch grid ────────────────────────────
function BranchNodeCard({
  tech, label, isAlt,
}: {
  tech: FlowTech | null
  label?: string
  isAlt?: boolean
}) {
  if (!tech) return (
    <div className={cn(
      'rounded-2xl border border-dashed border-gray-200 bg-gray-50 p-3 flex items-center justify-center min-h-[60px]',
      isAlt && 'opacity-50'
    )}>
      <p className="text-xs text-gray-400">{isAlt ? 'No alt set' : '—'}</p>
    </div>
  )

  const effectiveTier = tech.flag === 'DELAY_TECHNIQUE' ? 'RED' : tech.tier

  return (
    <div className={cn(
      'rounded-2xl border border-teal-light bg-white p-3',
      tierBorderClass(effectiveTier),
      isAlt && 'border-dashed opacity-80'
    )}>
      {label && <p className="text-[9px] font-bold text-charcoal-light uppercase tracking-wider mb-1">{label}</p>}
      <p className="text-[10px] font-mono text-charcoal-light uppercase">{tech.code}</p>
      <p className="text-xs font-semibold text-charcoal leading-snug mt-0.5">{tech.name}</p>
      <div className="mt-1.5">
        <TierBadge tier={effectiveTier} flag={tech.flag} size="sm" />
      </div>
    </div>
  )
}

// ── Branch Builder UI ────────────────────────────────────────────────────────
function BranchBuilder({
  steps,
  eligibility,
  branches,
  onBranchesChange,
}: {
  steps: VisualFlowStep[]
  eligibility: TechniqueEligibility[]
  branches: BranchPoint[]
  onBranchesChange: (branches: BranchPoint[]) => void
}) {
  const [addingBranchAt, setAddingBranchAt] = useState<number | null>(null)
  const [altPickOpen, setAltPickOpen] = useState<number | null>(null)

  const branchAtStep = (idx: number) => branches.find(b => b.stepIndex === idx) ?? null

  const addBranch = (stepIdx: number) => {
    const step = steps[stepIdx]
    if (!step.tech) return
    const existing = branchAtStep(stepIdx)
    if (existing) return
    const newBranch: BranchPoint = { stepIndex: stepIdx, primaryTech: step.tech, altTech: null }
    onBranchesChange([...branches, newBranch])
    setAddingBranchAt(null)
    setAltPickOpen(stepIdx)
  }

  const removeBranch = (stepIdx: number) => {
    onBranchesChange(branches.filter(b => b.stepIndex !== stepIdx))
  }

  const setAltTech = (stepIdx: number, tech: FlowTech | null) => {
    onBranchesChange(branches.map(b => b.stepIndex === stepIdx ? { ...b, altTech: tech } : b))
    setAltPickOpen(null)
  }

  return (
    <div className="space-y-3 pt-3 border-t border-teal-light/60">
      <div className="flex items-center gap-2">
        <GitBranch size={14} className="text-teal" />
        <p className="text-xs font-bold text-charcoal uppercase tracking-wide">Contingency Branches</p>
      </div>
      <p className="text-xs text-charcoal-light">
        Add "If/Then" alternates for each step. If your primary technique fails, you'll have a backup path ready.
      </p>

      {steps.map((step, i) => {
        if (!step.tech) return null
        const branch = branchAtStep(i)

        return (
          <div key={i} className="space-y-1">
            {/* Step label */}
            <p className="text-[10px] font-bold text-charcoal-light uppercase tracking-wider px-1">
              Step {i + 1} — {step.category}
            </p>

            {branch ? (
              /* Branch row: primary | OR | alt */
              <div className="grid grid-cols-[1fr_auto_1fr] gap-2 items-center">
                <BranchNodeCard tech={step.tech} label="Primary" />
                <div className="flex flex-col items-center gap-1">
                  <div className="w-px h-4 bg-teal-light" />
                  <span className="text-[10px] font-bold text-charcoal-light bg-surface border border-teal-light px-2 py-0.5 rounded-full">OR</span>
                  <div className="w-px h-4 bg-teal-light" />
                </div>
                {altPickOpen === i ? (
                  <div className="relative">
                    <div className="bg-white rounded-2xl border border-teal-light shadow-lg overflow-hidden max-h-48 overflow-y-auto">
                      {eligibleInCat(eligibility, step.category).filter(e => {
                        const t = e.techniques as { name: string }
                        return t.name !== step.tech?.name
                      }).map(e => {
                        const t = e.techniques as { code: string; name: string }
                        return (
                          <button
                            key={e.id}
                            onClick={() => setAltTech(i, eligToFlowTech(e))}
                            className="w-full text-left px-3 py-2.5 hover:bg-surface transition-colors border-b border-teal-light/40 last:border-0"
                          >
                            <p className="text-[10px] font-mono text-charcoal-light uppercase">{t.code}</p>
                            <p className="text-xs font-semibold text-charcoal">{t.name}</p>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                ) : (
                  <div
                    className="cursor-pointer"
                    onClick={() => setAltPickOpen(i)}
                  >
                    {branch.altTech ? (
                      <BranchNodeCard tech={branch.altTech} label="If fails, try" isAlt />
                    ) : (
                      <div className="rounded-2xl border-2 border-dashed border-teal/30 bg-teal/5 p-3 text-center hover:border-teal/60 transition-colors min-h-[60px] flex items-center justify-center">
                        <p className="text-xs text-teal font-semibold">+ Pick alternate</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ) : (
              /* Non-branch step — centered, with option to add branch */
              <div className="flex items-center gap-2">
                <div className="flex-1">
                  <BranchNodeCard tech={step.tech} />
                </div>
                {addingBranchAt === i ? (
                  <div className="flex gap-1 shrink-0">
                    <button
                      onClick={() => addBranch(i)}
                      className="text-[11px] bg-teal text-white px-2.5 py-1.5 rounded-xl font-semibold"
                    >
                      Add
                    </button>
                    <button
                      onClick={() => setAddingBranchAt(null)}
                      className="text-[11px] bg-gray-100 text-charcoal-light px-2 py-1.5 rounded-xl"
                    >
                      <X size={10} />
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setAddingBranchAt(i)}
                    className="shrink-0 text-[11px] text-teal border border-teal/30 px-2.5 py-1.5 rounded-xl hover:bg-teal-light transition-colors font-semibold"
                  >
                    + Branch
                  </button>
                )}
              </div>
            )}

            {branch && (
              <button
                onClick={() => removeBranch(i)}
                className="text-[10px] text-red-400 hover:text-red-600 pl-1 flex items-center gap-1"
              >
                <X size={9} /> Remove branch
              </button>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ── Coach Picks Tab ──────────────────────────────────────────────────────────
interface CoachAssignment {
  id: string
  technique_name: string
  category: string
  note: string | null
  assigned_at: string
  is_completed: boolean
  completed_at: string | null
}

interface CoachVideoFeedback {
  id: string
  youtube_url: string
  title: string
  notes: string | null
  created_at: string
}

function CoachPicksTab({ userId }: { userId: string | null }) {
  const [assignments, setAssignments] = useState<CoachAssignment[]>([])
  const [videos, setVideos] = useState<CoachVideoFeedback[]>([])
  const [loading, setLoading] = useState(false)
  const [showCompleted, setShowCompleted] = useState(false)
  const [hasCoach, setHasCoach] = useState<boolean | null>(null)

  useEffect(() => {
    if (!userId) return
    setLoading(true)

    async function load() {
      // Check if user has a coach
      const { data: athleteRow } = await supabase
        .from('athletes')
        .select('coach_id')
        .eq('user_id', userId!)
        .maybeSingle()
      const coachId = athleteRow?.coach_id ?? null
      setHasCoach(!!coachId)

      if (!coachId) {
        setLoading(false)
        return
      }

      const [assignRes, videoRes] = await Promise.all([
        supabase
          .from('coach_assignments')
          .select('id, technique_name, category, note, assigned_at, is_completed, completed_at')
          .eq('athlete_user_id', userId!)
          .order('assigned_at', { ascending: false }),
        supabase
          .from('coach_video_feedback')
          .select('id, youtube_url, title, notes, created_at')
          .eq('athlete_user_id', userId!)
          .order('created_at', { ascending: false })
          .limit(10),
      ])

      setAssignments((assignRes.data as CoachAssignment[]) ?? [])
      setVideos((videoRes.data as CoachVideoFeedback[]) ?? [])
      setLoading(false)
    }

    load()
  }, [userId])

  async function handleMarkComplete(assignmentId: string) {
    const { error } = await supabase
      .from('coach_assignments')
      .update({ is_completed: true, completed_at: new Date().toISOString() })
      .eq('id', assignmentId)
    if (!error) {
      setAssignments(prev => prev.map(a =>
        a.id === assignmentId ? { ...a, is_completed: true, completed_at: new Date().toISOString() } : a
      ))
    }
  }

  if (loading) return <Spinner />

  if (!userId) {
    return (
      <div className="text-center py-10 text-charcoal-light text-sm">
        Sign in to see your coach picks.
      </div>
    )
  }

  if (hasCoach === false) {
    return (
      <div className="card text-center py-8 space-y-2">
        <Dumbbell size={28} className="mx-auto text-charcoal-light" />
        <p className="text-sm font-semibold text-charcoal">No coach connected</p>
        <p className="text-xs text-charcoal-light">
          Connect to a coach in Settings to receive drill assignments.
        </p>
      </div>
    )
  }

  const pending = assignments.filter(a => !a.is_completed)
  const completed = assignments.filter(a => a.is_completed)

  return (
    <div className="space-y-5">
      {/* Assignments section */}
      <div className="space-y-3">
        <p className="text-xs font-bold text-charcoal uppercase tracking-widest">Assigned by Your Coach</p>

        {pending.length === 0 && completed.length === 0 ? (
          <div className="card text-center py-6">
            <p className="text-sm text-charcoal-light">No assignments yet. Your coach will send drills here.</p>
          </div>
        ) : (
          <>
            {pending.map(a => (
              <div key={a.id} className="bg-white rounded-2xl border border-teal-light p-4 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-bold text-charcoal">{a.technique_name}</p>
                  <span className="text-[10px] bg-teal-light text-teal px-2 py-0.5 rounded-full font-semibold shrink-0">
                    {a.category}
                  </span>
                </div>
                <p className="text-[10px] text-charcoal-light">
                  Assigned {new Date(a.assigned_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                </p>
                {a.note && (
                  <p className="text-xs text-charcoal bg-surface rounded-xl px-3 py-2">{a.note}</p>
                )}
                <button
                  onClick={() => handleMarkComplete(a.id)}
                  className="flex items-center gap-1.5 text-xs font-semibold text-teal bg-teal-light hover:bg-teal/20 px-3 py-1.5 rounded-xl transition-colors"
                >
                  <CheckCircle2 size={13} /> Mark Complete
                </button>
              </div>
            ))}

            {completed.length > 0 && (
              <div>
                <button
                  onClick={() => setShowCompleted(o => !o)}
                  className="text-xs text-charcoal-light hover:text-charcoal font-medium flex items-center gap-1 mb-2"
                >
                  <ChevronRight size={12} className={cn('transition-transform', showCompleted && 'rotate-90')} />
                  {showCompleted ? 'Hide' : 'Show'} {completed.length} completed
                </button>
                {showCompleted && completed.map(a => (
                  <div key={a.id} className="bg-surface rounded-2xl border border-teal-light p-4 space-y-1 opacity-60 mb-2">
                    <p className="text-sm font-bold text-charcoal line-through">{a.technique_name}</p>
                    <span className="text-[10px] bg-teal-light text-teal px-2 py-0.5 rounded-full font-semibold">
                      {a.category}
                    </span>
                    {a.note && (
                      <p className="text-xs text-charcoal-light">{a.note}</p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* Videos section */}
      {videos.length > 0 && (
        <div className="space-y-3">
          <p className="text-xs font-bold text-charcoal uppercase tracking-widest">Videos from Your Coach</p>
          {videos.map(v => (
            <div key={v.id} className="bg-white rounded-2xl border border-teal-light p-4 space-y-2">
              <p className="text-sm font-bold text-charcoal">{v.title}</p>
              <p className="text-[10px] text-charcoal-light">
                {new Date(v.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
              </p>
              {v.notes && (
                <p className="text-xs text-charcoal bg-surface rounded-xl px-3 py-2">{v.notes}</p>
              )}
              <a
                href={v.youtube_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-teal bg-teal-light hover:bg-teal/20 px-3 py-1.5 rounded-xl transition-colors"
              >
                Watch on YouTube
              </a>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────
export function MyGame() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const { profile, eligibility, loading } = useProfile(user?.id)

  const [tab, setTab]           = useState<Tab>('gameplan')
  const [genMode, setGenMode]   = useState<GenMode>('ai')
  const [pathMode, setPathMode] = useState<PathMode | null>(null)

  // Quick generate state
  const [quickFlow, setQuickFlow] = useState<TechniqueEligibility[]>([])

  // Custom builder state
  const [customPicks, setCustomPicks] = useState<(TechniqueEligibility | null)[]>([null, null, null, null])

  // Branch state (for Build My Own)
  const [branches, setBranches] = useState<BranchPoint[]>([])

  // AI wizard state
  const [aiStep, setAiStep]           = useState<number>(0) // 0 = step1, 1 = step2, 2 = step3, 3 = result
  const [aiStart, setAiStart]         = useState<AIStart | null>(null)
  const [aiFinish, setAiFinish]       = useState<AIFinish | null>(null)
  const [aiStyle, setAiStyle]         = useState<AIStyle | null>(null)
  const [aiFlow, setAiFlow]           = useState<FlowTech[]>([])
  const [aiPlanName, setAiPlanName]   = useState<string>('')
  const [aiDescription, setAiDescription] = useState<string>('')

  // Competition wizard state
  const [compStep, setCompStep]       = useState<number>(0) // 0,1,2 = questions; 3 = result
  const [compFormat, setCompFormat]   = useState<CompFormat | null>(null)
  const [compDuration, setCompDuration] = useState<CompDuration | null>(null)
  const [compThreat, setCompThreat]   = useState<CompThreat | null>(null)
  const [compFlow, setCompFlow]       = useState<FlowTech[]>([])
  const [compPlanName, setCompPlanName] = useState<string>('')
  const [compDescription, setCompDescription] = useState<string>('')

  // Save state
  const [savingPlanName, setSavingPlanName]   = useState<string>('')
  const [showSaveInput, setShowSaveInput]     = useState(false)
  const [savedConfirm, setSavedConfirm]       = useState(false)
  const [savingToDb, setSavingToDb]           = useState(false)

  // Loaded plan from My Flows
  const [loadedPlan, setLoadedPlan] = useState<SavedPlan | null>(null)

  // My Flows state (Supabase-backed)
  const [savedPlans, setSavedPlans] = useState<SavedPlan[]>([])
  const [plansLoading, setPlansLoading] = useState(false)

  // Library filters
  const [search, setSearch]         = useState('')
  const [catFilter, setCatFilter]   = useState('All')
  const [tierFilter, setTierFilter] = useState<typeof TIERS[number]>('All')

  // ── Load plans from Supabase (with localStorage migration) ─────────────────
  const loadPlans = useCallback(async () => {
    if (!user?.id) return
    setPlansLoading(true)
    try {
      // Check for legacy localStorage plans and migrate them
      const lsKey = 'romrx_game_plans'
      const lsRaw = localStorage.getItem(lsKey)
      if (lsRaw) {
        try {
          const lsPlans: SavedPlan[] = JSON.parse(lsRaw)
          if (lsPlans.length > 0) {
            const rows = lsPlans.map(p => ({
              user_id: user.id,
              name: p.name,
              description: p.description ?? '',
              path_mode: p.pathMode ?? 'offense',
              techniques: p.techniques,
              created_at: p.createdAt,
            }))
            await supabase.from('game_plans').insert(rows)
            localStorage.removeItem(lsKey)
          }
        } catch {
          // ignore migration errors
        }
      }

      const { data } = await supabase
        .from('game_plans')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })

      setSavedPlans((data as GamePlanRow[] ?? []).map(rowToSavedPlan))
    } finally {
      setPlansLoading(false)
    }
  }, [user?.id])

  useEffect(() => {
    if (tab === 'myflows') {
      loadPlans()
    }
  }, [tab, loadPlans])

  const sequence = useCallback((p: PathMode) =>
    p === 'offense' ? [...OFFENSE_SEQ] : [...DEFENSE_SEQ], [])

  // Quick generate
  const quickGenerate = useCallback((p: PathMode) => {
    setPathMode(p)
    setQuickFlow(sequence(p).map(cat => pick(eligibleInCat(eligibility, cat)) as TechniqueEligibility))
    setLoadedPlan(null)
  }, [eligibility, sequence])

  const quickRegenerate = useCallback(() => {
    if (!pathMode) return
    setQuickFlow(sequence(pathMode).map(cat => pick(eligibleInCat(eligibility, cat)) as TechniqueEligibility))
    setLoadedPlan(null)
  }, [pathMode, eligibility, sequence])

  // Custom: when path changes, reset picks + branches
  const setCustomPath = useCallback((p: PathMode) => {
    setPathMode(p)
    setCustomPicks([null, null, null, null])
    setBranches([])
    setLoadedPlan(null)
  }, [])

  const setPick = useCallback((stepIdx: number, tech: TechniqueEligibility | null) => {
    setCustomPicks(prev => prev.map((v, i) => i === stepIdx ? tech : v))
    // remove any branch at this step since the primary changed
    setBranches(prev => prev.filter(b => b.stepIndex !== stepIdx))
  }, [])

  // AI generate
  const generateAIFlow = useCallback((start: AIStart, finish: AIFinish, style: AIStyle) => {
    const seqMap: Record<AIStart, readonly string[]> = {
      standing: STANDING_SEQ,
      ontop:    ONTOP_SEQ,
      onbottom: ONBOTTOM_SEQ,
    }
    const seq = seqMap[start]

    const flow: FlowTech[] = seq.map((cat, i) => {
      const eligible = eligibleInCat(eligibility, cat)
      const isLastStep = i === seq.length - 1
      let chosen: TechniqueEligibility | null = null
      if (isLastStep) {
        chosen = pickByFinish(eligible, finish)
      } else {
        const greens = eligible.filter(e => e.tier === 'GREEN')
        chosen = pick(greens.length > 0 ? greens : eligible)
      }
      if (!chosen) return null
      return eligToFlowTech(chosen)
    }).filter((t): t is FlowTech => t !== null)

    const planName = getAIPlanName(start, finish, style)

    const g = eligibility.filter(e => e.tier === 'GREEN' && !e.flag).length
    const y = eligibility.filter(e => e.tier === 'YELLOW' && !e.flag).length
    const hipNote = eligibility.some(e => (e.limiting_joints ?? []).some(j => j.startsWith('hip')))
      ? ' Hip mobility is a key area to address to expand your options further.'
      : ''

    const startLabels: Record<AIStart, string> = {
      standing: 'starting on the feet',
      ontop:    'starting in a top position',
      onbottom: 'starting from guard',
    }
    const finishLabels: Record<AIFinish, string> = {
      chokes: 'choke finishes',
      arm:    'arm attack submissions',
      legs:   'leg attack submissions',
    }
    const styleLabels: Record<AIStyle, string> = {
      explosive: 'an explosive, physical approach',
      technical: 'a patient, technical approach',
    }

    const desc = `Based on your ROM profile (${g} GREEN, ${y} YELLOW techniques available), this game plan is built around ${startLabels[start]}, targeting ${finishLabels[finish]} with ${styleLabels[style]}.${hipNote} Focus on drilling the GREEN-tier moves first and work toward the YELLOW techniques as your mobility improves.`

    setAiFlow(flow)
    setAiPlanName(planName)
    setAiDescription(desc)
    setSavingPlanName(planName)
    setAiStep(3)
    setLoadedPlan(null)
  }, [eligibility])

  const resetAIWizard = () => {
    setAiStep(0)
    setAiStart(null)
    setAiFinish(null)
    setAiStyle(null)
    setAiFlow([])
    setShowSaveInput(false)
    setSavedConfirm(false)
  }

  // Competition generate
  const generateCompFlow = useCallback((format: CompFormat, duration: CompDuration, threat: CompThreat) => {
    // Determine sequence based on threat
    const seq = threat === 'guard'
      ? ['Passes', 'Controls', 'Submissions'] as const
      : threat === 'leglock'
      ? ['Guards', 'Sweeps', 'Submissions'] as const
      : ['Throws', 'Passes', 'Submissions'] as const

    const flow: FlowTech[] = seq.map((cat, i) => {
      // Competition: GREEN-only
      const eligible = greenOnlyInCat(eligibility, cat)
      const isLast = i === seq.length - 1
      let chosen: TechniqueEligibility | null = null
      if (isLast) {
        // Submission preference based on format
        const finishPref: AIFinish = format === 'mma' ? 'legs' : format === 'submission' ? 'chokes' : 'chokes'
        chosen = pickByFinish(eligible, finishPref)
      } else {
        chosen = pick(eligible)
      }
      if (!chosen) return null
      return eligToFlowTech(chosen)
    }).filter((t): t is FlowTech => t !== null)

    const formatShort: Record<CompFormat, string> = {
      points: 'Points',
      submission: 'Sub Only',
      mma: 'MMA / No-Gi',
    }

    const name = `Comp Plan - ${formatShort[format]}`
    const greenCount = eligibility.filter(e => e.tier === 'GREEN' && !e.flag).length
    const durationLabels: Record<CompDuration, string> = {
      under5: 'under 5 minutes',
      '5to8': '5–8 minutes',
      over8: '8+ minutes',
    }
    const threatLabels: Record<CompThreat, string> = {
      takedown: 'takedown-heavy opponents',
      guard: 'guard players',
      leglock: 'leg lockers',
    }

    const desc = `Competition plan built on GREEN-only techniques (${greenCount} available). In competition, you execute what is locked in — no experimenting with YELLOW or RED techniques under pressure. Built for ${formatShort[format]} format, ${durationLabels[duration]} matches, defending against ${threatLabels[threat]}.`

    setCompFlow(flow)
    setCompPlanName(name)
    setCompDescription(desc)
    setSavingPlanName(name)
    setCompStep(3)
    setLoadedPlan(null)
  }, [eligibility])

  const resetCompWizard = () => {
    setCompStep(0)
    setCompFormat(null)
    setCompDuration(null)
    setCompThreat(null)
    setCompFlow([])
    setShowSaveInput(false)
    setSavedConfirm(false)
  }

  // Handle save to Supabase
  const handleSavePlan = async (name: string, description: string, pathModeStr: string, techniques: FlowTech[]) => {
    if (!user?.id) return
    setSavingToDb(true)
    try {
      const { data } = await supabase
        .from('game_plans')
        .insert({
          user_id: user.id,
          name,
          description,
          path_mode: pathModeStr,
          techniques,
        })
        .select()
        .single()

      if (data) {
        const newPlan = rowToSavedPlan(data as GamePlanRow)
        setSavedPlans(prev => [newPlan, ...prev])
      }
      setSavedConfirm(true)
      setShowSaveInput(false)
      setTimeout(() => setSavedConfirm(false), 3000)
    } finally {
      setSavingToDb(false)
    }
  }

  const handleDeletePlan = async (id: string) => {
    await supabase.from('game_plans').delete().eq('id', id)
    setSavedPlans(prev => prev.filter(p => p.id !== id))
  }

  const handleLoadPlan = (plan: SavedPlan) => {
    setLoadedPlan(plan)
    setTab('gameplan')
    setGenMode('quick')
    setPathMode(null)
    setQuickFlow([])
  }

  if (loading) return <Spinner />

  if (eligibility.length === 0) return (
    <EmptyState
      icon={Layers}
      title="No techniques rated yet"
      description="Submit your ROM assessment to unlock your personalized game plan and flow generator."
    />
  )

  const g = eligibility.filter(e => e.tier === 'GREEN' && !e.flag).length
  const y = eligibility.filter(e => e.tier === 'YELLOW' && !e.flag).length
  const r = eligibility.filter(e => e.tier === 'RED' || e.flag === 'DELAY_TECHNIQUE').length

  const filtered = eligibility.filter(item => {
    const tech = item.techniques as { name: string; category: string }
    const effectiveTier = item.flag === 'DELAY_TECHNIQUE' ? 'RED' : item.tier
    return (
      (tierFilter === 'All' || effectiveTier === tierFilter) &&
      (catFilter  === 'All' || tech.category.toLowerCase().includes(catFilter.toLowerCase())) &&
      (!search || tech.name.toLowerCase().includes(search.toLowerCase()))
    )
  })

  const seq = pathMode ? sequence(pathMode) : OFFENSE_SEQ
  const customComplete = customPicks.every(p => p !== null)

  // Convert quick flow to VisualFlow steps
  const quickFlowSteps: VisualFlowStep[] = seq.map((cat, i) => ({
    tech: quickFlow[i] ? eligToFlowTech(quickFlow[i]) : null,
    category: cat,
  }))

  // Convert custom picks to VisualFlow steps
  const customFlowSteps: VisualFlowStep[] = seq.map((cat, i) => ({
    tech: customPicks[i] ? eligToFlowTech(customPicks[i]!) : null,
    category: cat,
  }))

  // Convert AI flow to VisualFlow steps
  const aiFlowSteps: VisualFlowStep[] = aiFlow.map(t => ({
    tech: t,
    category: t.category,
  }))

  // Convert competition flow to VisualFlow steps
  const compFlowSteps: VisualFlowStep[] = compFlow.map(t => ({
    tech: t,
    category: t.category,
  }))

  // Convert loaded plan to VisualFlow steps
  const loadedFlowSteps: VisualFlowStep[] = loadedPlan
    ? loadedPlan.techniques.map(t => ({ tech: t, category: t.category }))
    : []

  return (
    <div className="space-y-5">
      <PageHeader
        title="My Game"
        subtitle={`${eligibility.length} techniques rated · ${profile?.belt ?? 'white'} belt`}
      />

      {/* Tier summary strip */}
      <div className="flex gap-2 flex-wrap">
        {([['GREEN', g, 'tier-green'], ['YELLOW', y, 'tier-yellow'], ['RED', r, 'tier-red']] as const).map(([label, count, cls]) => (
          <span key={label} className={`text-xs font-semibold px-3 py-1.5 rounded-full ${cls}`}>
            {count} {label}
          </span>
        ))}
      </div>

      {/* Page tabs */}
      <div className="flex gap-1 bg-surface rounded-2xl p-1 no-print">
        {([
          ['gameplan',   'Game Plan'],
          ['myflows',    'My Flows'],
          ['library',    'Technique Library'],
          ['coachpicks', 'Coach Picks'],
        ] as const).map(([t, label]) => (
          <button key={t} onClick={() => setTab(t)}
            className={cn('flex-1 text-sm font-semibold py-2 rounded-xl transition-all',
              tab === t ? 'bg-white text-charcoal shadow-sm' : 'text-charcoal-light hover:text-charcoal'
            )}>{label}</button>
        ))}
      </div>

      {/* ── GAME PLAN ── */}
      {tab === 'gameplan' && (
        <div className="space-y-4">

          {/* Loaded plan banner */}
          {loadedPlan && (
            <div className="bg-teal-light rounded-2xl p-4 flex items-center justify-between gap-3 border border-teal/20 no-print">
              <div>
                <p className="text-sm font-bold text-teal">Loaded: {loadedPlan.name}</p>
                <p className="text-xs text-teal/70 mt-0.5">{loadedPlan.description}</p>
              </div>
              <button
                onClick={() => setLoadedPlan(null)}
                className="shrink-0 text-xs text-teal font-semibold bg-white px-3 py-1.5 rounded-xl border border-teal/20"
              >
                Clear
              </button>
            </div>
          )}

          {/* Loaded plan VisualFlow */}
          {loadedPlan && (
            <div className="space-y-3">
              <div className="flex items-center justify-between no-print">
                <div />
                <PrintButton planName={loadedPlan.name} />
              </div>
              <VisualFlow
                steps={loadedFlowSteps}
                eligibility={eligibility}
                planId={loadedPlan.id}
                planName={loadedPlan.name}
                planDescription={loadedPlan.description}
                isCompetition={loadedPlan.pathMode === 'competition'}
              />
            </div>
          )}

          {!loadedPlan && (
            <>
              {/* Generator mode toggle — 4 pills in 2x2 grid on small screens */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 bg-surface rounded-2xl p-1 no-print">
                {([
                  ['ai',          'Guided Build',    Wand2],
                  ['quick',       'Quick Flow',      RefreshCw],
                  ['custom',      'Build My Own',    PenLine],
                  ['competition', 'Competition',     Medal],
                ] as const).map(([mode, label, Icon]) => (
                  <button
                    key={mode}
                    onClick={() => {
                      setGenMode(mode)
                      setPathMode(null)
                      setQuickFlow([])
                      setCustomPicks([null, null, null, null])
                      setBranches([])
                      if (mode === 'ai') resetAIWizard()
                      if (mode === 'competition') resetCompWizard()
                    }}
                    className={cn(
                      'flex items-center justify-center gap-1.5 py-2 rounded-xl text-sm font-semibold transition-all',
                      genMode === mode
                        ? 'bg-white text-charcoal shadow-sm'
                        : 'text-charcoal-light hover:text-charcoal'
                    )}
                  >
                    <Icon size={13} />
                    <span className="hidden sm:inline">{label}</span>
                    <span className="sm:hidden text-xs">{label.split(' ')[0]}</span>
                  </button>
                ))}
              </div>

              {/* ── AI BUILD ── */}
              {genMode === 'ai' && (
                <div className="space-y-5">
                  {aiStep < 3 && (
                    <div className="space-y-4">
                      {/* Progress indicator */}
                      <div className="flex items-center gap-2">
                        {[0, 1, 2].map(s => (
                          <div key={s} className="flex items-center gap-2">
                            <div className={cn(
                              'w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold transition-all',
                              s === aiStep ? 'bg-teal text-white' :
                              s < aiStep  ? 'bg-teal/20 text-teal' :
                                            'bg-surface text-charcoal-light'
                            )}>
                              {s < aiStep ? <Check size={10} /> : s + 1}
                            </div>
                            {s < 2 && <div className={cn('flex-1 h-0.5 w-8', s < aiStep ? 'bg-teal/30' : 'bg-surface')} />}
                          </div>
                        ))}
                        <span className="text-xs text-charcoal-light ml-1">
                          {aiStep === 0 ? 'Starting position' : aiStep === 1 ? 'Preferred finish' : 'Your style'}
                        </span>
                      </div>

                      {/* Step 1: Starting position */}
                      {aiStep === 0 && (
                        <div className="space-y-3">
                          <p className="text-sm font-semibold text-charcoal">Where do you usually start?</p>
                          <div className="grid grid-cols-1 gap-3">
                            {([
                              ['standing', 'Standing', 'I pull guard or fight for takedowns', Swords] as const,
                              ['ontop',    'On Top',   'I look to pass and control',           Shield] as const,
                              ['onbottom', 'On Bottom','I play guard',                          Shield] as const,
                            ]).map(([val, label, sub, Icon]) => (
                              <button
                                key={val}
                                onClick={() => { setAiStart(val); setAiStep(1) }}
                                className={cn(
                                  'flex items-center gap-4 p-4 rounded-2xl border-2 text-left transition-all',
                                  aiStart === val
                                    ? 'border-teal bg-teal text-white'
                                    : 'border-teal-light bg-white hover:border-teal/40'
                                )}
                              >
                                <Icon
                                  size={22}
                                  className={cn(aiStart === val ? 'text-white' : 'text-teal', val === 'onbottom' ? 'rotate-180' : '')}
                                />
                                <div>
                                  <p className="font-bold text-sm">{label}</p>
                                  <p className={cn('text-xs mt-0.5', aiStart === val ? 'text-white/80' : 'text-charcoal-light')}>{sub}</p>
                                </div>
                              </button>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Step 2: Preferred finish */}
                      {aiStep === 1 && (
                        <div className="space-y-3">
                          <div className="flex items-center gap-2">
                            <button onClick={() => setAiStep(0)} className="text-charcoal-light hover:text-charcoal">
                              <ChevronLeft size={16} />
                            </button>
                            <p className="text-sm font-semibold text-charcoal">What is your go-to finish?</p>
                          </div>
                          <div className="grid grid-cols-1 gap-3">
                            {([
                              ['chokes', 'Chokes',      'Rear naked, triangle, guillotine',  CircleDot,  null]         as const,
                              ['arm',    'Arm Attacks',  'Armbar, kimura, americana',         Zap,        null]         as const,
                              ['legs',   'Leg Attacks',  'Heel hook, kneebar, ankle lock',    Footprints, 'Blue belt+ only'] as const,
                            ]).map(([val, label, sub, Icon, note]) => (
                              <button
                                key={val}
                                onClick={() => { setAiFinish(val); setAiStep(2) }}
                                className={cn(
                                  'flex items-center gap-4 p-4 rounded-2xl border-2 text-left transition-all',
                                  aiFinish === val
                                    ? 'border-teal bg-teal text-white'
                                    : 'border-teal-light bg-white hover:border-teal/40'
                                )}
                              >
                                <Icon size={22} className={aiFinish === val ? 'text-white' : 'text-teal'} />
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2">
                                    <p className="font-bold text-sm">{label}</p>
                                    {note && (
                                      <span className={cn(
                                        'text-[10px] px-1.5 py-0.5 rounded-full font-medium',
                                        aiFinish === val ? 'bg-white/20 text-white' : 'bg-blue-100 text-blue-700'
                                      )}>{note}</span>
                                    )}
                                  </div>
                                  <p className={cn('text-xs mt-0.5', aiFinish === val ? 'text-white/80' : 'text-charcoal-light')}>{sub}</p>
                                </div>
                              </button>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Step 3: Style */}
                      {aiStep === 2 && (
                        <div className="space-y-3">
                          <div className="flex items-center gap-2">
                            <button onClick={() => setAiStep(1)} className="text-charcoal-light hover:text-charcoal">
                              <ChevronLeft size={16} />
                            </button>
                            <p className="text-sm font-semibold text-charcoal">Your game style?</p>
                          </div>
                          <div className="grid grid-cols-1 gap-3">
                            {([
                              ['explosive', 'Explosive', 'Physical, aggressive, fast-paced',  Flame] as const,
                              ['technical', 'Technical', 'Patient, methodical, position-first', Brain] as const,
                            ]).map(([val, label, sub, Icon]) => (
                              <button
                                key={val}
                                onClick={() => setAiStyle(val)}
                                className={cn(
                                  'flex items-center gap-4 p-4 rounded-2xl border-2 text-left transition-all',
                                  aiStyle === val
                                    ? 'border-teal bg-teal text-white'
                                    : 'border-teal-light bg-white hover:border-teal/40'
                                )}
                              >
                                <Icon size={22} className={aiStyle === val ? 'text-white' : 'text-teal'} />
                                <div>
                                  <p className="font-bold text-sm">{label}</p>
                                  <p className={cn('text-xs mt-0.5', aiStyle === val ? 'text-white/80' : 'text-charcoal-light')}>{sub}</p>
                                </div>
                              </button>
                            ))}
                          </div>
                          {/* Generate button appears after selecting style */}
                          {aiStyle !== null && (
                            <div className="space-y-2">
                              <button
                                onClick={() => {
                                  if (aiStart && aiFinish && aiStyle) {
                                    generateAIFlow(aiStart, aiFinish, aiStyle)
                                  }
                                }}
                                className="w-full py-3 rounded-2xl bg-teal text-white font-bold text-sm hover:bg-teal/90 transition-colors flex items-center justify-center gap-2"
                              >
                                <Star size={15} />
                                Generate Guided Plan
                              </button>
                              <button
                                onClick={() => {
                                  if (aiStart && aiFinish && aiStyle) {
                                    navigate(`/dashboard/chat?gameplan=1&start=${aiStart}&finish=${aiFinish}&style=${aiStyle}`)
                                  }
                                }}
                                className="w-full py-2.5 rounded-2xl border-2 border-teal text-teal font-semibold text-sm hover:bg-teal-light transition-colors flex items-center justify-center gap-2"
                              >
                                <Wand2 size={14} />
                                Build with ROMBot
                              </button>
                              <p className="text-center text-xs text-charcoal-light">ROMBot uses your actual technique library to write a personalized plan</p>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {/* AI result */}
                  {aiStep === 3 && (
                    <div className="space-y-4">
                      <div className="flex items-center justify-between no-print">
                        <div>
                          <p className="text-base font-bold text-charcoal">{aiPlanName}</p>
                          <p className="text-xs text-charcoal-light mt-0.5">AI-generated game plan</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <PrintButton planName={aiPlanName} />
                          <button
                            onClick={resetAIWizard}
                            className="flex items-center gap-1.5 text-xs font-semibold text-teal bg-teal-light px-3 py-2 rounded-xl hover:bg-teal/20 transition-colors"
                          >
                            <ChevronLeft size={12} /> Rebuild
                          </button>
                        </div>
                      </div>

                      {/* Description */}
                      <div className="bg-surface rounded-2xl p-4">
                        <p className="text-xs text-charcoal-light leading-relaxed">{aiDescription}</p>
                      </div>

                      {/* Visual flow */}
                      <VisualFlow
                        steps={aiFlowSteps}
                        eligibility={eligibility}
                        planName={aiPlanName}
                        planDescription={aiDescription}
                      />

                      {/* Action buttons */}
                      <div className="flex flex-col gap-2 no-print">
                        {!showSaveInput && !savedConfirm && (
                          <button
                            onClick={() => { setSavingPlanName(aiPlanName); setShowSaveInput(true) }}
                            className="w-full py-2.5 rounded-xl bg-teal text-white text-sm font-semibold flex items-center justify-center gap-2 hover:bg-teal/90 transition-colors"
                          >
                            <Bookmark size={14} />
                            Save This Plan
                          </button>
                        )}
                        {showSaveInput && (
                          <div className="space-y-2">
                            <input
                              value={savingPlanName}
                              onChange={e => setSavingPlanName(e.target.value)}
                              className="w-full px-4 py-2.5 text-sm rounded-xl border border-teal-light focus:outline-none focus:border-teal bg-white"
                              placeholder="Name your game plan..."
                            />
                            <div className="flex gap-2">
                              <button
                                onClick={() => {
                                  handleSavePlan(savingPlanName || aiPlanName, aiDescription, 'ai', aiFlow)
                                }}
                                disabled={savingToDb}
                                className="flex-1 py-2 rounded-xl bg-teal text-white text-sm font-semibold hover:bg-teal/90 disabled:opacity-60"
                              >
                                {savingToDb ? 'Saving...' : 'Confirm Save'}
                              </button>
                              <button
                                onClick={() => setShowSaveInput(false)}
                                className="px-4 py-2 rounded-xl border border-teal-light text-sm text-charcoal-light hover:bg-surface"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        )}
                        {savedConfirm && (
                          <div className="flex items-center gap-2 py-2.5 px-4 bg-teal-light rounded-xl text-teal text-sm font-semibold">
                            <Check size={14} /> Plan saved to My Flows
                          </div>
                        )}
                        <div className="flex gap-2">
                          <button
                            onClick={() => {
                              if (aiStart && aiFinish && aiStyle) {
                                generateAIFlow(aiStart, aiFinish, aiStyle)
                              }
                            }}
                            className="flex-1 py-2 rounded-xl border border-teal-light text-sm font-semibold text-charcoal hover:bg-surface flex items-center justify-center gap-2"
                          >
                            <RefreshCw size={13} /> Regenerate
                          </button>
                          <button
                            onClick={() => {
                              const url = window.location.href + '#plan=' + btoa(JSON.stringify({ name: aiPlanName, techniques: aiFlow }))
                              navigator.clipboard.writeText(url)
                            }}
                            className="flex-1 py-2 rounded-xl border border-teal-light text-sm font-semibold text-charcoal hover:bg-surface flex items-center justify-center gap-2"
                          >
                            <Share2 size={13} /> Share
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* ── QUICK FLOW ── */}
              {genMode === 'quick' && (
                <div className="space-y-4">
                  <p className="text-xs text-charcoal-light text-center">
                    Pick your starting position and ROMRx generates a flow using your GREEN and YELLOW techniques.
                  </p>

                  <div className="grid grid-cols-2 gap-3 no-print">
                    {([
                      ['offense', 'Offense', 'I get the takedown', Swords],
                      ['defense', 'Defense', 'They get the takedown', Shield],
                    ] as const).map(([p, label, sub, Icon]) => (
                      <button key={p} onClick={() => quickGenerate(p)}
                        className={cn('flex flex-col items-center gap-2 rounded-2xl border-2 p-5 transition-all',
                          pathMode === p && genMode === 'quick'
                            ? 'border-teal bg-teal text-white shadow-md'
                            : 'border-teal-light bg-white text-charcoal hover:border-teal/40'
                        )}>
                        <Icon size={24} className={pathMode === p && genMode === 'quick' ? 'text-white' : 'text-teal'} />
                        <div className="text-center">
                          <p className="font-bold text-sm">{label}</p>
                          <p className={cn('text-xs mt-0.5', pathMode === p && genMode === 'quick' ? 'text-teal-light' : 'text-charcoal-light')}>
                            {sub}
                          </p>
                        </div>
                      </button>
                    ))}
                  </div>

                  {quickFlow.length > 0 && pathMode && (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between no-print">
                        <div>
                          <p className="text-sm font-bold text-charcoal">{pathMode === 'offense' ? 'Offense' : 'Defense'} Flow</p>
                          <p className="text-xs text-charcoal-light">GREEN + YELLOW only</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <PrintButton />
                          <button onClick={quickRegenerate}
                            className="flex items-center gap-1.5 text-xs font-semibold text-teal bg-teal-light px-3 py-2 rounded-xl hover:bg-teal/20 transition-colors">
                            <RefreshCw size={12} /> New Flow
                          </button>
                        </div>
                      </div>

                      <VisualFlow
                        steps={quickFlowSteps}
                        eligibility={eligibility}
                        planName={pathMode === 'offense' ? 'Offense Flow' : 'Defense Flow'}
                      />

                      {/* Save quick flow */}
                      <div className="no-print space-y-2">
                        {!showSaveInput && !savedConfirm && (
                          <button
                            onClick={() => {
                              setSavingPlanName(pathMode === 'offense' ? 'Offense Flow' : 'Defense Flow')
                              setShowSaveInput(true)
                            }}
                            className="w-full py-2.5 rounded-xl border border-teal-light text-sm font-semibold text-charcoal hover:bg-surface flex items-center justify-center gap-2"
                          >
                            <Bookmark size={14} /> Save This Flow
                          </button>
                        )}
                        {showSaveInput && (
                          <div className="space-y-2">
                            <input
                              value={savingPlanName}
                              onChange={e => setSavingPlanName(e.target.value)}
                              className="w-full px-4 py-2.5 text-sm rounded-xl border border-teal-light focus:outline-none focus:border-teal bg-white"
                              placeholder="Name your flow..."
                            />
                            <div className="flex gap-2">
                              <button
                                onClick={() => {
                                  const techs = quickFlowSteps
                                    .filter(s => s.tech !== null)
                                    .map(s => s.tech!)
                                  handleSavePlan(savingPlanName, '', pathMode ?? 'offense', techs)
                                }}
                                disabled={savingToDb}
                                className="flex-1 py-2 rounded-xl bg-teal text-white text-sm font-semibold hover:bg-teal/90 disabled:opacity-60"
                              >
                                {savingToDb ? 'Saving...' : 'Confirm Save'}
                              </button>
                              <button
                                onClick={() => setShowSaveInput(false)}
                                className="px-4 py-2 rounded-xl border border-teal-light text-sm text-charcoal-light hover:bg-surface"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        )}
                        {savedConfirm && (
                          <div className="flex items-center gap-2 py-2.5 px-4 bg-teal-light rounded-xl text-teal text-sm font-semibold">
                            <Check size={14} /> Flow saved to My Flows
                          </div>
                        )}

                        <p className="text-center text-xs text-charcoal-light">
                          Hit "New Flow" to randomize a different path. Switch to "Build My Own" to choose each move yourself.
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* ── CUSTOM BUILDER ── */}
              {genMode === 'custom' && (
                <div className="space-y-4">
                  <p className="text-xs text-charcoal-light text-center">
                    Choose your starting position, then pick your own techniques at each step.
                  </p>

                  <div className="grid grid-cols-2 gap-3 no-print">
                    {([
                      ['offense', 'Offense', 'I get the takedown', Swords],
                      ['defense', 'Defense', 'They get the takedown', Shield],
                    ] as const).map(([p, label, sub, Icon]) => (
                      <button key={p} onClick={() => setCustomPath(p)}
                        className={cn('flex flex-col items-center gap-2 rounded-2xl border-2 p-5 transition-all',
                          pathMode === p
                            ? 'border-teal bg-teal text-white shadow-md'
                            : 'border-teal-light bg-white text-charcoal hover:border-teal/40'
                        )}>
                        <Icon size={24} className={pathMode === p ? 'text-white' : 'text-teal'} />
                        <div className="text-center">
                          <p className="font-bold text-sm">{label}</p>
                          <p className={cn('text-xs mt-0.5', pathMode === p ? 'text-teal-light' : 'text-charcoal-light')}>{sub}</p>
                        </div>
                      </button>
                    ))}
                  </div>

                  {pathMode && (
                    <div className="space-y-3">
                      {seq.map((cat, i) => {
                        const eligible = eligibleInCat(eligibility, cat)
                        const fromPos = CAT_FROM[cat]
                        const toPos   = CAT_TO[cat]
                        const prevToPos = i > 0 ? CAT_TO[seq[i - 1]] : null
                        // Only show FROM label if it differs from previous step's TO (avoids duplicates)
                        const showFrom = i === 0 || fromPos !== prevToPos
                        const isLast   = i === seq.length - 1

                        return (
                          <div key={`${cat}-${i}`} className="space-y-1">
                            {showFrom && <PositionPill pos={fromPos} />}
                            <ArrowDown size={14} className="text-charcoal-light mx-3 my-0" />

                            <p className="text-xs font-bold text-charcoal uppercase tracking-wide px-1 mb-1">
                              Step {i + 1} - {cat}
                            </p>

                            {eligible.length === 0 ? (
                              <div className="rounded-2xl border border-yellow-200 bg-yellow-50 p-3 flex items-start gap-2.5">
                                <AlertTriangle size={14} className="text-yellow-600 shrink-0 mt-0.5" />
                                <p className="text-xs text-yellow-700">No GREEN or YELLOW {cat} available yet. Work on your ROM to unlock these techniques.</p>
                              </div>
                            ) : (
                              <StepSelector
                                category={cat}
                                eligible={eligible}
                                selected={customPicks[i]}
                                onSelect={(t) => setPick(i, t)}
                              />
                            )}

                            <ArrowDown size={14} className="text-charcoal-light mx-3 my-1" />
                            <PositionPill pos={toPos} isFinish={isLast && toPos === 'finish'} />
                          </div>
                        )
                      })}

                      {/* Custom complete: show visual flow + save + branch builder */}
                      {customComplete && (
                        <div className="space-y-3">
                          <div className="bg-teal-light rounded-2xl p-4 text-center space-y-1 border border-teal/20 no-print">
                            <CheckCircle2 size={20} className="text-teal mx-auto" />
                            <p className="text-sm font-bold text-teal">Flow complete</p>
                          </div>

                          <VisualFlow
                            steps={customFlowSteps}
                            eligibility={eligibility}
                            planName={pathMode === 'offense' ? 'My Offense Build' : 'My Defense Build'}
                          />

                          {/* Branch Builder */}
                          <BranchBuilder
                            steps={customFlowSteps}
                            eligibility={eligibility}
                            branches={branches}
                            onBranchesChange={setBranches}
                          />

                          <div className="no-print space-y-2">
                            <div className="flex items-center justify-between">
                              <div />
                              <PrintButton />
                            </div>
                            {!showSaveInput && !savedConfirm && (
                              <button
                                onClick={() => {
                                  setSavingPlanName(pathMode === 'offense' ? 'My Offense Build' : 'My Defense Build')
                                  setShowSaveInput(true)
                                }}
                                className="w-full py-2.5 rounded-xl border border-teal-light text-sm font-semibold text-charcoal hover:bg-surface flex items-center justify-center gap-2"
                              >
                                <Bookmark size={14} /> Save This Flow
                              </button>
                            )}
                            {showSaveInput && (
                              <div className="space-y-2">
                                <input
                                  value={savingPlanName}
                                  onChange={e => setSavingPlanName(e.target.value)}
                                  className="w-full px-4 py-2.5 text-sm rounded-xl border border-teal-light focus:outline-none focus:border-teal bg-white"
                                  placeholder="Name your flow..."
                                />
                                <div className="flex gap-2">
                                  <button
                                    onClick={() => {
                                      // Build techs array including branch alts with is_branch flag
                                      const mainTechs = customFlowSteps
                                        .filter(s => s.tech !== null)
                                        .map(s => s.tech!)
                                      const branchTechs: FlowTech[] = branches
                                        .filter(b => b.altTech !== null)
                                        .map(b => ({ ...b.altTech!, is_branch: true }))
                                      handleSavePlan(savingPlanName, '', pathMode ?? 'offense', [...mainTechs, ...branchTechs])
                                    }}
                                    disabled={savingToDb}
                                    className="flex-1 py-2 rounded-xl bg-teal text-white text-sm font-semibold hover:bg-teal/90 disabled:opacity-60"
                                  >
                                    {savingToDb ? 'Saving...' : 'Confirm Save'}
                                  </button>
                                  <button
                                    onClick={() => setShowSaveInput(false)}
                                    className="px-4 py-2 rounded-xl border border-teal-light text-sm text-charcoal-light hover:bg-surface"
                                  >
                                    Cancel
                                  </button>
                                </div>
                              </div>
                            )}
                            {savedConfirm && (
                              <div className="flex items-center gap-2 py-2.5 px-4 bg-teal-light rounded-xl text-teal text-sm font-semibold">
                                <Check size={14} /> Flow saved to My Flows
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* ── COMPETITION MODE ── */}
              {genMode === 'competition' && (
                <div className="space-y-5">
                  {/* Intro banner */}
                  <div className="bg-red-50 border border-red-200 rounded-2xl p-4 flex items-start gap-3">
                    <Medal size={18} className="text-red-500 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-bold text-red-700">Competition Mode</p>
                      <p className="text-xs text-red-600 mt-0.5 leading-relaxed">
                        Only your GREEN-tier techniques will be used. In competition, execute what's locked in — no experimenting under pressure.
                      </p>
                    </div>
                  </div>

                  {compStep < 3 && (
                    <div className="space-y-4">
                      {/* Progress dots */}
                      <div className="flex items-center gap-2">
                        {[0, 1, 2].map(s => (
                          <div key={s} className="flex items-center gap-2">
                            <div className={cn(
                              'w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold transition-all',
                              s === compStep ? 'bg-red-500 text-white' :
                              s < compStep   ? 'bg-red-200 text-red-700' :
                                              'bg-surface text-charcoal-light'
                            )}>
                              {s < compStep ? <Check size={10} /> : s + 1}
                            </div>
                            {s < 2 && <div className={cn('flex-1 h-0.5 w-8', s < compStep ? 'bg-red-200' : 'bg-surface')} />}
                          </div>
                        ))}
                        <span className="text-xs text-charcoal-light ml-1">
                          {compStep === 0 ? 'Format' : compStep === 1 ? 'Match length' : 'Primary threat'}
                        </span>
                      </div>

                      {/* Step 1: Format */}
                      {compStep === 0 && (
                        <div className="space-y-3">
                          <p className="text-sm font-semibold text-charcoal">What's your competition format?</p>
                          <div className="grid grid-cols-1 gap-3">
                            {([
                              ['points',     'Points Match',      'IBJJF style — position dominant',         Trophy] as const,
                              ['submission', 'Submission Only',   'Pure submission hunting',                  Zap] as const,
                              ['mma',        'MMA / No-Gi',       'Leg locks open, aggression focus',         Flame] as const,
                            ]).map(([val, label, sub, Icon]) => (
                              <button
                                key={val}
                                onClick={() => { setCompFormat(val); setCompStep(1) }}
                                className={cn(
                                  'flex items-center gap-4 p-4 rounded-2xl border-2 text-left transition-all',
                                  compFormat === val
                                    ? 'border-red-500 bg-red-500 text-white'
                                    : 'border-teal-light bg-white hover:border-red-200'
                                )}
                              >
                                <Icon size={22} className={compFormat === val ? 'text-white' : 'text-red-500'} />
                                <div>
                                  <p className="font-bold text-sm">{label}</p>
                                  <p className={cn('text-xs mt-0.5', compFormat === val ? 'text-white/80' : 'text-charcoal-light')}>{sub}</p>
                                </div>
                              </button>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Step 2: Duration */}
                      {compStep === 1 && (
                        <div className="space-y-3">
                          <div className="flex items-center gap-2">
                            <button onClick={() => setCompStep(0)} className="text-charcoal-light hover:text-charcoal">
                              <ChevronLeft size={16} />
                            </button>
                            <p className="text-sm font-semibold text-charcoal">How long is the match?</p>
                          </div>
                          <div className="grid grid-cols-1 gap-3">
                            {([
                              ['under5', 'Under 5 minutes', 'White/blue belt divisions — intensity matters',   Flame] as const,
                              ['5to8',   '5–8 minutes',     'Middle divisions',                                Brain] as const,
                              ['over8',  '8+ minutes',      'Advanced — endurance and patience',               Star] as const,
                            ]).map(([val, label, sub, Icon]) => (
                              <button
                                key={val}
                                onClick={() => { setCompDuration(val); setCompStep(2) }}
                                className={cn(
                                  'flex items-center gap-4 p-4 rounded-2xl border-2 text-left transition-all',
                                  compDuration === val
                                    ? 'border-red-500 bg-red-500 text-white'
                                    : 'border-teal-light bg-white hover:border-red-200'
                                )}
                              >
                                <Icon size={22} className={compDuration === val ? 'text-white' : 'text-red-500'} />
                                <div>
                                  <p className="font-bold text-sm">{label}</p>
                                  <p className={cn('text-xs mt-0.5', compDuration === val ? 'text-white/80' : 'text-charcoal-light')}>{sub}</p>
                                </div>
                              </button>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Step 3: Primary threat */}
                      {compStep === 2 && (
                        <div className="space-y-3">
                          <div className="flex items-center gap-2">
                            <button onClick={() => setCompStep(1)} className="text-charcoal-light hover:text-charcoal">
                              <ChevronLeft size={16} />
                            </button>
                            <p className="text-sm font-semibold text-charcoal">Primary threat to defend?</p>
                          </div>
                          <div className="grid grid-cols-1 gap-3">
                            {([
                              ['takedown', 'Takedown-heavy',   'Need strong guard pull or takedown',   Swords] as const,
                              ['guard',    'Guard players',    'Need passing game',                     Shield] as const,
                              ['leglock',  'Leg lockers',      'Need guard that protects legs',         Footprints] as const,
                            ]).map(([val, label, sub, Icon]) => (
                              <button
                                key={val}
                                onClick={() => setCompThreat(val)}
                                className={cn(
                                  'flex items-center gap-4 p-4 rounded-2xl border-2 text-left transition-all',
                                  compThreat === val
                                    ? 'border-red-500 bg-red-500 text-white'
                                    : 'border-teal-light bg-white hover:border-red-200'
                                )}
                              >
                                <Icon size={22} className={compThreat === val ? 'text-white' : 'text-red-500'} />
                                <div>
                                  <p className="font-bold text-sm">{label}</p>
                                  <p className={cn('text-xs mt-0.5', compThreat === val ? 'text-white/80' : 'text-charcoal-light')}>{sub}</p>
                                </div>
                              </button>
                            ))}
                          </div>
                          {compThreat !== null && (
                            <button
                              onClick={() => {
                                if (compFormat && compDuration && compThreat) {
                                  generateCompFlow(compFormat, compDuration, compThreat)
                                }
                              }}
                              className="w-full py-3 rounded-2xl bg-red-500 text-white font-bold text-sm hover:bg-red-600 transition-colors flex items-center justify-center gap-2"
                            >
                              <Medal size={15} />
                              Generate Competition Plan
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Competition result */}
                  {compStep === 3 && (
                    <div className="space-y-4">
                      <div className="flex items-center justify-between no-print">
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="text-base font-bold text-charcoal">{compPlanName}</p>
                            <span className="flex items-center gap-1 text-[11px] font-bold bg-red-500 text-white px-2.5 py-0.5 rounded-full">
                              <Medal size={10} /> Competition
                            </span>
                          </div>
                          <p className="text-xs text-charcoal-light mt-0.5">GREEN-only competition plan</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <PrintButton planName={compPlanName} />
                          <button
                            onClick={resetCompWizard}
                            className="flex items-center gap-1.5 text-xs font-semibold text-red-600 bg-red-50 px-3 py-2 rounded-xl hover:bg-red-100 transition-colors"
                          >
                            <ChevronLeft size={12} /> Rebuild
                          </button>
                        </div>
                      </div>

                      {/* Description */}
                      <div className="bg-red-50 border border-red-100 rounded-2xl p-4">
                        <p className="text-xs text-red-700 leading-relaxed">{compDescription}</p>
                      </div>

                      {compFlow.length === 0 ? (
                        <div className="bg-yellow-50 border border-yellow-200 rounded-2xl p-4 text-center">
                          <AlertTriangle size={20} className="text-yellow-600 mx-auto mb-2" />
                          <p className="text-sm font-semibold text-yellow-700">Not enough GREEN techniques</p>
                          <p className="text-xs text-yellow-600 mt-1">
                            You need more GREEN-tier techniques to build a competition plan. Keep drilling and working on your ROM!
                          </p>
                        </div>
                      ) : (
                        <>
                          <VisualFlow
                            steps={compFlowSteps}
                            eligibility={eligibility}
                            planName={compPlanName}
                            planDescription={compDescription}
                            isCompetition
                          />

                          <div className="flex flex-col gap-2 no-print">
                            {!showSaveInput && !savedConfirm && (
                              <button
                                onClick={() => { setSavingPlanName(compPlanName); setShowSaveInput(true) }}
                                className="w-full py-2.5 rounded-xl bg-red-500 text-white text-sm font-semibold flex items-center justify-center gap-2 hover:bg-red-600 transition-colors"
                              >
                                <Bookmark size={14} />
                                Save Competition Plan
                              </button>
                            )}
                            {showSaveInput && (
                              <div className="space-y-2">
                                <input
                                  value={savingPlanName}
                                  onChange={e => setSavingPlanName(e.target.value)}
                                  className="w-full px-4 py-2.5 text-sm rounded-xl border border-teal-light focus:outline-none focus:border-teal bg-white"
                                  placeholder="Name your competition plan..."
                                />
                                <div className="flex gap-2">
                                  <button
                                    onClick={() => {
                                      handleSavePlan(savingPlanName || compPlanName, compDescription, 'competition', compFlow)
                                    }}
                                    disabled={savingToDb}
                                    className="flex-1 py-2 rounded-xl bg-red-500 text-white text-sm font-semibold hover:bg-red-600 disabled:opacity-60"
                                  >
                                    {savingToDb ? 'Saving...' : 'Confirm Save'}
                                  </button>
                                  <button
                                    onClick={() => setShowSaveInput(false)}
                                    className="px-4 py-2 rounded-xl border border-teal-light text-sm text-charcoal-light hover:bg-surface"
                                  >
                                    Cancel
                                  </button>
                                </div>
                              </div>
                            )}
                            {savedConfirm && (
                              <div className="flex items-center gap-2 py-2.5 px-4 bg-teal-light rounded-xl text-teal text-sm font-semibold">
                                <Check size={14} /> Plan saved to My Flows
                              </div>
                            )}
                            <div className="flex gap-2">
                              <button
                                onClick={() => {
                                  if (compFormat && compDuration && compThreat) {
                                    generateCompFlow(compFormat, compDuration, compThreat)
                                  }
                                }}
                                className="flex-1 py-2 rounded-xl border border-teal-light text-sm font-semibold text-charcoal hover:bg-surface flex items-center justify-center gap-2"
                              >
                                <RefreshCw size={13} /> Regenerate
                              </button>
                              <button
                                onClick={() => {
                                  if (compFormat && compDuration && compThreat) {
                                    navigate(`/dashboard/chat?gameplan=1&mode=competition&format=${compFormat}&duration=${compDuration}&threat=${compThreat}`)
                                  }
                                }}
                                className="flex-1 py-2 rounded-xl border border-teal-light text-sm font-semibold text-charcoal hover:bg-surface flex items-center justify-center gap-2"
                              >
                                <Wand2 size={13} /> Build with ROMBot
                              </button>
                            </div>
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ── MY FLOWS ── */}
      {tab === 'myflows' && (
        <div className="space-y-4">
          {plansLoading ? (
            <Spinner />
          ) : savedPlans.length === 0 ? (
            <EmptyState
              icon={Bookmark}
              title="No saved game plans yet"
              description="Build one in the Game Plan tab."
            />
          ) : (
            <div className="space-y-3">
              {user && savedPlans.map(plan => (
                <SavedPlanCard
                  key={plan.id}
                  plan={plan}
                  userId={user.id}
                  onLoad={handleLoadPlan}
                  onDelete={handleDeletePlan}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── TECHNIQUE LIBRARY ── */}
      {tab === 'library' && (
        <div className="space-y-4">
          <SectionCard>
            <div className="space-y-3">
              <div className="relative">
                <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-charcoal-light" />
                <input
                  value={search} onChange={e => setSearch(e.target.value)}
                  placeholder="Search techniques..."
                  className="w-full pl-8 pr-4 py-2 text-sm rounded-xl border border-teal-light bg-surface focus:outline-none focus:border-teal focus:bg-white transition-colors"
                />
              </div>
              <div className="flex gap-1.5 flex-wrap">
                {CATEGORIES.map(c => (
                  <button key={c} onClick={() => setCatFilter(c)}
                    className={`text-xs px-3 py-1 rounded-full font-medium transition-colors capitalize ${
                      catFilter === c ? 'bg-charcoal text-white' : 'bg-surface text-charcoal-light hover:bg-gray-100'
                    }`}>{c}</button>
                ))}
              </div>
              <div className="flex gap-1.5 flex-wrap">
                {TIERS.map(t => (
                  <button key={t} onClick={() => setTierFilter(t)}
                    className={`text-xs px-3 py-1 rounded-full font-medium transition-colors ${
                      tierFilter === t ? 'bg-charcoal text-white' : 'bg-surface text-charcoal-light hover:bg-gray-100'
                    }`}>{t}</button>
                ))}
              </div>
            </div>
          </SectionCard>

          {filtered.length === 0 ? (
            <p className="text-center text-charcoal-light text-sm py-10">No techniques match your filters.</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {filtered.map(item => <TechCard key={item.id} item={item} />)}
            </div>
          )}
        </div>
      )}

      {/* ── COACH PICKS ── */}
      {tab === 'coachpicks' && (
        <CoachPicksTab userId={user?.id ?? null} />
      )}
    </div>
  )
}
