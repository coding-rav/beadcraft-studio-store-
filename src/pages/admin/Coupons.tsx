import { FormEvent, useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { inr, rupeesToPaise } from '@/lib/money';
import { cell, errText, Field, input, primary, smallBtn, Table } from './shared';

const blank = { code: '', type: 'percent', value: '', min: '', max: '', starts: '', expires: '', limit: '', perUser: '1' };

export default function Coupons() {
  const [rows, setRows] = useState<any[]>([]); const [f, setF] = useState(blank); const [msg, setMsg] = useState('');
  const [prods, setProds] = useState<any[]>([]); const [cats, setCats] = useState<any[]>([]); const [ep, setEp] = useState<string[]>([]); const [ec, setEc] = useState<string[]>([]);
  useEffect(() => { supabase.from('products').select('id,name').order('name').then(({ data }: any) => setProds(data ?? [])); supabase.from('categories').select('id,name').order('name').then(({ data }: any) => setCats(data ?? [])); }, []);
  const load = useCallback(async () => { const { data } = await supabase.from('coupons').select('*').order('created_at', { ascending: false }); setRows(data ?? []); }, []);
  useEffect(() => { load(); }, [load]);
  const set = (k: keyof typeof blank) => (e: any) => setF({ ...f, [k]: e.target.value });

  async function create(e: FormEvent) {
    e.preventDefault(); setMsg('');
    const code = f.code.trim().toUpperCase();
    if (!/^[A-Z0-9_-]{3,32}$/.test(code)) return setMsg('Code: 3–32 letters, numbers, - or _.');
    let value: number | null;
    if (f.type === 'percent') { value = /^\d{1,3}$/.test(f.value) ? parseInt(f.value, 10) : null; if (value === null || value < 1 || value > 100) return setMsg('Percentage must be 1–100.'); }
    else { value = rupeesToPaise(f.value); if (!value) return setMsg('Enter a valid rupee amount.'); }
    const min = f.min.trim() ? rupeesToPaise(f.min) : 0; if (min === null) return setMsg('Minimum order must be a valid amount.');
    const max = f.max.trim() ? rupeesToPaise(f.max) : null; if (f.max.trim() && !max) return setMsg('Maximum discount must be a valid amount.');
    const limit = f.limit.trim() ? parseInt(f.limit, 10) : null; const perUser = f.perUser.trim() ? parseInt(f.perUser, 10) : null;
    if ((limit !== null && !(limit > 0)) || (perUser !== null && !(perUser > 0))) return setMsg('Limits must be positive whole numbers.');
    const starts = f.starts ? new Date(f.starts).toISOString() : null; const expires = f.expires ? new Date(f.expires).toISOString() : null;
    if (starts && expires && expires <= starts) return setMsg('Expiry must be after the start.');
    const { error } = await supabase.from('coupons').insert({ code, discount_type: f.type, discount_value: value, min_order_paise: min, max_discount_paise: f.type === 'percent' ? max : null, starts_at: starts, expires_at: expires, usage_limit: limit, per_user_limit: perUser, is_active: true, eligible_product_ids: ep, eligible_category_ids: ec });
    if (error) return setMsg(/duplicate|unique/i.test(error.message) ? 'That code already exists.' : errText(error));
    setF(blank); setEp([]); setEc([]); setMsg('Coupon created.'); load();
  }
  async function toggle(c: any) { const { error } = await supabase.from('coupons').update({ is_active: !c.is_active }).eq('id', c.id); setMsg(error ? errText(error) : 'Saved.'); load(); }
  async function del(c: any) {
    if (!window.confirm(`Delete ${c.code}?`)) return;
    const { error } = await supabase.from('coupons').delete().eq('id', c.id);
    setMsg(error ? 'This coupon has been used and cannot be deleted. Deactivate it instead.' : 'Deleted.'); load();
  }
  return (
    <section aria-label="Coupons">
      <form onSubmit={create} className="grid gap-3 rounded-2xl border border-[#ecd9dc] bg-white p-4 sm:grid-cols-3" noValidate>
        <Field label="Code"><input className={input} value={f.code} onChange={set('code')} autoCapitalize="characters" /></Field>
        <Field label="Type"><select className={input} value={f.type} onChange={set('type')}><option value="percent">Percentage</option><option value="fixed">Fixed amount (₹)</option></select></Field>
        <Field label={f.type === 'percent' ? 'Percent off (1–100)' : 'Amount off (₹)'}><input className={input} value={f.value} onChange={set('value')} inputMode="decimal" /></Field>
        <Field label="Minimum order (₹)"><input className={input} value={f.min} onChange={set('min')} inputMode="decimal" /></Field>
        {f.type === 'percent' && <Field label="Maximum discount (₹, optional)"><input className={input} value={f.max} onChange={set('max')} inputMode="decimal" /></Field>}
        <Field label="Starts (optional)"><input type="datetime-local" className={input} value={f.starts} onChange={set('starts')} /></Field>
        <Field label="Expires (optional)"><input type="datetime-local" className={input} value={f.expires} onChange={set('expires')} /></Field>
        <Field label="Total uses (blank = unlimited)"><input className={input} value={f.limit} onChange={set('limit')} inputMode="numeric" /></Field>
        <Field label="Uses per customer"><input className={input} value={f.perUser} onChange={set('perUser')} inputMode="numeric" /></Field>
        <Field label="Only these products (optional; hold Ctrl/Cmd to pick several)"><select multiple className={`${input} min-h-[96px]`} value={ep} onChange={(e) => setEp(Array.from(e.target.selectedOptions as Iterable<HTMLOptionElement>, (o: HTMLOptionElement) => o.value))}>{prods.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>
        <Field label="Only these categories (optional)"><select multiple className={`${input} min-h-[96px]`} value={ec} onChange={(e) => setEc(Array.from(e.target.selectedOptions as Iterable<HTMLOptionElement>, (o: HTMLOptionElement) => o.value))}>{cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
        <p className="text-xs">Leave both empty for the whole cart. With a selection, the discount applies only to matching items.</p>
        <div className="sm:col-span-3"><button className={primary}>Create coupon</button></div>
      </form>
      <p role="status" className="min-h-[24px] text-sm">{msg}</p>
      <Table heads={['Code', 'Discount', 'Applies to', 'Min order', 'Window', 'Used', 'Active', '']}>
        {rows.map((c) => (
          <tr key={c.id}><td className={cell}>{c.code}</td>
            <td className={cell}>{c.discount_type === 'percent' ? `${c.discount_value}%${c.max_discount_paise ? ` (max ${inr(c.max_discount_paise)})` : ''}` : inr(c.discount_value)}</td>
            <td className={cell}>{(c.eligible_product_ids?.length || c.eligible_category_ids?.length) ? `${c.eligible_product_ids.length} product(s), ${c.eligible_category_ids.length} categor${c.eligible_category_ids.length === 1 ? 'y' : 'ies'}` : 'whole cart'}</td>
            <td className={cell}>{inr(c.min_order_paise)}</td>
            <td className={cell}>{c.starts_at ? new Date(c.starts_at).toLocaleDateString('en-IN') : 'now'} → {c.expires_at ? new Date(c.expires_at).toLocaleDateString('en-IN') : 'no expiry'}</td>
            <td className={cell}>{c.times_redeemed}{c.usage_limit ? ` / ${c.usage_limit}` : ''}</td>
            <td className={cell}><input type="checkbox" checked={c.is_active} aria-label={`${c.code} active`} onChange={() => toggle(c)} /></td>
            <td className={cell}><button className={smallBtn} onClick={() => del(c)}>Delete</button></td></tr>))}
      </Table>
    </section>);
}
