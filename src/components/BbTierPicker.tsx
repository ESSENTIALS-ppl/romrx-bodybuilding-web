// "Pick your level" card for bodybuilding pack owners with no tier yet (see lib/bbTier.ts).
// Calls the existing RPC set_my_bb_tier, then onPicked() so the parent reloads the view.
// The buyer chooses; nothing is saved until a button is pressed.
import { useState } from 'react'
import { Sparkles } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { cn, bbTierLabel } from '../lib/utils'
import {
  BB_TIER_VALUES, BB_TIER_PICKER_HEADING, BB_TIER_PICKER_SETTINGS_NOTE, bbTierPickerBody,
  type BbTierValue,
} from '../lib/bbTier'
import { SectionCard } from './SectionCard'

export function BbTierPicker({ onPicked }: { onPicked: (tier: BbTierValue) => void }) {
  const [saving, setSaving] = useState<BbTierValue | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function pick(tier: BbTierValue) {
    setSaving(tier)
    setError(null)
    const { data, error: rpcError } = await supabase.rpc('set_my_bb_tier', { p_tier: tier })
    if (rpcError || (data as { ok?: boolean } | null)?.ok !== true) {
      setSaving(null)
      setError('Could not save your level. Please try again.')
      return
    }
    onPicked(tier)
  }

  return (
    <SectionCard
      title={<span className="flex items-center gap-2 text-sm"><Sparkles size={14} className="text-miami" /> {BB_TIER_PICKER_HEADING}</span>}
    >
      <p className="text-sm text-miami-text/75">{bbTierPickerBody()}</p>
      <p className="text-xs text-miami-text/55 mt-1 mb-4">{BB_TIER_PICKER_SETTINGS_NOTE}</p>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        {BB_TIER_VALUES.map(t => (
          <button
            key={t}
            type="button"
            onClick={() => pick(t)}
            disabled={saving !== null}
            aria-busy={saving === t}
            className={cn(
              'rounded-xl border border-miami-violet/30 bg-miami-ink/60 px-3 py-3 text-sm font-bold text-miami-text transition-colors',
              'hover:border-miami hover:bg-miami-violet/15 disabled:cursor-not-allowed',
              saving !== null && saving !== t && 'opacity-40',
              saving === t && 'border-miami animate-pulse',
            )}
          >
            {bbTierLabel(t)}
          </button>
        ))}
      </div>
      {error && (
        <p className="mt-3 rounded-lg bg-red-tier-bg border border-red-tier/30 text-red-tier px-3 py-2 text-sm">{error}</p>
      )}
    </SectionCard>
  )
}
