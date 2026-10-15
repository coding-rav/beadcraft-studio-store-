// Pure (no Deno/DOM APIs): used by the Edge Functions (emails) and the React app. Calendar days, not business days.
export type DeliveryRule = { handling_days_min?: number; handling_days_max?: number; transit_days_min?: number; transit_days_max?: number };
const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.floor(v) : null);
const addDays = (d: Date, k: number) => new Date(d.getTime() + k * 86_400_000);

/** Estimated delivery window from an order/dispatch date. Returns null unless the owner configured transit days (nothing is invented). */
export function estimateDelivery(from: Date, rule: DeliveryRule | null | undefined, opts: { alreadyDispatched?: boolean } = {}): { min: Date; max: Date } | null {
  const tMin = n(rule?.transit_days_min), tMax = n(rule?.transit_days_max ?? rule?.transit_days_min);
  if (tMin === null || tMax === null || tMax < tMin) return null;
  const hMin = opts.alreadyDispatched ? 0 : n(rule?.handling_days_min) ?? 0;
  const hMax = opts.alreadyDispatched ? 0 : n(rule?.handling_days_max ?? rule?.handling_days_min) ?? 0;
  return { min: addDays(from, hMin + tMin), max: addDays(from, Math.max(hMax, hMin) + tMax) };
}
export function formatRange(r: { min: Date; max: Date }): string {
  const f = (d: Date, y: boolean) => d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', ...(y ? { year: 'numeric' } : {}), timeZone: 'Asia/Kolkata' });
  return r.min.getTime() === r.max.getTime() ? f(r.min, true) : `${f(r.min, false)} – ${f(r.max, true)}`;
}
