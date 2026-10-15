import { createClient } from 'npm:@supabase/supabase-js@2';

export { hmacHex, safeEqual, checkoutSignature } from './crypto.ts';
export const cors = {
  'Access-Control-Allow-Origin': '*', // tighten to your site origin in production
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
export const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } });

export async function rzp(path: string, init: RequestInit = {}) {
  const auth = 'Basic ' + btoa(`${Deno.env.get('RAZORPAY_KEY_ID')}:${Deno.env.get('RAZORPAY_KEY_SECRET')}`);
  const r = await fetch('https://api.razorpay.com/v1' + path, {
    ...init, headers: { Authorization: auth, 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(10000),
  });
  return { ok: r.ok, status: r.status, body: await r.json().catch(() => ({})) };
}
export const admin = () =>
  createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
export async function authedUser(req: Request) {
  const c = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } });
  const { data } = await c.auth.getUser();
  return data.user;
}

/** Supabase client acting AS the signed-in caller (RLS applies). Use for authorization checks. */
export function userClient(req: Request) {
  return createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } });
}
export async function requireAdmin(req: Request): Promise<boolean> {
  const { data } = await userClient(req).rpc('is_admin');
  return data === true;
}
