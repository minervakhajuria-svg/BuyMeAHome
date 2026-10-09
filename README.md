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

## Report page (Step 7)
`/report/<token>` renders a stored report (unguessable token, `noindex`); "Download PDF" uses the
browser's print dialog with a print stylesheet. Preview the layout without a database at
`/report/sample` (development only; set `ENABLE_SAMPLE_REPORT=true` to allow it in production).
With Supabase configured, `npm run report -- <profile.json> --save` stores a report and prints its link.

## Email and consent gate (Step 8)
After question 10 the chat shows a short privacy notice, a consent checkbox and an email field.
`POST /api/report` records the email and consent time on the session, generates the report, saves it
and emails the link through Resend (`RESEND_API_KEY`, `EMAIL_FROM`). The email address never reaches
the report data or the model. If sending fails or Resend is not configured, the page shows the report
link instead. Draft privacy and consent wording lives in `components/intake/ReportGate.tsx` and
`lib/consent.ts`; have it reviewed (see the data protection note above) before any public launch.
Rate limits (reports: 5 an hour per address and 3 an hour per session; typed answers: 20 per 10 minutes)
are in-memory per server instance, so put a shared limiter in front before a public launch.
