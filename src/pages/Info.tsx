import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { supabase, supabaseConfigured } from '@/integrations/supabase/client';
import { usePageMeta } from '@/lib/seo';

const PENDING = 'The studio will publish these details here soon. Until then, please contact us before ordering if you have questions.';
const PAGES: Record<string, { title: string; body: string[] }> = {
  'our-story': { title: 'Our story', body: [
    'We believe the smallest things can bring the biggest joy. A pop of color. A thoughtful gift. A piece that feels unmistakably you.',
    'That’s the spirit of Beadcraft Studio — thoughtfully made, bead by bead.'] },
  'style-finder': { title: 'Style finder', body: ['The style finder is coming soon. For now, browse the whole collection in the shop.'] },
  'jewelry-care': { title: 'Jewelry care', body: [PENDING] },
  'shipping-returns': { title: 'Shipping & returns', body: [PENDING] },
  contact: { title: 'Contact us', body: [PENDING] },
  privacy: { title: 'Privacy policy', body: [PENDING] },
  terms: { title: 'Terms & conditions', body: [PENDING] },
};
export const INFO_PATHS = Object.keys(PAGES);

export default function Info() {
  const key = useLocation().pathname.replace(/^\//, '');
  const page = PAGES[key];
  const [cfg, setCfg] = useState<{ policies?: Record<string, string>; profile?: Record<string, string> }>({});
  useEffect(() => {
    if (!supabaseConfigured) return;
    supabase.from('store_settings').select('setting_key,setting_value').in('setting_key', ['policies', 'store_profile']).then(({ data }: any) =>
      setCfg({ policies: data?.find((r: any) => r.setting_key === 'policies')?.setting_value, profile: data?.find((r: any) => r.setting_key === 'store_profile')?.setting_value }));
  }, []);
  usePageMeta(page ? `${page.title} — Beadcraft Studio` : 'Beadcraft Studio');
  if (!page) return null;
  return (
    <article className="mx-auto max-w-2xl px-4 py-14">
      <h1 className="text-3xl text-[#7A1F2B]">{page.title}</h1>
      {(() => {
        const owner = key === 'shipping-returns' ? [cfg.policies?.shipping, cfg.policies?.returns, cfg.policies?.cancellation]
          : key === 'jewelry-care' ? [cfg.policies?.care] : key === 'privacy' ? [cfg.policies?.privacy] : key === 'terms' ? [cfg.policies?.terms] : [];
        const text = owner.filter(Boolean) as string[];
        const body = text.length ? text : page.body;
        return <>{body.map((t) => <p key={t} className="mt-4 whitespace-pre-line">{t}</p>)}
          {key === 'contact' && (cfg.profile?.contact_email || cfg.profile?.support_phone) && <p className="mt-4">{cfg.profile?.contact_email}{cfg.profile?.contact_email && cfg.profile?.support_phone ? ' · ' : ''}{cfg.profile?.support_phone}</p>}</>;
      })()}
      <Link to="/#shop" className="mt-8 inline-flex min-h-[44px] items-center rounded-full bg-[#7A1F2B] px-6 text-[#FFFAF6]">Shop all pieces</Link>
    </article>
  );
}
