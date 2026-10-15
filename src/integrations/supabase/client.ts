import { createClient } from '@supabase/supabase-js';

const url = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim();
const key = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim();

/** Human-readable reason the backend is not usable, or '' when configuration looks valid. */
export function configProblem(): string {
  if (!url) return 'VITE_SUPABASE_URL is not set.';
  if (!key) return 'VITE_SUPABASE_ANON_KEY is not set.';
  if (url.includes('YOUR_PROJECT_REF') || key.includes('YOUR_SUPABASE')) return 'The Supabase variables still contain the .env.example placeholders.';
  if (!/^https:\/\/[a-z0-9-]+\.supabase\.(co|in)$/i.test(url) && !/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(url)) return 'VITE_SUPABASE_URL does not look like a Supabase project URL (https://<ref>.supabase.co).';
  if (/service_role/i.test(key) || key.length < 20) return 'VITE_SUPABASE_ANON_KEY must be the public anon/publishable key, never a service-role key.';
  return '';
}
export const supabaseConfigured = configProblem() === '';

// Placeholders keep the app from crashing when unconfigured; no request is made in that mode.
export const supabase = createClient(
  supabaseConfigured ? (url as string) : 'http://localhost:54321',
  supabaseConfigured ? (key as string) : 'not-configured',
  { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } },
);
