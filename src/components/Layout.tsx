import { NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom'
import { useEffect, useMemo } from 'react'
import { useAuth } from '../hooks/useAuth'
import { useProfile } from '../hooks/useProfile'
import { useSport } from '../sports/SportProvider'
import { cn } from '../lib/utils'
import {
  Dumbbell,
  Layers,
  ClipboardList,
  MessageSquare,
  Settings,
  LogOut,
  Users,
  UserCheck,
  Building2,
  GraduationCap,
  Trophy,
  Syringe,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { SportSwitcher } from '../sports/SportSwitcher'
import type { SportConfig } from '../sports/registry'

interface NavItem {
  to: string
  icon: LucideIcon
  label: string
  end?: boolean
}

const ATHLETE_ONLY_ROUTES = [
  '/dashboard/my-body',
  '/dashboard/my-game',
  '/dashboard/my-protocol',
]

/**
 * Build the athlete nav based on the active sport's config.
 * - Section labels (My Body / My Game / My Protocol) come from sport_config.
 * - Game tab is hidden if game_label is null (e.g. General has no game).
 * - School tab is hidden if has_schools = false.
 */
function buildAthleteNav(sport: SportConfig): NavItem[] {
  const items: NavItem[] = []
  if (sport.body_label) {
    items.push({ to: '/dashboard/my-body', icon: Dumbbell, label: sport.body_label })
  }
  if (sport.game_label) {
    items.push({ to: '/dashboard/my-game', icon: Layers, label: sport.game_label })
  }
  if (sport.protocol_label) {
    items.push({
      to: '/dashboard/my-protocol',
      icon: ClipboardList,
      label: sport.protocol_label,
    })
  }
  if (sport.has_coach_portal) {
    items.push({ to: '/dashboard/my-coach', icon: UserCheck, label: 'My Coach' })
  }
  if (sport.has_schools) {
    items.push({ to: '/dashboard/my-school', icon: Building2, label: 'My School' })
  }
  items.push({ to: '/dashboard/chat', icon: MessageSquare, label: 'ROMBot' })
  items.push({ to: '/dashboard/settings', icon: Settings, label: 'Settings' })
  return items
}

function buildCoachNav(sport: SportConfig): NavItem[] {
  const items: NavItem[] = [
    { to: '/dashboard/coach', icon: Users, label: 'My Team', end: true },
    { to: '/dashboard/coach-coaching', icon: GraduationCap, label: 'My Coaching' },
    { to: '/dashboard/coach-competitions', icon: Trophy, label: 'My Competitions' },
    { to: '/dashboard/coach-injury', icon: Syringe, label: 'My Injury' },
  ]
  if (sport.has_schools) {
    items.push({ to: '/dashboard/coach-school', icon: Building2, label: 'My School' })
  }
  items.push({ to: '/dashboard/chat', icon: MessageSquare, label: 'ROMBot' })
  items.push({ to: '/dashboard/settings', icon: Settings, label: 'Settings' })
  return items
}

/** Map sport theme_accent → Tailwind classes for active nav pill + brand text. */
function getThemeClasses(accent: string) {
  // Tailwind needs literal class names to be picked up by the JIT, so we
  // enumerate the supported accents here. Add new ones as new sports launch.
  switch (accent) {
    case 'crimson':
      return {
        brand: 'text-crimson',
        border: 'border-crimson-light',
        activeBg: 'bg-crimson text-white',
        hover: 'hover:bg-crimson-light hover:text-crimson',
      }
    case 'miami':
      return {
        brand: 'text-miami',
        border: 'border-miami-light',
        activeBg: 'bg-miami text-white',
        hover: 'hover:bg-miami-light hover:text-miami',
      }
    case 'slate':
      return {
        brand: 'text-slate-700',
        border: 'border-slate-200',
        activeBg: 'bg-slate-700 text-white',
        hover: 'hover:bg-slate-100 hover:text-slate-800',
      }
    case 'teal':
    default:
      return {
        brand: 'text-teal',
        border: 'border-teal-light',
        activeBg: 'bg-teal text-white',
        hover: 'hover:bg-teal-light hover:text-teal',
      }
  }
}

export function Layout() {
  const { user, signOut } = useAuth()
  const { profile } = useProfile(user?.id)
  const { activeSport } = useSport()
  const navigate = useNavigate()
  const location = useLocation()
  const isCoach = profile?.portal_role === 'coach'

  const nav = useMemo(
    () => (isCoach ? buildCoachNav(activeSport) : buildAthleteNav(activeSport)),
    [isCoach, activeSport],
  )

  const theme = useMemo(() => getThemeClasses(activeSport.theme_accent), [activeSport.theme_accent])

  // Redirect coaches away from athlete-only pages
  useEffect(() => {
    if (!isCoach) return
    if (ATHLETE_ONLY_ROUTES.some((r) => location.pathname.startsWith(r))) {
      navigate('/dashboard/coach', { replace: true })
    }
  }, [isCoach, location.pathname, navigate])

  const handleSignOut = async () => {
    await signOut()
    navigate('/')
  }

  return (
    <div className="min-h-screen flex flex-col bg-surface">
      {/* Top nav */}
      <header className={cn('sticky top-0 z-10 bg-white border-b', theme.border)}>
        <div className="max-w-5xl mx-auto px-4 flex items-center h-14 gap-1">
          <span className={cn('font-display tracking-wider mr-4 text-lg', theme.brand)}>
            ROMRx{activeSport.slug !== 'bodybuilding' ? ` · ${activeSport.short_name}` : 'BodyBuilding'}
          </span>
          <nav className="flex gap-1 flex-1 overflow-x-auto scrollbar-none">
            {nav.map(({ to, icon: Icon, label, end: isEnd }) => (
              <NavLink
                key={to}
                to={to}
                end={isEnd}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-colors',
                    isActive ? theme.activeBg : cn('text-charcoal-light', theme.hover),
                  )
                }
              >
                <Icon size={14} />
                {label}
              </NavLink>
            ))}
          </nav>
          <SportSwitcher />
          <button
            onClick={handleSignOut}
            className="ml-2 p-2 rounded-full text-charcoal-light hover:bg-red-50 hover:text-red-600 transition-colors"
            title="Sign out"
          >
            <LogOut size={16} />
          </button>
        </div>
      </header>

      {/* Page content */}
      <main className="flex-1 max-w-5xl w-full mx-auto px-4 py-6">
        <Outlet />
      </main>
    </div>
  )
}
