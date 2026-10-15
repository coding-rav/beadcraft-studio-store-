// Browser side of the Razorpay flow. Only the PUBLIC key_id is ever used here; totals come from the server.
export type PayUI = {
  onPending(): void;                    // payment window returned, waiting for server verification
  onPaid(orderId: string): void;        // ONLY after the server says the order is paid
  onUnconfirmed(orderId: string): void; // paid in the browser but the server could not confirm yet -> poll the order
  onFailed(msg: string, code?: string): void;
  onCancelled(): void;
};

declare global { interface Window { Razorpay?: any } }

function loadRazorpay(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.Razorpay) return resolve();
    const s = document.createElement('script');
    s.src = 'https://checkout.razorpay.com/v1/checkout.js';
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('load failed'));
    document.head.appendChild(s);
  });
}

// supabase-js returns data = null for non-2xx responses; the JSON body is on error.context.
async function errorBody(error: any): Promise<{ error?: string; code?: string }> {
  try { return await error.context.json(); } catch { return {}; }
}

export async function payNow(
  supabase: any,
  form: { name: string; email: string; phone: string; address: Record<string, string>; coupon?: string },
  cartItems: { product_id: string; quantity: number }[],
  idempotencyKey: string,
  ui: PayUI,
) {
  const { data, error } = await supabase.functions.invoke('create-razorpay-order', {
    body: { ...form, items: cartItems, idempotency_key: idempotencyKey },
  });
  if (error || !data || data.error) {
    const body = error ? await errorBody(error) : data ?? {};
    return ui.onFailed(body.error ?? 'Could not start checkout. Please try again.', body.code);
  }
  try { await loadRazorpay(); } catch { return ui.onFailed('Could not load the payment window. Check your connection and try again.'); }

  const rz = new window.Razorpay({
    key: data.key_id,
    order_id: data.razorpay_order_id,
    amount: data.amount,
    currency: 'INR',
    name: 'Beadcraft Studio',
    description: 'Order ' + data.order_number,
    prefill: { name: form.name, email: form.email, contact: form.phone },
    theme: { color: '#7A1F2B' },
    modal: { ondismiss: () => ui.onCancelled() }, // cart is kept; the order stays pending until it expires
    handler: async (r: { razorpay_payment_id: string; razorpay_order_id: string; razorpay_signature: string }) => {
      ui.onPending(); // never show "paid" from this browser callback alone
      const v = await supabase.functions.invoke('verify-razorpay-payment', { body: { order_id: data.order_id, ...r } });
      if (v.data?.status === 'paid') ui.onPaid(data.order_id);
      else ui.onUnconfirmed(data.order_id);
    },
  });
  rz.on('payment.failed', (r: any) => ui.onFailed(r?.error?.description ?? 'Payment was not confirmed.'));
  rz.open();
}
