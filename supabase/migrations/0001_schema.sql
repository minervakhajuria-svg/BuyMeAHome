-- BuyMeAHome schema. Every fact row carries as_of_date.

create extension if not exists pgcrypto;

create table micro_markets (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  corridor text not null,
  lat double precision,
  lng double precision,
  price_per_sqft_min integer,
  price_per_sqft_max integer,
  typical_price_by_bhk jsonb,
  nearest_metro text,
  metro_status text,
  flood_risk_note text,
  water_note text,
  power_note text,
  air_noise_note text,
  walkability_score integer check (walkability_score between 0 and 100),
  greenery_note text,
  hospitals_note text,
  airport_minutes integer,
  as_of_date date not null,
  source_notes text,
  is_sample boolean not null default false
);

create table schools (
  id uuid primary key default gen_random_uuid(),
  micro_market_id uuid not null references micro_markets(id) on delete cascade,
  name text not null,
  board text not null check (board in ('CBSE','ICSE','IB/IGCSE','State','Other')),
  notes text,
  as_of_date date not null
);

create table projects (
  id uuid primary key default gen_random_uuid(),
  micro_market_id uuid not null references micro_markets(id) on delete cascade,
  name text not null,
  rera_number text,
  status text check (status in ('ready','under_construction','resale')),
  khata_type text check (khata_type in ('A','B','unknown')),
  oc_cc_status text,
  as_of_date date not null
);

create table commute_times (
  micro_market_id uuid not null references micro_markets(id) on delete cascade,
  destination text not null,
  mode text not null check (mode in ('car','two_wheeler','metro','cab_bus')),
  peak_minutes integer not null,
  as_of_date date not null,
  primary key (micro_market_id, destination, mode)
);

create table sessions (
  id uuid primary key default gen_random_uuid(),
  resume_token text not null unique,
  profile jsonb not null default '{}'::jsonb,
  email text,
  consent_at timestamptz,
  created_at timestamptz not null default now()
);

create table reports (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references sessions(id) on delete cascade,
  access_token text not null unique,
  scored_results jsonb not null,
  report_html text,
  created_at timestamptz not null default now()
);

-- Dataset tables are readable by anyone; sessions and reports are only reachable
-- through server routes using the service role (no anon policies).
alter table micro_markets enable row level security;
alter table schools enable row level security;
alter table projects enable row level security;
alter table commute_times enable row level security;
alter table sessions enable row level security;
alter table reports enable row level security;

create policy "dataset read" on micro_markets for select using (true);
create policy "dataset read" on schools for select using (true);
create policy "dataset read" on projects for select using (true);
create policy "dataset read" on commute_times for select using (true);
