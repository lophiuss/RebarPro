-- Migration V8: Update transaction type constraint, drop outgoing, add unsuspend, nullable size_id for wastage

-- 1. Drop existing type check constraint
ALTER TABLE public.transactions DROP CONSTRAINT IF EXISTS transactions_type_check;

-- 2. Add updated type check constraint (outgoing removed, unsuspend added)
ALTER TABLE public.transactions ADD CONSTRAINT transactions_type_check 
  CHECK (type IN ('incoming', 'usage', 'ordering', 'transfer', 'suspended', 'unsuspend', 'wastage'));

-- 3. Make size_id nullable (for overall combined wastage)
ALTER TABLE public.transactions ALTER COLUMN size_id DROP NOT NULL;

-- 4. Clean up orphaned stock takes with no project_type_id
DELETE FROM public.stock_takes WHERE project_type_id IS NULL;

-- 5. Reload schema cache for PostgREST
NOTIFY pgrst, 'reload schema';
