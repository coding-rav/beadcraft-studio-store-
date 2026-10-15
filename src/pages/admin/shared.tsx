import { ReactNode } from 'react';
export const cell = 'border-b border-[#ecd9dc] p-2 text-left align-top text-sm';
export const input = 'min-h-[40px] w-full rounded-lg border border-[#ecd9dc] bg-white px-3 text-sm';
export const smallBtn = 'min-h-[36px] rounded-full border border-[#7A1F2B] px-3 text-xs text-[#7A1F2B] disabled:opacity-40';
export const primary = 'min-h-[44px] rounded-full bg-[#7A1F2B] px-5 text-sm font-semibold text-white disabled:opacity-50';
export const Field = ({ label, children }: { label: string; children: ReactNode }) => <label className="flex flex-col gap-1 text-sm">{label}{children}</label>;
export const Table = ({ heads, children }: { heads: string[]; children: ReactNode }) => (
  <div className="overflow-x-auto"><table className="w-full min-w-[640px]"><thead><tr>{heads.map((h) => <th key={h} className={cell}>{h}</th>)}</tr></thead><tbody>{children}</tbody></table></div>);
export const errText = (e: any) => (e?.message ? `Failed: ${e.message}` : 'Failed: not allowed');
