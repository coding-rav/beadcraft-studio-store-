import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useCart } from '@/hooks/useCart';
import { inr } from '@/lib/ui';

type O = { order_number: string; total_paise: number; payment_status: string; order_status: string };

// Shows "confirmed" ONLY when the server-side payment_status is 'paid' (set by verify/webhook).
export function PaymentSuccess() {
  const [sp] = useSearchParams(); const id = sp.get('order'); const cart = useCart();
  const [o, setO] = useState<O | null>(null); const [tries, setTries] = useState(0); const cleared = useRef(false);

  useEffect(() => {
    if (!id) return;
    let stop = false;
    const tick = async (n: number) => {
      const { data } = await supabase.from('orders').select('order_number,total_paise,payment_status,order_status').eq('id', id).maybeSingle();
      if (stop) return;
      setO(data); setTries(n);
      const done = data && (data.payment_status === 'paid' || data.payment_status === 'refunded');
      if (!done && n < 20) setTimeout(() => tick(n + 1), 3000);
    };
    tick(1);
    return () => { stop = true; };
  }, [id]);

  useEffect(() => { if (o?.payment_status === 'paid' && !cleared.current) { cleared.current = true; cart.clear(); } }, [o?.payment_status]);

  if (!id) return <main className="p-10 text-center">No order specified. <Link to="/account" className="underline">My account</Link></main>;
  const paid = o?.payment_status === 'paid';
  return (
    <main className="mx-auto max-w-xl px-4 py-14 text-center" role="status">
      {paid ? (<>
        <h1 className="text-3xl text-[#7A1F2B]">Your order is confirmed!</h1>
        <p className="mt-3">A little handmade happiness is on its way.</p>
        <p className="mt-4">Order <b>{o!.order_number}</b> · {inr(o!.total_paise)}</p>
        <Link to={`/account/orders/${id}`} className="mt-6 inline-flex min-h-[44px] items-center rounded-full bg-[#7A1F2B] px-6 text-[#FFFAF6]">View order</Link>
      </>) : o?.payment_status === 'failed' ? (<>
        <h1 className="text-3xl text-[#7A1F2B]">Payment not confirmed</h1>
        <p className="mt-3">Your payment was not confirmed. Your cart is saved, so you can try again.</p>
        <Link to="/checkout" className="mt-6 inline-flex min-h-[44px] items-center rounded-full bg-[#7A1F2B] px-6 text-[#FFFAF6]">Back to checkout</Link>
      </>) : (<>
        <h1 className="text-3xl text-[#7A1F2B]">Your payment is being confirmed</h1>
        <p className="mt-3">{tries >= 20 ? 'This is taking longer than usual. If money was deducted it will be reconciled automatically; check My account for the status.' : 'Please keep this page open. This usually takes a few seconds.'}</p>
        <Link to="/account" className="mt-6 inline-block underline">My account</Link>
      </>)}
    </main>
  );
}

export function PaymentFailed() {
  return (
    <main className="mx-auto max-w-xl px-4 py-14 text-center">
      <h1 className="text-3xl text-[#7A1F2B]">Payment not completed</h1>
      <p className="mt-3">The payment was not confirmed and no order was paid. Your cart is saved, so you can try again.</p>
      <Link to="/checkout" className="mt-6 inline-flex min-h-[44px] items-center rounded-full bg-[#7A1F2B] px-6 text-[#FFFAF6]">Back to checkout</Link>
    </main>
  );
}
