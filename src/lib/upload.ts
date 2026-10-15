import { supabase } from '@/integrations/supabase/client';

import { IMAGE_TYPES, validateImage } from '@/lib/imageRules';
export { IMAGE_TYPES, validateImage };

/** Uploads to a public bucket under a random, safe filename. Admin-only by storage policy. */
export async function uploadImage(bucket: 'product-images' | 'category-images' | 'site-assets', file: File): Promise<{ url: string; path: string } | { error: string }> {
  const bad = validateImage(file); if (bad) return { error: bad };
  const path = `${crypto.randomUUID()}.${IMAGE_TYPES[file.type]}`;
  const { error } = await supabase.storage.from(bucket).upload(path, file, { contentType: file.type, upsert: false, cacheControl: '31536000' });
  if (error) {
    if (/bucket not found/i.test(error.message)) return { error: `The "${bucket}" storage bucket is missing. Apply migration 7 or create it in Supabase → Storage (see README).` };
    if (/row-level security|not allowed|unauthorized/i.test(error.message)) return { error: 'Only admins can upload images.' };
    return { error: 'Upload failed. Please try again.' };
  }
  return { url: supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl, path };
}
