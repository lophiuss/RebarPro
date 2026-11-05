-- v66: Rebar Module — Add supplier tracking to transactions and stock takes
-- Allows tracking rebar incoming by supplier, reporting incoming per supplier,
-- and recording physical stock take counts categorized by supplier.

alter table public.transactions
  add column if not exists supplier text;

create index if not exists idx_transactions_supplier
  on public.transactions(supplier);

alter table public.stock_takes
  add column if not exists supplier text;

create index if not exists idx_stock_takes_supplier
  on public.stock_takes(supplier);
