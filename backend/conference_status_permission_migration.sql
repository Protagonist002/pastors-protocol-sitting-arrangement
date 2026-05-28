ALTER TABLE public.conferences
    ADD COLUMN IF NOT EXISTS all_protocols_can_update_status BOOLEAN NOT NULL DEFAULT FALSE;
