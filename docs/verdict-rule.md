# One GREEN / YELLOW / RED rule (F-05)

Three places decide a color today, and they disagree.

| | Server (compute-tiers v41, emails, Base, BJJ) | BB screens (MyGame.tsx computeReadiness) |
|---|---|---|
| Side used | worst side (min of L/R) | better side (max of L/R) |
| GREEN | every joint at 100% of minimum or more | 90% or more |
| YELLOW | 90 to 99%, or a required joint not measured | 75 to 89% |
| RED | under 90% | under 75% |
| Joint not measured | YELLOW | counts as 0%, so RED |
| Words | GREEN / YELLOW / RED | Ready / Caution / Mobility first |

Effect: the same person is GREEN on a BB screen and YELLOW or RED in the email and Base, and BB never shows the server result at all (no BB screen reads technique_eligibility).

## Jim decision D1 (one line)
One GREEN/YELLOW/RED rule everywhere: use the server rule (worst side, GREEN 100%, YELLOW 90 to 99%, RED under 90) instead of the BB screen rule (better side, Ready 90, Caution 75, Mobility first)? Recommend: yes, server rule, because the emails and the saved technique_eligibility rows already use it, and keep the words Ready / Caution / Mobility first as labels on those colors.

## This PR
Only adds `src/lib/verdict.ts` (the server rule as a pure function plus the word map) and this note. Nothing imports it. After D1: replace `computeReadiness` color logic in MyGame.tsx and ProgramGenerator/programGenerator.ts with `verdictFor`, or read technique_eligibility directly.
