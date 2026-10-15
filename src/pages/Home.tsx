import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { usePageMeta } from '@/lib/seo';
import { rupeesToPaise } from '@/lib/money';
import ProductCard from '@/components/ProductCard';
import Newsletter from '@/components/Newsletter';
import { useProducts } from '@/lib/catalog';

const VALUES = ['Thoughtfully handmade', 'Uniquely you', 'Little gifts, big smiles', 'Made for everyday joy'];
const btn = 'inline-flex min-h-[44px] items-center justify-center rounded-full px-6 font-semibold';

export default function Home() {
  const { products, loading, error, source } = useProducts();
  const [sp] = useSearchParams(); const q = (sp.get('q') ?? '').trim().toLowerCase();
  usePageMeta('Beadcraft Studio — Small Beads. Big Vibes.', 'Handmade seed-bead keychains. Colorful little things, made to make your day.');
  const [cat, setCat] = useState(''); const [sort, setSort] = useState('featured'); const [maxRupees, setMaxRupees] = useState(''); const [shown, setShown] = useState(12);
  const categories = useMemo(() => [...new Set(products.map((p) => p.category))], [products]);
  const list = useMemo(() => {
    const max = rupeesToPaise(maxRupees);
    let l = products.filter((p) => (!q || `${p.name} ${p.short_description ?? ''} ${p.category}`.toLowerCase().includes(q)) && (!cat || p.category === cat) && (max === null || !maxRupees || p.price_paise <= max));
    if (sort === 'price-asc') l = [...l].sort((a, b) => a.price_paise - b.price_paise);
    else if (sort === 'price-desc') l = [...l].sort((a, b) => b.price_paise - a.price_paise);
    else if (sort === 'name') l = [...l].sort((a, b) => a.name.localeCompare(b.name));
    else l = [...l].sort((a, b) => Number(b.is_featured) - Number(a.is_featured));
    return l;
  }, [products, q, cat, sort, maxRupees]);
  return (
    <>
      <section className="bg-gradient-to-br from-[#F5DADD] to-[#EBD3D8] py-[clamp(2rem,8vw,4.5rem)]">
        <div className="mx-auto grid max-w-6xl items-center gap-8 px-4 md:grid-cols-[1.1fr_.9fr]">
          <div className="min-w-0">
            <p className="text-xs tracking-wider text-[#7A1F2B]">BEADCRAFT STUDIO · HANDMADE WITH HEART</p>
            <h1 className="mt-2 text-[clamp(2.4rem,6vw,4.25rem)] leading-tight text-[#7A1F2B]">Small Beads. Big Vibes.</h1>
            <p className="mt-4 max-w-md text-lg">Colorful little things, made to make your day. Find a piece that feels like you.</p>
            <p className="mt-5"><Link to="/#shop" className={`${btn} bg-[#7A1F2B] text-[#FFFAF6]`}>Shop keychains</Link></p>
            <p className="mt-4 text-sm tracking-wide text-[#7A1F2B]">A little color. A little magic. All you.</p>
          </div>
          <div className="grid grid-cols-3 gap-2 sm:gap-3" aria-hidden="true">
            {products.slice(0, 3).map((p, i) => (
              <div key={p.id} className={`rounded-2xl bg-white p-1.5 shadow sm:p-2 ${i === 1 ? 'md:translate-y-5' : ''}`}>
                {p.image_url && <img src={p.image_url} alt="" className="aspect-square w-full rounded-xl object-cover" />}
              </div>))}
          </div>
        </div>
      </section>

      <ul className="mx-auto grid max-w-6xl grid-cols-2 gap-3 px-4 py-7 text-center font-medium text-[#7A1F2B] md:grid-cols-4">
        {VALUES.map((v) => <li key={v}>{v}</li>)}
      </ul>

      <section id="shop" className="mx-auto max-w-6xl px-4 py-10">
        <h2 className="text-3xl text-[#7A1F2B]">{q ? `Results for “${sp.get('q')}”` : 'Meet your new favorites'}</h2>
        {source === 'sample' && <p className="mt-2 text-xs opacity-70">Showing sample products. Connect Supabase to load your live catalog.</p>}
        {error && <p role="alert" className="mt-3 text-red-700">{error}</p>}
        <div className="mt-4 flex flex-wrap items-end gap-3 text-sm">
          <label className="flex flex-col gap-1">Category
            <select value={cat} onChange={(e) => { setCat(e.target.value); setShown(12); }} className="min-h-[44px] rounded-xl border border-[#ecd9dc] bg-white px-3">
              <option value="">All</option>{categories.map((c) => <option key={c} value={c}>{c}</option>)}</select></label>
          <label className="flex flex-col gap-1">Sort by
            <select value={sort} onChange={(e) => setSort(e.target.value)} className="min-h-[44px] rounded-xl border border-[#ecd9dc] bg-white px-3">
              <option value="featured">Featured</option><option value="price-asc">Price: low to high</option><option value="price-desc">Price: high to low</option><option value="name">Name</option></select></label>
          <label className="flex flex-col gap-1">Max price (₹)
            <input value={maxRupees} onChange={(e) => { setMaxRupees(e.target.value); setShown(12); }} inputMode="decimal" placeholder="e.g. 100" className="min-h-[44px] w-32 rounded-xl border border-[#ecd9dc] bg-white px-3" /></label>
        </div>
        {loading ? <p className="mt-6">Loading…</p> : !list.length ? (
          <p className="mt-6">{q || cat || maxRupees ? 'No pieces match those filters. Try changing them.' : 'No products are available yet.'}</p>
        ) : (<>
          <div className="mt-6 grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-3 xl:grid-cols-4">{list.slice(0, shown).map((p) => <ProductCard key={p.id} p={p} />)}</div>
          {list.length > shown && <p className="mt-6 text-center"><button onClick={() => setShown(shown + 12)} className="min-h-[44px] rounded-full border-2 border-[#7A1F2B] px-6 font-semibold text-[#7A1F2B]">Load more</button></p>}
        </>)}
      </section>

      <section id="style" className="mx-auto max-w-6xl px-4 py-10">
        <h2 className="text-3xl text-[#7A1F2B]">Collections</h2>
        <div className="mt-5 grid gap-4 sm:grid-cols-3">
          {products.slice(0, 3).map((p) => (
            <Link key={p.id} to={`/products/${p.slug}`} className="rounded-2xl bg-[#EBD3D8] p-5">
              <h3 className="text-xl text-[#7A1F2B]">{p.name.split(' ').slice(0, 2).join(' ')}</h3><p>{p.short_description}</p>
            </Link>))}
        </div>
        <p className="mt-6 flex flex-wrap gap-3">
          <Link to="/#shop" className={`${btn} bg-[#7A1F2B] text-[#FFFAF6]`}>Shop all pieces</Link>
          <Link to="/style-finder" className={`${btn} border-2 border-[#7A1F2B] text-[#7A1F2B]`}>Find your style</Link>
        </p>
      </section>

      <section id="story" className="mx-auto max-w-6xl px-4 py-10">
        <div className="rounded-3xl bg-[#EADDD2] px-5 py-10 text-center sm:px-12">
          <h2 className="text-3xl text-[#7A1F2B]">Little things. A whole lot of heart.</h2>
          <p className="mx-auto mt-4 max-w-xl">We believe the smallest things can bring the biggest joy. A pop of color. A thoughtful gift. A piece that feels unmistakably you. That’s the spirit of Beadcraft Studio — thoughtfully made, bead by bead.</p>
          <p className="mt-5"><Link to="/our-story" className={`${btn} bg-[#7A1F2B] text-[#FFFAF6]`}>Come meet the studio</Link></p>
        </div>
      </section>
      <Newsletter />
    </>
  );
}
