import { FormEvent, useState } from 'react';
import { supabase, supabaseConfigured } from '@/integrations/supabase/client';
import { isEmail } from '@/lib/ui';

export default function Newsletter() {
  const [email, setEmail] = useState(''); const [msg, setMsg] = useState(''); const [ok, setOk] = useState(false); const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault(); setOk(false);
    if (!isEmail(email)) return setMsg('That email address doesn’t look right. Check it and try again.');
    if (!supabaseConfigured) return setMsg('Sign-ups are not connected yet, so nothing was saved.');
    setBusy(true);
    const { error } = await supabase.from('newsletter_subscribers').insert({ email: email.trim().toLowerCase(), is_subscribed: true });
    setBusy(false);
    if (!error) { setOk(true); setMsg('You’re on the list. Thank you!'); setEmail(''); }
    else if ((error as any).code === '23505') { setOk(true); setMsg('That email is already subscribed.'); }
    else setMsg('Could not subscribe right now. Please try again.');
  }
  return (
    <section className="mx-auto max-w-2xl px-4 py-14 text-center">
      <h2 className="text-3xl text-[#7A1F2B]">Let’s stay in the loop.</h2>
      <p className="mt-2">New little favorites, fresh collections, and studio notes.</p>
      <form onSubmit={submit} noValidate className="mt-5 flex flex-col gap-3 sm:flex-row sm:justify-center">
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email address" aria-label="Email address" autoComplete="email"
          className="min-h-[44px] w-full rounded-full border border-[#ecd9dc] bg-white px-5 sm:max-w-sm" />
        <button disabled={busy} className="min-h-[44px] rounded-full bg-[#7A1F2B] px-6 font-semibold text-[#FFFAF6] disabled:opacity-60">{busy ? 'Subscribing…' : 'Subscribe'}</button>
      </form>
      <p role="status" className={`mt-3 min-h-[24px] text-sm ${ok ? 'text-green-800' : 'text-red-700'}`}>{msg}</p>
      <p className="text-xs opacity-70">By subscribing, you agree to receive emails from Beadcraft Studio.</p>
    </section>
  );
}
