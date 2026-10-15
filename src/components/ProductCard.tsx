import { Link } from 'react-router-dom';
import { Product, soldOut } from '@/lib/catalog';
import { inr } from '@/lib/ui';
import { useCart } from '@/hooks/useCart';
import { useWishlist } from '@/hooks/useWishlist';
import { useUI } from '@/contexts/UIContext';

export default function ProductCard({ p }: { p: Product }) {
  const cart = useCart(); const wish = useWishlist(); const ui = useUI();
  const out = soldOut(p); const on = wish.has(p.id);
  const save = p.compare_at_price_paise && p.compare_at_price_paise > p.price_paise
    ? Math.round(100 - (p.price_paise / p.compare_at_price_paise) * 100) : 0;
  return (
    <article className="flex min-w-0 flex-col overflow-hidden rounded-2xl border border-[#ecd9dc] bg-white shadow-sm">
      <div className="relative aspect-square bg-[#F5DADD]">
        <Link to={`/products/${p.slug}`} aria-label={`View ${p.name}`}>
          {p.image_url && <img src={p.image_url} alt={p.name} loading="lazy" className="h-full w-full object-cover" />}
        </Link>
        {p.badge && <span className="absolute left-2 top-2 rounded-full bg-white px-2.5 py-0.5 text-xs text-[#7A1F2B]">{p.badge}</span>}
        <button onClick={() => wish.toggle(p.id)} aria-pressed={on} aria-label={`${on ? 'Remove from' : 'Add to'} wishlist: ${p.name}`}
          className="absolute right-1 top-1 flex h-11 w-11 items-center justify-center rounded-full bg-white/90 text-lg text-[#7A1F2B]">{on ? '♥' : '♡'}</button>
      </div>
      <div className="flex flex-1 flex-col gap-1 p-3 sm:p-4">
        <small className="opacity-70">{p.category}</small>
        <h3 className="break-words text-base leading-snug text-[#7A1F2B] sm:text-lg"><Link to={`/products/${p.slug}`}>{p.name}</Link></h3>
        {p.short_description && <p className="break-words text-sm opacity-80">{p.short_description}</p>}
        <p className="mt-1 flex flex-wrap items-baseline gap-x-2">
          <b className="text-lg text-[#7A1F2B]">{inr(p.price_paise)}</b>
          {save > 0 && <><s className="text-sm opacity-60">{inr(p.compare_at_price_paise!)}</s><span className="text-xs text-green-800">Save {save}%</span></>}
        </p>
        <button disabled={out} onClick={async () => { await cart.add(p.id); ui.open('cart'); }}
          className="mt-auto min-h-[44px] rounded-full bg-[#7A1F2B] px-4 font-semibold text-[#FFFAF6] disabled:opacity-50">{out ? 'Sold out' : 'Add to cart'}</button>
        <Link to={`/products/${p.slug}`} className="min-h-[36px] pt-1 text-center text-sm underline">View product</Link>
      </div>
    </article>
  );
}
