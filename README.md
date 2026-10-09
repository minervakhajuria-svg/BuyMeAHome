# BuyMeAHome

Helps a live-in buyer decide **where in Bangalore to buy a home**. Ten short questions in a chat
produce a ranked report of the 3 best micro-markets, plus backups and a "ruled out and why" section.

Rules: buy only, live-in only, all of Bangalore at micro-market level, free for now (email and
consent before a report), never filter or score by caste, religion or community, never invent data
(missing facts say "not available"), no scraping until terms of use are checked.

## Stack
Next.js (App Router) + TypeScript + Tailwind, Supabase, Anthropic API, Resend, Vitest.

## Setup
```
npm install
cp .env.example .env.local   # fill in values; never commit it
npm run dev
npm test
npm run lint                 # type-check
```
Apply `supabase/migrations/*.sql` to your Supabase project.

## Data
Only a small sample dataset (`is_sample = true`) is seeded, and reports show a "sample data"
banner whenever sample rows appear. Rates in `config/rates.ts` are placeholders marked
`// VERIFY against official source`.

## Privacy
We collect only the email and the answers needed for the report. Obligations under India's data
protection law (DPDP Act) need legal review before any public launch.

## Not advice
Reports are not financial or legal advice. Verify everything before buying.

## Intake chat (Step 5)
`/chat` runs the 10-question intake; the first answer creates a resume link (`/chat/<token>`).
Questions, their order and their wording live in code (`config/questions.ts`). Option widgets send
typed answers directly; typed replies for household, work and budget (and the dealbreakers note)
go through `POST /api/intake`, where Claude only extracts the answer into the typed profile
(`ANTHROPIC_MODEL`, credentials from the Anthropic SDK defaults). Without Supabase keys, sessions
are kept in memory and lost on restart (local development only).

## Report engine (Step 6)
`lib/report/generate.ts` turns a profile and the dataset into report data: hard filters, scoring,
rule-out log and "honest math" are all code. Claude writes only the narrative, from JSON, and every
number it writes is checked against the input; after two rejected attempts a deterministic template
is used. Try it locally (sample data, no email or web page yet):
```
npm run report -- data/sample/profile.example.json --no-llm          # template narrative
npm run report -- data/sample/profile.example.json --out report.json  # uses ANTHROPIC_MODEL
```
