import { cn, tierColor, tierLabel } from '../../lib/utils'

interface Props {
  tier: string | null
  flag?: string | null
  size?: 'sm' | 'md'
}

export function TierBadge({ tier, flag, size = 'md' }: Props) {
  // DELAY_TECHNIQUE is an internal flag — display as RED
  const effectiveTier = flag === 'DELAY_TECHNIQUE' ? 'RED' : tier
  const label = tierLabel(effectiveTier, flag ?? null)
  const color = tierColor(effectiveTier)
  return (
    <span className={cn(
      'inline-flex items-center rounded-full px-2.5 font-semibold tracking-wide uppercase',
      size === 'sm' ? 'text-xs py-0.5' : 'text-xs py-1',
      color
    )}>
      {label}
    </span>
  )
}
