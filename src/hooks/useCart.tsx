import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { supabase, supabaseConfigured } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export type Line = { product_id: string; quantity: number };
const KEY = 'bc_cart_v2';  // guests only: product ids + quantities. Never prices, never tokens.
const read = (): Line[] => { try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch { return []; } };
const write = (l: Line[]) => { try { localStorage.setItem(KEY, JSON.stringify(l)); } catch { /* storage blocked */ } };
const clamp = (n: number) => Math.max(0, Math.min(20, Math.floor(n)));

type CartCtx = {
  lines: Line[]; count: number;
  add(id: string, n?: number): Promise<void>;
  setQty(id: string, q: number): Promise<void>;
  clear(): Promise<void>;
};
const Ctx = createContext<CartCtx>(null as any);
export const useCart = () => useContext(Ctx);

export function CartProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [lines, setLines] = useState<Line[]>(read);

  // On login: merge the guest cart into the saved cart, then the database is the source of truth.
  useEffect(() => {
    if (!user) { setLines(read()); return; }
    if (!supabaseConfigured) return;
    (async () => {
      const { data } = await supabase.from('cart_items').select('product_id,quantity').eq('user_id', user.id);
      const m = new Map<string, number>((data ?? []).map((r: Line) => [r.product_id, r.quantity] as [string, number]));
      for (const g of read()) m.set(g.product_id, clamp((m.get(g.product_id) ?? 0) + g.quantity));
      const merged = [...m].map(([product_id, quantity]) => ({ product_id, quantity })).filter((l) => l.quantity > 0);
      if (merged.length) {
        await supabase.from('cart_items').upsert(merged.map((l) => ({ ...l, user_id: user.id })), { onConflict: 'user_id,product_id' });
      }
      try { localStorage.removeItem(KEY); } catch { /* ignore */ }
      setLines(merged);
    })();
  }, [user?.id]);

  const setQty = useCallback(async (product_id: string, q: number) => {
    const quantity = clamp(q);
    setLines((cur) => {
      const rest = cur.filter((l) => l.product_id !== product_id);
      const next = quantity ? [...rest, { product_id, quantity }] : rest;
      if (!user) write(next);
      return next;
    });
    if (user && supabaseConfigured) {
      if (quantity) await supabase.from('cart_items').upsert({ user_id: user.id, product_id, quantity }, { onConflict: 'user_id,product_id' });
      else await supabase.from('cart_items').delete().eq('user_id', user.id).eq('product_id', product_id);
    }
  }, [user?.id]);

  const add = useCallback((id: string, n = 1) => setQty(id, (lines.find((l) => l.product_id === id)?.quantity ?? 0) + n), [lines, setQty]);
  const clear = useCallback(async () => {
    setLines([]);
    try { localStorage.removeItem(KEY); } catch { /* ignore */ }
    if (user && supabaseConfigured) await supabase.from('cart_items').delete().eq('user_id', user.id);
  }, [user?.id]);

  const value = useMemo(() => ({ lines, add, setQty, clear, count: lines.reduce((a, l) => a + l.quantity, 0) }), [lines, add, setQty, clear]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
