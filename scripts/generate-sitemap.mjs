// Runs before `vite build`. Writes public/sitemap.xml from VITE_SITE_URL; product URLs are dynamic and not listed.
import { writeFileSync } from 'node:fs';
const site = (process.env.VITE_SITE_URL || '').replace(/\/+$/, '');
if (!/^https:\/\//.test(site)) { console.warn('[sitemap] VITE_SITE_URL is not an https URL; sitemap.xml not generated.'); process.exit(0); }
const paths = ['/', '/our-story', '/style-finder', '/jewelry-care', '/shipping-returns', '/contact', '/privacy', '/terms'];
const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${paths.map((p) => `  <url><loc>${site}${p}</loc></url>`).join('\n')}\n</urlset>\n`;
writeFileSync('public/sitemap.xml', xml);
console.log('[sitemap] wrote public/sitemap.xml');
