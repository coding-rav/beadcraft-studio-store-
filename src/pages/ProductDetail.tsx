import { useEffect, useState } from 'react';
import ProductCard from '@/components/ProductCard';
import { usePageMeta } from '@/lib/seo';
import { supabase, supabaseConfigured } from '@/integrations/supabase/client';
import { Link, useParams } from 'react-router-dom';
import { soldOut, useProducts } from '@/lib/catalog';
import { useCart } from '@/hooks/useCart';
import { useWishlist } from '@/hooks/useWishlist';
import { useUI } from '@/contexts/UIContext';
import { inr } from '@/lib/ui';

export default function ProductDetail() {
  const { slug } = useParams(); const { products, loading } = useProducts();
  const cart = useCart(); const wish = useWishlist(); const ui = useUI(); const [qty, setQty] = useState(1);
  const p = products.find((x) => x.slug === slug);
  const [extra, setExtra] = useState<{ image_url: string; alt_text: string | null }[]>([]); const [active, setActive] = useState(0);
  useEffect(() => {
    setActive(0); setQty(1);
    if (!p || !supabaseConfigured) { setExtra([]); return; }
    supabase.from('product_images').select('image_url,alt_text').eq('product_id', p.id).order('sort_order').then(({ data }: any) => setExtra(data ?? []));
  }, [p?.id]);
  usePageMeta(p ? (p.seo_title || `${p.name} — Beadcraft Studio`) : 'Beadcraft Studio', p?.seo_description || p?.short_description || undefined, p ? {
    '@context': 'https://schema.org', '@type': 'Product', name: p.name, image: p.image_url ?? undefined, description: p.description ?? p.short_description ?? undefined,
    offers: { '@type': 'Offer', priceCurrency: 'INR', price: (p.price_paise / 100).toFixed(2), availability: p.stock_quantity !== null && p.stock_quantity <= 0 ? 'https://schema.org/OutOfStock' : 'https://schema.org/InStock' } } : undefined);
  if (loading) return <p className="p-10 text-center">Loading…</p>;
  if (!p) return <div className="p-10 text-center"><p>We couldn’t find that piece.</p><Link to="/#shop" className="underline">Back to the shop</Link></div>;
  const out = soldOut(p); const max = p.stock_quantity === null ? 20 : Math.min(20, p.stock_quantity);
  const related = products.filter((x) => x.id !== p.id && x.category === p.category).slice(0, 4);
  return (<>
    <div className="mx-auto grid max-w-5xl gap-8 px-4 py-10 md:grid-cols-2">
      <div>
        {(() => { const imgs = [{ image_url: p.image_url ?? '', alt_text: p.name }, ...extra].filter((i) => i.image_url); const cur = imgs[Math.min(active, imgs.length - 1)];
          return (<>
            <div className="aspect-square overflow-hidden rounded-3xl bg-[#F5DADD]">{cur && <img src={cur.image_url} alt={cur.alt_text ?? p.name} className="h-full w-full object-cover" />}</div>
            {imgs.length > 1 && <div className="mt-3 flex gap-2">{imgs.map((i, n) => <button key={n} onClick={() => setActive(n)} aria-label={`Show image ${n + 1}`} aria-pressed={n === active} className={`h-16 w-16 overflow-hidden rounded-xl border-2 ${n === active ? 'border-[#7A1F2B]' : 'border-transparent'}`}><img src={i.image_url} alt="" className="h-full w-full object-cover" /></button>)}</div>}
          </>); })()}
      </div>
      <div className="min-w-0">
        <p className="text-sm opacity-70">{p.category}</p>
        <h1 className="break-words text-3xl text-[#7A1F2B]">{p.name}</h1>
        <p className="mt-3 flex items-baseline gap-3"><b className="text-2xl text-[#7A1F2B]">{inr(p.price_paise)}</b>
          {p.compare_at_price_paise && p.compare_at_price_paise > p.price_paise && <s className="opacity-60">{inr(p.compare_at_price_paise)}</s>}</p>
        <p className="mt-4">{p.description ?? p.short_description}</p>
        <p className="mt-3 text-sm" role="status">{p.stock_quantity === null ? '' : out ? 'Currently sold out' : p.stock_quantity <= 5 ? `Only ${p.stock_quantity} left` : 'In stock'}</p>
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <button aria-label="Fewer" className="h-11 w-11 rounded-full border border-[#ecd9dc]" onClick={() => setQty(Math.max(1, qty - 1))}>−</button>
            <span className="w-6 text-center" aria-live="polite">{qty}</span>
            <button aria-label="More" className="h-11 w-11 rounded-full border border-[#ecd9dc]" onClick={() => setQty(Math.min(max, qty + 1))}>+</button>
          </div>
          <button disabled={out} onClick={async () => { await cart.add(p.id, qty); ui.open('cart'); }} className="min-h-[44px] rounded-full bg-[#7A1F2B] px-6 font-semibold text-[#FFFAF6] disabled:opacity-50">{out ? 'Sold out' : 'Add to cart'}</button>
          <button onClick={() => wish.toggle(p.id)} aria-pressed={wish.has(p.id)} className="min-h-[44px] rounded-full border border-[#7A1F2B] px-5 text-[#7A1F2B]">{wish.has(p.id) ? '♥ Saved' : '♡ Wishlist'}</button>
        </div>
      </div>
    </div>
    {related.length > 0 && (
      <section className="mx-auto max-w-5xl px-4 pb-12" aria-label="Related products">
        <h2 className="text-2xl text-[#7A1F2B]">You might also like</h2>
        <div className="mt-4 grid grid-cols-2 gap-3 sm:gap-5 md:grid-cols-4">{related.map((r) => <ProductCard key={r.id} p={r} />)}</div>
      </section>)}
  </>);
}
