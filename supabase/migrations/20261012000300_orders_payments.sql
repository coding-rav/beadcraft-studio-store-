-- 3/8  Orders, items, payments, inventory audit, shipments, refund requests, webhook event log.

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  order_number text not null unique,
  user_id uuid references auth.users(id) on delete restrict,  -- must be set for new orders: see migration 8
  customer_name text not null,
  customer_email text not null,
  customer_phone text not null,
  shipping_address jsonb not null,
  subtotal_paise bigint not null check (subtotal_paise >= 0),
  shipping_fee_paise bigint not null default 0 check (shipping_fee_paise >= 0),
  discount_paise bigint not null default 0 check (discount_paise >= 0),
  total_paise bigint not null check (total_paise >= 0),
  currency text not null default 'INR' check (currency = 'INR'),
  order_status text not null default 'pending'
    check (order_status in ('pending','confirmed','processing','shipped','delivered','cancelled','refunded')),
  payment_status text not null default 'pending'
    check (payment_status in ('pending','authorized','paid','failed','refunded')),
  razorpay_order_id text unique,
  razorpay_payment_id text unique,
  expires_at timestamptz,
  idempotency_key text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (total_paise = subtotal_paise + shipping_fee_paise - discount_paise)
);
create unique index orders_user_idem_uq on public.orders(user_id, idempotency_key) where idempotency_key is not null;
create index orders_user_idx on public.orders(user_id);
create index orders_status_idx on public.orders(order_status, payment_status);
create index orders_created_idx on public.orders(created_at desc);

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  product_name text not null,
  product_image_url text,
  sku text,
  unit_price_paise bigint not null check (unit_price_paise >= 0),
  quantity integer not null check (quantity > 0),
  line_total_paise bigint not null check (line_total_paise >= 0),
  created_at timestamptz not null default now(),
  check (line_total_paise = unit_price_paise * quantity)
);
create index order_items_order_idx on public.order_items(order_id);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  provider text not null default 'razorpay',
  provider_order_id text not null unique,
  provider_payment_id text unique,
  amount_paise bigint not null check (amount_paise >= 0),
  currency text not null default 'INR',
  status text not null default 'pending'
    check (status in ('pending','authorized','paid','failed','refunded')),
  provider_signature_verified boolean not null default false,
  failure_reason text,
  refund_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index payments_order_idx on public.payments(order_id);

create table public.inventory_movements (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  quantity_change integer not null check (quantity_change <> 0),
  movement_type text not null
    check (movement_type in ('reservation','release','cancellation','restock','adjustment','correction')),
  reference_order_id uuid references public.orders(id) on delete set null,
  note text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index inventory_movements_product_idx on public.inventory_movements(product_id, created_at desc);

create table public.shipments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  carrier text, tracking_number text, tracking_url text,
  shipped_at timestamptz, delivered_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index shipments_order_idx on public.shipments(order_id);

create table public.refund_requests (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete restrict,
  reason text not null check (char_length(reason) between 3 and 500),
  status text not null default 'requested' check (status in ('requested','approved','rejected','processed')),
  razorpay_refund_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index refund_one_open_per_order on public.refund_requests(order_id) where status in ('requested','approved');

-- Webhook delivery log (idempotency). Server-only: RLS enabled with no policies.
create table public.razorpay_events (
  event_id text primary key,
  event_type text not null,
  razorpay_order_id text,
  razorpay_payment_id text,
  processed_at timestamptz not null default now()
);

create trigger orders_updated   before update on public.orders   for each row execute function public.set_updated_at();
create trigger payments_updated before update on public.payments for each row execute function public.set_updated_at();
create trigger refunds_updated  before update on public.refund_requests for each row execute function public.set_updated_at();
