import { Link } from 'react-router-dom';
import { useCart } from '@/hooks/useCart';
import { useProducts, soldOut } from '@/lib/catalog';
import { inr } from '@/lib/ui';

export default function CartPanel() {
  const cart = useCart(); const { byId } = useProducts();
  const rows = cart.lines.map((l) => ({ ...l, p: byId(l.product_id) }));
  const sub = rows.reduce((a, r) => a + (r.p ? r.p.price_paise * r.quantity : 0), 0);
  const blocked = rows.some((r) => !r.p || soldOut(r.p));
  if (!rows.length) return <p className="mt-4">Your cart is empty. Pick a little favorite from the shop.</p>;
  return (
    <>
      <ul className="min-h-0 flex-1 divide-y divide-[#ecd9dc] overflow-y-auto">
        {rows.map((r) => (
          <li key={r.product_id} className="flex items-center gap-3 py-3">
            {r.p?.image_url && <img src={r.p.image_url} alt="" className="h-14 w-14 rounded-lg object-cover" />}
            <div className="min-w-0 flex-1">
              <p className="break-words font-medium">{r.p?.name ?? 'No longer available'}</p>
              <p className="text-sm">{r.p ? inr(r.p.price_paise) : ''}{r.p && soldOut(r.p) ? ' · sold out' : ''}</p>
            </div>
            <div className="flex items-center gap-1 whitespace-nowrap">
              <button aria-label="Fewer" className="h-9 w-9 rounded-full border border-[#ecd9dc]" onClick={() => cart.setQty(r.product_id, r.quantity - 1)}>−</button>
              <span aria-live="polite" className="w-5 text-center">{r.quantity}</span>
              <button aria-label="More" className="h-9 w-9 rounded-full border border-[#ecd9dc]" onClick={() => cart.setQty(r.product_id, r.quantity + 1)}>+</button>
            </div>
          </li>))}
      </ul>
      <div className="border-t border-[#ecd9dc] pt-3">
        <p className="flex justify-between"><span>Subtotal</span><b>{inr(sub)}</b></p>
        <p className="text-xs opacity-70">Shipping and the final total are confirmed at checkout.</p>
        {blocked && <p role="alert" className="mt-1 text-xs text-red-700">Remove unavailable items to continue.</p>}
        <Link to="/checkout" aria-disabled={blocked} onClick={(e) => { if (blocked) e.preventDefault(); }}
          className={`mt-3 flex min-h-[44px] items-center justify-center rounded-full bg-[#7A1F2B] font-semibold text-[#FFFAF6] ${blocked ? 'opacity-50' : ''}`}>Checkout</Link>
      </div>
    </>
  );
}
