import { cn } from '../lib/utils'

interface Props {
  title?: string
  subtitle?: string
  children: React.ReactNode
  className?: string
  noPad?: boolean
}

export function SectionCard({ title, subtitle, children, className, noPad }: Props) {
  return (
    <div className={cn('bg-white rounded-2xl border border-teal-light', !noPad && 'p-5', className)}>
      {title && (
        <div className={cn('mb-4', noPad && 'px-5 pt-5')}>
          <p className="text-sm font-semibold text-charcoal">{title}</p>
          {subtitle && <p className="text-xs text-charcoal-light mt-0.5">{subtitle}</p>}
        </div>
      )}
      {children}
    </div>
  )
}
