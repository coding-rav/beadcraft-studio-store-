import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { inr } from '@/lib/money';
import Products from '@/pages/admin/Products';
import Orders from '@/pages/admin/Orders';
import Refunds from '@/pages/admin/Refunds';
import Coupons from '@/pages/admin/Coupons';
import Settings from '@/pages/admin/Settings';
import { Notifications, Payments } from '@/pages/admin/Operations';
import { Audit, Categories, Newsletter } from '@/pages/admin/Store';

// This gate only decides what to RENDER. Every privileged read/write is enforced again by RLS and is_admin() in the database.
const TABS = ['overview', 'orders', 'products', 'categories', 'coupons', 'refunds', 'payments', 'notifications', 'newsletter', 'settings', 'audit'] as const;
type Tab = typeof TABS[number];

function Overview() {
  const [days, setDays] = useState('30'); const [d, setD] = useState<any>(null); const [err, setErr] = useState('');
  useEffect(() => { (async () => {
    setD(null); setErr('');
    const since = days === 'all' ? null : new Date(Date.now() - parseInt(days, 10) * 86_400_000).toISOString();
    let oq = supabase.from('orders').select('total_paise,payment_status,order_status').limit(5000); if (since) oq = oq.gte('created_at', since);
    let rq = supabase.from('refunds').select('amount_paise,status'); if (since) rq = rq.gte('created_at', since);
    const [o, p, r, ev] = await Promise.all([oq, supabase.from('products').select('is_active,stock_quantity,low_stock_threshold'), rq,
      supabase.from('order_events').select('id,kind,to_status,created_at,orders(order_number)').order('created_at', { ascending: false }).limit(10)]);
    if (o.error || p.error) return setErr('Could not load the dashboard.');
    setD({ orders: o.data ?? [], products: p.data ?? [], refunds: r.data ?? [], events: ev.data ?? [], capped: (o.data ?? []).length >= 5000 });
  })(); }, [days]);
  if (err) return <p role="alert" className="text-red-700">{err}</p>;
  if (!d) return <p>Loading…</p>;
  const O = d.orders as any[]; const P = d.products as any[];
  const revenue = O.filter((o) => o.payment_status === 'paid' && !['cancelled', 'refund_pending', 'refunded'].includes(o.order_status)).reduce((a, o) => a + o.total_paise, 0);
  const n = (f: (o: any) => boolean) => O.filter(f).length;
  const soldOutActive = P.filter((p) => p.is_active && p.stock_quantity <= 0).length;
  const stat = (label: string, v: string | number, note: string) => <div key={label} className="rounded-2xl border border-[#ecd9dc] bg-white p-4"><p className="text-sm opacity-70">{label}</p><p className="text-2xl text-[#7A1F2B]">{v}</p><p className="text-xs opacity-60">{note}</p></div>;
  return (
    <div className="space-y-4">
      <label className="text-sm">Period <select className="ml-2 min-h-[40px] rounded-lg border border-[#ecd9dc] bg-white px-3" value={days} onChange={(e) => setDays(e.target.value)}><option value="7">Last 7 days</option><option value="30">Last 30 days</option><option value="90">Last 90 days</option><option value="all">All time</option></select></label>
      {soldOutActive > 0 && <p role="alert" className="rounded-xl bg-amber-100 p-3 text-sm">{soldOutActive} active product(s) have 0 stock and show as <b>Sold out</b> in the store. Set stock in Products → Adjust stock.</p>}
      {d.capped && <p className="text-xs">Showing the latest 5,000 orders in this period.</p>}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {stat('Revenue', inr(revenue), 'verified paid orders, minus cancelled/refunded')}
        {stat('Orders', O.length, 'placed in the period')}
        {stat('Pending payments', n((o) => o.payment_status === 'pending' && o.order_status === 'pending'), 'not counted as revenue')}
        {stat('Processing', n((o) => ['confirmed', 'processing', 'packed'].includes(o.order_status)), 'paid, not yet shipped')}
        {stat('Shipped', n((o) => ['shipped', 'out_for_delivery'].includes(o.order_status)), 'with the courier')}
        {stat('Delivered', n((o) => o.order_status === 'delivered'), 'completed')}
        {stat('Refunds', `${d.refunds.filter((r: any) => r.status === 'pending').length} pending · ${d.refunds.filter((r: any) => r.status === 'processed').length} done`, `${inr(d.refunds.filter((r: any) => r.status === 'processed').reduce((a: number, r: any) => a + r.amount_paise, 0))} refunded`)}
        {stat('Low stock', P.filter((p) => p.stock_quantity > 0 && p.stock_quantity <= p.low_stock_threshold).length, 'at or below each product’s threshold')}
        {stat('Out of stock', P.filter((p) => p.stock_quantity <= 0).length, '0 units')}
        {stat('Active products', P.filter((p) => p.is_active).length, `of ${P.length}`)}
      </div>
      <section aria-label="Recent activity"><h2 className="mb-2 font-serif text-xl text-[#7A1F2B]">Recent activity</h2>
        <ul className="space-y-1 text-sm">{d.events.map((e: any) => { const o = Array.isArray(e.orders) ? e.orders[0] : e.orders; return <li key={e.id}>{new Date(e.created_at).toLocaleString('en-IN')} · {o?.order_number} · {e.kind}{e.to_status ? ` → ${e.to_status}` : ''}</li>; })}{!d.events.length && <li>No activity yet.</li>}</ul></section>
    </div>);
}

export default function Admin() {
  const { user } = useAuth();
  const [ok, setOk] = useState<boolean | null>(null); const [tab, setTab] = useState<Tab>('overview');
  useEffect(() => { supabase.rpc('is_admin').then(({ data }: any) => setOk(data === true)); }, [user?.id]);
  if (ok === null) return <p className="p-10 text-center">Checking access…</p>;
  if (!ok) return <main className="p-14 text-center"><h1 className="text-2xl text-[#7A1F2B]">Access denied</h1><p className="mt-2">This area is for store administrators.</p><Link to="/" className="mt-4 inline-block underline">Back to the store</Link></main>;
  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <h1 className="text-3xl text-[#7A1F2B]">Admin</h1>
      <div role="tablist" aria-label="Admin sections" className="mt-4 flex flex-wrap gap-2">
        {TABS.map((t) => <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)} className={`min-h-[44px] rounded-full px-4 capitalize ${tab === t ? 'bg-[#7A1F2B] text-white' : 'border border-[#7A1F2B] text-[#7A1F2B]'}`}>{t}</button>)}
      </div>
      <div className="mt-5" role="tabpanel">
        {tab === 'overview' && <Overview />}{tab === 'orders' && <Orders />}{tab === 'products' && <Products />}{tab === 'categories' && <Categories />}
        {tab === 'coupons' && <Coupons />}{tab === 'refunds' && <Refunds />}{tab === 'payments' && <Payments />}{tab === 'notifications' && <Notifications />}
        {tab === 'newsletter' && <Newsletter />}{tab === 'settings' && <Settings />}{tab === 'audit' && <Audit />}
      </div>
    </main>);
}
