import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { Loader2, ChevronLeft, ChevronRight, CheckCircle2, AlertTriangle, Info, ExternalLink, SkipForward } from 'lucide-react'
import { cn } from '../lib/utils'

const SUBMIT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/submit-assessment`

// ── Types ────────────────────────────────────────────────────────────────────
interface Field {
  key: string
  label: string
  unit?: string
  normalLow: number
  normalHigh: number
  riskBelow: number  // AT RISK threshold
}

interface Step {
  id: string
  title: string
  bjjWhy: string         // One-line BJJ relevance
  tool: string           // What to use to measure
  position: string[]     // Setup steps (numbered)
  howTo: string[]        // How to measure steps
  mistake: string        // Common mistake
  mistakeFix: string     // The fix
  videoUrl?: string
  videoLabel?: string
  fields: Field[]
}

// ── Measurement steps (one per joint group) ──────────────────────────────────
const STEPS: Step[] = [
  {
    id: 'hip_er',
    title: 'Hip External Rotation',
    bjjWhy: 'Opens your guard game — triangles, De La Riva, and seated guard all need this.',
    tool: 'Phone flat on your shin · Seated on a firm chair',
    position: [
      'Sit on the edge of a chair or bench. Let your feet hang off the floor. Hip and knee are each bent at 90°.',
      'Place your phone FLAT on your shin, just below your knee. Long edge of the phone runs along your shinbone.',
      'Tap once to zero. The phone should read 0° with your shin pointing straight down.',
      'Hold your thigh still with one hand — it should NOT move during the test.',
    ],
    howTo: [
      'Slowly swing your foot INWARD (toward your other leg). Your shin moves — your thigh stays still.',
      'Stop when you feel a firm stretch or your thigh starts to rotate. Read the number.',
      'Write it down. Return to center. Tap to re-zero.',
      'Do the other leg.',
    ],
    mistake: 'Your thigh rotates instead of just your shin.',
    mistakeFix: 'Press your hand firmly on the TOP of your thigh. If you feel it move, you went too far.',
    videoUrl: 'https://www.youtube.com/watch?v=HKYVJHnrReU',
    videoLabel: 'Hip IR & ER — Seated Shin Method (John Hancock OTD)',
    fields: [
      { key: 'hip_er_l', label: 'Left', unit: '°', normalLow: 40, normalHigh: 60, riskBelow: 40 },
      { key: 'hip_er_r', label: 'Right', unit: '°', normalLow: 40, normalHigh: 60, riskBelow: 40 },
    ],
  },
  {
    id: 'hip_ir',
    title: 'Hip Internal Rotation',
    bjjWhy: 'Protects your knee in guard, drives hip escapes, key in leg entanglement defense.',
    tool: 'Phone flat on your shin · Same seated position as Hip ER',
    position: [
      'Stay seated on the edge of the chair. Feet off the floor. Hip and knee at 90°.',
      'Phone flat on your shin, just below the knee. Long edge runs along your shinbone.',
      'Tap to zero. Shin points straight down = 0°.',
      'Hold your thigh still — it does NOT move.',
    ],
    howTo: [
      'Slowly swing your foot OUTWARD (away from your other leg). Your shin moves out — that IS internal rotation of the hip.',
      'Stop when your butt starts to lift off the chair or your thigh rolls. Read the number.',
      'Write it down. Return to center. Tap to re-zero.',
      'Do the other leg.',
    ],
    mistake: 'Leaning your whole body sideways to get the foot higher.',
    mistakeFix: 'Stay sitting evenly on both sides. If one butt cheek lifts, stop right there.',
    videoUrl: 'https://www.youtube.com/watch?v=-EyAIpwhBWA',
    videoLabel: 'Hip Internal Rotation Solo Test',
    fields: [
      { key: 'hip_ir_l', label: 'Left', unit: '°', normalLow: 30, normalHigh: 45, riskBelow: 30 },
      { key: 'hip_ir_r', label: 'Right', unit: '°', normalLow: 30, normalHigh: 45, riskBelow: 30 },
    ],
  },
  {
    id: 'hip_abd',
    title: 'Hip Abduction',
    bjjWhy: 'How wide your guard opens — butterfly, open guard, and side control base all need this.',
    tool: 'Phone on outside of thigh · Standing next to a wall',
    position: [
      'Stand next to a wall. Rest one hand on the wall for balance — do not lean on it.',
      'Stand tall. Feet together. Toes pointing straight forward.',
      'Place your phone flat on the OUTSIDE of your thigh, above the knee.',
      'Tap to zero while you stand straight.',
    ],
    howTo: [
      'Lift your test leg straight out to the side. Keep your toes pointing forward — NOT up at the ceiling.',
      'Stop when your hip starts to hike up or your body leans to the side. Read the number.',
      'Write it down. Return to standing. Tap to re-zero.',
      'Do the other leg.',
    ],
    mistake: 'Tilting your whole body sideways to get the leg higher.',
    mistakeFix: 'Watch your opposite hip in a mirror. If it drops or rises, stop right there.',
    videoUrl: 'https://www.youtube.com/watch?v=Ho3mfhDaA_g',
    videoLabel: 'Hip Mobility Self-Assessment incl. Abduction (Dr. Mitch Israel)',
    fields: [
      { key: 'hip_abd_l', label: 'Left', unit: '°', normalLow: 40, normalHigh: 50, riskBelow: 30 },
      { key: 'hip_abd_r', label: 'Right', unit: '°', normalLow: 40, normalHigh: 50, riskBelow: 30 },
    ],
  },
  {
    id: 'hip_flex',
    title: 'Hip Flexion',
    bjjWhy: 'How deep your closed guard is — closed guard, rubber guard, and armbar position all need this.',
    tool: 'Phone on top of your thigh · Lying on your back',
    position: [
      'Lie flat on your back on the floor. Both legs straight.',
      'Place your phone flat on the TOP of your thigh, midway between your hip and your knee.',
      'Tap to zero with your leg flat on the ground.',
    ],
    howTo: [
      'Pull one knee toward your chest using both hands. The phone rides along on your thigh.',
      'Stop when your lower back peels off the floor OR your other leg lifts. Read the number.',
      'Write it down. Lay your leg back down. Tap to re-zero.',
      'Do the other leg.',
    ],
    mistake: 'Curling your whole lower back off the floor to get the knee closer.',
    mistakeFix: 'Keep your opposite leg flat on the ground. When your low back peels up — that is your real endpoint.',
    videoUrl: 'https://www.youtube.com/watch?v=tdYjpTQ0AQY',
    videoLabel: 'Hip Flexion Self-Assessment (The Ready State)',
    fields: [
      { key: 'hip_flex_l', label: 'Left', unit: '°', normalLow: 100, normalHigh: 120, riskBelow: 100 },
      { key: 'hip_flex_r', label: 'Right', unit: '°', normalLow: 100, normalHigh: 120, riskBelow: 100 },
    ],
  },
  {
    id: 'shoulder_er',
    title: 'Shoulder External Rotation',
    bjjWhy: 'Protects you from Kimuras and Americanas — this range is your joint safety zone.',
    tool: 'Phone on your forearm · Lying on your back',
    position: [
      'Lie flat on your back. Stretch one arm straight out to the side so it makes a T shape with your body.',
      'Bend your elbow to 90°. Your forearm now points straight up at the ceiling.',
      'Place your phone flat on your forearm. Tap to zero.',
      'Press your elbow down to the floor with your other hand before you start.',
    ],
    howTo: [
      'Let your forearm fall BACKWARD toward your head. Your upper arm stays flat on the floor — elbow must not lift.',
      'Stop when your elbow starts to peel off the floor or you feel a firm stretch. Read the number.',
      'Write it down. Return forearm to straight up. Tap to re-zero.',
      'Do the other arm.',
    ],
    mistake: 'The elbow lifts off the floor to fake more range.',
    mistakeFix: 'Press your elbow down with your other hand before you start, and keep it there the whole time.',
    videoUrl: 'https://www.youtube.com/watch?v=ucw-RsD5sEE',
    videoLabel: 'Shoulder ER & IR Self-Assessment — Lying Method (Athletes\' Potential)',
    fields: [
      { key: 'shoulder_er_l', label: 'Left', unit: '°', normalLow: 60, normalHigh: 90, riskBelow: 60 },
      { key: 'shoulder_er_r', label: 'Right', unit: '°', normalLow: 60, normalHigh: 90, riskBelow: 60 },
    ],
  },
  {
    id: 'shoulder_flex',
    title: 'Shoulder Flexion',
    bjjWhy: 'Overhead reach for spider guard, frames, and posting when taken down.',
    tool: 'Phone on your upper arm · Standing flat against a wall',
    position: [
      'Stand with your back flat against a wall. Heels, butt, and shoulders all touch the wall.',
      'Let one arm hang straight at your side.',
      'Place your phone against your upper arm (between shoulder and elbow). Use your other hand to hold it steady while you zero, then let go.',
      'Tap to zero with your arm pointing down.',
    ],
    howTo: [
      'Raise your arm straight forward and up — like a slow front raise going all the way overhead.',
      'Keep your elbow straight. Stop when your low back peels off the wall or your shoulder shrugs up toward your ear. Read the number.',
      'Write it down. Return arm to your side. Tap to re-zero.',
      'Do the other arm.',
    ],
    mistake: 'Arching your back off the wall to get your arm higher.',
    mistakeFix: 'Keep your low back touching the wall the whole time. The moment it peels off — that is your real endpoint.',
    videoUrl: 'https://www.youtube.com/watch?v=fnc01OxSh-s',
    videoLabel: 'Shoulder Flexion Self-Test Against Wall (Upright Health)',
    fields: [
      { key: 'shoulder_flex_l', label: 'Left', unit: '°', normalLow: 140, normalHigh: 180, riskBelow: 120 },
      { key: 'shoulder_flex_r', label: 'Right', unit: '°', normalLow: 140, normalHigh: 180, riskBelow: 120 },
    ],
  },
  {
    id: 'ankle_df',
    title: 'Ankle Dorsiflexion',
    bjjWhy: 'Your base and balance in every standing position — takedowns, sprawls, and passing guard.',
    tool: 'Tape measure or ruler · Standing knee-to-wall test (measure in cm)',
    position: [
      'Stand facing a wall. Put a tape measure on the floor pointing straight away from the wall.',
      'Place the big toe of your test foot on the tape measure, right at the wall.',
      'Put your other foot back for balance.',
    ],
    howTo: [
      'Lunge your knee forward until it just touches the wall. Keep your heel FLAT on the floor.',
      'If it was easy: move your foot back 1 cm and try again. Keep moving back until your knee can just barely touch the wall with your heel still flat.',
      'Record that distance from your big toe to the wall in centimeters.',
      'Do the other foot.',
    ],
    mistake: 'Your heel lifts off the floor to make the knee reach the wall.',
    mistakeFix: 'Watch your heel the whole time. It must stay flat. If it lifts — move your foot back closer and try again.',
    videoUrl: 'https://www.youtube.com/watch?v=u3NbKOXl75k',
    videoLabel: 'Knee-to-Wall Ankle Test — Exact Solo Method (Aleks Physio)',
    fields: [
      { key: 'ankle_df_l', label: 'Left', unit: 'cm', normalLow: 10, normalHigh: 20, riskBelow: 10 },
      { key: 'ankle_df_r', label: 'Right', unit: 'cm', normalLow: 10, normalHigh: 20, riskBelow: 10 },
    ],
  },
  {
    id: 'lumbar',
    title: 'Lumbar Flexion + Extension',
    bjjWhy: 'Bridging, guard recovery, back escapes, and protecting your lower back when stacked.',
    tool: 'Phone tucked in your waistband at belt level · Standing',
    position: [
      'Stand straight, feet shoulder-width apart, toes pointing forward.',
      'Tuck your phone into the back of your waistband at belt level. Screen against your back.',
      'Tap to zero while standing tall.',
    ],
    howTo: [
      'FLEXION: Bend forward slowly, letting your hands drop toward the floor. Keep your knees straight. Stop when you cannot go further. Read and record the number.',
      'Come back to standing. Tap to re-zero.',
      'EXTENSION: Place your hands on your lower back. Lean backward slowly. Stop before your knees bend or your hips shoot forward. Read and record the number.',
    ],
    mistake: 'During extension: bending your knees and pushing your hips forward — that is hip movement, not back movement.',
    mistakeFix: 'Keep your knees locked straight. Move only from the belt line up.',
    videoUrl: 'https://www.youtube.com/watch?v=FlNXMZ_cUGM',
    videoLabel: 'Lumbar Flexion & Extension — Phone Inclinometer Method (Dr. Bryan PT)',
    fields: [
      { key: 'lumbar_flex', label: 'Flexion', unit: '°', normalLow: 40, normalHigh: 80, riskBelow: 40 },
      { key: 'lumbar_ext', label: 'Extension', unit: '°', normalLow: 20, normalHigh: 30, riskBelow: 15 },
    ],
  },
  {
    id: 'cervical_rot',
    title: 'Cervical Rotation',
    bjjWhy: 'Neck safety in scrambles, defending collar ties, and situational awareness on the mat.',
    tool: 'Phone flat on TOP of your head · Seated in a chair',
    position: [
      'Sit in a chair with your back straight. Feet flat on the floor.',
      'Set your phone FLAT on top of your head. Screen up, like a little hat.',
      'Tap to zero while looking straight ahead. Do not tilt your chin up or down.',
    ],
    howTo: [
      'Turn your head slowly to the LEFT. Keep your chin level — do not dip it toward your shoulder.',
      'Stop when you cannot turn further without your shoulder moving. Read the number.',
      'Write it down. Return to center. Tap to re-zero.',
      'Turn to the RIGHT. Repeat.',
    ],
    mistake: 'Tipping your chin down toward your shoulder instead of rotating.',
    mistakeFix: 'Keep your chin parallel to the floor the whole time. Turn your nose to the side — do not dip it.',
    videoUrl: 'https://www.youtube.com/watch?v=wLuRF70zrLg',
    videoLabel: 'Cervical Rotation — Inclinometer on Head Method (Dr. Syed Ali Hussain PT)',
    fields: [
      { key: 'cervical_rot_l', label: 'Left', unit: '°', normalLow: 70, normalHigh: 90, riskBelow: 60 },
      { key: 'cervical_rot_r', label: 'Right', unit: '°', normalLow: 70, normalHigh: 90, riskBelow: 60 },
    ],
  },
  {
    id: 'thoracic_rot',
    title: 'Thoracic Rotation',
    bjjWhy: 'Hip escapes, guard passing hip drive, and arm bar rotation all start here.',
    tool: 'Phone flat on your chest · Seated on a stool or chair edge',
    position: [
      'Sit on a stool or the edge of a chair. Feet flat on the floor, hip-width apart.',
      'Cross your arms over your chest — hands on opposite shoulders.',
      'Set your phone flat on your sternum (chest bone, in the middle of your chest).',
      'Tap to zero while sitting tall, looking straight ahead.',
      'Squeeze a rolled towel or small ball between your knees — this keeps your hips from cheating.',
    ],
    howTo: [
      'Rotate your upper body to the LEFT. Keep your hips facing forward — your knees should NOT move.',
      'Stop when your hips start to turn. Read the number.',
      'Write it down. Return to center. Tap to re-zero.',
      'Rotate to the RIGHT. Repeat.',
    ],
    mistake: 'Spinning your hips to get more rotation — this fakes the number.',
    mistakeFix: 'Watch your knees. If one knee moves or drifts, your hips moved. Stop and record that angle.',
    videoUrl: 'https://www.youtube.com/watch?v=HeGIMZU6EnQ',
    videoLabel: 'Thoracic Rotation — Inclinometer Method (OrthoNugs)',
    fields: [
      { key: 'thoracic_rot', label: 'Avg L+R', unit: '°', normalLow: 40, normalHigh: 60, riskBelow: 30 },
    ],
  },
]

const SETUP_STEPS = [
  { icon: '📱', label: 'iPhone', detail: 'Open the Measure app → tap Level at the bottom' },
  { icon: '🤖', label: 'Android', detail: 'Download "Simple Inclinometer" by Syleos Apps (free, Play Store)' },
  { icon: '⚖️', label: 'Calibrate', detail: 'Place phone on a flat surface — confirm it reads 0°. Tap to zero if not.' },
  { icon: '🏃', label: 'Warm up', detail: '8–10 min light movement first. Wear shorts and a t-shirt.' },
  { icon: '📸', label: 'Hands-free screenshot', detail: 'When the phone is on your body, you can\'t tap the screen. Just say "Hey Siri, take a screenshot" (iPhone) or "Hey Google, take a screenshot" (Android). Then read the number after.' },
]

// ── Live scoring helper ───────────────────────────────────────────────────────
function getScore(val: string, field: Field) {
  const n = parseFloat(val)
  if (isNaN(n) || val === '') return null
  if (n < field.riskBelow) return 'risk'
  if (n >= field.normalLow) return 'functional'
  return 'yellow'
}

// ── Single field input ────────────────────────────────────────────────────────
function MeasureInput({ field, value, onChange }: {
  field: Field; value: string; onChange: (k: string, v: string) => void
}) {
  const score = getScore(value, field)
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <label className="text-sm font-semibold text-charcoal">{field.label}</label>
        <span className="text-xs text-charcoal-light">Normal: {field.normalLow}–{field.normalHigh}{field.unit}</span>
      </div>
      <div className="flex items-center gap-3">
        <input
          type="number" min="0" max="360" step="0.5"
          value={value}
          onChange={e => onChange(field.key, e.target.value)}
          placeholder="—"
          className={cn(
            'w-24 px-3 py-2.5 rounded-xl border text-sm text-center font-mono font-bold transition-all focus:outline-none',
            score === 'risk'       ? 'border-red-300 bg-red-50 text-red-700 focus:border-red-400' :
            score === 'functional' ? 'border-teal/40 bg-teal/5 text-teal focus:border-teal' :
            score === 'yellow'     ? 'border-yellow-300 bg-yellow-50 text-yellow-700 focus:border-yellow-400' :
                                     'border-teal-light bg-surface focus:border-teal focus:bg-white'
          )}
        />
        <span className="text-sm text-charcoal-light">{field.unit}</span>
        {score === 'risk' && (
          <span className="flex items-center gap-1 text-xs font-semibold text-red-tier bg-red-tier-bg px-2 py-0.5 rounded-full">
            <AlertTriangle size={10} /> AT RISK
          </span>
        )}
        {score === 'functional' && (
          <span className="flex items-center gap-1 text-xs font-semibold text-teal bg-teal-light px-2 py-0.5 rounded-full">
            <CheckCircle2 size={10} /> FUNCTIONAL
          </span>
        )}
        {score === 'yellow' && (
          <span className="flex items-center gap-1 text-xs font-semibold text-yellow-tier bg-yellow-tier-bg px-2 py-0.5 rounded-full">
            ⚠ LOW
          </span>
        )}
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────
export function Assessment() {
  const { session } = useAuth()
  const navigate = useNavigate()
  const [phase, setPhase]     = useState<'setup' | 'measure' | 'done'>('setup')
  const [stepIdx, setStepIdx] = useState(0)
  const [values, setValues]   = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState('')

  const handleChange = (key: string, val: string) => setValues(p => ({ ...p, [key]: val }))

  const step = STEPS[stepIdx]
  const totalMeasureSteps = STEPS.length
  const progress = Math.round(((stepIdx) / totalMeasureSteps) * 100)

  const handleNext = () => {
    if (stepIdx < STEPS.length - 1) {
      setStepIdx(s => s + 1)
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } else {
      submit()
    }
  }

  const submit = async () => {
    if (!session) { setError('Session expired — please sign in again.'); return }
    setLoading(true); setError('')
    const payload: Record<string, number | null> = {}
    for (const [k, v] of Object.entries(values)) {
      payload[k] = v === '' ? null : parseFloat(v)
    }
    const res = await fetch(SUBMIT_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`,
        'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
      },
      body: JSON.stringify(payload),
    })
    const data = await res.json()
    setLoading(false)
    if (!data.ok) { setError(data.error ?? 'Submission failed. Please try again.'); return }
    setPhase('done')
    setTimeout(() => navigate('/onboarding/results', { replace: true }), 2000)
  }

  // ── Setup screen ─────────────────────────────────────────────────────────
  if (phase === 'setup') {
    return (
      <div className="min-h-screen bg-surface py-8 px-4">
        <div className="max-w-lg mx-auto space-y-5">
          <div className="text-center">
            <h1 className="font-display font-bold text-teal text-2xl">ROM Self-Assessment</h1>
            <p className="text-sm text-charcoal-light mt-1">15 minutes · Smartphone inclinometer · No equipment needed</p>
          </div>

          <div className="bg-white rounded-2xl border border-teal-light p-6 space-y-4">
            <p className="text-sm font-semibold text-charcoal">Before you start:</p>
            {SETUP_STEPS.map(s => (
              <div key={s.label} className="flex gap-3 items-start">
                <span className="text-xl shrink-0">{s.icon}</span>
                <div>
                  <p className="text-sm font-semibold text-charcoal">{s.label}</p>
                  <p className="text-xs text-charcoal-light leading-relaxed">{s.detail}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="bg-teal-light rounded-2xl p-4">
            <div className="flex gap-2 items-start">
              <Info size={16} className="text-teal mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-semibold text-teal">How to use your phone as a measuring tool</p>
                <p className="text-xs text-teal/80 mt-1 leading-relaxed">
                  Place phone FLAT against the body part. Tap screen to zero. Move to end range. Pause 1 second. Read the number (ignore any minus sign). This is the same method validated in 4 peer-reviewed clinical studies.
                </p>
              </div>
            </div>
          </div>

          <button onClick={() => setPhase('measure')} className="btn-primary w-full flex items-center justify-center gap-2 text-base py-3">
            I'm ready — Start assessment <ChevronRight size={18} />
          </button>
          <p className="text-center text-xs text-charcoal-light">You can skip any measurement you can't do and retest later.</p>
        </div>
      </div>
    )
  }

  // ── Done screen ───────────────────────────────────────────────────────────
  if (phase === 'done') {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="w-16 h-16 bg-teal-light rounded-full flex items-center justify-center mx-auto">
            <CheckCircle2 size={32} className="text-teal" fill="currentColor" strokeWidth={0} />
          </div>
          <h2 className="font-display font-bold text-xl text-charcoal">Assessment complete!</h2>
          <p className="text-sm text-charcoal-light">Computing your technique tiers...</p>
          <div className="w-6 h-6 border-[3px] border-teal/30 border-t-teal rounded-full animate-spin mx-auto" />
        </div>
      </div>
    )
  }

  // ── Measurement screen ────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-surface py-6 px-4">
      <div className="max-w-lg mx-auto space-y-4">
        {/* Progress */}
        <div className="flex items-center gap-3">
          <div className="flex-1 h-1.5 bg-teal-light rounded-full overflow-hidden">
            <div className="h-full bg-teal rounded-full transition-all duration-500"
              style={{ width: `${progress + (100 / totalMeasureSteps)}%` }} />
          </div>
          <span className="text-xs text-charcoal-light whitespace-nowrap">{stepIdx + 1} / {totalMeasureSteps}</span>
        </div>

        {/* Joint card */}
        <div className="bg-white rounded-2xl border border-teal-light shadow-sm overflow-hidden">
          {/* Header */}
          <div className="bg-teal px-5 py-4">
            <h2 className="font-display font-bold text-xl text-white">{step.title}</h2>
            <p className="text-teal-light text-xs mt-0.5">{step.bjjWhy}</p>
          </div>

          <div className="p-5 space-y-5">
            {/* Tool */}
            <div className="flex items-center gap-2 text-xs text-charcoal-light bg-surface rounded-xl px-3 py-2">
              <span className="text-base">📐</span>
              <span className="font-medium">{step.tool}</span>
            </div>

            {/* Video reference */}
            {step.videoUrl && (
              <a href={step.videoUrl} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-2 text-xs text-teal font-medium hover:underline">
                <ExternalLink size={12} /> {step.videoLabel}
              </a>
            )}

            {/* Setup */}
            <div>
              <p className="text-xs font-bold text-charcoal uppercase tracking-wide mb-2">Setup</p>
              <ol className="space-y-1.5">
                {step.position.map((s, i) => (
                  <li key={i} className="flex gap-2.5 text-sm text-charcoal-light leading-snug">
                    <span className="w-5 h-5 bg-teal-light text-teal text-xs font-bold rounded-full flex items-center justify-center shrink-0 mt-0.5">
                      {i + 1}
                    </span>
                    {s}
                  </li>
                ))}
              </ol>
            </div>

            {/* How to */}
            <div>
              <p className="text-xs font-bold text-charcoal uppercase tracking-wide mb-2">How to Measure</p>
              <ol className="space-y-1.5">
                {step.howTo.map((s, i) => (
                  <li key={i} className="flex gap-2.5 text-sm text-charcoal-light leading-snug">
                    <span className="w-5 h-5 bg-surface border border-teal-light text-charcoal-light text-xs font-bold rounded-full flex items-center justify-center shrink-0 mt-0.5">
                      {i + 1}
                    </span>
                    {s}
                  </li>
                ))}
              </ol>
            </div>

            {/* Common mistake */}
            <div className="flex gap-2.5 bg-yellow-50 border border-yellow-200 rounded-xl p-3">
              <AlertTriangle size={15} className="text-yellow-600 shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-semibold text-yellow-700">Common mistake</p>
                <p className="text-xs text-yellow-700 mt-0.5">{step.mistake}</p>
                <p className="text-xs text-yellow-800 font-medium mt-1">Fix: {step.mistakeFix}</p>
              </div>
            </div>

            {/* Input fields */}
            <div className="space-y-4 pt-2 border-t border-teal-light">
              <p className="text-xs font-bold text-charcoal uppercase tracking-wide">Enter your measurements</p>
              {step.fields.map(f => (
                <MeasureInput key={f.key} field={f} value={values[f.key] ?? ''} onChange={handleChange} />
              ))}
            </div>

            {/* Hands-free screenshot tip */}
            <p className="text-center text-xs text-charcoal-light">
              📸 Can't tap the screen? Say <span className="font-semibold">&ldquo;Hey Siri, take a screenshot&rdquo;</span> (iPhone) or <span className="font-semibold">&ldquo;Hey Google, take a screenshot&rdquo;</span> (Android).
            </p>

            {error && <p className="text-xs text-red-tier bg-red-tier-bg rounded-lg px-3 py-2">{error}</p>}

            {/* Navigation */}
            <div className="flex items-center justify-between pt-2">
              <button
                type="button"
                onClick={() => { if (stepIdx > 0) { setStepIdx(s => s - 1); window.scrollTo({ top: 0 }) } else setPhase('setup') }}
                className="flex items-center gap-1 text-sm text-charcoal-light hover:text-teal px-3 py-2 rounded-xl hover:bg-teal-light transition-colors"
              >
                <ChevronLeft size={15} /> Back
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => { handleChange(step.fields[0].key, ''); handleNext() }}
                  className="flex items-center gap-1 text-xs text-charcoal-light hover:text-charcoal px-3 py-2 rounded-xl hover:bg-surface transition-colors"
                >
                  <SkipForward size={13} /> Skip
                </button>

                <button
                  type="button"
                  onClick={handleNext}
                  disabled={loading}
                  className="btn-primary flex items-center gap-2"
                >
                  {loading
                    ? <><Loader2 size={14} className="animate-spin" /> Submitting...</>
                    : stepIdx === STEPS.length - 1
                      ? <><CheckCircle2 size={14} /> Submit</>
                      : <>Next <ChevronRight size={14} /></>
                  }
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Step dots */}
        <div className="flex justify-center gap-1.5">
          {STEPS.map((_, i) => (
            <div key={i} className={cn(
              'rounded-full transition-all duration-300',
              i === stepIdx ? 'bg-teal w-5 h-2' : i < stepIdx ? 'bg-teal/40 w-2 h-2' : 'bg-gray-200 w-2 h-2'
            )} />
          ))}
        </div>
      </div>
    </div>
  )
}
