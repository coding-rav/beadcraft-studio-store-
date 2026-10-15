# Validation report (commands actually executed in the build sandbox)

```
$ node scripts/verify.mjs
verify ok (10 migrations)
exit code: 0

$ node scripts/check-env.mjs   (no variables set: expected to fail, prints names only)
  MISSING VITE_SUPABASE_URL
  MISSING VITE_SUPABASE_ANON_KEY
  MISSING VITE_SITE_URL
check:env FAILED for: VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, VITE_SITE_URL
exit code: 1 (1 is the expected result here)

$ tsx --test tests/*.test.ts
# tests 65
# pass 65
# fail 0
# cancelled 0
# skipped 0
exit code: 0

$ tsc -p <stub-config>   (type-check of src/ against hand-written library stubs; NOT the real build)
../proj/beadcraft-studio/src/main.tsx(11,8): error TS2882: Cannot find module or type declarations for side-effect import of './index.css'.
(only expected error: index.css side-effect import, resolved by the real vite/client types)

$ independent PDF check (pypdf, outside the repo): 2-item invoice -> 1 page; 70-item invoice -> 4 pages; invoice number, totals and "Page n of N" footers extracted correctly
```

## Not run (no network / Docker / Postgres / accounts)
- npm ci, real npm run typecheck, npm run build (need the npm registry)
- SQL migrations on Postgres (so every SQL function, trigger and policy is unexecuted); RLS with real users; concurrency/stock-race tests; supabase db push
- Edge Function deploy/execution; any Razorpay test or live payment, refund or webhook; Resend emails; signed-URL download
- Browser/E2E tests, SPA refresh on Vercel, responsive checks of this React build, real-React type-check
- Skipped tests: none. The items above were simply not runnable here.
