ALTER TABLE public.conferences
    ADD COLUMN IF NOT EXISTS start_date DATE,
    ADD COLUMN IF NOT EXISTS end_date DATE;

UPDATE public.conferences
SET start_date = COALESCE(start_date, date)
WHERE date IS NOT NULL
  AND start_date IS NULL;
