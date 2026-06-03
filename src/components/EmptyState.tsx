import type { LucideIcon } from 'lucide-react'
import { cn } from '../lib/utils'

interface Props {
  icon: LucideIcon
  title: string
  description: string
  action?: React.ReactNode
  className?: string
}

export function EmptyState({ icon: Icon, title, description, action, className }: Props) {
  return (
    <div className={cn('flex flex-col items-center justify-center py-16 text-center px-4', className)}>
      <div className="w-14 h-14 bg-teal-light rounded-2xl flex items-center justify-center mb-4">
        <Icon size={24} className="text-teal" />
      </div>
      <h3 className="font-display font-bold text-base text-charcoal mb-1">{title}</h3>
      <p className="text-sm text-charcoal-light max-w-xs leading-relaxed">{description}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}
