import { cn } from '../lib/utils'

interface Props {
  title: string
  subtitle?: string
  badge?: string
  badgeColor?: string
  action?: React.ReactNode
}

export function PageHeader({ title, subtitle, badge, badgeColor = 'bg-miami-light text-miami', action }: Props) {
  return (
    <div className="flex items-start justify-between mb-6">
      <div>
        <h1 className="font-display font-bold text-2xl text-charcoal tracking-tight">{title}</h1>
        {subtitle && (
          <p className="text-sm text-charcoal-light mt-0.5">{subtitle}</p>
        )}
      </div>
      <div className="flex items-center gap-2 mt-0.5">
        {badge && (
          <span className={cn('px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wide', badgeColor)}>
            {badge}
          </span>
        )}
        {action}
      </div>
    </div>
  )
}
