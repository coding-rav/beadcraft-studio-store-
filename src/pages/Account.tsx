import { FormEvent, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { btn, field, inr, isMobile, isPin } from '@/lib/ui';
import { canCustomerCancel, canGenerateInvoice, canRequestRefund, customerLabel } from '@/lib/orderStatus';
import { estimateDelivery, formatRange } from '../../supabase/functions/_shared/delivery';

const statusLabel = customerLabel;

export default function Account() {
  const { user, signOut } = useAuth(); const nav = useNavigate();
  const [prof, setProf] = useState({ full_name: '', phone: '' }); const [msg, setMsg] = useState('');
  const [orders, setOrders] = useState<any[] | null>(null);

  useEffect(() => { (async () => {
    // RLS limits both queries to the signed-in customer; no client-side filter is relied on.
    const { data: p } = await supabase.from('profiles').select('full_name,phone').eq('id', user!.id).maybeSingle();
    if (p) setProf({ full_name: p.full_name ?? '', phone: p.phone ?? '' });
    const { data: o } = await supabase.from('orders')
      .select('id,order_number,created_at,total_paise,order_status,payment_status').order('created_at', { ascending: false });
    setOrders(o ?? []);
  })(); }, [user?.id]);

  async function save(e: FormEvent) {
    e.preventDefault(); setMsg('');
    if (prof.full_name.trim().length < 2) return setMsg('Enter your name.');
    if (prof.phone && !isMobile(prof.phone)) return setMsg('Enter a valid 10-digit mobile number.');
    const { error } = await supabase.from('profiles').update({ full_name: prof.full_name.trim(), phone: prof.phone || null }).eq('id', user!.id);
    setMsg(error ? 'Could not save. Please try again.' : 'Saved.');
  }
  return (
    <main className="mx-auto max-w-3xl space-y-10 px-4 py-10">
      <header className="flex items-center justify-between gap-4">
        <div><h1 className="font-serif text-3xl text-[#7A1F2B]">My account</h1><p className="break-all text-sm">{user?.email}</p></div>
        <button className="min-h-[44px] underline" onClick={async () => { await signOut(); nav('/', { replace: true }); }}>Sign out</button>
      </header>
      <section aria-label="Profile">
        <h2 className="mb-3 font-serif text-xl text-[#7A1F2B]">Profile</h2>
        <form onSubmit={save} className="grid gap-3 sm:grid-cols-2" noValidate>
          <input className={field} aria-label="Full name" placeholder="Full name" value={prof.full_name} onChange={(e) => setProf({ ...prof, full_name: e.target.value })} />
          <input className={field} aria-label="Mobile" inputMode="numeric" maxLength={10} placeholder="Mobile (10 digits)" value={prof.phone} onChange={(e) => setProf({ ...prof, phone: e.target.value })} />
          <button className={btn}>Save profile</button><p role="status" className="self-center text-sm">{msg}</p>
        </form>
      </section>
      <AddressBook />
      <section aria-label="Orders">
        <h2 className="mb-3 font-serif text-xl text-[#7A1F2B]">Order history</h2>
        {orders === null ? <p>Loading…</p> : !orders.length ? <p>No orders yet. <Link to="/" className="underline">Find a little favorite</Link>.</p> : (
          <ul className="divide-y divide-[#e9dfe3] rounded-2xl border border-[#e9dfe3] bg-white">
            {orders.map((o) => (
              <li key={o.id}><Link to={`/account/orders/${o.id}`} className="flex min-h-[56px] flex-wrap items-center justify-between gap-2 p-4">
                <span><b>{o.order_number}</b><br /><small>{new Date(o.created_at).toLocaleString('en-IN')}</small></span>
                <span className="text-right">{inr(o.total_paise)}<br /><small>{statusLabel(o)}</small></span></Link></li>))}
          </ul>)}
      </section>
    </main>);
}

export function OrderDetail() {
  const { id } = useParams(); const [o, setO] = useState<any | undefined>(undefined); const [tick, setTick] = useState(0);
  const [events, setEvents] = useState<any[]>([]); const [delivery, setDelivery] = useState<any>(null); const [invMsg, setInvMsg] = useState(''); const [invBusy, setInvBusy] = useState(false);
  useEffect(() => { (async () => {
    // Someone else's order id returns nothing because RLS hides it.
    const { data } = await supabase.from('orders').select('*, order_items(*), shipments(*)').eq('id', id!).maybeSingle();
    setO(data ?? null);
    if (data) {
      const ev = await supabase.from('order_events').select('id,kind,from_status,to_status,message,created_at').eq('order_id', id!).order('created_at');
      setEvents(ev.data ?? []);
      const d = await supabase.from('store_settings').select('setting_value').eq('setting_key', 'delivery').maybeSingle(); setDelivery(d.data?.setting_value ?? null);
    }
  })(); }, [id, tick]);
  async function invoice() {
    setInvMsg(''); setInvBusy(true);
    const { data, error } = await supabase.functions.invoke('generate-invoice', { body: { order_id: id } });
    setInvBusy(false);
    if (error || !data?.url) { let m = 'Could not prepare the invoice. Please try again.'; try { m = (await (error as any).context.json()).error ?? m; } catch { /* keep default */ } return setInvMsg(m); }
    window.open(data.url, '_blank', 'noopener');   // 60-second signed link to the private PDF
  }
  if (o === undefined) return <p className="p-10 text-center">Loading…</p>;
  if (!o) return <main className="p-10 text-center">Order not found. <Link to="/account" className="underline">Back to your account</Link></main>;
  const a = o.shipping_address ?? {};
  const ship = [...(o.shipments ?? [])].sort((x: any, y: any) => (x.created_at < y.created_at ? 1 : -1))[0];
  const range = ship?.estimated_delivery ? { min: new Date(ship.estimated_delivery), max: new Date(ship.estimated_delivery) }
    : o.payment_status === 'paid' && !['delivered', 'cancelled', 'refunded', 'refund_pending'].includes(o.order_status) ? estimateDelivery(new Date(ship?.shipped_at ?? o.created_at), delivery, { alreadyDispatched: !!ship }) : null;
  const label: Record<string, string> = { order_placed: 'Order placed', payment_confirmed: 'Payment confirmed', invoice_issued: 'Invoice issued', refund_pending: 'Refund started', refund_processed: 'Refund confirmed', cancelled: 'Cancelled' };
  const statusText: Record<string, string> = { processing: 'Processing', packed: 'Packed', shipped: 'Shipped', out_for_delivery: 'Out for delivery', delivered: 'Delivered' };
  return (
    <main className="mx-auto max-w-3xl space-y-6 px-4 py-10">
      <Link to="/account" className="underline">← My account</Link>
      <h1 className="font-serif text-3xl text-[#7A1F2B]">{o.order_number}</h1>
      <p>Status: <b>{statusLabel(o)}</b> · Payment: {o.payment_status}</p>
      {o.payment_status !== 'paid' && o.order_status === 'pending' && <p role="status">Your payment is being confirmed. This page shows “Payment confirmed” only after the payment is verified.</p>}
      {range && <p className="rounded-xl bg-[#F5DADD] p-3 text-sm"><b>Estimated delivery: {formatRange(range)}.</b> This is an estimate based on the store’s delivery settings{ship?.estimated_delivery ? ' and the date entered at dispatch' : ''}, not a guarantee.</p>}
      {ship && (ship.carrier || ship.tracking_number) && <p>Shipped via {ship.carrier ?? 'courier'} · Tracking: {ship.tracking_url && /^https?:\/\//i.test(ship.tracking_url) ? <a className="underline" href={ship.tracking_url} rel="noopener noreferrer" target="_blank">{ship.tracking_number ?? 'track package'}</a> : ship.tracking_number}</p>}
      <ul className="divide-y divide-[#e9dfe3] rounded-2xl border border-[#e9dfe3] bg-white">
        {o.order_items.map((i: any) => <li key={i.id} className="flex justify-between gap-3 p-3"><span className="break-words">{i.product_name} × {i.quantity}</span><span>{inr(i.line_total_paise)}</span></li>)}
        {o.discount_paise > 0 && <li className="flex justify-between p-3 text-green-800"><span>Coupon {o.coupon_code}</span><span>−{inr(o.discount_paise)}</span></li>}
        <li className="flex justify-between p-3"><span>Shipping</span><span>{o.shipping_fee_paise ? inr(o.shipping_fee_paise) : 'Free'}</span></li>
        <li className="flex justify-between p-3 font-semibold"><span>Total</span><span>{inr(o.total_paise)}</span></li>
      </ul>
      <section aria-label="Order timeline"><h2 className="mb-2 font-serif text-xl text-[#7A1F2B]">Timeline</h2>
        <ol className="space-y-2 border-l-2 border-[#EBD3D8] pl-4">
          {events.map((e) => <li key={e.id}><b>{e.kind === 'status_changed' ? statusText[e.to_status] ?? e.to_status : e.kind === 'note' ? 'Note from the store' : label[e.kind] ?? e.kind}</b>{e.kind === 'note' || e.kind === 'cancelled' ? <span>: {e.message}</span> : null}<br /><small className="opacity-70">{new Date(e.created_at).toLocaleString('en-IN')}</small></li>)}
          {!events.length && <li>No updates yet.</li>}
        </ol></section>
      {canGenerateInvoice(o) && <div><button className={btn} onClick={invoice} disabled={invBusy}>{invBusy ? 'Preparing…' : 'Download invoice (PDF)'}</button><p role="status" className="mt-1 text-sm text-red-700">{invMsg}</p></div>}
      <OrderActions o={o} onChanged={() => setTick((n) => n + 1)} />
      <p>{o.customer_name}<br />{a.line1}{a.line2 && `, ${a.line2}`}<br />{a.city}, {a.state} {a.pincode}</p>
    </main>);
}

type Addr = { id: string; label: string | null; full_name: string; phone: string; line1: string; line2: string | null; city: string; state: string; pincode: string; is_default: boolean };

function AddressBook() {
  const { user } = useAuth();
  const blank = { label: '', full_name: '', phone: '', line1: '', line2: '', city: '', state: '', pincode: '' };
  const [list, setList] = useState<Addr[]>([]); const [f, setF] = useState(blank); const [open, setOpen] = useState(false); const [msg, setMsg] = useState('');
  const load = async () => { const { data } = await supabase.from('customer_addresses').select('*').order('created_at'); setList(data ?? []); };
  useEffect(() => { load(); }, [user?.id]);
  const set = (k: string) => (e: any) => setF({ ...f, [k]: e.target.value });
  async function add(e: FormEvent) {
    e.preventDefault(); setMsg('');
    if (f.full_name.trim().length < 2 || !f.line1.trim() || !f.city.trim() || !f.state.trim()) return setMsg('Complete the address.');
    if (!isMobile(f.phone)) return setMsg('Enter a valid 10-digit mobile number.');
    if (!isPin(f.pincode)) return setMsg('Enter a valid 6-digit PIN code.');
    const { error } = await supabase.from('customer_addresses').insert({ ...f, line2: f.line2 || null, label: f.label || null, user_id: user!.id, is_default: list.length === 0 });
    if (error) return setMsg('Could not save the address. Please try again.');
    setF(blank); setOpen(false); load();
  }
  async function makeDefault(id: string) {
    await supabase.from('customer_addresses').update({ is_default: false }).eq('user_id', user!.id);
    await supabase.from('customer_addresses').update({ is_default: true }).eq('id', id); load();
  }
  async function remove(id: string) { if (window.confirm('Delete this address?')) { await supabase.from('customer_addresses').delete().eq('id', id); load(); } }
  return (
    <section aria-label="Addresses">
      <h2 className="mb-3 font-serif text-xl text-[#7A1F2B]">Saved addresses</h2>
      {!list.length && <p>No saved addresses yet.</p>}
      <ul className="space-y-2">{list.map((a) => (
        <li key={a.id} className="rounded-2xl border border-[#e9dfe3] bg-white p-3 text-sm">
          <b>{a.label || a.full_name}</b>{a.is_default && <span className="ml-2 rounded-full bg-[#F5DADD] px-2 py-0.5 text-xs">Default</span>}
          <br />{a.full_name} · {a.phone}<br />{a.line1}{a.line2 && `, ${a.line2}`}, {a.city}, {a.state} {a.pincode}
          <div className="mt-2 flex gap-3">{!a.is_default && <button className="min-h-[36px] underline" onClick={() => makeDefault(a.id)}>Make default</button>}<button className="min-h-[36px] underline" onClick={() => remove(a.id)}>Delete</button></div>
        </li>))}</ul>
      {open ? (
        <form onSubmit={add} className="mt-3 grid gap-3 sm:grid-cols-2" noValidate>
          <input className={field} placeholder="Label (Home, Work…)" aria-label="Label" value={f.label} onChange={set('label')} />
          <input className={field} placeholder="Full name" aria-label="Full name" value={f.full_name} onChange={set('full_name')} />
          <input className={field} inputMode="numeric" maxLength={10} placeholder="Mobile (10 digits)" aria-label="Mobile" value={f.phone} onChange={set('phone')} />
          <input className={field} placeholder="Address line 1" aria-label="Address line 1" value={f.line1} onChange={set('line1')} />
          <input className={field} placeholder="Address line 2 (optional)" aria-label="Address line 2" value={f.line2} onChange={set('line2')} />
          <input className={field} placeholder="City" aria-label="City" value={f.city} onChange={set('city')} />
          <input className={field} placeholder="State" aria-label="State" value={f.state} onChange={set('state')} />
          <input className={field} inputMode="numeric" maxLength={6} placeholder="PIN code" aria-label="PIN code" value={f.pincode} onChange={set('pincode')} />
          <button className={btn}>Save address</button><button type="button" className="underline" onClick={() => setOpen(false)}>Cancel</button>
        </form>) : <button className={`${btn} mt-3`} onClick={() => setOpen(true)}>Add an address</button>}
      <p role="status" className="mt-2 text-sm text-red-700">{msg}</p>
    </section>);
}

function OrderActions({ o, onChanged }: { o: any; onChanged: () => void }) {
  const [msg, setMsg] = useState(''); const [reason, setReason] = useState(''); const [ask, setAsk] = useState(false);
  async function cancel() {
    if (!window.confirm('Cancel this order?')) return;
    const { data, error } = await supabase.rpc('cancel_my_order', { p_order: o.id });
    setMsg(error ? 'This order can no longer be cancelled.' : data === 'cancelled_refund_requested' ? 'Order cancelled. A refund has been requested and will be reviewed.' : 'Order cancelled.');
    onChanged();
  }
  async function refund() {
    if (reason.trim().length < 3) return setMsg('Please tell us briefly why.');
    const { error } = await supabase.rpc('request_refund', { p_order: o.id, p_reason: reason.trim() });
    setMsg(error ? 'Could not submit the request (one may already be open).' : 'Refund request sent. We’ll review it and get back to you.');
    setAsk(false); onChanged();
  }
  if (!canCustomerCancel(o) && !canRequestRefund(o)) return null;
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-3">
        {canCustomerCancel(o) && <button className="min-h-[44px] rounded-full border border-[#7A1F2B] px-5 text-[#7A1F2B]" onClick={cancel}>Cancel order</button>}
        {canRequestRefund(o) && !ask && <button className="min-h-[44px] rounded-full border border-[#7A1F2B] px-5 text-[#7A1F2B]" onClick={() => setAsk(true)}>Request a refund</button>}
      </div>
      {ask && <div className="flex flex-wrap gap-2"><input className={field} aria-label="Reason" placeholder="Reason" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} /><button className={btn} onClick={refund}>Send request</button></div>}
      <p role="status" className="text-sm">{msg}</p>
    </div>);
}
