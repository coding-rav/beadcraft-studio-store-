/** Only same-site paths like /checkout or /account/orders/123. Blocks //evil.com, /\evil.com and full URLs. */
export const safeRedirect = (p: unknown, fallback = '/account') =>
  typeof p === 'string' && /^\/(?![\/\\])[^\s]*$/.test(p) && !p.includes('://') ? p : fallback;
