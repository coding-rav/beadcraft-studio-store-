-- 6/8  Row Level Security + least-privilege grants. Writes to orders/payments/stock happen only via the
-- server functions above; customers get read access to their own rows and nothing more.

alter table public.categories            enable row level security;
alter table public.products              enable row level security;
alter table public.product_images        enable row level security;
alter table public.store_settings         enable row level security;
alter table public.newsletter_subscribers enable row level security;
alter table public.profiles               enable row level security;
alter table public.user_roles             enable row level security;
alter table public.customer_addresses     enable row level security;
alter table public.cart_items             enable row level security;
alter table public.wishlists              enable row level security;
alter table public.orders                 enable row level security;
alter table public.order_items            enable row level security;
alter table public.payments               enable row level security;
alter table public.inventory_movements    enable row level security;
alter table public.shipments              enable row level security;
alter table public.refund_requests        enable row level security;
alter table public.razorpay_events        enable row level security;   -- no policies: service role only

-- Start from zero, then grant exactly what the app needs.
revoke all on all tables in schema public from anon, authenticated;

-- Public storefront (read only)
grant select on public.categories, public.products, public.product_images, public.store_settings to anon, authenticated;
grant insert on public.newsletter_subscribers to anon, authenticated;

-- Signed-in customers: read own records
grant select on public.orders, public.order_items, public.payments, public.shipments,
                public.refund_requests, public.user_roles, public.profiles to authenticated;
grant update (full_name, phone, avatar_url) on public.profiles to authenticated;
grant select, insert, update, delete on public.customer_addresses, public.cart_items, public.wishlists to authenticated;

-- Admin-only writes (RLS policies below require is_admin()). Stock is changed ONLY through admin_adjust_stock().
grant insert (category_id, name, slug, short_description, description, price_paise, compare_at_price_paise,
              sku, image_url, badge, is_featured, is_active) on public.products to authenticated;
grant update (category_id, name, slug, short_description, description, price_paise, compare_at_price_paise,
              sku, image_url, badge, is_featured, is_active) on public.products to authenticated;
grant delete on public.products to authenticated;
grant insert, update, delete on public.categories, public.product_images, public.store_settings to authenticated;
grant select, update on public.newsletter_subscribers to authenticated;
grant select on public.inventory_movements to authenticated;

-- Catalog
create policy categories_read   on public.categories for select to anon, authenticated using (is_active or public.is_admin());
create policy categories_write  on public.categories for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy products_read     on public.products for select to anon, authenticated using (is_active or public.is_admin());
create policy products_insert   on public.products for insert to authenticated with check (public.is_admin());
create policy products_update   on public.products for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy products_delete   on public.products for delete to authenticated using (public.is_admin());
create policy product_images_read  on public.product_images for select to anon, authenticated
  using (public.is_admin() or exists (select 1 from public.products p where p.id = product_id and p.is_active));
create policy product_images_write on public.product_images for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy settings_read     on public.store_settings for select to anon, authenticated using (true);   -- non-secret by design
create policy settings_write    on public.store_settings for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Newsletter: anyone may subscribe; only admins may read/manage the list
create policy newsletter_subscribe on public.newsletter_subscribers for insert to anon, authenticated
  with check (is_subscribed = true);
create policy newsletter_admin_read   on public.newsletter_subscribers for select to authenticated using (public.is_admin());
create policy newsletter_admin_update on public.newsletter_subscribers for update to authenticated using (public.is_admin()) with check (public.is_admin());

-- Accounts
create policy profiles_read   on public.profiles for select to authenticated using (id = auth.uid() or public.is_admin());
create policy profiles_update on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
create policy roles_read      on public.user_roles for select to authenticated using (user_id = auth.uid() or public.is_admin());
create policy addresses_own   on public.customer_addresses for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy cart_own        on public.cart_items for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy wishlist_own    on public.wishlists for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Orders (read only for customers; admins see all)
create policy orders_read on public.orders for select to authenticated using (user_id = auth.uid() or public.is_admin());
create policy order_items_read on public.order_items for select to authenticated
  using (public.is_admin() or exists (select 1 from public.orders o where o.id = order_id and o.user_id = auth.uid()));
create policy payments_read on public.payments for select to authenticated
  using (public.is_admin() or exists (select 1 from public.orders o where o.id = order_id and o.user_id = auth.uid()));
create policy shipments_read on public.shipments for select to authenticated
  using (public.is_admin() or exists (select 1 from public.orders o where o.id = order_id and o.user_id = auth.uid()));
create policy refunds_read on public.refund_requests for select to authenticated using (user_id = auth.uid() or public.is_admin());
create policy inventory_admin_read on public.inventory_movements for select to authenticated using (public.is_admin());
