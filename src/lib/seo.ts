import { useEffect } from 'react';

/** Sets the document title, meta description and optional JSON-LD for the current page. */
export function usePageMeta(title: string, description?: string, jsonLd?: object) {
  useEffect(() => {
    document.title = title;
    const set = (sel: string, make: () => HTMLElement, attr: string, val: string) => {
      let el = document.head.querySelector<HTMLElement>(sel);
      if (!el) { el = make(); document.head.appendChild(el); }
      el.setAttribute(attr, val);
    };
    if (description) {
      set('meta[name="description"]', () => Object.assign(document.createElement('meta'), { name: 'description' }), 'content', description);
      set('meta[property="og:description"]', () => { const m = document.createElement('meta'); m.setAttribute('property', 'og:description'); return m; }, 'content', description);
    }
    set('meta[property="og:title"]', () => { const m = document.createElement('meta'); m.setAttribute('property', 'og:title'); return m; }, 'content', title);
    let ld: HTMLScriptElement | null = null;
    if (jsonLd) { ld = document.createElement('script'); ld.type = 'application/ld+json'; ld.text = JSON.stringify(jsonLd); document.head.appendChild(ld); }
    return () => { ld?.remove(); };
  }, [title, description, jsonLd ? JSON.stringify(jsonLd) : '']);
}
