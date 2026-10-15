-- 7/8  Storage buckets (public-read images, admin-only writes). Create via SQL so it is reproducible.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('product-images',  'product-images',  true, 5242880, array['image/jpeg','image/png','image/webp']),
  ('category-images', 'category-images', true, 5242880, array['image/jpeg','image/png','image/webp']),
  ('site-assets',     'site-assets',     true, 5242880, array['image/jpeg','image/png','image/webp','image/svg+xml'])
on conflict (id) do nothing;

create policy "public read store images" on storage.objects for select to anon, authenticated
  using (bucket_id in ('product-images','category-images','site-assets'));
create policy "admin upload store images" on storage.objects for insert to authenticated
  with check (bucket_id in ('product-images','category-images','site-assets') and public.is_admin());
create policy "admin replace store images" on storage.objects for update to authenticated
  using (bucket_id in ('product-images','category-images','site-assets') and public.is_admin())
  with check (bucket_id in ('product-images','category-images','site-assets') and public.is_admin());
create policy "admin delete store images" on storage.objects for delete to authenticated
  using (bucket_id in ('product-images','category-images','site-assets') and public.is_admin());
