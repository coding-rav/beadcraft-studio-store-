export const IMAGE_TYPES: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
/** Client-side checks (the buckets enforce the same limits server-side). */
export function validateImage(file: { type: string; size: number }): string | null {
  if (!IMAGE_TYPES[file.type]) return 'Use a JPG, PNG or WebP image.';
  if (file.size <= 0) return 'That file is empty.';
  if (file.size > MAX_IMAGE_BYTES) return 'The image must be 5 MB or smaller.';
  return null;
}
