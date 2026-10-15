import { FormEvent, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import AccountMenu from '@/components/AccountMenu';
import { useCart } from '@/hooks/useCart';
import { useWishlist } from '@/hooks/useWishlist';
import { useUI } from '@/contexts/UIContext';
import { supabase, supabaseConfigured } from '@/integrations/supabase/client';

const DEFAULT_ANNOUNCEMENT = 'A little handmade happiness, just for you ✧';
const icon = 'relative inline-flex h-11 w-11 items-center justify-center rounded-full border border-[#ecd9dc] text-[#7A1F2B] hover:bg-[#F5DADD]';
const Count = ({ n }: { n: number }) => <span className="absolute -right-1 -top-1 min-w-[18px] rounded-full bg-[#7A1F2B] px-1 text-center text-[11px] font-semibold leading-[18px] text-white">{n}</span>;

export default function Header() {
  const cart = useCart(); const wish = useWishlist(); const ui = useUI(); const nav = useNavigate();
  const [searchOpen, setSearchOpen] = useState(false); const [q, setQ] = useState('');
  const [announcement, setAnnouncement] = useState(DEFAULT_ANNOUNCEMENT);

  useEffect(() => {
    if (!supabaseConfigured) return;
    supabase.from('store_settings').select('setting_value').eq('setting_key', 'announcement').maybeSingle()
      .then(({ data }: any) => { const t = data?.setting_value?.text; if (typeof t === 'string' && t.trim()) setAnnouncement(t); });
  }, []);

  function search(e: FormEvent) {
    e.preventDefault();
    nav(q.trim() ? `/?q=${encodeURIComponent(q.trim())}#shop` : '/#shop');
    setSearchOpen(false);
  }
  return (
    <header className="sticky top-0 z-20 border-b border-[#ecd9dc] bg-[#FFFAF6]/95 pt-[env(safe-area-inset-top)] backdrop-blur">
      <div className="bg-[#7A1F2B] px-3 py-2 text-center text-sm text-[#FFFAF6]">{announcement}</div>
      <div className="mx-auto flex max-w-6xl items-center gap-2 px-3 py-2 sm:px-4">
        <button className={`${icon} md:hidden`} aria-label="Open menu" aria-haspopup="dialog" onClick={() => ui.open('menu')}>☰</button>
        <Link to="/" className="min-w-0 flex-1 leading-tight md:flex-none">
          <span className="block font-serif text-lg font-semibold text-[#7A1F2B] sm:text-2xl">Beadcraft Studio</span>
          <span className="hidden text-[11px] opacity-70 sm:block">Small Beads. Big Vibes.</span>
        </Link>
        <nav aria-label="Main" className="ml-6 hidden gap-6 text-[15px] md:flex">
          <Link className="hover:underline" to="/#shop">Shop all</Link>
          <Link className="hover:underline" to="/#shop">Keychain</Link>
          <Link className="hover:underline" to="/style-finder">Style finder</Link>
          <Link className="hover:underline" to="/our-story">Our story</Link>
        </nav>
        <div className="hidden flex-1 md:block" />
        <button className={`${icon} hidden md:inline-flex`} aria-label="Search" aria-expanded={searchOpen} onClick={() => setSearchOpen(!searchOpen)}>⌕</button>
        <div className="hidden md:block"><AccountMenu /></div>
        <Link to="/account" className={`${icon} md:hidden`} aria-label="Account">👤</Link>
        <button className={icon} aria-label="Wishlist" onClick={() => ui.open('wishlist')}>♡<Count n={wish.ids.length} /></button>
        <button className={icon} aria-label="Cart" onClick={() => ui.open('cart')}>🛍<Count n={cart.count} /></button>
      </div>
      {searchOpen && (
        <form onSubmit={search} className="mx-auto hidden max-w-6xl px-4 pb-3 md:block" role="search">
          <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search products" placeholder="Search pieces"
            className="min-h-[44px] w-full max-w-md rounded-full border border-[#ecd9dc] bg-white px-4" />
        </form>)}
    </header>
  );
}
