import { useEffect, useRef, useState } from 'react'
import { MessageSquarePlus, X } from 'lucide-react'
import { FeedbackWidget } from './FeedbackWidget'

export function FeedbackButton() {
  const [open, setOpen] = useState(false)
  const launcherRef = useRef<HTMLButtonElement>(null)
  const dialogRef = useRef<HTMLDivElement>(null)
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Focus management: trap focus inside the modal, ESC to close, return focus on close.
  useEffect(() => {
    if (!open) return

    const dialog = dialogRef.current
    const focusables = dialog?.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), textarea, input:not([tabindex="-1"]), select, [tabindex]:not([tabindex="-1"])',
    )
    focusables?.[0]?.focus()

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        setOpen(false)
        return
      }
      if (e.key === 'Tab' && focusables && focusables.length > 0) {
        const first = focusables[0]
        const last = focusables[focusables.length - 1]
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault()
          last.focus()
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault()
          first.focus()
        }
      }
    }

    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open])

  // Return focus to the launcher when the modal closes.
  useEffect(() => {
    if (!open) launcherRef.current?.focus()
  }, [open])

  useEffect(() => {
    return () => {
      if (closeTimer.current) clearTimeout(closeTimer.current)
    }
  }, [])

  const handleSuccess = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current)
    closeTimer.current = setTimeout(() => setOpen(false), 2000)
  }

  return (
    <>
      <button
        ref={launcherRef}
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={open}
        className="fixed bottom-5 right-5 z-40 flex items-center gap-2 rounded-full bg-miami px-4 py-3 text-sm font-semibold text-white shadow-[0_0_24px_-6px_rgba(255,45,120,0.7)] hover:bg-miami/90 focus:outline-none focus:ring-2 focus:ring-miami focus:ring-offset-2 transition-colors min-h-[44px]"
      >
        <MessageSquarePlus size={18} />
        Feedback
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 px-4 pb-4 sm:pb-0"
          onClick={() => setOpen(false)}
        >
          <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="feedback-modal-title"
            onClick={e => e.stopPropagation()}
            className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl space-y-4"
          >
            <div className="flex items-center justify-between">
              <h3
                id="feedback-modal-title"
                className="font-display font-bold text-lg text-charcoal"
              >
                Send feedback
              </h3>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close feedback"
                className="p-1.5 rounded-full text-charcoal-light hover:bg-miami-light transition-colors focus:outline-none focus:ring-2 focus:ring-miami"
              >
                <X size={18} />
              </button>
            </div>
            <FeedbackWidget onSuccess={handleSuccess} />
          </div>
        </div>
      )}
    </>
  )
}
