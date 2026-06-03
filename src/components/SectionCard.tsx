import { cn } from '../lib/utils'

interface Props {
  title?: React.ReactNode
  subtitle?: string
  children: React.ReactNode
  className?: string
  noPad?: boolean
}

export function SectionCard({ title, subtitle, children, className, noPad }: Props) {
  return (
    <div className={cn('bg-miami-ink/80 backdrop-blur rounded-2xl border border-miami-violet/20 shadow-[0_0_24px_-12px_rgba(180,79,232,0.45)]', !noPad && 'p-5', className)}>
      {title && (
        <div className={cn('mb-4', noPad && 'px-5 pt-5')}>
          <div className="text-sm font-semibold text-miami-text">{title}</div>
          {subtitle && <p className="text-xs text-miami-text/60 mt-0.5">{subtitle}</p>}
        </div>
      )}
      {children}
    </div>
  )
}
