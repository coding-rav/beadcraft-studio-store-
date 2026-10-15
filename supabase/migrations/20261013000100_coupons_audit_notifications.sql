-- 9/9  Coupons (server-validated, concurrency-safe), audit log, refund review, email log.
-- Replaces create_checkout_order() with a version that takes an optional coupon, and release_order() so a
-- released/expired order frees its coupon use. No tables are dropped; no data is deleted.

-- ---------- Coupons ----------
create table public.coupons (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[A-Z0-9_-]{3,32}$'),
  description text,
  discount_type text not null check (discount_type in ('percent', 'fixed')),
  discount_value bigint not null check (discount_value > 0),   -- percent: 1..100 ; fixed: paise
  min_order_paise bigint not null default 0 check (min_order_paise >= 0),
  max_discount_paise bigint check (max_discount_paise is null or max_discount_paise > 0), -- cap for percent coupons
  starts_at timestamptz,
  expires_at timestamptz,
  usage_limit integer check (usage_limit is null or usage_limit > 0),         -- total redemptions
  per_user_limit integer check (per_user_limit is null or per_user_limit > 0),-- redemptions per customer
  times_redeemed integer not null default 0 check (times_redeemed >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (discount_type <> 'percent' or discount_value <= 100),
  check (expires_at is null or starts_at is null or expires_at > starts_at)
);
create table public.coupon_redemptions (
  id uuid primary key default gen_random_uuid(),
  coupon_id uuid not null references public.coupons(id) on delete restrict,
  user_id uuid not null references auth.users(id) on delete restrict,
  order_id uuid not null unique references public.orders(id) on delete cascade,
  amount_paise bigint not null check (amount_paise >= 0),
  created_at timestamptz not null default now()
);
create index coupon_redemptions_user_idx on public.coupon_redemptions(coupon_id, user_id);
alter table public.orders add column coupon_code text;
create trigger coupons_updated before update on public.coupons for each row execute function public.set_updated_at();

-- Returns an error code, or NULL when the coupon may be used by this customer for this subtotal.
create or replace function public.coupon_problem(cp public.coupons, p_sub bigint, p_user uuid)
returns text language plpgsql stable set search_path = public as $$
declare v_used integer;
begin
  if not cp.is_active then return 'COUPON_INVALID'; end if;
  if cp.starts_at is not null and now() < cp.starts_at then return 'COUPON_NOT_STARTED'; end if;
  if cp.expires_at is not null and now() > cp.expires_at then return 'COUPON_EXPIRED'; end if;
  if p_sub < cp.min_order_paise then return 'COUPON_MIN_ORDER'; end if;
  if cp.usage_limit is not null and cp.times_redeemed >= cp.usage_limit then return 'COUPON_EXHAUSTED'; end if;
  select count(*) into v_used from coupon_redemptions where coupon_id = cp.id and user_id = p_user;
  if cp.per_user_limit is not null and v_used >= cp.per_user_limit then return 'COUPON_USED'; end if;
  return null;
end $$;

-- Integer paise. Percentage discounts are ROUNDED DOWN to the paisa; capped by max_discount_paise; never above the subtotal.
create or replace function public.coupon_discount(cp public.coupons, p_sub bigint)
returns bigint language plpgsql immutable set search_path = public as $$
declare v bigint;
begin
  if cp.discount_type = 'percent' then
    v := (p_sub * cp.discount_value) / 100;
    if cp.max_discount_paise is not null then v := least(v, cp.max_discount_paise); end if;
  else
    v := cp.discount_value;
  end if;
  return greatest(0, least(v, p_sub));
end $$;

-- Display-only preview for the checkout page. The real check + redemption happens inside create_checkout_order().
create or replace function public.preview_coupon(p_code text, p_subtotal bigint)
returns jsonb language plpgsql security definer set search_path = public as $$
declare cp public.coupons; v_err text;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  select * into cp from coupons where code = upper(trim(p_code));
  if not found then return jsonb_build_object('valid', false, 'message', 'That coupon code isn''t valid.'); end if;
  v_err := coupon_problem(cp, greatest(p_subtotal, 0), auth.uid());
  if v_err is not null then
    return jsonb_build_object('valid', false, 'message', case v_err
      when 'COUPON_NOT_STARTED' then 'That coupon isn''t active yet.'
      when 'COUPON_EXPIRED'     then 'That coupon has expired.'
      when 'COUPON_MIN_ORDER'   then 'Your order is below the minimum for this coupon.'
      when 'COUPON_EXHAUSTED'   then 'That coupon has been fully redeemed.'
      when 'COUPON_USED'        then 'You have already used this coupon.'
      else 'That coupon code isn''t valid.' end);
  end if;
  return jsonb_build_object('valid', true, 'discount_paise', coupon_discount(cp, greatest(p_subtotal, 0)), 'code', cp.code);
end $$;

-- ---------- Order creation v2 (adds coupon) ----------
drop function if exists public.create_checkout_order(uuid, text, text, text, jsonb, jsonb, text);
create or replace function public.create_checkout_order(
  p_user uuid, p_name text, p_email text, p_phone text,
  p_address jsonb, p_items jsonb, p_idem text, p_coupon text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  o public.orders; pr public.products; r record; cp public.coupons;
  v_sub bigint := 0; v_ship bigint := 0; v_disc bigint := 0; v_set jsonb; v_err text;
  v_id uuid := gen_random_uuid(); v_num text;
begin
  if p_user is null then raise exception 'AUTH_REQUIRED'; end if;

  select * into o from orders where user_id = p_user and idempotency_key = p_idem;
  if found then
    if o.order_status <> 'pending' or o.payment_status not in ('pending','failed') then raise exception 'ORDER_CLOSED'; end if;
    return jsonb_build_object('order_id', o.id, 'order_number', o.order_number,
      'total_paise', o.total_paise, 'razorpay_order_id', o.razorpay_order_id);
  end if;

  for r in select (e->>'product_id')::uuid as pid, sum((e->>'quantity')::int)::int as qty
           from jsonb_array_elements(p_items) e group by 1 order by 1 loop
    if r.qty < 1 or r.qty > 20 then raise exception 'BAD_QUANTITY'; end if;
    select * into pr from products where id = r.pid for update;
    if not found or not pr.is_active then raise exception 'PRODUCT_UNAVAILABLE'; end if;
    if pr.stock_quantity < r.qty then raise exception 'OUT_OF_STOCK: %', pr.name; end if;
    v_sub := v_sub + pr.price_paise * r.qty;
  end loop;

  -- Coupon: row-locked so two checkouts cannot both take the last redemption.
  if p_coupon is not null and btrim(p_coupon) <> '' then
    select * into cp from coupons where code = upper(btrim(p_coupon)) for update;
    if not found then raise exception 'COUPON_INVALID'; end if;
    v_err := coupon_problem(cp, v_sub, p_user);
    if v_err is not null then raise exception '%', v_err; end if;
    v_disc := coupon_discount(cp, v_sub);
  end if;

  -- Shipping uses the subtotal BEFORE the coupon discount.
  select setting_value into v_set from store_settings where setting_key = 'shipping';
  v_ship := coalesce((v_set->>'flat_fee_paise')::bigint, 0);
  if v_set ? 'free_threshold_paise' and v_sub >= (v_set->>'free_threshold_paise')::bigint then v_ship := 0; end if;

  v_num := 'BC-' || to_char(now(), 'YYMMDD') || '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));
  insert into orders (id, order_number, user_id, customer_name, customer_email, customer_phone,
      shipping_address, subtotal_paise, shipping_fee_paise, discount_paise, total_paise, currency,
      order_status, payment_status, expires_at, idempotency_key, coupon_code)
  values (v_id, v_num, p_user, p_name, p_email, p_phone, p_address, v_sub, v_ship, v_disc, v_sub + v_ship - v_disc,
      'INR', 'pending', 'pending', now() + interval '30 minutes', p_idem, case when v_disc > 0 then cp.code end);

  if cp.id is not null then
    insert into coupon_redemptions (coupon_id, user_id, order_id, amount_paise) values (cp.id, p_user, v_id, v_disc);
    update coupons set times_redeemed = times_redeemed + 1 where id = cp.id;
  end if;

  for r in select (e->>'product_id')::uuid as pid, sum((e->>'quantity')::int)::int as qty
           from jsonb_array_elements(p_items) e group by 1 order by 1 loop
    select * into pr from products where id = r.pid;
    insert into order_items (order_id, product_id, product_name, product_image_url, sku,
        unit_price_paise, quantity, line_total_paise)
    values (v_id, pr.id, pr.name, pr.image_url, pr.sku, pr.price_paise, r.qty, pr.price_paise * r.qty);
    update products set stock_quantity = stock_quantity - r.qty where id = pr.id;
    insert into inventory_movements (product_id, quantity_change, movement_type, reference_order_id)
    values (pr.id, -r.qty, 'reservation', v_id);
  end loop;

  return jsonb_build_object('order_id', v_id, 'order_number', v_num,
    'total_paise', v_sub + v_ship - v_disc, 'razorpay_order_id', null);
end $$;

-- Release also frees the coupon use of an unpaid order.
create or replace function public.release_order(p_order uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare o public.orders; r record; v_coupon uuid;
begin
  select * into o from orders where id = p_order for update;
  if not found or o.order_status <> 'pending' or o.payment_status not in ('pending','failed') then return false; end if;
  update orders set order_status = 'cancelled' where id = o.id;
  for r in select product_id, quantity from order_items where order_id = o.id and product_id is not null loop
    update products set stock_quantity = stock_quantity + r.quantity where id = r.product_id;
    insert into inventory_movements (product_id, quantity_change, movement_type, reference_order_id, note)
    values (r.product_id, r.quantity, 'release', o.id, 'unpaid order released');
  end loop;
  delete from coupon_redemptions where order_id = o.id returning coupon_id into v_coupon;
  if v_coupon is not null then
    update coupons set times_redeemed = greatest(times_redeemed - 1, 0) where id = v_coupon;
  end if;
  return true;
end $$;

-- Refund webhook also closes the matching refund request.
create or replace function public.record_full_refund(p_payment text, p_refund text, p_amount bigint)
returns text language plpgsql security definer set search_path = public as $$
declare o public.orders;
begin
  select * into o from orders where razorpay_payment_id = p_payment for update;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;
  if p_amount < o.total_paise then return 'partial_not_applied'; end if;
  update orders set payment_status = 'refunded', order_status = 'refunded' where id = o.id;
  update payments set status = 'refunded', refund_id = p_refund where provider_payment_id = p_payment;
  update refund_requests set status = 'processed', razorpay_refund_id = p_refund
    where order_id = o.id and status in ('requested', 'approved');
  return 'refunded';
end $$;

-- Admin decision on a customer refund request. This records the decision only; money moves in Razorpay.
create or replace function public.admin_review_refund(p_id uuid, p_decision text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'FORBIDDEN'; end if;
  if p_decision not in ('approved', 'rejected') then raise exception 'BAD_DECISION'; end if;
  update refund_requests set status = p_decision where id = p_id and status = 'requested';
  if not found then raise exception 'NOT_ALLOWED'; end if;
end $$;

-- ---------- Audit log of privileged changes ----------
create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor uuid,
  table_name text not null,
  row_id text,
  op text not null,
  old_data jsonb,
  new_data jsonb,
  created_at timestamptz not null default now()
);
create index audit_logs_created_idx on public.audit_logs(created_at desc);

create or replace function public.log_admin_change() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and public.is_admin() then   -- system/checkout writes (no auth.uid) are not "admin actions"
    insert into audit_logs (actor, table_name, row_id, op, old_data, new_data)
    values (auth.uid(), tg_table_name,
            (case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end)->>'id', tg_op,
            case when tg_op <> 'INSERT' then to_jsonb(old) end,
            case when tg_op <> 'DELETE' then to_jsonb(new) end);
  end if;
  return coalesce(new, old);
end $$;
create trigger audit_products  after insert or update or delete on public.products        for each row execute function public.log_admin_change();
create trigger audit_categories after insert or update or delete on public.categories      for each row execute function public.log_admin_change();
create trigger audit_coupons   after insert or update or delete on public.coupons         for each row execute function public.log_admin_change();
create trigger audit_settings  after insert or update or delete on public.store_settings  for each row execute function public.log_admin_change();
create trigger audit_orders    after update on public.orders                              for each row execute function public.log_admin_change();
create trigger audit_refunds   after update on public.refund_requests                     for each row execute function public.log_admin_change();

-- ---------- Email de-duplication log (server only) ----------
create table public.email_log (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  kind text not null,
  status text not null check (status in ('sent', 'failed')),
  error text,
  created_at timestamptz not null default now(),
  unique (order_id, kind)
);

-- ---------- RLS + grants ----------
alter table public.coupons            enable row level security;
alter table public.coupon_redemptions enable row level security;
alter table public.audit_logs         enable row level security;
alter table public.email_log          enable row level security;   -- no policies: service role only
revoke all on public.coupons, public.coupon_redemptions, public.audit_logs, public.email_log from anon, authenticated;

grant select, delete on public.coupons to authenticated;
grant insert (code, description, discount_type, discount_value, min_order_paise, max_discount_paise, starts_at, expires_at, usage_limit, per_user_limit, is_active) on public.coupons to authenticated;
grant update (description, discount_type, discount_value, min_order_paise, max_discount_paise, starts_at, expires_at, usage_limit, per_user_limit, is_active) on public.coupons to authenticated;
grant select on public.coupon_redemptions, public.audit_logs to authenticated;
-- refund_requests stay read-only for clients (migration 6); status changes go through admin_review_refund().

create policy coupons_admin_all on public.coupons for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy redemptions_read on public.coupon_redemptions for select to authenticated using (user_id = auth.uid() or public.is_admin());
create policy audit_admin_read on public.audit_logs for select to authenticated using (public.is_admin());

-- Function privileges
revoke all on function public.coupon_problem(public.coupons, bigint, uuid) from public, anon, authenticated;
revoke all on function public.coupon_discount(public.coupons, bigint) from public, anon, authenticated;
revoke all on function public.preview_coupon(text, bigint) from public, anon;
revoke all on function public.admin_review_refund(uuid, text) from public, anon;
revoke all on function public.create_checkout_order(uuid,text,text,text,jsonb,jsonb,text,text) from public, anon, authenticated;
revoke all on function public.release_order(uuid) from public, anon, authenticated;
revoke all on function public.record_full_refund(text,text,bigint) from public, anon, authenticated;
revoke all on function public.log_admin_change() from public, anon, authenticated;
grant execute on function public.preview_coupon(text, bigint) to authenticated;
grant execute on function public.admin_review_refund(uuid, text) to authenticated;
grant execute on function public.create_checkout_order(uuid,text,text,text,jsonb,jsonb,text,text) to service_role;
grant execute on function public.release_order(uuid) to service_role;
grant execute on function public.record_full_refund(text,text,bigint) to service_role;
