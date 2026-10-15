import { ChangeEvent, FormEvent, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { paiseToRupeeString, rupeesToPaise } from '@/lib/money';
import { uploadImage } from '@/lib/upload';
import { errText, Field, input, primary } from './shared';

const GSTIN = /^\d{2}[A-Z]{5}\d{4}[A-Z][A-Z\d]Z[A-Z\d]$/;
const days = (v: string) => (v.trim() === '' ? null : /^\d{1,3}$/.test(v.trim()) ? parseInt(v, 10) : NaN);
type S = Record<string, string>;
const blank: S = { name: '', contact_email: '', support_phone: '', logo_url: '', legal_name: '', address: '', gstin: '', biz_email: '', biz_phone: '', announcement: '', flat: '', free: '',
  hmin: '', hmax: '', tmin: '', tmax: '', states: '', p_shipping: '', p_returns: '', p_cancellation: '', p_care: '', p_privacy: '', p_terms: '' };

export default function Settings() {
  const [f, setF] = useState<S>(blank); const [msg, setMsg] = useState(''); const [busy, setBusy] = useState(false);
  useEffect(() => { (async () => {
    const { data } = await supabase.from('store_settings').select('setting_key,setting_value'); const m: Record<string, any> = {};
    for (const r of data ?? []) m[r.setting_key] = r.setting_value;
    const pf = m.store_profile ?? {}, b = m.business ?? {}, sh = m.shipping ?? {}, dl = m.delivery ?? {}, po = m.policies ?? {};
    setF({ name: pf.name ?? '', contact_email: pf.contact_email ?? '', support_phone: pf.support_phone ?? '', logo_url: pf.logo_url ?? '', legal_name: b.legal_name ?? '', address: b.address ?? '', gstin: b.gstin ?? '', biz_email: b.email ?? '', biz_phone: b.phone ?? '',
      announcement: m.announcement?.text ?? '', flat: sh.flat_fee_paise != null ? paiseToRupeeString(sh.flat_fee_paise) : '', free: sh.free_threshold_paise != null ? paiseToRupeeString(sh.free_threshold_paise) : '',
      hmin: dl.handling_days_min != null ? String(dl.handling_days_min) : '', hmax: dl.handling_days_max != null ? String(dl.handling_days_max) : '', tmin: dl.transit_days_min != null ? String(dl.transit_days_min) : '', tmax: dl.transit_days_max != null ? String(dl.transit_days_max) : '',
      states: (dl.serviceable_states ?? []).join(', '), p_shipping: po.shipping ?? '', p_returns: po.returns ?? '', p_cancellation: po.cancellation ?? '', p_care: po.care ?? '', p_privacy: po.privacy ?? '', p_terms: po.terms ?? '' });
  })(); }, []);
  const set = (k: string) => (e: any) => setF({ ...f, [k]: e.target.value });
  async function logo(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return; setMsg('Uploading…');
    const r = await uploadImage('site-assets', file); if ('error' in r) return setMsg(r.error); setF((c) => ({ ...c, logo_url: r.url })); setMsg('Logo uploaded. Save settings to keep it.');
  }
  async function save(e: FormEvent) {
    e.preventDefault(); setMsg('');
    const fl = f.flat.trim() ? rupeesToPaise(f.flat) : 0; const fr = f.free.trim() ? rupeesToPaise(f.free) : null;
    if (fl === null || (f.free.trim() && fr === null)) return setMsg('Shipping amounts must be valid rupee amounts.');
    const [hmin, hmax, tmin, tmax] = [days(f.hmin), days(f.hmax), days(f.tmin), days(f.tmax)];
    if ([hmin, hmax, tmin, tmax].some((x) => Number.isNaN(x))) return setMsg('Delivery days must be whole numbers.');
    if ((tmin !== null && tmax !== null && tmax < tmin) || (hmin !== null && hmax !== null && hmax < hmin)) return setMsg('A maximum cannot be lower than its minimum.');
    if (f.gstin.trim() && !GSTIN.test(f.gstin.trim().toUpperCase())) return setMsg('That GSTIN does not look valid (15 characters). Leave it blank if you do not have one.');
    if (f.contact_email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(f.contact_email)) return setMsg('Enter a valid contact email.');
    const states = f.states.split(',').map((x) => x.trim()).filter(Boolean);
    const rows = [
      { setting_key: 'store_profile', setting_value: { name: f.name.trim(), contact_email: f.contact_email.trim(), support_phone: f.support_phone.trim(), logo_url: f.logo_url, currency: 'INR' } },
      { setting_key: 'business', setting_value: { legal_name: f.legal_name.trim(), address: f.address.trim(), gstin: f.gstin.trim().toUpperCase(), email: f.biz_email.trim(), phone: f.biz_phone.trim() } },
      { setting_key: 'announcement', setting_value: { text: f.announcement.trim() } },
      { setting_key: 'shipping', setting_value: { flat_fee_paise: fl, free_threshold_paise: fr } },
      { setting_key: 'delivery', setting_value: { handling_days_min: hmin, handling_days_max: hmax, transit_days_min: tmin, transit_days_max: tmax, serviceable_states: states } },
      { setting_key: 'policies', setting_value: { shipping: f.p_shipping, returns: f.p_returns, cancellation: f.p_cancellation, care: f.p_care, privacy: f.p_privacy, terms: f.p_terms } }];
    setBusy(true);
    const { error } = await supabase.from('store_settings').upsert(rows, { onConflict: 'setting_key' });
    setBusy(false); setMsg(error ? errText(error) : 'Settings saved.');
  }
  const T = ({ k, label, rows = 3 }: { k: string; label: string; rows?: number }) => <Field label={label}><textarea className={`${input} min-h-[${rows * 24}px]`} value={f[k]} onChange={set(k)} rows={rows} maxLength={4000} /></Field>;
  return (
    <form onSubmit={save} className="max-w-3xl space-y-6" noValidate>
      <fieldset className="grid gap-3 sm:grid-cols-2"><legend className="mb-1 font-serif text-lg text-[#7A1F2B]">Store (public)</legend>
        <Field label="Store name"><input className={input} value={f.name} onChange={set('name')} /></Field>
        <Field label="Contact email"><input className={input} value={f.contact_email} onChange={set('contact_email')} /></Field>
        <Field label="Support phone"><input className={input} value={f.support_phone} onChange={set('support_phone')} /></Field>
        <Field label="Logo (JPG, PNG, WebP)"><input type="file" accept="image/jpeg,image/png,image/webp" onChange={logo} /></Field>
        {f.logo_url && <img src={f.logo_url} alt="Logo preview" className="h-16 w-16 rounded-xl object-cover" />}
        <div className="sm:col-span-2"><Field label="Announcement bar text"><input className={input} value={f.announcement} onChange={set('announcement')} maxLength={140} /></Field></div>
        <p className="text-xs sm:col-span-2">Currency: INR (fixed).</p></fieldset>
      <fieldset className="grid gap-3 sm:grid-cols-2"><legend className="mb-1 font-serif text-lg text-[#7A1F2B]">Business details for invoices (admins only)</legend>
        <Field label="Legal / registered name"><input className={input} value={f.legal_name} onChange={set('legal_name')} /></Field>
        <Field label="GSTIN (optional)"><input className={input} value={f.gstin} onChange={set('gstin')} maxLength={15} /></Field>
        <Field label="Business email"><input className={input} value={f.biz_email} onChange={set('biz_email')} /></Field>
        <Field label="Business phone"><input className={input} value={f.biz_phone} onChange={set('biz_phone')} /></Field>
        <div className="sm:col-span-2"><T k="address" label="Registered address" rows={2} /></div>
        <p className="text-xs sm:col-span-2">Only what you enter here is printed on invoices. Nothing is invented. Invoices do not itemise tax; ask your accountant before relying on them as GST tax invoices.</p></fieldset>
      <fieldset className="grid gap-3 sm:grid-cols-2"><legend className="mb-1 font-serif text-lg text-[#7A1F2B]">Shipping and delivery</legend>
        <Field label="Flat shipping fee (₹, blank = free)"><input className={input} value={f.flat} onChange={set('flat')} inputMode="decimal" /></Field>
        <Field label="Free shipping from subtotal (₹, blank = never)"><input className={input} value={f.free} onChange={set('free')} inputMode="decimal" /></Field>
        <Field label="Handling days (min)"><input className={input} value={f.hmin} onChange={set('hmin')} inputMode="numeric" /></Field>
        <Field label="Handling days (max)"><input className={input} value={f.hmax} onChange={set('hmax')} inputMode="numeric" /></Field>
        <Field label="Transit days (min)"><input className={input} value={f.tmin} onChange={set('tmin')} inputMode="numeric" /></Field>
        <Field label="Transit days (max)"><input className={input} value={f.tmax} onChange={set('tmax')} inputMode="numeric" /></Field>
        <div className="sm:col-span-2"><Field label="Serviceable states (comma separated; blank = all of India)"><input className={input} value={f.states} onChange={set('states')} placeholder="Maharashtra, Karnataka, …" /></Field></div>
        <p className="text-xs sm:col-span-2">Customers see an estimate only if transit days are set (calendar days, labelled as an estimate). Orders to other states are rejected by the server.</p></fieldset>
      <fieldset className="space-y-3"><legend className="mb-1 font-serif text-lg text-[#7A1F2B]">Policy text shown on the site</legend>
        <T k="p_shipping" label="Shipping policy" /><T k="p_returns" label="Return policy" /><T k="p_cancellation" label="Cancellation policy" /><T k="p_care" label="Jewelry care" /><T k="p_privacy" label="Privacy policy" /><T k="p_terms" label="Terms & conditions" /></fieldset>
      <div className="flex items-center gap-3"><button className={primary} disabled={busy}>{busy ? 'Saving…' : 'Save settings'}</button><span role="status" className="text-sm">{msg}</span></div>
    </form>);
}
