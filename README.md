# ROMRxBodyBuilding Web

Frontend for ROMRxBodyBuilding™ — AI-powered ROM assessment for bodybuilders and powerlifters.

**Domain:** romrxbodybuilding.com  
**Stack:** Vanilla HTML/CSS/JS + Netlify  
**Backend:** Google Apps Script (romrx-bodybuilding-gas)  
**Payments:** Stripe

## Visual Identity
Miami Vice x Golden Era Bodybuilding (80s/90s aesthetic)  
Neon pastels: hot pink, electric teal, soft violet, sunset orange on dark background.

## Build Phases
1. Foundation — folder structure, design system, tokens
2. Public Pages — Homepage, Pricing, Assessment flow
3. Auth + Payments — Magic link auth, Stripe checkout
4. Athlete Dashboard — Gym Readiness Profile, filtered programs, training log
5. Coach Dashboard — roster, warmup generator, level-up approvals
6. Polish + Launch

## Folder Structure
```
/                   Homepage (index.html)
/Assessment/        Self-guided ROM measurement flow
/Dashboard/         Athlete paid dashboard
/Coach/             Coach paid dashboard
/Pricing/           Pricing page
/css/main.css       Design system + tokens
/js/config.js       Shared API URL constant
/images/            Assets
/netlify.toml       Routing
```

## Pricing
| Plan | Price |
|------|-------|
| Gym Readiness Profile | Free |
| Athlete Dashboard | $149/year |
| Coach Dashboard | $349/year |
