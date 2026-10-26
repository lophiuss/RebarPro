-- v63: QAQC Module — add Quantity and Unit for tests, and index PO / Invoice for multi-test coverage.
--
-- 1. Quantity and Unit: allow recording test sample counts (e.g. 3 cubes, 6 nos, 1 set, etc.)
alter table public.qaqc_tests
  add column if not exists qty numeric check (qty is null or qty >= 0) default 1,
  add column if not exists unit text default 'nos';

-- 2. Indexes for fast PO and Invoice grouping
create index if not exists qaqc_tests_po_no_idx on public.qaqc_tests(po_no);
create index if not exists qaqc_tests_invoice_no_idx on public.qaqc_tests(invoice_no);
