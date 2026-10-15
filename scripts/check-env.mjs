// `npm run check:env` — checks that required variable NAMES are set, without ever printing their values.
// Reads process.env and, if present, .env.local / .env (names only). Exit code 1 if a required one is missing.
import { existsSync, readFileSync } from 'node:fs';

const fromFile = (f) => existsSync(f) ? Object.fromEntries(readFileSync(f, 'utf8').split(/\r?\n/).map((l) => /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(l)).filter(Boolean).map((m) => [m[1], m[2].replace(/^["']|["']$/g, '')])) : {};
const env = { ...fromFile('.env'), ...fromFile('.env.local'), ...process.env };
const problems = [];
const isSet = (k) => Boolean(env[k] && String(env[k]).trim());

console.log('Browser build variables (Vercel + .env.local):');
for (const k of ['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY', 'VITE_SITE_URL']) {
  const ok = isSet(k) && !/YOUR_|PLACEHOLDER/i.test(env[k]);
  console.log(`  ${ok ? 'ok     ' : 'MISSING'} ${k}`); if (!ok) problems.push(k);
}
if (isSet('VITE_SUPABASE_URL') && !/^https:\/\/[a-z0-9-]+\.supabase\.(co|in)$/i.test(env.VITE_SUPABASE_URL)) { console.log('  WARN    VITE_SUPABASE_URL does not look like https://<ref>.supabase.co'); problems.push('VITE_SUPABASE_URL format'); }
if (isSet('VITE_SITE_URL') && !/^https:\/\//.test(env.VITE_SITE_URL)) console.log('  note    VITE_SITE_URL is not https (fine for local development; the sitemap needs https)');
for (const k of Object.keys(env)) if (/^VITE_.*(SECRET|SERVICE_ROLE|PRIVATE|PASSWORD)/i.test(k)) { console.log(`  DANGER  ${k} must not be a VITE_ variable (it would be public)`); problems.push(k); }

console.log('\nServer-side secrets live in Supabase, not here. Names to set with `supabase secrets set NAME=...`:');
for (const [k, note] of [['RAZORPAY_KEY_ID', 'required'], ['RAZORPAY_KEY_SECRET', 'required'], ['RAZORPAY_WEBHOOK_SECRET', 'required'], ['RESEND_API_KEY', 'optional, email'], ['EMAIL_FROM', 'optional, email'], ['SITE_URL', 'optional, email links']])
  console.log(`  ${isSet(k) ? 'found locally (should not be here!)' : 'to set in Supabase'}  ${k} (${note})`);
if (['RAZORPAY_KEY_SECRET', 'RAZORPAY_WEBHOOK_SECRET'].some(isSet)) { console.log('\nWARNING: a Razorpay secret is present in this shell/.env file. Keep it out of the repo.'); }

if (problems.length) { console.error('\ncheck:env FAILED for: ' + problems.join(', ')); process.exit(1); }
console.log('\ncheck:env ok');
