import { ChangeEvent, FormEvent, useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { paiseToRupeeString, rupeesToPaise } from '@/lib/money';
import { uploadImage } from '@/lib/upload';
import { cell, errText, Field, input, primary, smallBtn, Table } from './shared';

export function Categories() {
  const [rows, setRows] = useState<any[]>([]); const [msg, setMsg] = useState('');
  const [f, setF] = useState({ name: '', slug: '', description: '', sort_order: '0', image_url: '' });
  const load = useCallback(async () => { const { data } = await supabase.from('categories').select('*').order('sort_order'); setRows(data ?? []); }, []);
  useEffect(() => { load(); }, [load]);
  async function pick(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return; setMsg('Uploading…');
    const r = await uploadImage('category-images', file); if ('error' in r) return setMsg(r.error);
    setF((c) => ({ ...c, image_url: r.url })); setMsg('Image uploaded.');
  }
  async function add(e: FormEvent) {
    e.preventDefault();
    if (!f.name.trim() || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(f.slug)) return setMsg('Enter a name and a slug (lowercase, hyphens).');
    const { error } = await supabase.from('categories').insert({ name: f.name.trim(), slug: f.slug, description: f.description || null, sort_order: parseInt(f.sort_order, 10) || 0, image_url: f.image_url || null });
    setMsg(error ? errText(error) : 'Category added.'); if (!error) setF({ name: '', slug: '', description: '', sort_order: '0', image_url: '' }); load();
  }
  async function patch(id: string, p: object) { const { error } = await supabase.from('categories').update(p).eq('id', id); setMsg(error ? errText(error) : 'Saved.'); load(); }
  return (
    <section aria-label="Categories">
      <form onSubmit={add} className="grid gap-3 rounded-2xl border border-[#ecd9dc] bg-white p-4 sm:grid-cols-2" noValidate>
        <Field label="Name"><input className={input} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value, slug: e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') })} /></Field>
        <Field label="Slug"><input className={input} value={f.slug} onChange={(e) => setF({ ...f, slug: e.target.value })} /></Field>
        <Field label="Description"><input className={input} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
        <Field label="Sort order"><input className={input} inputMode="numeric" value={f.sort_order} onChange={(e) => setF({ ...f, sort_order: e.target.value })} /></Field>
        <Field label="Image (JPG, PNG, WebP; 5 MB max)"><input type="file" accept="image/jpeg,image/png,image/webp" onChange={pick} /></Field>
        <div className="flex items-end"><button className={primary}>Add category</button></div>
      </form>
      <p role="status" className="min-h-[24px] text-sm">{msg}</p>
      <Table heads={['Name', 'Slug', 'Sort', 'Active']}>
        {rows.map((c) => (<tr key={c.id}><td className={cell}>{c.name}</td><td className={cell}>{c.slug}</td>
          <td className={cell}><input className="min-h-[36px] w-16 rounded border border-[#ecd9dc] px-2" defaultValue={c.sort_order} aria-label={`Sort order for ${c.name}`} inputMode="numeric" onBlur={(e) => { const n = parseInt(e.target.value, 10); if (Number.isInteger(n) && n !== c.sort_order) patch(c.id, { sort_order: n }); }} /></td>
          <td className={cell}><input type="checkbox" checked={c.is_active} aria-label={`${c.name} active`} onChange={(e) => patch(c.id, { is_active: e.target.checked })} /></td></tr>))}
      </Table>
    </section>);
}

export function Newsletter() {
  const [rows, setRows] = useState<any[]>([]); const [q, setQ] = useState(''); const [msg, setMsg] = useState('');
  const load = useCallback(async () => { const { data } = await supabase.from('newsletter_subscribers').select('*').order('created_at', { ascending: false }).limit(1000); setRows(data ?? []); }, []);
  useEffect(() => { load(); }, [load]);
  async function toggle(r: any) { const { error } = await supabase.from('newsletter_subscribers').update({ is_subscribed: !r.is_subscribed }).eq('id', r.id); setMsg(error ? errText(error) : 'Saved.'); load(); }
  function exportCsv() {
    if (!window.confirm('Export subscriber emails? This file contains personal data; store it securely.')) return;
    const csv = 'email,subscribed,consented_at\n' + rows.filter((r) => r.is_subscribed).map((r) => `"${r.email.replace(/"/g, '""')}",true,${r.consented_at}`).join('\n');
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); a.download = 'subscribers.csv'; a.click(); URL.revokeObjectURL(a.href);
  }
  const shown = rows.filter((r) => !q || r.email.toLowerCase().includes(q.toLowerCase()));
  return (
    <section aria-label="Newsletter">
      <div className="flex flex-wrap items-center gap-3"><input className={`${input} max-w-xs`} placeholder="Search email" aria-label="Search subscribers" value={q} onChange={(e) => setQ(e.target.value)} /><button className={smallBtn} onClick={exportCsv}>Export CSV</button><span className="text-sm">{rows.filter((r) => r.is_subscribed).length} subscribed</span></div>
      <p role="status" className="min-h-[24px] text-sm">{msg}</p>
      <Table heads={['Email', 'Joined', 'Subscribed']}>{shown.map((r) => <tr key={r.id}><td className={cell}>{r.email}</td><td className={cell}>{new Date(r.consented_at).toLocaleDateString('en-IN')}</td><td className={cell}><input type="checkbox" checked={r.is_subscribed} aria-label={`${r.email} subscribed`} onChange={() => toggle(r)} /></td></tr>)}</Table>
    </section>);
}

export function Audit() {
  const [rows, setRows] = useState<any[]>([]);
  useEffect(() => { supabase.from('audit_logs').select('id,created_at,actor,table_name,op,row_id').order('created_at', { ascending: false }).limit(100).then(({ data }: any) => setRows(data ?? [])); }, []);
  return (
    <section aria-label="Audit log"><p className="mb-2 text-sm">The latest 100 changes made by administrators.</p>
      <Table heads={['When', 'Admin', 'Table', 'Action', 'Row']}>{rows.map((r) => <tr key={r.id}><td className={cell}>{new Date(r.created_at).toLocaleString('en-IN')}</td><td className={cell}>{String(r.actor).slice(0, 8)}</td><td className={cell}>{r.table_name}</td><td className={cell}>{r.op}</td><td className={cell}>{String(r.row_id).slice(0, 8)}</td></tr>)}</Table>
    </section>);
}
