import { admin, authedUser, cors, json, requireAdmin } from '../_shared/razorpay.ts';
import { emailConfigured, processQueue } from '../_shared/notifyQueue.ts';

// Admin-only "send queued emails now / retry failed". Not configured => nothing is sent and the response says so.
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  try {
    const user = await authedUser(req);
    if (!user) return json({ error: 'Please sign in.' }, 401);
    if (!(await requireAdmin(req))) return json({ error: 'Not allowed.' }, 403);
    if (!emailConfigured()) return json({ configured: false, message: 'Email is not configured. Set RESEND_API_KEY, EMAIL_FROM and SITE_URL as Supabase function secrets.' });
    return json(await processQueue(admin(), { limit: 25 }));
  } catch (e) { console.error('process-notifications', (e as Error).message); return json({ error: 'Something went wrong.' }, 500); }
});
