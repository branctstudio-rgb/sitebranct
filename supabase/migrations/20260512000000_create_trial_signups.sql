-- Migration: criar tabela de captura de leads da landing /crm-gestao.html
-- Apply via Supabase SQL Editor ou: supabase db push
--
-- A Edge Function trial-signup escreve aqui usando service_role (ignora RLS).
-- Visitantes anónimos NUNCA leem nem escrevem diretamente.

CREATE TABLE IF NOT EXISTS public.trial_signups (
    id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at   timestamptz NOT NULL DEFAULT now(),
    updated_at   timestamptz NOT NULL DEFAULT now(),
    nome         text        NOT NULL,
    email        text        NOT NULL UNIQUE,
    empresa      text,
    utm_source   text,
    utm_medium   text,
    utm_campaign text,
    utm_content  text,
    utm_term     text,
    referrer     text,
    landing_url  text,
    user_agent   text,
    ip_country   text,
    status       text        NOT NULL DEFAULT 'pending'
                              CHECK (status IN ('pending','provisioned','contacted','converted','dead'))
);

CREATE INDEX IF NOT EXISTS trial_signups_status_idx       ON public.trial_signups (status);
CREATE INDEX IF NOT EXISTS trial_signups_created_at_idx   ON public.trial_signups (created_at DESC);
CREATE INDEX IF NOT EXISTS trial_signups_utm_campaign_idx ON public.trial_signups (utm_campaign);

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.trial_signups_touch_updated_at()
RETURNS trigger AS $$
BEGIN
    NEW.updated_at := now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trial_signups_set_updated_at ON public.trial_signups;
CREATE TRIGGER trial_signups_set_updated_at
    BEFORE UPDATE ON public.trial_signups
    FOR EACH ROW
    EXECUTE FUNCTION public.trial_signups_touch_updated_at();

-- RLS: bloqueia leitura/escrita anónima. service_role ignora RLS por defeito,
-- portanto a Edge Function continua a funcionar sem políticas adicionais.
ALTER TABLE public.trial_signups ENABLE ROW LEVEL SECURITY;

-- (Opcional) política para um futuro dashboard de admin autenticado:
-- CREATE POLICY trial_signups_admin_read ON public.trial_signups
--     FOR SELECT TO authenticated
--     USING (auth.jwt() ->> 'email' = 'admin@branct.com');
