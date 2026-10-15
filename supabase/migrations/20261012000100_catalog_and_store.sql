-- 1/8  Catalog + storefront tables. Money is integer paise (INR). Fresh-project migration: see README
-- "Existing database?" before running against a project that already has tables with these names.

create or replace function public.set_updated_at() returns trigger
language plpgsql as $$ begin new.updated_at = now(); return new; end $$;

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 100),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  description text,
  image_url text,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  category_id uuid references public.categories(id) on delete set null,
  name text not null check (char_length(name) between 1 and 200),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  short_description text,
  description text,
  price_paise bigint not null check (price_paise >= 0),
  compare_at_price_paise bigint check (compare_at_price_paise is null or compare_at_price_paise >= price_paise),
  sku text unique,
  stock_quantity integer not null default 0 check (stock_quantity >= 0),
  image_url text,
  badge text,
  is_featured boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index products_category_idx on public.products(category_id);
create index products_visible_idx on public.products(is_active, is_featured);

create table public.product_images (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  image_url text not null,
  alt_text text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);
create index product_images_product_idx on public.product_images(product_id);

-- Non-secret settings only (announcement text, shipping rule, contact details). Never store secrets here.
create table public.store_settings (
  id uuid primary key default gen_random_uuid(),
  setting_key text not null unique,
  setting_value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table public.newsletter_subscribers (
  id uuid primary key default gen_random_uuid(),
  email text not null unique check (char_length(email) <= 254 and email ~* '^[^@\s]+@[^@\s]+\.[^@\s]{2,}$'),
  consented_at timestamptz not null default now(),
  is_subscribed boolean not null default true,
  created_at timestamptz not null default now()
);

create trigger categories_updated before update on public.categories for each row execute function public.set_updated_at();
create trigger products_updated   before update on public.products   for each row execute function public.set_updated_at();
create trigger settings_updated   before update on public.store_settings for each row execute function public.set_updated_at();
