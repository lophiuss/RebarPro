-- v51: Meetings — add MYR and SGD as KPI units.
alter table public.mtg_kpis drop constraint if exists mtg_kpis_unit_type_check;
alter table public.mtg_kpis add constraint mtg_kpis_unit_type_check
  check (unit_type in ('number','percent','dollars','euros','pesos','yen','pounds','inr','rand','aed','xcg','myr','sgd','yesno'));
