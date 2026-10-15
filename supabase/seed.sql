-- OPTIONAL seed (not a migration). Safe to re-run. Stock is intentionally 0: set real quantities in /admin
-- (Products -> stock) before customers can buy. No invented inventory.
insert into public.categories (id, name, slug, description, sort_order)
values ('c0000000-0000-4000-8000-000000000001', 'Keychain', 'keychain', 'Handmade seed-bead keychains.', 1)
on conflict (slug) do nothing;

insert into public.products (id, category_id, name, slug, short_description, description, price_paise, compare_at_price_paise, stock_quantity, image_url, badge, is_featured, is_active) values
 ('a0000000-0000-4000-8000-000000000001','c0000000-0000-4000-8000-000000000001','Spidey Swing Spider-Man Keychain','spidey-swing-spider-man-keychain','Your everyday superhero.','Your everyday superhero. Handmade bead by bead.',9900,14900,0,'/images/spidey.jpg','A Little Treat',true,true),
 ('a0000000-0000-4000-8000-000000000002','c0000000-0000-4000-8000-000000000001','Little Fox Bead Keychain','little-fox-bead-keychain','A tiny woodland companion.','A tiny woodland companion. Handmade bead by bead.',2900,6900,0,'/images/fox.jpg','A Little Treat',true,true),
 ('a0000000-0000-4000-8000-000000000003','c0000000-0000-4000-8000-000000000001','Cheeky Croc Bead Keychain','cheeky-croc-bead-keychain','A little green grin to go.','A little green grin to go. Handmade bead by bead.',6900,12900,0,'/images/croc.jpg','A Little Treat',true,true),
 ('a0000000-0000-4000-8000-000000000004','c0000000-0000-4000-8000-000000000001','Hello Kutti Keychain','hello-kutti-keychain','A tiny, cheerful keychain made to add a little happiness to your everyday.','A tiny, cheerful keychain made to add a little happiness to your everyday.',2000,6900,0,'/images/kutti.jpg','A Little Treat',true,true)
on conflict (slug) do nothing;

insert into public.store_settings (setting_key, setting_value) values
 ('announcement', '{"text": "A little handmade happiness, just for you ✧"}')
on conflict (setting_key) do nothing;
-- Shipping rule is NOT seeded (no invented rates). Add one when you decide, e.g.:
-- insert into public.store_settings (setting_key, setting_value) values ('shipping', '{"flat_fee_paise": 4900, "free_threshold_paise": 49900}');
