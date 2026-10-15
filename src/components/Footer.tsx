import { Link } from 'react-router-dom';

const link = 'block min-h-[32px] py-1 opacity-90 hover:underline';
export default function Footer() {
  return (
    <footer className="mt-16 bg-[#7A1F2B] pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-12 text-sm text-[#FFFAF6]">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="min-w-0"><h3 className="mb-2 text-lg">Beadcraft Studio</h3><p>Small Beads. Big Vibes. Little things. A whole lot of heart.</p></div>
        <div><h3 className="mb-2 text-base">The Collection</h3>
          <Link className={link} to="/#shop">Shop all</Link><Link className={link} to="/#shop">Keychain</Link><Link className={link} to="/style-finder">Style finder</Link></div>
        <div><h3 className="mb-2 text-base">Good to Know</h3>
          <Link className={link} to="/our-story">Our story</Link><Link className={link} to="/jewelry-care">Jewelry care</Link>
          <Link className={link} to="/shipping-returns">Shipping &amp; returns</Link><Link className={link} to="/contact">Contact us</Link></div>
        <div><h3 className="mb-2 text-base">Your Little Corner</h3>
          <Link className={link} to="/account">My account</Link><Link className={link} to="/#shop">Your wishlist</Link><Link className={link} to="/privacy">Privacy policy</Link><Link className={link} to="/terms">Terms &amp; conditions</Link></div>
      </div>
      <p className="mx-auto mt-8 max-w-6xl px-4 opacity-80">Made with love, bead by bead. © 2026 Beadcraft Studio. Thoughtfully made. Joyfully worn.</p>
    </footer>
  );
}
