-- Migration V9: Add default_unit to global_settings (kg or ton)

-- 1. Add default_unit column (default to 'kg')
ALTER TABLE public.global_settings 
  ADD COLUMN IF NOT EXISTS default_unit text NOT NULL DEFAULT 'kg' 
  CHECK (default_unit IN ('kg', 'ton'));

-- 2. Set existing row to 'kg'
UPDATE public.global_settings SET default_unit = 'kg' WHERE id = 1;

-- 3. Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';
