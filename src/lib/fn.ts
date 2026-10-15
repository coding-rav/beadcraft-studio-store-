import { supabase } from '@/integrations/supabase/client';
/** Calls an Edge Function and returns the JSON body or a readable error (supabase-js hides the body of non-2xx replies). */
export async function callFn<T = any>(name: string, body: object): Promise<{ data: T | null; error: string | null }> {
  const { data, error } = await supabase.functions.invoke(name, { body });
  if (!error) return { data: data as T, error: null };
  try { const b = await (error as any).context.json(); return { data: b as T, error: b?.error ?? b?.message ?? 'Request failed.' }; }
  catch { return { data: null, error: 'Request failed. Please try again.' }; }
}
