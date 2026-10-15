import { useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import Drawer from '@/components/Drawer';
import CartPanel from '@/components/CartPanel';
import { MobileMenuPanel, WishlistPanel } from '@/components/Panels';
import { useUI } from '@/contexts/UIContext';
import { configProblem, supabaseConfigured } from '@/integrations/supabase/client';

export default function Layout() {
  const ui = useUI(); const loc = useLocation();
  useEffect(() => { ui.close(); }, [loc.pathname, loc.search]);          // close drawers after navigation
  useEffect(() => {                                                      // /#shop style links
    if (loc.hash) setTimeout(() => document.getElementById(loc.hash.slice(1))?.scrollIntoView(), 0);
    else window.scrollTo(0, 0);
  }, [loc.pathname, loc.hash]);
  return (
    <div className="flex min-h-screen flex-col">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:bg-white focus:p-3">Skip to content</a>
      {!supabaseConfigured && import.meta.env.DEV && (
        <p role="status" className="bg-[#EBD3D8] px-4 py-2 text-center text-xs">
          Development: {configProblem()} Sample products are shown; sign-in and checkout are unavailable.
        </p>)}
      <Header />
      <main id="main" className="flex-1">
        {!supabaseConfigured && !import.meta.env.DEV ? (
          <div className="mx-auto max-w-xl px-4 py-20 text-center">
            <h1 className="text-3xl text-[#7A1F2B]">We’ll be right back</h1>
            <p className="mt-3">The store is being set up and can’t take orders right now. Please check back soon.</p>
          </div>) : <Outlet />}
      </main>
      <Footer />
      <Drawer open={ui.panel === 'cart'} onClose={ui.close} title="Your cart"><CartPanel /></Drawer>
      <Drawer open={ui.panel === 'wishlist'} onClose={ui.close} title="Your wishlist"><WishlistPanel /></Drawer>
      <Drawer open={ui.panel === 'menu'} onClose={ui.close} title="Menu" side="left"><MobileMenuPanel /></Drawer>
    </div>
  );
}
