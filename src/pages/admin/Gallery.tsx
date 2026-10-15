import { ChangeEvent, useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { uploadImage } from '@/lib/upload';
import { smallBtn } from './shared';

/** Extra product images: upload, reorder, delete. Only objects uploaded through this screen (path stored) are removed from Storage. */
export default function Gallery({ productId, onMsg }: { productId: string; onMsg: (m: string) => void }) {
  const [imgs, setImgs] = useState<any[]>([]); const [busy, setBusy] = useState(false);
  const load = useCallback(async () => { const { data } = await supabase.from('product_images').select('*').eq('product_id', productId).order('sort_order'); setImgs(data ?? []); }, [productId]);
  useEffect(() => { load(); }, [load]);
  async function add(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]; if (!f) return; setBusy(true); onMsg('Uploading…');
    const r = await uploadImage('product-images', f); setBusy(false); if ('error' in r) return onMsg(r.error);
    const { error } = await supabase.from('product_images').insert({ product_id: productId, image_url: r.url, storage_path: r.path, alt_text: null, sort_order: imgs.length });
    onMsg(error ? 'Could not save the image record.' : 'Image added.'); load(); e.target.value = '';
  }
  async function move(i: number, dir: -1 | 1) {
    const a = imgs[i], b = imgs[i + dir]; if (!a || !b) return;
    await Promise.all([supabase.from('product_images').update({ sort_order: b.sort_order }).eq('id', a.id), supabase.from('product_images').update({ sort_order: a.sort_order }).eq('id', b.id)]); load();
  }
  async function remove(im: any) {
    if (!window.confirm('Remove this image?')) return;
    const { error } = await supabase.from('product_images').delete().eq('id', im.id); if (error) return onMsg('Could not remove the image.');
    if (im.storage_path) await supabase.storage.from('product-images').remove([im.storage_path]);
    load();
  }
  async function alt(im: any) { const t = window.prompt('Alt text (describe the image)', im.alt_text ?? ''); if (t === null) return; await supabase.from('product_images').update({ alt_text: t.slice(0, 200) }).eq('id', im.id); load(); }
  return (
    <div>
      <p className="text-sm font-medium">More images</p>
      <div className="mt-2 flex flex-wrap gap-3">
        {imgs.map((im, i) => (
          <div key={im.id} className="w-28 text-center text-xs">
            <img src={im.image_url} alt={im.alt_text ?? ''} className="h-24 w-24 rounded-xl object-cover" />
            <div className="mt-1 flex justify-center gap-1"><button type="button" className={smallBtn} disabled={i === 0} onClick={() => move(i, -1)} aria-label="Move earlier">←</button><button type="button" className={smallBtn} disabled={i === imgs.length - 1} onClick={() => move(i, 1)} aria-label="Move later">→</button></div>
            <div className="mt-1 flex justify-center gap-1"><button type="button" className={smallBtn} onClick={() => alt(im)}>Alt</button><button type="button" className={smallBtn} onClick={() => remove(im)}>Delete</button></div>
          </div>))}
      </div>
      <label className="mt-2 block text-sm">Add image (JPG, PNG or WebP, up to 5 MB) <input type="file" accept="image/jpeg,image/png,image/webp" onChange={add} disabled={busy} /></label>
    </div>);
}
