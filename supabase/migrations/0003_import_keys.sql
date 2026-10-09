-- Stable keys so CSV imports are idempotent upserts.
alter table micro_markets add column slug text not null unique;
alter table schools add constraint schools_market_name_key unique (micro_market_id, name);
alter table projects add constraint projects_market_name_key unique (micro_market_id, name);
