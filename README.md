# ROMRxBodyBuilding Web

The frontend for **romrxbodybuilding.com** — the ROM-based training system built
for bodybuilders.

This repo is a sibling of [`romrx-bjj-web`](https://github.com/ESSENTIALS-ppl/romrx-bjj-web)
and shares the same Supabase backend (`romrxbjj-v2`, project `cqzvqzwwevnflinxgnpp`).
Sport context defaults to `bodybuilding` so users land on BB content.

## Stack

- React 19 + TypeScript + Vite
- Tailwind CSS (Miami Vice × Golden Era BB palette)
- Supabase (auth, DB, edge functions)
- React Router v7
- Recharts (ROM/load charting)
- Radix UI (dialog, dropdown, tabs, tooltip)

## Brand

- **Palette**: hot pink `#FF2D78` · electric teal `#00F5E4` · synthwave violet `#B44FE8`
  · golden era gold `#FFD700` on near-black `#070711`
- **Type**: Bebas Neue (display) · Barlow Condensed (subheads) · Inter (body)
- **Voice**: data-first, evidence-led, no-BS — "KNOW WHAT YOUR BODY CAN LIFT."

## Local dev

```bash
cp .env.example .env.local   # fill in VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY
npm install
npm run dev
```

## Build

```bash
npm run build       # → dist/
npm run preview     # serve the production build locally
```

## Deploy

Deployed to Netlify at `romrxbodybuilding.com`. The site root rewrites to
`marketing.html`; the React app handles `/login`, `/signup`, `/dashboard/*`,
`/onboarding/*`, and `/auth/*`.

## Sport mode

This site sets `DEFAULT_SPORT_KEY = 'bodybuilding'` in `src/sports/registry.ts`.
Users can still switch sports via `SportSwitcher` (which writes to
`users.active_sport` in Supabase) — the registry only controls the **default**
sport before the DB row arrives.

- Coach portal: **hidden** (`has_coach_portal: false`) — Trainers are
  "in development" and shown only as a teaser on the marketing site.
- Schools: **hidden** — gym portal is "coming soon".
- Tier gating: BB exercises gated by `users.active_bb_tier` (beginner /
  intermediate / advanced) via the `unlocked_techniques_v` view.

## Companion repos

- [`romrxbjj-v2`](https://github.com/ESSENTIALS-ppl/romrxbjj-v2) — shared backend
- [`romrx-bjj-web`](https://github.com/ESSENTIALS-ppl/romrx-bjj-web) — BJJ frontend
