// Edge Function: trial-signup
// ─────────────────────────────────────────────────────────────────────────────
// Recebe submissões do form da landing /crm-gestao.html e grava (UPSERT por email)
// em public.trial_signups. Devolve um redirectUrl com email + nome + UTMs para
// app.branct.com/signup completar o onboarding.
//
// Deploy (uma vez):
//   supabase functions deploy trial-signup \
//     --project-ref ksocmuesmlqzpbtmibgu \
//     --no-verify-jwt
//
// O --no-verify-jwt é OBRIGATÓRIO porque a landing usa o novo formato de keys
// sb_publishable_* (não é um JWT; o gateway não consegue verificar). O endpoint
// é público por design — qualquer visitante anónimo cria o trial.
//
// Env vars (auto-injectadas pelo runtime do Supabase):
//   - SUPABASE_URL
//   - SUPABASE_SERVICE_ROLE_KEY
// ─────────────────────────────────────────────────────────────────────────────

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*', // apertar para 'https://branct.com' depois do lançamento
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

interface Payload {
  nome?: string;
  email?: string;
  empresa?: string | null;
  utm_source?: string | null;
  utm_medium?: string | null;
  utm_campaign?: string | null;
  utm_content?: string | null;
  utm_term?: string | null;
  referrer?: string | null;
  landing_url?: string | null;
  user_agent?: string | null;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function clean(value: unknown, max = 500): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.length > max ? trimmed.slice(0, max) : trimmed;
}

serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return json(405, { error: 'Método não permitido' });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceRoleKey) {
    console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    return json(500, { error: 'Configuração do servidor incompleta' });
  }

  let payload: Payload;
  try {
    payload = await req.json();
  } catch {
    return json(400, { error: 'JSON inválido' });
  }

  const nome = clean(payload.nome, 200);
  const email = clean(payload.email, 320)?.toLowerCase() ?? null;

  if (!nome || !email || !EMAIL_RE.test(email)) {
    return json(400, { error: 'Nome e email válidos são obrigatórios' });
  }

  const ipCountry =
    req.headers.get('cf-ipcountry') ||
    req.headers.get('x-vercel-ip-country') ||
    req.headers.get('x-country-code') ||
    null;

  const row = {
    nome,
    email,
    empresa: clean(payload.empresa, 200),
    utm_source: clean(payload.utm_source, 200),
    utm_medium: clean(payload.utm_medium, 200),
    utm_campaign: clean(payload.utm_campaign, 200),
    utm_content: clean(payload.utm_content, 200),
    utm_term: clean(payload.utm_term, 200),
    referrer: clean(payload.referrer, 500),
    landing_url: clean(payload.landing_url, 500),
    user_agent: clean(payload.user_agent, 500),
    ip_country: ipCountry,
  };

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data, error } = await supabase
    .from('trial_signups')
    .upsert(row, { onConflict: 'email', ignoreDuplicates: false })
    .select('id, email, status')
    .single();

  if (error) {
    console.error('trial_signups upsert error:', error);
    return json(500, { error: 'Não foi possível guardar o registo' });
  }

  // Constrói redirectUrl com email/nome pré-preenchidos + UTMs preservadas
  // para app.branct.com poder continuar a atribuição da campanha.
  const params = new URLSearchParams({
    email,
    nome,
    trial: '1',
  });
  if (row.utm_source)   params.set('utm_source',   row.utm_source);
  if (row.utm_medium)   params.set('utm_medium',   row.utm_medium);
  if (row.utm_campaign) params.set('utm_campaign', row.utm_campaign);
  if (row.utm_content)  params.set('utm_content',  row.utm_content);
  if (row.utm_term)     params.set('utm_term',     row.utm_term);

  const redirectUrl = `https://app.branct.com/signup?${params.toString()}`;

  return json(200, {
    success: true,
    signupId: data?.id,
    redirectUrl,
  });
});
