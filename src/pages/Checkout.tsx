import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useCart } from '@/hooks/useCart';
import { payNow } from '@/lib/checkout-client';
import { btn, field, inr, isEmail, isMobile, isPin } from '@/lib/ui';
import { shippingFor } from '@/lib/money';

type Prod = { id: string; name: string; price_paise: number; image_url: string | null; stock_quantity: number; is_active: boolean };

export default function Checkout() {
  const { user } = useAuth(); const nav = useNavigate(); const cart = useCart();
  const [prods, setProds] = useState<Record<string, Prod>>({});
  const [ship, setShip] = useState<{ flat: number; free: number | null }>({ flat: 0, free: null });
  const [step, setStep] = useState<'details' | 'review'>('details');
  const [f, setF] = useState({ name: '', email: user?.email ?? '', phone: '', line1: '', line2: '', city: '', state: '', pincode: '' });
  const [err, setErr] = useState(''); const [busy, setBusy] = useState(false); const [pending, setPending] = useState(false);
  const idem = useRef(crypto.randomUUID()); // one key per checkout attempt: retries reuse the same open order
  const [couponInput, setCouponInput] = useState(''); const [coupon, setCoupon] = useState<{ code: string; discount: number } | null>(null); const [couponMsg, setCouponMsg] = useState('');
  const cartSig = JSON.stringify(cart.lines) + (coupon?.code ?? '');
  useEffect(() => { idem.current = crypto.randomUUID(); }, [cartSig]); // changed cart = new attempt

  useEffect(() => { (async () => {   // prefill from profile + default address
    if (!user) return;
    const [{ data: p }, { data: a }] = await Promise.all([
      supabase.from('profiles').select('full_name,phone').eq('id', user.id).maybeSingle(),
      supabase.from('customer_addresses').select('*').eq('user_id', user.id).order('is_default', { ascending: false }).limit(1).maybeSingle()]);
    setF((c) => ({ ...c, name: a?.full_name ?? p?.full_name ?? c.name, phone: a?.phone ?? p?.phone ?? c.phone,
      line1: a?.line1 ?? c.line1, line2: a?.line2 ?? c.line2, city: a?.city ?? c.city, state: a?.state ?? c.state, pincode: a?.pincode ?? c.pincode }));
  })(); }, [user?.id]);

  useEffect(() => { (async () => {   // display-only prices; the server re-prices everything
    const ids = cart.lines.map((l) => l.product_id); if (!ids.length) return;
    const { data } = await supabase.from('products').select('id,name,price_paise,image_url,stock_quantity,is_active').in('id', ids);
    setProds(Object.fromEntries((data ?? []).map((p: any) => [p.id, p])));
    const { data: s } = await supabase.from('store_settings').select('setting_value').eq('setting_key', 'shipping').maybeSingle();
    const v: any = s?.setting_value ?? {}; setShip({ flat: Number(v.flat_fee_paise ?? 0), free: v.free_threshold_paise ?? null });
  })(); }, [cart.lines.length]);

  const rows = cart.lines.map((l) => ({ ...l, p: prods[l.product_id] })).filter((r) => r.p);
  const sub = useMemo(() => rows.reduce((a, r) => a + r.p.price_paise * r.quantity, 0), [rows]);
  const shipping = shippingFor(sub, { flat_fee_paise: ship.flat, free_threshold_paise: ship.free });
  const discount = coupon ? Math.min(coupon.discount, sub) : 0;
  const total = sub + shipping - discount;
  const problem = rows.find((r) => !r.p.is_active || r.p.stock_quantity < r.quantity);
  const set = (k: string) => (e: any) => setF({ ...f, [k]: e.target.value });

  async function applyCoupon() {
    setCouponMsg(''); const code = couponInput.trim().toUpperCase();
    if (!/^[A-Z0-9_-]{3,32}$/.test(code)) return setCouponMsg('Enter a valid coupon code.');
    const { data, error } = await supabase.rpc('preview_coupon', { p_code: code, p_items: cart.lines });
    if (error || !data) return setCouponMsg('Could not check that coupon. Please try again.');
    if (data.valid) { setCoupon({ code: data.code, discount: data.discount_paise }); setCouponMsg(`Coupon applied: −${inr(data.discount_paise)}`); }
    else { setCoupon(null); setCouponMsg(data.message); }
  }
  useEffect(() => { if (coupon) setCoupon(null); }, [sub]); // subtotal changed: re-apply to re-check minimums

  function review() {
    setErr('');
    if (f.name.trim().length < 2) return setErr('Enter your name.');
    if (!isEmail(f.email)) return setErr('Enter a valid email.');
    if (!isMobile(f.phone)) return setErr('Enter a valid 10-digit mobile number.');
    if (!f.line1.trim() || !f.city.trim() || !f.state.trim()) return setErr('Complete your shipping address.');
    if (!isPin(f.pincode)) return setErr('Enter a valid 6-digit PIN code.');
    if (problem) return setErr(`${problem.p.name} is no longer available in that quantity. Update your cart.`);
    setStep('review');
  }
  async function pay() {
    setBusy(true); setErr('');
    await payNow(supabase, { name: f.name, email: f.email, phone: f.phone,
      address: { line1: f.line1, line2: f.line2, city: f.city, state: f.state, pincode: f.pincode }, coupon: coupon?.code },
      cart.lines, idem.current, {
        onPending: () => setPending(true),
        onPaid: async (id) => { await cart.clear(); nav(`/payment/success?order=${id}`); },
        onUnconfirmed: (id) => nav(`/payment/success?order=${id}`), // that page polls the order; cart is kept until paid
        onFailed: (m, code) => { if (code === 'ORDER_CLOSED') idem.current = crypto.randomUUID(); setBusy(false); setPending(false); setErr(m); },
        onCancelled: () => { setBusy(false); setErr('Payment was cancelled. Your cart is saved — you can try again.'); } });
  }

  if (!cart.lines.length) return <main className="p-10 text-center">Your cart is empty.</main>;
  return (
    <main className="mx-auto grid max-w-5xl gap-8 px-4 py-10 md:grid-cols-[1.2fr_1fr]">
      <section aria-label="Checkout">
        <h1 className="mb-4 font-serif text-3xl text-[#7A1F2B]">{step === 'details' ? 'Delivery details' : 'Review your order'}</h1>
        {step === 'details' ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <input className={`${field} sm:col-span-2`} placeholder="Full name" aria-label="Full name" value={f.name} onChange={set('name')} />
            <input className={field} type="email" placeholder="Email" aria-label="Email" value={f.email} onChange={set('email')} />
            <input className={field} inputMode="numeric" maxLength={10} placeholder="Mobile (10 digits)" aria-label="Mobile" value={f.phone} onChange={set('phone')} />
            <input className={`${field} sm:col-span-2`} placeholder="Address line 1" aria-label="Address line 1" value={f.line1} onChange={set('line1')} />
            <input className={`${field} sm:col-span-2`} placeholder="Address line 2 (optional)" aria-label="Address line 2" value={f.line2} onChange={set('line2')} />
            <input className={field} placeholder="City" aria-label="City" value={f.city} onChange={set('city')} />
            <input className={field} placeholder="State" aria-label="State" value={f.state} onChange={set('state')} />
            <input className={field} inputMode="numeric" maxLength={6} placeholder="PIN code" aria-label="PIN code" value={f.pincode} onChange={set('pincode')} />
            <button className={`${btn} sm:col-span-2`} onClick={review}>Review order</button>
          </div>) : (
          <div className="space-y-3">
            <p>{f.name} · {f.phone}<br />{f.line1}{f.line2 && `, ${f.line2}`}<br />{f.city}, {f.state} {f.pincode}</p>
            <button className="underline" onClick={() => setStep('details')} disabled={busy}>Edit details</button>
            <button className={`${btn} block w-full`} onClick={pay} disabled={busy}>{busy ? 'Opening payment…' : `Pay ${inr(total)}`}</button>
            {pending && <p role="status">Your payment is being confirmed. Please don’t close this page.</p>}
          </div>)}
        {err && <p role="alert" className="mt-3 text-sm text-red-700">{err}</p>}
      </section>
      <aside aria-label="Order summary" className="h-fit rounded-2xl border border-[#e9dfe3] bg-white p-5">
        <h2 className="mb-3 font-serif text-xl text-[#7A1F2B]">Order summary</h2>
        {rows.map((r) => (
          <div key={r.product_id} className="flex items-center gap-3 border-b border-[#e9dfe3] py-2">
            {r.p.image_url && <img src={r.p.image_url} alt={r.p.name} className="h-12 w-12 rounded-lg object-cover" />}
            <div className="min-w-0 flex-1"><p className="break-words text-sm font-medium">{r.p.name}</p><p className="text-sm">{inr(r.p.price_paise)} × {r.quantity}</p></div>
            {step === 'details' && <div className="whitespace-nowrap">
              <button aria-label="Fewer" className="h-9 w-9 rounded-full border" onClick={() => cart.setQty(r.product_id, r.quantity - 1)}>−</button> {r.quantity}{' '}
              <button aria-label="More" className="h-9 w-9 rounded-full border" onClick={() => cart.setQty(r.product_id, r.quantity + 1)}>+</button></div>}
          </div>))}
        <dl className="mt-3 space-y-1 text-sm">
          <div className="flex justify-between"><dt>Subtotal</dt><dd>{inr(sub)}</dd></div>
          {discount > 0 && <div className="flex justify-between text-green-800"><dt>Coupon {coupon?.code}</dt><dd>−{inr(discount)}</dd></div>}
          <div className="flex justify-between"><dt>Shipping</dt><dd>{shipping ? inr(shipping) : 'Free'}</dd></div>
          <div className="flex justify-between text-base font-semibold"><dt>Total</dt><dd>{inr(total)}</dd></div>
        </dl>
        {step === 'details' && (
          <div className="mt-3">
            <label className="text-sm" htmlFor="coupon">Coupon code</label>
            <div className="mt-1 flex gap-2">
              <input id="coupon" value={couponInput} onChange={(e) => setCouponInput(e.target.value)} className={field} placeholder="Enter code" autoCapitalize="characters" />
              <button type="button" onClick={applyCoupon} className="min-h-[44px] rounded-full border border-[#7A1F2B] px-4 text-[#7A1F2B]">Apply</button>
            </div>
            <p role="status" className="mt-1 min-h-[20px] text-xs">{couponMsg}</p>
          </div>)}
        <p className="mt-2 text-xs opacity-70">The final amount is confirmed by our server when you pay.</p>
      </aside>
    </main>);
}
