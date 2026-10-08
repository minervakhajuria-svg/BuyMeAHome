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
