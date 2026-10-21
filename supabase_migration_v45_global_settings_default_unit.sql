-- v45: global_settings.default_unit ('kg' | 'ton').
--
-- Four Rebar pages (Dashboard, Monthly Report, Stock Take, Transactions)
-- and the Rebar Settings page read/write this column, but it was never
-- created in the live database — every one of those queries failed with
-- Postgres 42703 "column global_settings.default_unit does not exist".
-- Side effects of the failing query: the pages silently fell back to kg,
-- the Dashboard also fell back to a 14-day coverage target instead of the
-- stored target_coverage_days, and saving Rebar Settings errored out.
--
-- Applied live to jiltqrunlpewqkofzulz via MCP. Local record, as v2..v44.

alter table public.global_settings
  add column if not exists default_unit text not null default 'kg' check (default_unit in ('kg', 'ton'));
