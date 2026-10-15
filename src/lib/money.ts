/** All money is integer paise (INR). Never use floating-point rupees for arithmetic. */
export const inr = (paise: number) => '₹' + (paise / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 });

/** "199", "199.5", "199.50" -> 19950. Returns null for anything else (negative, 3 decimals, text). */
export function rupeesToPaise(input: string): number | null {
  const m = /^(\d{1,7})(?:\.(\d{1,2}))?$/.exec(input.trim());
  if (!m) return null;
  return parseInt(m[1], 10) * 100 + (m[2] ? parseInt(m[2].padEnd(2, '0'), 10) : 0);
}
export const paiseToRupeeString = (paise: number) => (paise / 100).toFixed(2).replace(/\.00$/, '');

export type ShippingRule = { flat_fee_paise?: number; free_threshold_paise?: number | null };
/** Mirrors create_checkout_order(): flat fee, waived when the subtotal reaches the free threshold. */
export function shippingFor(subtotalPaise: number, rule: ShippingRule | null | undefined): number {
  const flat = Math.max(0, Math.floor(rule?.flat_fee_paise ?? 0));
  const free = rule?.free_threshold_paise;
  return free != null && subtotalPaise >= free ? 0 : flat;
}
