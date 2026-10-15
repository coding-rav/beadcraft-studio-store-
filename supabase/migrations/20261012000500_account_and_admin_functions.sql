-- 5/8  Customer actions + admin fulfilment/stock. auth.uid() is checked INSIDE each function.

create or replace function public.cancel_my_order(p_order uuid) returns text
language plpgsql security definer set search_path = public as $$
declare o public.orders; r record;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  select * into o from orders where id = p_order and user_id = auth.uid() for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if o.order_status = 'pending' and o.payment_status in ('pending','failed') then
    perform release_order(o.id);
    return 'cancelled';
  end if;
  if o.payment_status = 'paid' and o.order_status = 'confirmed' then   -- policy: only before processing starts
    update orders set order_status = 'cancelled' where id = o.id;
    for r in select product_id, quantity from order_items where order_id = o.id and product_id is not null loop
      update products set stock_quantity = stock_quantity + r.quantity where id = r.product_id;
      insert into inventory_movements (product_id, quantity_change, movement_type, reference_order_id, note)
      values (r.product_id, r.quantity, 'cancellation', o.id, 'customer cancelled');
    end loop;
    insert into refund_requests (order_id, user_id, reason) values (o.id, auth.uid(), 'Customer cancelled order')
      on conflict do nothing;
    return 'cancelled_refund_requested';
  end if;
  raise exception 'NOT_CANCELLABLE';
end $$;

create or replace function public.request_refund(p_order uuid, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare o public.orders;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  select * into o from orders where id = p_order and user_id = auth.uid();
  if not found or o.payment_status <> 'paid' then raise exception 'NOT_ELIGIBLE'; end if;
  insert into refund_requests (order_id, user_id, reason) values (o.id, auth.uid(), p_reason);
end $$;

-- Admin fulfilment: only after payment is verified; never touches payment fields.
create or replace function public.admin_set_fulfillment(p_order uuid, p_status text,
  p_carrier text default null, p_tracking text default null, p_url text default null) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'FORBIDDEN'; end if;
  if p_status not in ('processing','shipped','delivered') then raise exception 'BAD_STATUS'; end if;
  update orders set order_status = p_status
    where id = p_order and payment_status = 'paid' and order_status in ('confirmed','processing','shipped');
  if not found then raise exception 'NOT_ALLOWED'; end if;
  if p_status = 'shipped' then
    insert into shipments (order_id, carrier, tracking_number, tracking_url, shipped_at, created_by)
    values (p_order, p_carrier, p_tracking, p_url, now(), auth.uid());
  end if;
  if p_status = 'delivered' then
    update shipments set delivered_at = now() where order_id = p_order and delivered_at is null;
  end if;
end $$;

-- Admin stock changes always leave an audit row. Direct UPDATE of stock_quantity is not granted (migration 6).
create or replace function public.admin_adjust_stock(p_product uuid, p_delta integer, p_type text, p_note text default null)
returns integer language plpgsql security definer set search_path = public as $$
declare v_new integer;
begin
  if not public.is_admin() then raise exception 'FORBIDDEN'; end if;
  if p_delta = 0 then raise exception 'NO_CHANGE'; end if;
  if p_type not in ('restock','adjustment','correction') then raise exception 'BAD_TYPE'; end if;
  update products set stock_quantity = stock_quantity + p_delta
    where id = p_product and stock_quantity + p_delta >= 0
    returning stock_quantity into v_new;
  if not found then raise exception 'NEGATIVE_STOCK_OR_NOT_FOUND'; end if;
  insert into inventory_movements (product_id, quantity_change, movement_type, note, created_by)
  values (p_product, p_delta, p_type, left(p_note, 300), auth.uid());
  return v_new;
end $$;

revoke all on function public.cancel_my_order(uuid) from public, anon;
revoke all on function public.request_refund(uuid, text) from public, anon;
revoke all on function public.admin_set_fulfillment(uuid, text, text, text, text) from public, anon;
revoke all on function public.admin_adjust_stock(uuid, integer, text, text) from public, anon;
grant execute on function public.cancel_my_order(uuid) to authenticated;
grant execute on function public.request_refund(uuid, text) to authenticated;
grant execute on function public.admin_set_fulfillment(uuid, text, text, text, text) to authenticated;
grant execute on function public.admin_adjust_stock(uuid, integer, text, text) to authenticated;
grant execute on function public.is_admin() to anon, authenticated;
