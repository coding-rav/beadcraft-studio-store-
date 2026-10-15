import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';

// Put this in the header next to the cart. The cart itself never requires sign-in;
// only the /checkout route does (see RequireAuth).
export default function AccountMenu() {
  const { user, loading, signOut } = useAuth(); const nav = useNavigate();
  if (loading) return null;
  if (!user) return <Link to="/login" className="inline-flex min-h-[44px] items-center px-3 underline">Sign in</Link>;
  return (
    <details className="relative">
      <summary className="flex min-h-[44px] cursor-pointer list-none items-center px-3">Account</summary>
      <div className="absolute right-0 z-30 mt-1 w-44 rounded-xl border border-[#e9dfe3] bg-white p-2 shadow">
        <Link to="/account" className="block min-h-[44px] p-3">My account</Link>
        <button className="block min-h-[44px] w-full p-3 text-left" onClick={async () => { await signOut(); nav('/', { replace: true }); }}>Sign out</button>
      </div>
    </details>);
}
// Cart drawer "Checkout" button: <Link to="/checkout">Checkout</Link> — RequireAuth does the redirect,
// remembers /checkout, and the guest cart is merged into the saved cart after login (useCart).

// Put these inside your mobile menu / drawer so Account is reachable on phones
// (the header icon row is often too crowded to hold it). Pass onNavigate to close the menu.
export function MobileAccountLinks({ onNavigate }: { onNavigate?: () => void }) {
  const { user, loading, signOut } = useAuth(); const nav = useNavigate();
  if (loading) return null;
  const cls = 'block min-h-[44px] p-3 text-lg';
  return user ? (<>
    <Link to="/account" className={cls} onClick={onNavigate}>My account</Link>
    <button className={`${cls} w-full text-left`} onClick={async () => { await signOut(); onNavigate?.(); nav('/', { replace: true }); }}>Sign out</button>
  </>) : (<>
    <Link to="/login" className={cls} onClick={onNavigate}>Sign in</Link>
    <Link to="/signup" className={cls} onClick={onNavigate}>Create account</Link>
  </>);
}
