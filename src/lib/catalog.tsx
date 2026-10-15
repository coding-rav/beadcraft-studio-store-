import { createContext, ReactNode, useContext, useEffect, useMemo, useState } from 'react';
import { supabase, supabaseConfigured } from '@/integrations/supabase/client';

export type Product = {
  id: string; slug: string; name: string; short_description: string | null; description: string | null;
  price_paise: number; compare_at_price_paise: number | null; image_url: string | null; badge: string | null;
  category: string; stock_quantity: number | null; // null = unknown (sample data only)
  is_featured: boolean; seo_title?: string | null; seo_description?: string | null;
};

// Shown ONLY in local development (vite dev) when Supabase is not configured. Production never shows sample data.
// IDs match supabase/seed.sql.
export const SAMPLE_PRODUCTS: Product[] = [
  { id: 'a0000000-0000-4000-8000-000000000001', slug: 'spidey-swing-spider-man-keychain', name: 'Spidey Swing Spider-Man Keychain', short_description: 'Your everyday superhero.', description: null, price_paise: 9900, compare_at_price_paise: 14900, image_url: '/images/spidey.jpg', badge: 'A Little Treat', category: 'Keychain', stock_quantity: null, is_featured: true },
  { id: 'a0000000-0000-4000-8000-000000000002', slug: 'little-fox-bead-keychain', name: 'Little Fox Bead Keychain', short_description: 'A tiny woodland companion.', description: null, price_paise: 2900, compare_at_price_paise: 6900, image_url: '/images/fox.jpg', badge: 'A Little Treat', category: 'Keychain', stock_quantity: null, is_featured: true },
  { id: 'a0000000-0000-4000-8000-000000000003', slug: 'cheeky-croc-bead-keychain', name: 'Cheeky Croc Bead Keychain', short_description: 'A little green grin to go.', description: null, price_paise: 6900, compare_at_price_paise: 12900, image_url: '/images/croc.jpg', badge: 'A Little Treat', category: 'Keychain', stock_quantity: null, is_featured: true },
  { id: 'a0000000-0000-4000-8000-000000000004', slug: 'hello-kutti-keychain', name: 'Hello Kutti Keychain', short_description: 'A tiny, cheerful keychain made to add a little happiness to your everyday.', description: null, price_paise: 2000, compare_at_price_paise: 6900, image_url: '/images/kutti.jpg', badge: 'A Little Treat', category: 'Keychain', stock_quantity: null, is_featured: true },
];

type Ctx = { products: Product[]; loading: boolean; error: string; source: 'database' | 'sample'; byId(id: string): Product | undefined };
const useSample = !supabaseConfigured && import.meta.env.DEV;
const C = createContext<Ctx>(null as any);
export const useProducts = () => useContext(C);

export function ProductsProvider({ children }: { children: ReactNode }) {
  const [products, setProducts] = useState<Product[]>(useSample ? SAMPLE_PRODUCTS : []);
  const [loading, setLoading] = useState(supabaseConfigured);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!supabaseConfigured) return;
    (async () => {
      const { data, error: e } = await supabase.from('products')
        .select('id,slug,name,short_description,description,price_paise,compare_at_price_paise,image_url,badge,stock_quantity,is_featured,seo_title,seo_description,categories(name)')
        .eq('is_active', true).order('created_at', { ascending: true });
      if (e) setError('Could not load products. Please refresh.');
      else setProducts((data ?? []).map((p: any) => {
        const c = Array.isArray(p.categories) ? p.categories[0] : p.categories;
        return { ...p, category: c?.name ?? 'Keychain' } as Product;
      }));
      setLoading(false);
    })();
  }, []);

  const value = useMemo<Ctx>(() => ({
    products, loading, error, source: useSample ? 'sample' : 'database',
    byId: (id) => products.find((p) => p.id === id),
  }), [products, loading, error]);
  return <C.Provider value={value}>{children}</C.Provider>;
}

export const soldOut = (p: Product) => p.stock_quantity !== null && p.stock_quantity <= 0;
