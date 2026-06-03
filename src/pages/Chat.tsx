import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { useProfile } from '../hooks/useProfile'
import { PageHeader } from '../components/PageHeader'
import { SectionCard } from '../components/SectionCard'
import { Spinner } from '../components/Spinner'
import { Send, Loader2, Settings, Trash2, Wand2 } from 'lucide-react'
import { cn } from '../lib/utils'
import { supabase, SUPABASE_URL, SUPABASE_ANON } from '../lib/supabase'

const START_LABELS: Record<string, string> = {
  standing: 'starting on the feet, fighting for takedowns',
  ontop:    'starting in a top position, looking to pass and control',
  onbottom: 'starting from guard on the bottom',
}
const FINISH_LABELS: Record<string, string> = {
  chokes: 'choke submissions (rear naked, triangle, guillotine)',
  arm:    'arm attack submissions (armbar, kimura, americana)',
  legs:   'leg attack submissions (heel hook, kneebar, ankle lock)',
}
const STYLE_LABELS: Record<string, string> = {
  explosive: 'explosive and physical',
  technical: 'patient and technical',
}

const AI_CHAT_URL = `${SUPABASE_URL}/functions/v1/ai-chat`

interface Message { role: 'user' | 'assistant'; content: string }
const PROVIDERS = [
  { value: 'rombot',     label: 'ROMBot (included)' },
  { value: 'openai',     label: 'OpenAI (BYOK)' },
  { value: 'anthropic',  label: 'Anthropic (BYOK)' },
  { value: 'google',     label: 'Google Gemini (BYOK)' },
  { value: 'perplexity', label: 'Perplexity (BYOK)' },
]



function formatLines(text: string) {
  return text
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/^- (.+)$/gm, '- $1')
    .split('\n').filter(Boolean)
}

export function Chat() {
  const location = useLocation()
  const navigate = useNavigate()
  const { user, session } = useAuth()
  const { profile, loading: profileLoading } = useProfile(user?.id)
  const [messages, setMessages]             = useState<Message[]>([])
  const [input, setInput]                   = useState('')
  const [busy, setBusy]                     = useState(false)
  const [convId, setConvId]                 = useState<string | undefined>()
  const [showSettings, setShowSettings]     = useState(false)
  const [provider, setProvider]             = useState('rombot')
  const [providerKey, setProviderKey]       = useState('')
  const [error, setError]                   = useState('')
  const [gamePlanBanner, setGamePlanBanner] = useState<string | null>(null)
  const autoSentRef = useRef(false)
  const endRef = useRef<HTMLDivElement>(null)

  const isCoach = profile?.portal_role === 'coach'

  useEffect(() => {
    const saved = localStorage.getItem('romrx_provider_pref')
    if (saved) { const p = JSON.parse(saved); setProvider(p.provider ?? 'rombot'); setProviderKey(p.key ?? '') }
  }, [])

  // Load athlete roster for coach
  useEffect(() => {
    if (!isCoach || !user) return
    async function loadAthletes() {
      const { data: coachRow } = await supabase
        .from('coaches')
        .select('id')
        .eq('user_id', user!.id)
        .maybeSingle()
      if (!coachRow) return
      const { data: athletes } = await supabase
        .from('athletes')
        .select('user_id, belt')
        .eq('coach_id', coachRow.id)
      if (!athletes || athletes.length === 0) return

      const userIds = athletes.map(a => a.user_id).filter(Boolean) as string[]
      if (userIds.length === 0) return

      const { data: users } = await supabase
        .from('users')
        .select('id, full_name, email')
        .in('id', userIds)

      // Athletes loaded for roster reference (no longer needed for dropdown)
      void athletes; void users; // suppress unused warnings
    }
    loadAthletes()
  }, [isCoach, user])

  useEffect(() => {
    if (messages.length === 0 && user && !profileLoading) {
      const name = (profile?.full_name ?? 'there').split(' ')[0]
      const tier = profile?.active_bb_tier ?? 'beginner'
      const coachWelcome = isCoach
        ? `Hey ${name} \u2014 I'm ROMBot, your team intelligence assistant.\n\nI can see your athletes' ROM scores and training tiers. Ask me anything about your roster.\n\nNote: ROMBot provides educational information only and is not medical advice.`
        : `Hey ${name} \u2014 I'm ROMBot, your bodybuilding intelligence assistant.\n\nI can see your ${tier} tier profile, ROM scores, and protocol. Ask me anything:\n\u2022 "What exercises should I prioritize this week?"\n\u2022 "Which lifts am I closest to unlocking?"\n\u2022 "How do I program around tight ankles?"\n\nNote: ROMBot provides educational information only and is not medical advice. Consult a healthcare professional before changing your training if you have pain or injury.`
      setMessages([{ role: 'assistant', content: coachWelcome }])
    }
  }, [user, profile, profileLoading, messages.length, isCoach])

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  // Auto-send game plan request from My Game URL params
  useEffect(() => {
    if (autoSentRef.current || profileLoading || !session || messages.length === 0) return
    const params = new URLSearchParams(location.search)
    if (params.get('gameplan') !== '1') return
    const start  = params.get('start')  ?? ''
    const finish = params.get('finish') ?? ''
    const style  = params.get('style')  ?? ''
    if (!start || !finish || !style) return
    autoSentRef.current = true
    // Clear URL params without navigation
    navigate('/dashboard/chat', { replace: true })
    const startLabel  = START_LABELS[start]  ?? start
    const finishLabel = FINISH_LABELS[finish] ?? finish
    const styleLabel  = STYLE_LABELS[style]  ?? style
    setGamePlanBanner(`Building your game plan: ${startLabel.split(',')[0]}, ${finishLabel.split(' (')[0]}, ${styleLabel} style`)
    const msg = `Build me a personalized BJJ game plan. I prefer ${startLabel}. My go-to finish is ${finishLabel}. My game style is ${styleLabel}. Give me: a creative name for this game plan, a 4-step technique flow using only my available techniques (technique names, no codes), and explain why each technique fits my mobility profile.`
    // Auto-send after brief delay so welcome message shows first
    setTimeout(async () => {
      setMessages(p => [...p, { role: 'user', content: msg }])
      setBusy(true)
      setError('')
      try {
        const res = await fetch(AI_CHAT_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}`, 'apikey': SUPABASE_ANON },
          body: JSON.stringify({ message: msg, sport: 'bodybuilding', provider, provider_key: providerKey }),
        })
        const data = await res.json()
        if (data.error) throw new Error(data.error)
        setConvId(data.conversation_id)
        setMessages(p => [...p, { role: 'assistant', content: data.reply }])
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Something went wrong')
      } finally { setBusy(false) }
    }, 600)
  }, [profileLoading, session, messages.length, location.search])

  const send = async () => {
    if (!input.trim() || busy || !session) return
    const msg = input.trim()
    setInput(''); setError('')
    setMessages(p => [...p, { role: 'user', content: msg }])
    setBusy(true)
    try {
      const body: Record<string, unknown> = {
        message: msg,
        conversation_id: convId,
        sport: 'bodybuilding',
        provider,
        provider_key: providerKey,
      }
      // Coach mode: roster-level context is loaded server-side automatically
      const res = await fetch(AI_CHAT_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
          'apikey': SUPABASE_ANON,
        },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setConvId(data.conversation_id)
      setMessages(p => [...p, { role: 'assistant', content: data.reply }])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong')
    } finally { setBusy(false) }
  }

  const savePrefs = () => {
    localStorage.setItem('romrx_provider_pref', JSON.stringify({ provider, key: providerKey }))
    setShowSettings(false)
  }

  if (profileLoading) return <Spinner />


  return (
    <div className="flex flex-col" style={{ height: 'calc(100vh - 7rem)' }}>
      <PageHeader
        title="ROMBot"
        subtitle={PROVIDERS.find(p => p.value === provider)?.label}
        action={
          <div className="flex gap-1">
            <button onClick={() => { setMessages([]); setConvId(undefined) }}
              className="p-2 rounded-xl hover:bg-red-tier-bg text-charcoal-light hover:text-red-tier transition-colors" title="Clear chat">
              <Trash2 size={15} />
            </button>
            <button onClick={() => setShowSettings(s => !s)}
              className="p-2 rounded-xl hover:bg-miami-light text-charcoal-light hover:text-miami transition-colors" title="Settings">
              <Settings size={15} />
            </button>
          </div>
        }
      />

      {showSettings && (
        <SectionCard className="mb-4">
          <div className="space-y-3">
            <p className="text-xs bg-miami-light text-miami rounded-xl px-3 py-2">
              ROMBot (GPT-4o-mini) is included free. Use your own key for other models.
            </p>
            <select value={provider} onChange={e => setProvider(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-miami-light bg-surface text-sm focus:outline-none focus:border-miami">
              {PROVIDERS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
            </select>
            {provider !== 'rombot' && (
              <input type="password" value={providerKey} onChange={e => setProviderKey(e.target.value)}
                placeholder="API key..."
                className="w-full px-3 py-2 rounded-xl border border-miami-light bg-surface text-sm font-mono focus:outline-none focus:border-miami" />
            )}
            <div className="flex gap-2">
              <button onClick={savePrefs} className="btn-primary flex-1 py-2 text-sm">Save</button>
              <button onClick={() => setShowSettings(false)} className="flex-1 py-2 text-sm rounded-xl border border-miami-light text-charcoal-light hover:bg-surface">Cancel</button>
            </div>
          </div>
        </SectionCard>
      )}

      {/* Coach team context badge */}
      {isCoach && (
        <div className="flex items-center gap-2 bg-miami-light border border-miami/20 rounded-xl px-3 py-2 mb-2">
          <span className="text-xs font-medium text-miami flex-1">
            Team mode - ROMBot has full access to all your athletes' ROM profiles and technique readiness
          </span>
        </div>
      )}


      {/* Game plan context banner */}
      {gamePlanBanner && (
        <div className="flex items-center gap-2 bg-miami text-white rounded-xl px-3 py-2 mb-2">
          <Wand2 size={13} className="shrink-0" />
          <span className="text-xs font-medium flex-1">{gamePlanBanner}</span>
          <button onClick={() => setGamePlanBanner(null)} className="text-white/70 hover:text-white text-xs">x</button>
        </div>
      )}

      {/* Disclaimer banner */}
      <div className="flex items-start gap-2 bg-surface border border-miami-light rounded-xl px-3 py-2 mb-2">
        <span className="text-xs text-charcoal-light leading-relaxed">
          <span className="font-semibold text-charcoal">Educational use only.</span> ROMBot is not medical advice — consult a healthcare professional for pain or injury, and a qualified coach before attempting new lifts.
        </span>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto space-y-3 pb-3 min-h-0">
        {messages.map((m, i) => (
          <div key={i} className={cn('flex', m.role === 'user' ? 'justify-end' : 'justify-start')}>
            <div className={cn(
              'max-w-[82%] rounded-2xl px-4 py-3 text-sm leading-relaxed',
              m.role === 'user'
                ? 'bg-miami text-white rounded-br-sm'
                : 'bg-white border border-miami-light text-charcoal rounded-bl-sm'
            )}>
              {formatLines(m.content).map((line, j) => (
                <p key={j} dangerouslySetInnerHTML={{ __html: line }} className={j > 0 ? 'mt-1' : ''} />
              ))}
            </div>
          </div>
        ))}

        {busy && (
          <div className="flex justify-start">
            <div className="bg-white border border-miami-light rounded-2xl rounded-bl-sm px-4 py-3">
              <div className="flex gap-1.5">
                {[0, 160, 320].map(d => (
                  <div key={d} className="w-2 h-2 bg-miami rounded-full animate-bounce" style={{ animationDelay: `${d}ms` }} />
                ))}
              </div>
            </div>
          </div>
        )}
        {error && <p className="text-xs text-center text-red-tier bg-red-tier-bg rounded-xl px-3 py-2">{error}</p>}
        <div ref={endRef} />
      </div>

      {/* Input */}
      <div className="flex gap-2 pt-3 border-t border-miami-light mt-2">
        <textarea
          value={input} onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
          placeholder="Ask about your mobility, techniques, or protocol..."
          rows={1} className="flex-1 px-4 py-2.5 rounded-xl border border-miami-light bg-surface text-sm resize-none focus:outline-none focus:border-miami focus:bg-white transition-colors"
          style={{ minHeight: 44, maxHeight: 120 }}
        />
        <button onClick={send} disabled={busy || !input.trim()} className="btn-primary px-4 flex items-center gap-1.5 shrink-0">
          {busy ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
        </button>
      </div>
    </div>
  )
}
