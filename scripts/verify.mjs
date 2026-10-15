// Lightweight regression guard: `npm run verify`. Fails (exit 1) on structural problems that have broken deploys.
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const errors = [];
const need = (cond, msg) => { if (!cond) errors.push(msg); };
const walk = (d) => readdirSync(d).flatMap((f) => { const p = join(d, f); return statSync(p).isDirectory() ? walk(p) : [p]; });

for (const f of ['package.json', 'vercel.json', 'index.html', 'tsconfig.json', '.env.example', '.nvmrc', 'supabase/config.toml'])
  need(existsSync(f), `missing ${f}`);

const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
need(pkg.scripts?.build?.includes('vite build'), 'build script must run vite build');
need(!/\|\|\s*true/.test(JSON.stringify(pkg.scripts)), 'scripts must not swallow errors with "|| true"');
need(pkg.engines?.node, 'pin engines.node');
JSON.parse(readFileSync('vercel.json', 'utf8'));                       // throws if invalid JSON
need(!existsSync('yarn.lock') && !existsSync('pnpm-lock.yaml') && !existsSync('bun.lockb'), 'use one lockfile (npm): remove yarn/pnpm/bun lockfiles');
need(!existsSync('.npmrc') || !/cache-dir/.test(readFileSync('.npmrc', 'utf8')), '.npmrc must not set cache-dir');

const env = readFileSync('.env.example', 'utf8');
for (const k of ['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY', 'VITE_SITE_URL']) need(env.includes(k), `.env.example missing ${k}`);
need(!/eyJ[A-Za-z0-9_-]{20,}|rzp_(live|test)_[A-Za-z0-9]{8,}|sb_secret_/.test(env), '.env.example contains something that looks like a real secret');

for (const f of walk('src').filter((x) => /\.(ts|tsx)$/.test(x))) {
  const s = readFileSync(f, 'utf8');
  // Flag USE of server-only secrets in browser code (env reads, secret-looking values), not mere mentions in help text.
  need(!/Deno\.env|process\.env|import\.meta\.env\.(?!VITE_SUPABASE_URL|VITE_SUPABASE_ANON_KEY|VITE_SITE_URL|DEV|PROD|MODE|BASE_URL)/.test(s), `${f}: reads an environment variable other than the three public VITE_ ones`);
  need(!/rzp_(live|test)_[A-Za-z0-9]{8,}|sb_secret_[A-Za-z0-9]+|eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/.test(s), `${f}: contains something that looks like a real key`);
}
const migs = readdirSync('supabase/migrations').filter((f) => f.endsWith('.sql')).sort();
need(migs.length > 0, 'no migrations');
need(new Set(migs.map((m) => m.slice(0, 14))).size === migs.length, 'duplicate migration timestamps');

if (errors.length) { console.error('verify FAILED:\n - ' + errors.join('\n - ')); process.exit(1); }
console.log(`verify ok (${migs.length} migrations)`);
