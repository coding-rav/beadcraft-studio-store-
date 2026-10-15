export { inr } from './money';
export { safeRedirect } from './redirect';
export const isEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim());
export const isMobile = (v: string) => /^[6-9]\d{9}$/.test(v);      // 10-digit Indian mobile
export const isPin = (v: string) => /^\d{6}$/.test(v);
export const field = 'w-full min-h-[44px] rounded-xl border border-[#e9dfe3] bg-white px-4 text-[#29252B] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#c0566a]';
export const btn = 'min-h-[44px] rounded-full bg-[#7A1F2B] px-6 font-semibold text-[#FFFAF6] disabled:opacity-50';
