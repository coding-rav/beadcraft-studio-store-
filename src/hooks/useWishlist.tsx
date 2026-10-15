import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { supabase, supabaseConfigured } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

const KEY = 'bc_wl_v2'; // guests only: product ids
const read = (): string[] => { try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch { return []; } };
const write = (l: string[]) => { try { localStorage.setItem(KEY, JSON.stringify(l)); } catch { /* ignore */ } };

type Ctx = { ids: string[]; has(id: string): boolean; toggle(id: string): Promise<void> };
const WishCtx = createContext<Ctx>(null as any);
export const useWishlist = () => useContext(WishCtx);

export function WishlistProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [ids, setIds] = useState<string[]>(read);

  useEffect(() => {
    if (!user) { setIds(read()); return; }
    if (!supabaseConfigured) return;
    (async () => {
      const { data } = await supabase.from('wishlists').select('product_id').eq('user_id', user.id);
      const saved = new Set<string>((data ?? []).map((r: { product_id: string }) => r.product_id));
      const guest = read().filter((g) => !saved.has(g));
      if (guest.length) await supabase.from('wishlists').upsert(guest.map((product_id) => ({ user_id: user.id, product_id })), { onConflict: 'user_id,product_id', ignoreDuplicates: true });
      try { localStorage.removeItem(KEY); } catch { /* ignore */ }
      setIds([...saved, ...guest]);
    })();
  }, [user?.id]);

  const toggle = useCallback(async (id: string) => {
    const on = ids.includes(id);
    const next = on ? ids.filter((x) => x !== id) : [...ids, id];
    setIds(next);
    if (!user) return write(next);
    if (!supabaseConfigured) return;
    if (on) await supabase.from('wishlists').delete().eq('user_id', user.id).eq('product_id', id);
    else await supabase.from('wishlists').upsert({ user_id: user.id, product_id: id }, { onConflict: 'user_id,product_id', ignoreDuplicates: true });
  }, [ids, user?.id]);

  const value = useMemo(() => ({ ids, has: (id: string) => ids.includes(id), toggle }), [ids, toggle]);
  return <WishCtx.Provider value={value}>{children}</WishCtx.Provider>;
}
