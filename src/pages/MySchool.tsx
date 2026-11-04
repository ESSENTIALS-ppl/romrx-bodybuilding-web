import { Building2 } from 'lucide-react'
import { PageHeader } from '../components/PageHeader'
import { SectionCard } from '../components/SectionCard'

export function MySchool() {
  return (
    <div className="space-y-5">
      <PageHeader
        title="My School"
        subtitle="Your gym and team features"
      />

      <SectionCard title="">
        <div className="flex flex-col items-center text-center py-8 space-y-5 max-w-sm mx-auto">
          <div className="w-16 h-16 rounded-full bg-miami-light flex items-center justify-center">
            <Building2 size={28} className="text-miami" />
          </div>

          <div className="space-y-2">
            <h2 className="font-display font-bold text-charcoal text-xl">
              School features are coming soon
            </h2>
            <p className="text-sm text-charcoal-light leading-relaxed">
              Connect to your gym, see your team's training data, access class schedules,
              and stay in sync with your school's program. Check back soon.
            </p>
          </div>
        </div>
      </SectionCard>
    </div>
  )
}
