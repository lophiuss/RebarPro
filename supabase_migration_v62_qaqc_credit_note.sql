-- v62: QAQC Module — Credit Note (CN) support for supplier billing adjustments.
--
-- When a supplier overbills, bills wrong rates, or issues a credit note for cancelled/discounted tests,
-- Account can record the CN number, CN date, CN amount, and CN reason.
-- Net billed spend is computed as: invoice_amount - coalesce(cn_amount, 0).

alter table public.qaqc_tests
  add column if not exists cn_no text,
  add column if not exists cn_date date,
  add column if not exists cn_amount numeric check (cn_amount is null or cn_amount >= 0),
  add column if not exists cn_remarks text;

create index if not exists qaqc_tests_cn_no_idx on public.qaqc_tests(cn_no);
