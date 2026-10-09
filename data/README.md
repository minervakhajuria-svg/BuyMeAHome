# Data import

`data/sample/` holds a small **sample** dataset (`is_sample = true`). The numbers are placeholders
for testing the app and are not real. Reports built from it show a "sample data" banner.

## Loading

```
npm run seed:sample -- --dry-run     # validate only, writes nothing
npm run seed:sample                  # upsert into Supabase (needs .env.local)
npm run import:micro-markets -- my.csv --dry-run
npm run import:schools       -- my.csv --dry-run --markets my_markets.csv   # also checks slugs
```
Import `micro_markets` first. Imports are upserts, so re-running the same file is safe.
Run the migrations in `supabase/migrations/` first.

## Conventions

- `micro_markets.slug` is the stable key (lowercase, hyphens). Child files use `micro_market_slug`.
- Every row needs `as_of_date` (YYYY-MM-DD). The report shows the oldest date it used.
- Rows with `is_sample = false` must have `source_notes` saying where the facts came from.
- `typical_price_by_bhk` is JSON in rupees: `{"2":{"min":9500000,"max":13000000}}`.
- Level columns (`flood_risk_level`, `power_cut_level`, `air_noise_level`, `greenery_level`,
  `hospitals_level`): `low`, `medium` or `high`. `water_source`: `cauvery`, `mixed`, `borewell_tanker`.
- Leave a cell blank when the fact is unknown. The report says "not available"; it never guesses.
- `projects.oc_cc_status`: only the exact value `received` counts as OC/CC held;
  use `pending` or `not_applicable` otherwise. `khata_type`: `A`, `B` or `unknown`.
- `commute_times.destination` is one of `orr_bellandur`, `whitefield`, `manyata_hebbal`,
  `electronic_city`, `cbd`, `sarjapur_road`; `mode` is `car`, `two_wheeler`, `metro`, `cab_bus`.
- Do not scrape. Check a source's terms of use before using its data.
