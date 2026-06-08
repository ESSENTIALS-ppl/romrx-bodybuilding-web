import { useState } from 'react'
import { Loader2, Send, CheckCircle2 } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { DEFAULT_SPORT_KEY } from '../sports/registry'
import { cn } from '../lib/utils'

export type FeedbackCategory = 'bug' | 'feature' | 'general'

const FEEDBACK_CATEGORIES: { value: FeedbackCategory; label: string }[] = [
  { value: 'bug', label: "Something's broken" },
  { value: 'feature', label: 'Feature idea' },
  { value: 'general', label: 'General feedback' },
]

const MAX_MESSAGE = 1000
const MIN_MESSAGE = 5

interface FeedbackWidgetProps {
  /** Called after a successful submission (e.g. to auto-close a modal). */
  onSuccess?: () => void
  /** Sport slug sent to the backend. Defaults to this build's sport. */
  sport?: string
}

export function FeedbackWidget({ onSuccess, sport = DEFAULT_SPORT_KEY }: FeedbackWidgetProps) {
  const [category, setCategory] = useState<FeedbackCategory>('general')
  const [message, setMessage] = useState('')
  const [honeypot, setHoneypot] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)

  const trimmedLength = message.trim().length
  const tooLong = message.length > MAX_MESSAGE
  const canSubmit = !submitting && trimmedLength >= MIN_MESSAGE && !tooLong

  const handleSubmit = async () => {
    if (!canSubmit) return
    setSubmitting(true)
    setMsg(null)
    try {
      const { data, error } = await supabase.functions.invoke('submit-feedback', {
        body: {
          category,
          message: message.trim(),
          sport,
          page_url: window.location.pathname,
          honeypot,
        },
      })
      if (error || data?.error) {
        throw new Error(error?.message ?? data?.error ?? 'Submission failed.')
      }
      // Keep the typed message intact only on error; clear on success.
      setMessage('')
      setCategory('general')
      setMsg({ type: 'ok', text: 'Thanks! We got it. 💪' })
      onSuccess?.()
    } catch (e) {
      setMsg({ type: 'err', text: e instanceof Error ? e.message : 'Something went wrong. Please try again.' })
    } finally {
      setSubmitting(false)
    }
  }

  const counterColor = tooLong
    ? 'text-red-tier'
    : message.length >= MAX_MESSAGE * 0.9
      ? 'text-yellow-tier'
      : 'text-charcoal-light'

  return (
    <div className="space-y-4">
      {/* Category — segmented toggle group */}
      <div role="radiogroup" aria-label="Feedback category">
        <p className="text-xs text-charcoal-light font-semibold uppercase tracking-wide mb-2">
          What kind of feedback?
        </p>
        <div className="flex gap-2 flex-wrap">
          {FEEDBACK_CATEGORIES.map(({ value, label }) => {
            const active = category === value
            return (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => setCategory(value)}
                className={cn(
                  'px-3 py-1.5 rounded-full text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-miami focus:ring-offset-1',
                  active
                    ? 'bg-miami text-white'
                    : 'bg-surface text-charcoal-light border border-miami-light hover:bg-miami-light',
                )}
              >
                {label}
              </button>
            )
          })}
        </div>
      </div>

      {/* Message */}
      <div>
        <label
          htmlFor="feedback-message"
          className="text-xs text-charcoal-light font-semibold uppercase tracking-wide block mb-1"
        >
          Your message
        </label>
        <textarea
          id="feedback-message"
          value={message}
          onChange={e => setMessage(e.target.value)}
          rows={4}
          maxLength={MAX_MESSAGE}
          placeholder="Tell us what happened or what you'd like to see…"
          className="w-full rounded-xl border border-miami-light bg-surface px-3 py-2.5 text-sm text-charcoal focus:outline-none focus:ring-2 focus:ring-miami resize-y"
        />
        <div className="flex justify-end mt-1">
          <span className={cn('text-xs font-medium tabular-nums', counterColor)}>
            {message.length}/{MAX_MESSAGE}
          </span>
        </div>
      </div>

      {/* Honeypot — visually hidden but present in the DOM for bots to fill */}
      <input
        type="text"
        name="honeypot"
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
        value={honeypot}
        onChange={e => setHoneypot(e.target.value)}
        className="absolute left-[-9999px] h-0 w-0 overflow-hidden"
      />

      {msg && (
        <div
          className={cn(
            'flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-medium',
            msg.type === 'ok' ? 'bg-miami-light text-miami' : 'bg-red-tier-bg text-red-tier',
          )}
        >
          {msg.type === 'ok' ? <CheckCircle2 size={14} /> : <span className="text-xs font-bold">!</span>}
          {msg.text}
        </div>
      )}

      <button
        type="button"
        onClick={handleSubmit}
        disabled={!canSubmit}
        className="btn-primary flex items-center gap-2 disabled:opacity-50"
      >
        {submitting ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
        {submitting ? 'Sending…' : 'Send feedback'}
      </button>
    </div>
  )
}
