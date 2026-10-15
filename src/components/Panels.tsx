import { FormEvent, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { MobileAccountLinks } from '@/components/AccountMenu';
import { useWishlist } from '@/hooks/useWishlist';
import { useCart } from '@/hooks/useCart';
import { useProducts, soldOut } from '@/lib/catalog';
import { useUI } from '@/contexts/UIContext';
import { inr } from '@/lib/ui';

export function WishlistPanel() {
  const wish = useWishlist(); const cart = useCart(); const { byId } = useProducts(); const ui = useUI();
  const items = wish.ids.map(byId).filter(Boolean) as NonNullable<ReturnType<typeof byId>>[];
  if (!items.length) return <p className="mt-4">Nothing saved yet. Tap the heart on a piece you love.</p>;
  return (
    <ul className="min-h-0 flex-1 divide-y divide-[#ecd9dc] overflow-y-auto">
      {items.map((p) => (
        <li key={p.id} className="flex items-center gap-3 py-3">
          {p.image_url && <img src={p.image_url} alt="" className="h-14 w-14 rounded-lg object-cover" />}
          <div className="min-w-0 flex-1"><p className="break-words font-medium">{p.name}</p><p className="text-sm">{inr(p.price_paise)}</p></div>
          <button disabled={soldOut(p)} onClick={async () => { await cart.add(p.id); ui.open('cart'); }} className="min-h-[44px] rounded-full bg-[#7A1F2B] px-4 text-sm text-white disabled:opacity-50">{soldOut(p) ? 'Sold out' : 'Add'}</button>
          <button aria-label={`Remove ${p.name}`} onClick={() => wish.toggle(p.id)} className="h-11 w-11">✕</button>
        </li>))}
    </ul>
  );
}

export function MobileMenuPanel() {
  const nav = useNavigate(); const [q, setQ] = useState('');
  const link = 'block min-h-[44px] border-b border-[#ecd9dc] p-3 text-lg';
  function search(e: FormEvent) { e.preventDefault(); nav(q.trim() ? `/?q=${encodeURIComponent(q.trim())}#shop` : '/#shop'); }
  return (
    <nav aria-label="Mobile" className="overflow-y-auto">
      <form onSubmit={search} role="search" className="mb-3"><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search pieces" aria-label="Search products" className="min-h-[44px] w-full rounded-full border border-[#ecd9dc] bg-white px-4" /></form>
      <Link className={link} to="/#shop">Shop all</Link>
      <Link className={link} to="/#shop">Keychain</Link>
      <Link className={link} to="/style-finder">Style finder</Link>
      <Link className={link} to="/our-story">Our story</Link>
      <div className="mt-3"><MobileAccountLinks /></div>
    </nav>
  );
}
