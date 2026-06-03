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
    <div className={cn('bg-white rounded-2xl border border-miami-light', !noPad && 'p-5', className)}>
      {title && (
        <div className={cn('mb-4', noPad && 'px-5 pt-5')}>
          <div className="text-sm font-semibold text-charcoal">{title}</div>
          {subtitle && <p className="text-xs text-charcoal-light mt-0.5">{subtitle}</p>}
        </div>
      )}
      {children}
    </div>
  )
}
