-- 10  Order workflow + history, tracking, invoices (private PDFs), API refunds, notification queue,
--     product extras (costs restricted to admins), coupon eligibility, delivery rules, settings access.
-- Forward-only: no table is dropped, no data deleted. Replaces functions from migrations 4, 5 and 9.

-- ============ Products: extra fields; cost price lives in an admin-only table ============
alter table public.products
  add column low_stock_threshold integer not null default 5 check (low_stock_threshold >= 0),
  add column tags text[] not null default '{}',
  add column weight_grams integer check (weight_grams is null or weight_grams >= 0),
  add column seo_title text,
  add column seo_description text;
alter table public.product_images add column storage_path text;
grant insert (low_stock_threshold, tags, weight_grams, seo_title, seo_description) on public.products to authenticated;
grant update (low_stock_threshold, tags, weight_grams, seo_title, seo_description) on public.products to authenticated;
grant insert (storage_path) on public.product_images to authenticated;   -- table-level insert/update already granted

create table public.product_costs (
  product_id uuid primary key references public.products(id) on delete cascade,
  cost_paise bigint not null check (cost_paise >= 0),
  updated_at timestamptz not null default now()
);
alter table public.product_costs enable row level security;
revoke all on public.product_costs from anon, authenticated;
grant select, insert, update, delete on public.product_costs to authenticated;
create policy product_costs_admin on public.product_costs for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- ============ Coupons: eligible products / categories ============
alter table public.coupons
  add column eligible_product_ids uuid[] not null default '{}',
  add column eligible_category_ids uuid[] not null default '{}';
grant insert (eligible_product_ids, eligible_category_ids) on public.coupons to authenticated;
grant update (eligible_product_ids, eligible_category_ids) on public.coupons to authenticated;

-- ============ Orders: wider status set, payment method ============
alter table public.orders drop constraint orders_order_status_check;
alter table public.orders add constraint orders_order_status_check check (order_status in
  ('pending','confirmed','processing','packed','shipped','out_for_delivery','delivered','cancelled','refund_pending','refunded'));
alter table public.orders add column payment_method text;
alter table public.shipments add column estimated_delivery date, add column out_for_delivery_at timestamptz;

-- ============ Immutable order history ============
create table public.order_events (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  actor uuid references auth.users(id) on delete set null,
  kind text not null check (kind in ('order_placed','payment_confirmed','status_changed','note','invoice_issued',
                                     'refund_requested','refund_pending','refund_processed','refund_failed','cancelled')),
  from_status text, to_status text, message text,
  customer_visible boolean not null default false,
  created_at timestamptz not null default now()
);
create index order_events_order_idx on public.order_events(order_id, created_at);
create or replace function public.prevent_event_change() returns trigger language plpgsql as $$
begin raise exception 'order_events are immutable'; end $$;
create trigger order_events_immutable before update or delete on public.order_events
  for each row execute function public.prevent_event_change();

create or replace function public.log_order_event(p_order uuid, p_kind text, p_from text, p_to text, p_msg text, p_visible boolean, p_actor uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into order_events (order_id, kind, from_status, to_status, message, customer_visible, actor)
  values (p_order, p_kind, p_from, p_to, left(p_msg, 1000), p_visible, p_actor);
end $$;

-- ============ Notification queue (idempotent per order + kind) ============
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  kind text not null check (kind in ('order_paid','invoice_ready','shipped','delivered','cancelled','refund_started','refunded')),
  status text not null default 'pending' check (status in ('pending','sent','failed','dead')),
  attempts integer not null default 0,
  last_error text,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  unique (order_id, kind)
);
create index notifications_status_idx on public.notifications(status, created_at);

create or replace function public.enqueue_notification() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_kind text;
begin
  v_kind := case
    when new.kind = 'payment_confirmed' then 'order_paid'
    when new.kind = 'invoice_issued' then 'invoice_ready'
    when new.kind = 'status_changed' and new.to_status = 'shipped' then 'shipped'
    when new.kind = 'status_changed' and new.to_status = 'delivered' then 'delivered'
    when new.kind = 'cancelled' then 'cancelled'
    when new.kind = 'refund_pending' then 'refund_started'
    when new.kind = 'refund_processed' then 'refunded'
  end;
  if v_kind is not null then
    insert into notifications (order_id, kind) values (new.order_id, v_kind) on conflict (order_id, kind) do nothing;
  end if;
  return new;
end $$;
create trigger order_events_enqueue after insert on public.order_events
  for each row execute function public.enqueue_notification();

-- ============ Invoices (immutable once issued) ============
create sequence public.invoice_number_seq;
create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references public.orders(id) on delete restrict,
  invoice_number text not null unique,
  issued_at timestamptz not null default now(),
  pdf_path text,
  business_snapshot jsonb not null,
  created_at timestamptz not null default now()
);
create or replace function public.protect_invoice() returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then raise exception 'invoices cannot be deleted'; end if;
  if new.invoice_number is distinct from old.invoice_number or new.order_id is distinct from old.order_id
     or new.issued_at is distinct from old.issued_at or new.business_snapshot is distinct from old.business_snapshot
     or (old.pdf_path is not null and new.pdf_path is distinct from old.pdf_path) then
    raise exception 'issued invoices cannot be modified; issue a credit note instead';
  end if;
  return new;
end $$;
create trigger invoices_protect before update or delete on public.invoices for each row execute function public.protect_invoice();

-- Idempotent: one invoice per paid order, number from a sequence (gaps are possible after a rolled-back transaction).
create or replace function public.issue_invoice(p_order uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare o public.orders; inv public.invoices; v_biz jsonb; v_prof jsonb;
begin
  select * into o from orders where id = p_order for update;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;
  select * into inv from invoices where order_id = p_order;
  if found then return jsonb_build_object('invoice_id', inv.id, 'invoice_number', inv.invoice_number, 'pdf_path', inv.pdf_path, 'is_new', false); end if;
  if o.payment_status <> 'paid' or o.order_status in ('pending','cancelled','refunded') then raise exception 'INVOICE_NOT_ALLOWED'; end if;
  select coalesce(setting_value, '{}'::jsonb) into v_biz from store_settings where setting_key = 'business';
  select coalesce(setting_value, '{}'::jsonb) into v_prof from store_settings where setting_key = 'store_profile';
  insert into invoices (order_id, invoice_number, business_snapshot)
  values (p_order, 'BC-INV-' || to_char(now() at time zone 'Asia/Kolkata', 'YYYY') || '-' || lpad(nextval('public.invoice_number_seq')::text, 6, '0'),
          coalesce(v_biz, '{}'::jsonb) || jsonb_build_object('store_name', coalesce(v_prof->>'name', 'Beadcraft Studio')))
  returning * into inv;
  perform log_order_event(p_order, 'invoice_issued', null, null, 'Invoice ' || inv.invoice_number || ' issued', true, null);
  return jsonb_build_object('invoice_id', inv.id, 'invoice_number', inv.invoice_number, 'pdf_path', null, 'is_new', true);
end $$;

create or replace function public.set_invoice_pdf(p_order uuid, p_path text) returns void
language plpgsql security definer set search_path = public as $$
begin update invoices set pdf_path = p_path where order_id = p_order and pdf_path is null; end $$;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('invoices', 'invoices', false, 5242880, array['application/pdf']) on conflict (id) do nothing;
-- No storage policies on purpose: only the service role (Edge Function) reads/writes; users get short-lived signed URLs.

-- ============ Refunds (provider-reconciled) ============
create table public.refunds (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete restrict,
  razorpay_payment_id text not null,
  razorpay_refund_id text unique,
  amount_paise bigint not null check (amount_paise > 0),
  status text not null default 'pending' check (status in ('pending','processed','failed')),
  prior_order_status text,
  reason text,
  failure_reason text,
  requested_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index refunds_one_active on public.refunds(order_id) where status in ('pending','processed');
create trigger refunds_updated before update on public.refunds for each row execute function public.set_updated_at();

create or replace function public.begin_refund(p_order uuid, p_actor uuid, p_reason text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare o public.orders; r public.refunds;
begin
  select * into o from orders where id = p_order for update;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;
  if o.payment_status <> 'paid' or o.razorpay_payment_id is null
     or o.order_status not in ('confirmed','processing','packed','shipped','out_for_delivery','delivered','cancelled') then
    raise exception 'REFUND_NOT_ELIGIBLE';
  end if;
  begin
    insert into refunds (order_id, razorpay_payment_id, amount_paise, prior_order_status, reason, requested_by)
    values (o.id, o.razorpay_payment_id, o.total_paise, o.order_status, left(p_reason, 300), p_actor) returning * into r;
  exception when unique_violation then raise exception 'REFUND_EXISTS';
  end;
  update orders set order_status = 'refund_pending' where id = o.id;
  update refund_requests set status = 'approved' where order_id = o.id and status = 'requested';
  perform log_order_event(o.id, 'refund_pending', o.order_status, 'refund_pending', 'Refund initiated', true, p_actor);
  return jsonb_build_object('refund_id', r.id, 'payment_id', r.razorpay_payment_id, 'amount_paise', r.amount_paise);
end $$;

create or replace function public.attach_refund(p_refund uuid, p_rzp_refund text) returns void
language plpgsql security definer set search_path = public as $$
begin update refunds set razorpay_refund_id = p_rzp_refund where id = p_refund; end $$;

create or replace function public.fail_refund(p_refund_id uuid, p_rzp_refund text, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare r public.refunds;
begin
  select * into r from refunds where (p_refund_id is not null and id = p_refund_id) or (p_rzp_refund is not null and razorpay_refund_id = p_rzp_refund) for update;
  if not found or r.status <> 'pending' then return; end if;
  update refunds set status = 'failed', failure_reason = left(coalesce(p_reason, 'refund failed'), 200) where id = r.id;
  update orders set order_status = coalesce(r.prior_order_status, 'confirmed') where id = r.order_id and order_status = 'refund_pending';
  perform log_order_event(r.order_id, 'refund_failed', 'refund_pending', r.prior_order_status, 'Refund failed: ' || left(coalesce(p_reason, ''), 200), false, null);
end $$;

-- Webhook refund.processed. Full refunds only; stock is never restored automatically.
create or replace function public.record_full_refund(p_payment text, p_refund text, p_amount bigint)
returns text language plpgsql security definer set search_path = public as $$
declare o public.orders;
begin
  select * into o from orders where razorpay_payment_id = p_payment for update;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;
  if p_amount < o.total_paise then return 'partial_not_applied'; end if;
  if o.payment_status = 'refunded' then return 'already_refunded'; end if;
  update orders set payment_status = 'refunded', order_status = 'refunded' where id = o.id;
  update payments set status = 'refunded', refund_id = p_refund where provider_payment_id = p_payment;
  update refunds set status = 'processed', razorpay_refund_id = coalesce(razorpay_refund_id, p_refund)
    where order_id = o.id and status = 'pending';
  update refund_requests set status = 'processed', razorpay_refund_id = p_refund where order_id = o.id and status in ('requested','approved');
  perform log_order_event(o.id, 'refund_processed', o.order_status, 'refunded', 'Refund confirmed by the payment provider', true, null);
  return 'refunded';
end $$;

-- ============ Payment method + paid (events) ============
create or replace function public.set_payment_method(p_order uuid, p_method text) returns void
language plpgsql security definer set search_path = public as $$
begin update orders set payment_method = left(p_method, 30) where id = p_order and payment_method is null; end $$;

create or replace function public.mark_order_paid(
  p_order uuid, p_rzp_order text, p_payment text, p_amount bigint, p_currency text)
returns text language plpgsql security definer set search_path = public as $$
declare o public.orders; r record; reserved boolean := true; v_status text := 'confirmed';
begin
  select * into o from orders where id = p_order for update;
  if not found or o.razorpay_order_id is distinct from p_rzp_order then raise exception 'ORDER_MISMATCH'; end if;
  if p_amount <> o.total_paise or p_currency <> 'INR' then raise exception 'AMOUNT_MISMATCH'; end if;
  if o.payment_status in ('paid','refunded') then return 'already_paid'; end if;

  if o.order_status = 'cancelled' then
    begin
      for r in select product_id, quantity from order_items where order_id = o.id and product_id is not null loop
        update products set stock_quantity = stock_quantity - r.quantity where id = r.product_id and stock_quantity >= r.quantity;
        if not found then raise exception 'NO_STOCK'; end if;
        insert into inventory_movements (product_id, quantity_change, movement_type, reference_order_id, note)
        values (r.product_id, -r.quantity, 'reservation', o.id, 're-reserved after late payment');
      end loop;
    exception when others then reserved := false;
    end;
    if not reserved then v_status := 'cancelled'; end if;
  end if;

  update orders set payment_status = 'paid', order_status = v_status, razorpay_payment_id = p_payment where id = o.id;
  update payments set status = 'paid', provider_payment_id = p_payment, provider_signature_verified = true where provider_order_id = p_rzp_order;
  if reserved then
    perform log_order_event(o.id, 'payment_confirmed', o.order_status, v_status, 'Payment confirmed', true, null);
  else
    perform log_order_event(o.id, 'note', null, null, 'PAID AFTER CANCELLATION AND STOCK UNAVAILABLE: refund this payment in Razorpay', false, null);
  end if;
  return case when reserved then 'paid' else 'paid_needs_refund' end;
end $$;

-- ============ Order creation v3: coupon eligibility, serviceable states, history ============
create or replace function public.create_checkout_order(
  p_user uuid, p_name text, p_email text, p_phone text,
  p_address jsonb, p_items jsonb, p_idem text, p_coupon text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  o public.orders; pr public.products; r record; cp public.coupons;
  v_sub bigint := 0; v_elig bigint := 0; v_ship bigint := 0; v_disc bigint := 0; v_set jsonb; v_del jsonb; v_err text;
  v_id uuid := gen_random_uuid(); v_num text; v_open boolean;
begin
  if p_user is null then raise exception 'AUTH_REQUIRED'; end if;
  select * into o from orders where user_id = p_user and idempotency_key = p_idem;
  if found then
    if o.order_status <> 'pending' or o.payment_status not in ('pending','failed') then raise exception 'ORDER_CLOSED'; end if;
    return jsonb_build_object('order_id', o.id, 'order_number', o.order_number, 'total_paise', o.total_paise, 'razorpay_order_id', o.razorpay_order_id);
  end if;

  select setting_value into v_del from store_settings where setting_key = 'delivery';
  if jsonb_typeof(v_del->'serviceable_states') = 'array' and jsonb_array_length(v_del->'serviceable_states') > 0 then
    if not exists (select 1 from jsonb_array_elements_text(v_del->'serviceable_states') s where lower(btrim(s)) = lower(btrim(coalesce(p_address->>'state','')))) then
      raise exception 'NOT_SERVICEABLE';
    end if;
  end if;

  if p_coupon is not null and btrim(p_coupon) <> '' then
    select * into cp from coupons where code = upper(btrim(p_coupon)) for update;
    if not found then raise exception 'COUPON_INVALID'; end if;
  end if;
  v_open := cp.id is not null and cardinality(cp.eligible_product_ids) = 0 and cardinality(cp.eligible_category_ids) = 0;

  for r in select (e->>'product_id')::uuid as pid, sum((e->>'quantity')::int)::int as qty
           from jsonb_array_elements(p_items) e group by 1 order by 1 loop
    if r.qty < 1 or r.qty > 20 then raise exception 'BAD_QUANTITY'; end if;
    select * into pr from products where id = r.pid for update;
    if not found or not pr.is_active then raise exception 'PRODUCT_UNAVAILABLE'; end if;
    if pr.stock_quantity < r.qty then raise exception 'OUT_OF_STOCK: %', pr.name; end if;
    v_sub := v_sub + pr.price_paise * r.qty;
    if cp.id is not null and (v_open or pr.id = any(cp.eligible_product_ids) or (pr.category_id is not null and pr.category_id = any(cp.eligible_category_ids))) then
      v_elig := v_elig + pr.price_paise * r.qty;
    end if;
  end loop;

  if cp.id is not null then
    v_err := coupon_problem(cp, v_sub, p_user);
    if v_err is not null then raise exception '%', v_err; end if;
    if v_elig = 0 then raise exception 'COUPON_NOT_ELIGIBLE'; end if;
    v_disc := coupon_discount(cp, v_elig);
  end if;

  select setting_value into v_set from store_settings where setting_key = 'shipping';
  v_ship := coalesce((v_set->>'flat_fee_paise')::bigint, 0);
  if v_set ? 'free_threshold_paise' and v_sub >= (v_set->>'free_threshold_paise')::bigint then v_ship := 0; end if;

  v_num := 'BC-' || to_char(now(), 'YYMMDD') || '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));
  insert into orders (id, order_number, user_id, customer_name, customer_email, customer_phone, shipping_address,
      subtotal_paise, shipping_fee_paise, discount_paise, total_paise, currency, order_status, payment_status, expires_at, idempotency_key, coupon_code)
  values (v_id, v_num, p_user, p_name, p_email, p_phone, p_address, v_sub, v_ship, v_disc, v_sub + v_ship - v_disc,
      'INR', 'pending', 'pending', now() + interval '30 minutes', p_idem, case when v_disc > 0 then cp.code end);

  if cp.id is not null then
    insert into coupon_redemptions (coupon_id, user_id, order_id, amount_paise) values (cp.id, p_user, v_id, v_disc);
    update coupons set times_redeemed = times_redeemed + 1 where id = cp.id;
  end if;

  for r in select (e->>'product_id')::uuid as pid, sum((e->>'quantity')::int)::int as qty
           from jsonb_array_elements(p_items) e group by 1 order by 1 loop
    select * into pr from products where id = r.pid;
    insert into order_items (order_id, product_id, product_name, product_image_url, sku, unit_price_paise, quantity, line_total_paise)
    values (v_id, pr.id, pr.name, pr.image_url, pr.sku, pr.price_paise, r.qty, pr.price_paise * r.qty);
    update products set stock_quantity = stock_quantity - r.qty where id = pr.id;
    insert into inventory_movements (product_id, quantity_change, movement_type, reference_order_id) values (pr.id, -r.qty, 'reservation', v_id);
  end loop;
  perform log_order_event(v_id, 'order_placed', null, 'pending', 'Order placed', true, p_user);
  return jsonb_build_object('order_id', v_id, 'order_number', v_num, 'total_paise', v_sub + v_ship - v_disc, 'razorpay_order_id', null);
end $$;

-- Coupon preview now takes the cart (so eligibility is exact). Display only; create_checkout_order decides.
drop function if exists public.preview_coupon(text, bigint);
create or replace function public.preview_coupon(p_code text, p_items jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare cp public.coupons; pr public.products; r record; v_sub bigint := 0; v_elig bigint := 0; v_err text; v_open boolean;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  select * into cp from coupons where code = upper(btrim(p_code));
  if not found then return jsonb_build_object('valid', false, 'message', 'That coupon code isn''t valid.'); end if;
  v_open := cardinality(cp.eligible_product_ids) = 0 and cardinality(cp.eligible_category_ids) = 0;
  for r in select (e->>'product_id')::uuid as pid, sum((e->>'quantity')::int)::int as qty from jsonb_array_elements(p_items) e group by 1 loop
    select * into pr from products where id = r.pid and is_active;
    if found then
      v_sub := v_sub + pr.price_paise * r.qty;
      if v_open or pr.id = any(cp.eligible_product_ids) or (pr.category_id is not null and pr.category_id = any(cp.eligible_category_ids)) then v_elig := v_elig + pr.price_paise * r.qty; end if;
    end if;
  end loop;
  v_err := coupon_problem(cp, v_sub, auth.uid());
  if v_err is null and v_elig = 0 then v_err := 'COUPON_NOT_ELIGIBLE'; end if;
  if v_err is not null then
    return jsonb_build_object('valid', false, 'message', case v_err
      when 'COUPON_NOT_STARTED' then 'That coupon isn''t active yet.' when 'COUPON_EXPIRED' then 'That coupon has expired.'
      when 'COUPON_MIN_ORDER' then 'Your order is below the minimum for this coupon.' when 'COUPON_EXHAUSTED' then 'That coupon has been fully redeemed.'
      when 'COUPON_USED' then 'You have already used this coupon.' when 'COUPON_NOT_ELIGIBLE' then 'This coupon doesn''t apply to the items in your cart.'
      else 'That coupon code isn''t valid.' end);
  end if;
  return jsonb_build_object('valid', true, 'discount_paise', coupon_discount(cp, v_elig), 'code', cp.code);
end $$;

-- ============ Customer + admin order actions ============
create or replace function public.cancel_my_order(p_order uuid) returns text
language plpgsql security definer set search_path = public as $$
declare o public.orders; r record;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  select * into o from orders where id = p_order and user_id = auth.uid() for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if o.order_status = 'pending' and o.payment_status in ('pending','failed') then
    perform release_order(o.id);
    perform log_order_event(o.id, 'cancelled', 'pending', 'cancelled', 'Cancelled by customer', true, auth.uid());
    return 'cancelled';
  end if;
  if o.payment_status = 'paid' and o.order_status = 'confirmed' then
    update orders set order_status = 'cancelled' where id = o.id;
    for r in select product_id, quantity from order_items where order_id = o.id and product_id is not null loop
      update products set stock_quantity = stock_quantity + r.quantity where id = r.product_id;
      insert into inventory_movements (product_id, quantity_change, movement_type, reference_order_id, note)
      values (r.product_id, r.quantity, 'cancellation', o.id, 'customer cancelled');
    end loop;
    insert into refund_requests (order_id, user_id, reason) values (o.id, auth.uid(), 'Customer cancelled order') on conflict do nothing;
    perform log_order_event(o.id, 'cancelled', 'confirmed', 'cancelled', 'Cancelled by customer; refund requested', true, auth.uid());
    return 'cancelled_refund_requested';
  end if;
  raise exception 'NOT_CANCELLABLE';
end $$;

create or replace function public.admin_cancel_order(p_order uuid, p_reason text) returns text
language plpgsql security definer set search_path = public as $$
declare o public.orders; r record;
begin
  if not public.is_admin() then raise exception 'FORBIDDEN'; end if;
  select * into o from orders where id = p_order for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if o.order_status = 'pending' and o.payment_status in ('pending','failed') then
    perform release_order(o.id);
  elsif o.payment_status = 'paid' and o.order_status in ('confirmed','processing','packed') then
    update orders set order_status = 'cancelled' where id = o.id;
    for r in select product_id, quantity from order_items where order_id = o.id and product_id is not null loop
      update products set stock_quantity = stock_quantity + r.quantity where id = r.product_id;
      insert into inventory_movements (product_id, quantity_change, movement_type, reference_order_id, note, created_by)
      values (r.product_id, r.quantity, 'cancellation', o.id, 'admin cancelled', auth.uid());
    end loop;
  else raise exception 'NOT_CANCELLABLE'; end if;
  perform log_order_event(o.id, 'cancelled', o.order_status, 'cancelled', 'Cancelled by the store' || coalesce(': ' || left(p_reason, 200), ''), true, auth.uid());
  return case when o.payment_status = 'paid' then 'cancelled_refund_needed' else 'cancelled' end;
end $$;

drop function if exists public.admin_set_fulfillment(uuid, text, text, text, text);
create or replace function public.admin_set_fulfillment(p_order uuid, p_status text,
  p_carrier text default null, p_tracking text default null, p_url text default null, p_eta date default null) returns void
language plpgsql security definer set search_path = public as $$
declare o public.orders; v_ok boolean;
begin
  if not public.is_admin() then raise exception 'FORBIDDEN'; end if;
  select * into o from orders where id = p_order for update;
  if not found or o.payment_status <> 'paid' then raise exception 'NOT_ALLOWED'; end if;
  v_ok := (o.order_status = 'confirmed' and p_status in ('processing','packed','shipped'))
       or (o.order_status = 'processing' and p_status in ('packed','shipped'))
       or (o.order_status = 'packed' and p_status = 'shipped')
       or (o.order_status = 'shipped' and p_status in ('out_for_delivery','delivered'))
       or (o.order_status = 'out_for_delivery' and p_status = 'delivered');
  if not v_ok then raise exception 'NOT_ALLOWED'; end if;
  update orders set order_status = p_status where id = o.id;
  if p_status = 'shipped' then
    insert into shipments (order_id, carrier, tracking_number, tracking_url, shipped_at, estimated_delivery, created_by)
    values (o.id, left(p_carrier, 80), left(p_tracking, 80), left(p_url, 300), now(), p_eta, auth.uid());
  elsif p_status = 'out_for_delivery' then
    update shipments set out_for_delivery_at = now() where order_id = o.id and out_for_delivery_at is null;
  elsif p_status = 'delivered' then
    update shipments set delivered_at = now() where order_id = o.id and delivered_at is null;
  end if;
  perform log_order_event(o.id, 'status_changed', o.order_status, p_status, null, true, auth.uid());
end $$;

create or replace function public.admin_update_tracking(p_order uuid, p_carrier text, p_tracking text, p_url text, p_eta date) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'FORBIDDEN'; end if;
  update shipments set carrier = left(p_carrier, 80), tracking_number = left(p_tracking, 80), tracking_url = left(p_url, 300), estimated_delivery = p_eta
   where id = (select id from shipments where order_id = p_order order by created_at desc limit 1);
  if not found then raise exception 'NO_SHIPMENT'; end if;
  perform log_order_event(p_order, 'note', null, null, 'Tracking details updated', true, auth.uid());
end $$;

create or replace function public.admin_add_order_note(p_order uuid, p_text text, p_visible boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'FORBIDDEN'; end if;
  if char_length(btrim(coalesce(p_text, ''))) = 0 then raise exception 'EMPTY'; end if;
  perform log_order_event(p_order, 'note', null, null, p_text, coalesce(p_visible, false), auth.uid());
end $$;

create or replace function public.admin_retry_notification(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'FORBIDDEN'; end if;
  update notifications set status = 'pending', attempts = 0, last_error = null where id = p_id and status in ('failed','dead');
end $$;

-- ============ Settings: public keys vs admin-only ============
drop policy if exists settings_read on public.store_settings;
create policy settings_read_public on public.store_settings for select to anon, authenticated
  using (setting_key in ('announcement','shipping','delivery','store_profile','policies') or public.is_admin());
-- 'business' (legal name, address, GSTIN, tax settings used on invoices) is readable by admins and the service role only.

-- ============ RLS, grants, audit ============
alter table public.order_events  enable row level security;
alter table public.notifications enable row level security;
alter table public.invoices      enable row level security;
alter table public.refunds       enable row level security;
revoke all on public.order_events, public.notifications, public.invoices, public.refunds from anon, authenticated;
grant select on public.order_events, public.notifications, public.invoices, public.refunds to authenticated;
revoke all on sequence public.invoice_number_seq from anon, authenticated;

create policy order_events_read on public.order_events for select to authenticated
  using (public.is_admin() or (customer_visible and exists (select 1 from public.orders o where o.id = order_id and o.user_id = auth.uid())));
create policy notifications_admin_read on public.notifications for select to authenticated using (public.is_admin());
create policy invoices_read on public.invoices for select to authenticated
  using (public.is_admin() or exists (select 1 from public.orders o where o.id = order_id and o.user_id = auth.uid()));
create policy refunds_admin_read on public.refunds for select to authenticated using (public.is_admin());
create trigger audit_refunds_tbl after insert or update on public.refunds for each row execute function public.log_admin_change();

-- Function privileges
do $$ declare f text; begin
  foreach f in array array[
    'log_order_event(uuid,text,text,text,text,boolean,uuid)','enqueue_notification()','issue_invoice(uuid)','set_invoice_pdf(uuid,text)',
    'begin_refund(uuid,uuid,text)','attach_refund(uuid,text)','fail_refund(uuid,text,text)','record_full_refund(text,text,bigint)',
    'set_payment_method(uuid,text)','mark_order_paid(uuid,text,text,bigint,text)','create_checkout_order(uuid,text,text,text,jsonb,jsonb,text,text)'] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
  foreach f in array array[
    'preview_coupon(text,jsonb)','cancel_my_order(uuid)','admin_cancel_order(uuid,text)','admin_set_fulfillment(uuid,text,text,text,text,date)',
    'admin_update_tracking(uuid,text,text,text,date)','admin_add_order_note(uuid,text,boolean)','admin_retry_notification(uuid)'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
