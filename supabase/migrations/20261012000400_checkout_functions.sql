-- 4/8  Server-side order lifecycle. Callable ONLY by the service role (Edge Functions).
-- Stock policy: RESERVE at order creation, RELEASE if unpaid at expiry, never deduct twice.

create or replace function public.create_checkout_order(
  p_user uuid, p_name text, p_email text, p_phone text,
  p_address jsonb, p_items jsonb, p_idem text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  o public.orders; pr public.products; r record;
  v_sub bigint := 0; v_ship bigint := 0; v_set jsonb;
  v_id uuid := gen_random_uuid(); v_num text;
begin
  if p_user is null then raise exception 'AUTH_REQUIRED'; end if;

  select * into o from orders where user_id = p_user and idempotency_key = p_idem;
  if found then
    -- Same checkout attempt retried: reuse the order only while it is still open.
    if o.order_status <> 'pending' or o.payment_status not in ('pending','failed') then
      raise exception 'ORDER_CLOSED';
    end if;
    return jsonb_build_object('order_id', o.id, 'order_number', o.order_number,
      'total_paise', o.total_paise, 'razorpay_order_id', o.razorpay_order_id);
  end if;

  -- Lock products in a stable order (avoids deadlocks), validate, price from the database only.
  for r in select (e->>'product_id')::uuid as pid, sum((e->>'quantity')::int)::int as qty
           from jsonb_array_elements(p_items) e group by 1 order by 1 loop
    if r.qty < 1 or r.qty > 20 then raise exception 'BAD_QUANTITY'; end if;
    select * into pr from products where id = r.pid for update;
    if not found or not pr.is_active then raise exception 'PRODUCT_UNAVAILABLE'; end if;
    if pr.stock_quantity < r.qty then raise exception 'OUT_OF_STOCK: %', pr.name; end if;
    v_sub := v_sub + pr.price_paise * r.qty;
  end loop;

  select setting_value into v_set from store_settings where setting_key = 'shipping';
  v_ship := coalesce((v_set->>'flat_fee_paise')::bigint, 0);
  if v_set ? 'free_threshold_paise' and v_sub >= (v_set->>'free_threshold_paise')::bigint then v_ship := 0; end if;

  v_num := 'BC-' || to_char(now(), 'YYMMDD') || '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));
  insert into orders (id, order_number, user_id, customer_name, customer_email, customer_phone,
      shipping_address, subtotal_paise, shipping_fee_paise, discount_paise, total_paise, currency,
      order_status, payment_status, expires_at, idempotency_key)
  values (v_id, v_num, p_user, p_name, p_email, p_phone, p_address, v_sub, v_ship, 0, v_sub + v_ship,
      'INR', 'pending', 'pending', now() + interval '30 minutes', p_idem);

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
    'total_paise', v_sub + v_ship, 'razorpay_order_id', null);
end $$;

create or replace function public.release_order(p_order uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare o public.orders; r record;
begin
  select * into o from orders where id = p_order for update;
  if not found or o.order_status <> 'pending' or o.payment_status not in ('pending','failed') then return false; end if;
  update orders set order_status = 'cancelled' where id = o.id;
  for r in select product_id, quantity from order_items where order_id = o.id and product_id is not null loop
    update products set stock_quantity = stock_quantity + r.quantity where id = r.product_id;
    insert into inventory_movements (product_id, quantity_change, movement_type, reference_order_id, note)
    values (r.product_id, r.quantity, 'release', o.id, 'unpaid order released');
  end loop;
  return true;
end $$;

create or replace function public.release_expired_orders()
returns integer language plpgsql security definer set search_path = public as $$
declare r record; n integer := 0;
begin
  for r in select id from orders where order_status = 'pending' and payment_status in ('pending','failed')
           and expires_at < now() loop
    if release_order(r.id) then n := n + 1; end if;
  end loop;
  return n;
end $$;

-- Idempotent: safe to call from verify AND webhook, any number of times, in any order.
create or replace function public.mark_order_paid(
  p_order uuid, p_rzp_order text, p_payment text, p_amount bigint, p_currency text)
returns text language plpgsql security definer set search_path = public as $$
declare o public.orders; r record; reserved boolean := true; v_status text := 'confirmed';
begin
  select * into o from orders where id = p_order for update;
  if not found or o.razorpay_order_id is distinct from p_rzp_order then raise exception 'ORDER_MISMATCH'; end if;
  if p_amount <> o.total_paise or p_currency <> 'INR' then raise exception 'AMOUNT_MISMATCH'; end if;
  if o.payment_status = 'paid' then return 'already_paid'; end if;

  if o.order_status = 'cancelled' then      -- paid after expiry: stock was released, try to re-take it
    begin
      for r in select product_id, quantity from order_items where order_id = o.id and product_id is not null loop
        update products set stock_quantity = stock_quantity - r.quantity
          where id = r.product_id and stock_quantity >= r.quantity;
        if not found then raise exception 'NO_STOCK'; end if;
        insert into inventory_movements (product_id, quantity_change, movement_type, reference_order_id, note)
        values (r.product_id, -r.quantity, 'reservation', o.id, 're-reserved after late payment');
      end loop;
    exception when others then reserved := false;   -- inner changes roll back
    end;
    if not reserved then v_status := 'cancelled'; end if;
  end if;

  update orders set payment_status = 'paid', order_status = v_status, razorpay_payment_id = p_payment
    where id = o.id;
  update payments set status = 'paid', provider_payment_id = p_payment, provider_signature_verified = true
    where provider_order_id = p_rzp_order;
  return case when reserved then 'paid' else 'paid_needs_refund' end;  -- latter: refund manually in Razorpay
end $$;

create or replace function public.mark_payment_failed(p_rzp_order text, p_payment text, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
begin
  update payments set status = 'failed', failure_reason = left(coalesce(p_reason, 'payment failed'), 200)
    where provider_order_id = p_rzp_order and status <> 'paid';
  update orders set payment_status = 'failed'
    where razorpay_order_id = p_rzp_order and payment_status in ('pending','failed');
end $$;

-- Full refunds only. Stock is NOT restored automatically (goods may already be shipped).
create or replace function public.record_full_refund(p_payment text, p_refund text, p_amount bigint)
returns text language plpgsql security definer set search_path = public as $$
declare o public.orders;
begin
  select * into o from orders where razorpay_payment_id = p_payment for update;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;
  if p_amount < o.total_paise then return 'partial_not_applied'; end if;
  update orders set payment_status = 'refunded', order_status = 'refunded' where id = o.id;
  update payments set status = 'refunded', refund_id = p_refund where provider_payment_id = p_payment;
  return 'refunded';
end $$;

-- Server-only: nobody but the service role (Edge Functions) may call these.
revoke all on function public.create_checkout_order(uuid,text,text,text,jsonb,jsonb,text) from public, anon, authenticated;
revoke all on function public.release_order(uuid) from public, anon, authenticated;
revoke all on function public.release_expired_orders() from public, anon, authenticated;
revoke all on function public.mark_order_paid(uuid,text,text,bigint,text) from public, anon, authenticated;
revoke all on function public.mark_payment_failed(text,text,text) from public, anon, authenticated;
revoke all on function public.record_full_refund(text,text,bigint) from public, anon, authenticated;
grant execute on function public.create_checkout_order(uuid,text,text,text,jsonb,jsonb,text) to service_role;
grant execute on function public.release_order(uuid) to service_role;
grant execute on function public.release_expired_orders() to service_role;
grant execute on function public.mark_order_paid(uuid,text,text,bigint,text) to service_role;
grant execute on function public.mark_payment_failed(text,text,text) to service_role;
grant execute on function public.record_full_refund(text,text,bigint) to service_role;

-- Optional (enable the pg_cron extension first): release unpaid reservations every 10 minutes.
-- select cron.schedule('release-expired-orders', '*/10 * * * *', 'select public.release_expired_orders()');
