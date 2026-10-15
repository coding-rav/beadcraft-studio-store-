// Dependency-free so it can be unit-tested outside Deno.
const enc = new TextEncoder();
export async function hmacHex(secret: string, msg: string): Promise<string> {
  const k = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', k, enc.encode(msg));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
/** Constant-time string comparison (same length required). */
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}
/** Razorpay Checkout signature: HMAC_SHA256(razorpay_order_id + "|" + razorpay_payment_id, key_secret). */
export const checkoutSignature = (keySecret: string, orderId: string, paymentId: string) => hmacHex(keySecret, `${orderId}|${paymentId}`);
