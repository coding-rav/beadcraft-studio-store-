import { ChangeEvent, FormEvent, useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { inr, paiseToRupeeString, rupeesToPaise } from '@/lib/money';
import { uploadImage, validateImage } from '@/lib/upload';
import { cell, errText, Field, input, primary, smallBtn, Table } from './shared';
import Gallery from './Gallery';

type Form = { id?: string; name: string; slug: string; category_id: string; short_description: string; description: string; price: string; compare: string; sku: string; badge: string; image_url: string; is_featured: boolean; is_active: boolean; stock: string; low: string; tags: string; weight: string; seo_title: string; seo_description: string; cost: string };
const blank: Form = { name: '', slug: '', category_id: '', short_description: '', description: '', price: '', compare: '', sku: '', badge: '', image_url: '', is_featured: false, is_active: true, stock: '0', low: '5', tags: '', weight: '', seo_title: '', seo_description: '', cost: '' };
const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);

export default function Products() {
  const [rows, setRows] = useState<any[]>([]); const [cats, setCats] = useState<any[]>([]);
  const [form, setForm] = useState<Form | null>(null); const [msg, setMsg] = useState(''); const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    const [p, c] = await Promise.all([supabase.from('products').select('*').order('name'), supabase.from('categories').select('id,name').order('sort_order')]);
    setRows(p.data ?? []); setCats(c.data ?? []);
  }, []);
  useEffect(() => { load(); }, [load]);

  const edit = (p: any) => { setForm({ id: p.id, name: p.name, slug: p.slug, category_id: p.category_id ?? '', short_description: p.short_description ?? '', description: p.description ?? '', price: paiseToRupeeString(p.price_paise), compare: p.compare_at_price_paise ? paiseToRupeeString(p.compare_at_price_paise) : '', sku: p.sku ?? '', badge: p.badge ?? '', image_url: p.image_url ?? '', is_featured: p.is_featured, is_active: p.is_active, stock: '0', low: String(p.low_stock_threshold ?? 5), tags: (p.tags ?? []).join(', '), weight: p.weight_grams ? String(p.weight_grams) : '', seo_title: p.seo_title ?? '', seo_description: p.seo_description ?? '', cost: '' });
    supabase.from('product_costs').select('cost_paise').eq('product_id', p.id).maybeSingle().then(({ data }: any) => { if (data) setForm((c) => c && { ...c, cost: paiseToRupeeString(data.cost_paise) }); }); };
  const set = (k: keyof Form) => (e: any) => setForm({ ...form!, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });

  async function pickImage(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]; if (!f) return;
    const bad = validateImage(f); if (bad) return setMsg(bad);
    setBusy(true); setMsg('Uploading…');
    const r = await uploadImage('product-images', f); setBusy(false);
    if ('error' in r) return setMsg(r.error);
    setForm((cur) => cur && { ...cur, image_url: r.url }); setMsg('Image uploaded. Save the product to keep it.');
  }
  async function save(e: FormEvent) {
    e.preventDefault(); if (!form) return; setMsg('');
    const price = rupeesToPaise(form.price); const compare = form.compare.trim() ? rupeesToPaise(form.compare) : null;
    if (!form.name.trim()) return setMsg('Enter a name.');
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(form.slug)) return setMsg('Slug: lowercase letters, numbers and hyphens only.');
    if (price === null) return setMsg('Enter a valid price in rupees, e.g. 99 or 99.50.');
    if (form.compare.trim() && (compare === null || compare < price)) return setMsg('Original price must be a valid amount at least equal to the sale price.');
    const low = parseInt(form.low, 10); if (!Number.isInteger(low) || low < 0) return setMsg('Low-stock threshold must be 0 or more.');
    const weight = form.weight.trim() ? parseInt(form.weight, 10) : null; if (form.weight.trim() && (!Number.isInteger(weight) || (weight as number) < 0)) return setMsg('Weight must be a whole number of grams.');
    const cost = form.cost.trim() ? rupeesToPaise(form.cost) : null; if (form.cost.trim() && cost === null) return setMsg('Cost price must be a valid rupee amount.');
    if (form.seo_title.length > 70 || form.seo_description.length > 200) return setMsg('SEO title max 70 characters, description max 200.');
    const stock = parseInt(form.stock, 10);
    if (!form.id && (!Number.isInteger(stock) || stock < 0)) return setMsg('Initial stock must be 0 or more.');
    const body = { name: form.name.trim(), slug: form.slug, category_id: form.category_id || null, short_description: form.short_description.trim() || null, description: form.description.trim() || null,
      price_paise: price, compare_at_price_paise: compare, sku: form.sku.trim() || null, badge: form.badge.trim() || null, image_url: form.image_url || null, is_featured: form.is_featured, is_active: form.is_active,
      low_stock_threshold: low, tags: form.tags.split(',').map((t) => t.trim().toLowerCase()).filter(Boolean).slice(0, 20), weight_grams: weight, seo_title: form.seo_title.trim() || null, seo_description: form.seo_description.trim() || null };
    setBusy(true);
    if (form.id) {
      const { error } = await supabase.from('products').update(body).eq('id', form.id);
      if (error) { setBusy(false); return setMsg(errText(error)); }
      if (cost !== null) await supabase.from('product_costs').upsert({ product_id: form.id, cost_paise: cost }, { onConflict: 'product_id' });
      else await supabase.from('product_costs').delete().eq('product_id', form.id);
      setBusy(false);
    } else {
      const { data, error } = await supabase.from('products').insert(body).select('id').single();
      if (error) { setBusy(false); return setMsg(errText(error)); }
      if (cost !== null) await supabase.from('product_costs').upsert({ product_id: data.id, cost_paise: cost }, { onConflict: 'product_id' });
      if (stock > 0) { const r = await supabase.rpc('admin_adjust_stock', { p_product: data.id, p_delta: stock, p_type: 'restock', p_note: 'initial stock' }); if (r.error) setMsg(errText(r.error)); }
      setBusy(false);
    }
    setForm(null); setMsg('Saved.'); load();
  }
  async function adjust(id: string, delta: number) {
    const { error } = await supabase.rpc('admin_adjust_stock', { p_product: id, p_delta: delta, p_type: delta > 0 ? 'restock' : 'adjustment', p_note: 'admin dashboard' });
    setMsg(error ? errText(error) : 'Stock updated.'); load();
  }
  async function toggle(id: string, patch: object) { const { error } = await supabase.from('products').update(patch).eq('id', id); setMsg(error ? errText(error) : 'Saved.'); load(); }
  async function duplicate(p: any) {
    const { data, error } = await supabase.from('products').insert({ name: `${p.name} (copy)`, slug: `${p.slug}-copy-${Math.random().toString(36).slice(2, 6)}`.slice(0, 90), category_id: p.category_id, short_description: p.short_description, description: p.description,
      price_paise: p.price_paise, compare_at_price_paise: p.compare_at_price_paise, sku: null, image_url: p.image_url, badge: p.badge, is_featured: false, is_active: false,
      low_stock_threshold: p.low_stock_threshold, tags: p.tags, weight_grams: p.weight_grams, seo_title: p.seo_title, seo_description: p.seo_description }).select('*').single();
    if (error) return setMsg(errText(error)); setMsg('Duplicated as an inactive draft with 0 stock.'); await load(); edit(data);
  }
  async function del(p: any) {
    if (!window.confirm(`Delete "${p.name}" permanently? Past orders keep their own copy of the name and price. Archiving (inactive) is safer.`)) return;
    const { error } = await supabase.from('products').delete().eq('id', p.id); setMsg(error ? errText(error) : 'Deleted.'); load();
  }

  return (
    <section aria-label="Products">
      <p role="status" className="min-h-[24px] text-sm">{msg}</p>
      {!form && <button className={primary} onClick={() => setForm({ ...blank })}>Add product</button>}
      {form && (
        <form onSubmit={save} className="mt-3 grid gap-3 rounded-2xl border border-[#ecd9dc] bg-white p-4 sm:grid-cols-2" noValidate>
          <Field label="Name"><input className={input} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value, slug: form.id ? form.slug : slugify(e.target.value) })} /></Field>
          <Field label="Slug (URL)"><input className={input} value={form.slug} onChange={set('slug')} /></Field>
          <Field label="Sale price (₹)"><input className={input} inputMode="decimal" value={form.price} onChange={set('price')} /></Field>
          <Field label="Original price (₹, optional)"><input className={input} inputMode="decimal" value={form.compare} onChange={set('compare')} /></Field>
          <Field label="Category"><select className={input} value={form.category_id} onChange={set('category_id')}><option value="">None</option>{cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
          <Field label="SKU (optional)"><input className={input} value={form.sku} onChange={set('sku')} /></Field>
          <Field label="Badge (optional)"><input className={input} value={form.badge} onChange={set('badge')} /></Field>
          {!form.id && <Field label="Initial stock"><input className={input} inputMode="numeric" value={form.stock} onChange={set('stock')} /></Field>}
          <Field label="Cost price (₹, admins only)"><input className={input} inputMode="decimal" value={form.cost} onChange={set('cost')} /></Field>
          <Field label="Low-stock threshold"><input className={input} inputMode="numeric" value={form.low} onChange={set('low')} /></Field>
          <Field label="Weight (grams, optional)"><input className={input} inputMode="numeric" value={form.weight} onChange={set('weight')} /></Field>
          <Field label="Tags (comma separated)"><input className={input} value={form.tags} onChange={set('tags')} /></Field>
          <Field label="SEO title (max 70)"><input className={input} value={form.seo_title} onChange={set('seo_title')} maxLength={70} /></Field>
          <Field label="SEO description (max 200)"><input className={input} value={form.seo_description} onChange={set('seo_description')} maxLength={200} /></Field>
          <div className="sm:col-span-2"><Field label="Short description"><input className={input} value={form.short_description} onChange={set('short_description')} /></Field></div>
          <div className="sm:col-span-2"><Field label="Description"><textarea className={`${input} min-h-[80px]`} value={form.description} onChange={set('description')} /></Field></div>
          <div className="flex items-center gap-3 sm:col-span-2">
            {form.image_url && <img src={form.image_url} alt="Preview" className="h-20 w-20 rounded-xl object-cover" />}
            <Field label="Main image (JPG, PNG or WebP, up to 5 MB)"><input type="file" accept="image/jpeg,image/png,image/webp" onChange={pickImage} disabled={busy} /></Field>
          </div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.is_featured} onChange={set('is_featured')} /> Featured</label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.is_active} onChange={set('is_active')} /> Active (visible in the store)</label>
          {form.id && <div className="sm:col-span-2"><Gallery productId={form.id} onMsg={setMsg} /></div>}
          {form.id && <p className="text-xs sm:col-span-2">Change stock from the table below (every change is recorded).</p>}
          <div className="flex gap-3 sm:col-span-2"><button className={primary} disabled={busy}>{busy ? 'Working…' : 'Save product'}</button><button type="button" className="underline" onClick={() => setForm(null)}>Cancel</button></div>
        </form>)}
      <div className="mt-4"><Table heads={['Product', 'Price', 'Stock', 'Adjust', 'Active', 'Featured', '']}>
        {rows.map((p) => <Row key={p.id} p={p} onEdit={() => edit(p)} onAdjust={adjust} onToggle={toggle} onDelete={() => del(p)} onDuplicate={() => duplicate(p)} />)}
      </Table></div>
    </section>
  );
}

function Row({ p, onEdit, onAdjust, onToggle, onDelete, onDuplicate }: any) {
  const [d, setD] = useState(''); const n = parseInt(d, 10);
  return (
    <tr>
      <td className={cell}>{p.name}<br /><small className="opacity-60">{p.slug}</small></td><td className={cell}>{inr(p.price_paise)}</td><td className={cell}>{p.stock_quantity}{p.stock_quantity <= 0 ? <small className="block text-red-700">sold out</small> : p.stock_quantity <= p.low_stock_threshold ? <small className="block text-amber-700">low</small> : null}</td>
      <td className={cell}><input value={d} onChange={(e) => setD(e.target.value)} inputMode="numeric" placeholder="+10 / -2" aria-label={`Stock change for ${p.name}`} className="min-h-[36px] w-20 rounded border border-[#ecd9dc] px-2" />{' '}
        <button className={smallBtn} disabled={!Number.isInteger(n) || n === 0} onClick={async () => { await onAdjust(p.id, n); setD(''); }}>Apply</button></td>
      <td className={cell}><input type="checkbox" checked={p.is_active} aria-label={`${p.name} active`} onChange={(e) => onToggle(p.id, { is_active: e.target.checked })} /></td>
      <td className={cell}><input type="checkbox" checked={p.is_featured} aria-label={`${p.name} featured`} onChange={(e) => onToggle(p.id, { is_featured: e.target.checked })} /></td>
      <td className={cell}><button className={smallBtn} onClick={onEdit}>Edit</button> <button className={smallBtn} onClick={onDuplicate}>Duplicate</button> <button className={smallBtn} onClick={onDelete}>Delete</button></td>
    </tr>);
}
