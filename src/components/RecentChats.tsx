import { useState } from 'react'
import { History } from 'lucide-react'
import { SUPABASE_URL, SUPABASE_ANON } from '../lib/supabase'

// FG-06: recent ROMBot chats. One account-wide history (FG-38), same list in Base, BJJ and BB.
// Each row shows the chat's date and the user's first message (ai_conversations.title). No new screen text.
// Built on Avery's rombot-conversations function (action list / get, owner-only, read-only). STAGED by Avery, not deployed yet.
const URL_ = `${SUPABASE_URL}/functions/v1/rombot-conversations`

interface Row { id: string; title: string | null; updated_at: string }
export interface OpenedChat { id: string; messages: { role: 'user' | 'assistant'; content: string }[] }

export function RecentChats({ accessToken, onOpen }: { accessToken?: string; onOpen: (c: OpenedChat) => void }) {
  const [open, setOpen] = useState(false)
  const [rows, setRows] = useState<Row[]>([])

  async function call(body: Record<string, unknown>) {
    const res = await fetch(URL_, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}`, apikey: SUPABASE_ANON },
      body: JSON.stringify(body),
    })
    if (!res.ok) throw new Error('request failed')
    return res.json()
  }

  async function toggle() {
    const next = !open
    setOpen(next)
    if (next && accessToken) {
      try { setRows((await call({ action: 'list', limit: 20 })).conversations ?? []) } catch { setRows([]) }
    }
  }

  async function pick(id: string) {
    try {
      const data = await call({ action: 'get', conversation_id: id })
      const messages = ((data.messages ?? []) as { role: string; content: string }[])
        .filter(m => m.role === 'user' || m.role === 'assistant')
        .map(m => ({ role: m.role as 'user' | 'assistant', content: m.content }))
      if (messages.length > 0) { onOpen({ id, messages }); setOpen(false) }
    } catch { /* leave the list open */ }
  }

  return (
    <div className="relative">
      <button onClick={toggle} className="p-2 rounded-xl hover:bg-black/5 text-charcoal-light transition-colors" data-testid="recent-chats-button">
        <History size={15} />
      </button>
      {open && rows.length > 0 && (
        <ul className="absolute right-0 mt-1 w-72 max-h-80 overflow-y-auto rounded-xl border border-black/10 bg-white shadow-lg z-20" data-testid="recent-chats-list">
          {rows.map(r => (
            <li key={r.id}>
              <button onClick={() => pick(r.id)} className="w-full text-left px-3 py-2 text-xs hover:bg-black/5">
                <span className="opacity-60 mr-2">{new Date(r.updated_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
                <span>{r.title ?? ''}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
