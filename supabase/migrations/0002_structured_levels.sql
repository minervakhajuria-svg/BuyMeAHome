-- Structured, scoreable fields. The free-text notes stay for report wording; scoring reads these.
alter table micro_markets
  add column flood_risk_level text check (flood_risk_level in ('low','medium','high')),
  add column water_source text check (water_source in ('cauvery','mixed','borewell_tanker')),
  add column power_cut_level text check (power_cut_level in ('low','medium','high')),
  add column air_noise_level text check (air_noise_level in ('low','medium','high')),
  add column greenery_level text check (greenery_level in ('low','medium','high')),
  add column hospitals_level text check (hospitals_level in ('low','medium','high'));

alter table projects
  add column gated_clubhouse boolean,
  add column has_parking boolean,
  add column has_power_backup boolean,
  add column has_lift boolean;
