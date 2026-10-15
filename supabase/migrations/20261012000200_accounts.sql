-- 2/8  Accounts: profiles, roles, addresses, server-side cart, wishlist. Identities come from auth.users.

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text check (full_name is null or char_length(full_name) <= 100),
  phone text check (phone is null or phone ~ '^[6-9][0-9]{9}$'),
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('customer', 'admin')),
  created_at timestamptz not null default now(),
  unique (user_id, role)
);

create table public.customer_addresses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  label text,
  full_name text not null,
  phone text not null check (phone ~ '^[6-9][0-9]{9}$'),
  line1 text not null, line2 text,
  city text not null, state text not null,
  pincode text not null check (pincode ~ '^[0-9]{6}$'),
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index customer_addresses_user_idx on public.customer_addresses(user_id);

-- Cart persistence: product + quantity ONLY. Prices are always read from products at checkout.
create table public.cart_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  quantity integer not null check (quantity between 1 and 20),
  updated_at timestamptz not null default now(),
  unique (user_id, product_id)
);

create table public.wishlists (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_id, product_id)
);

create trigger profiles_updated  before update on public.profiles  for each row execute function public.set_updated_at();
create trigger addresses_updated before update on public.customer_addresses for each row execute function public.set_updated_at();
create trigger cart_updated      before update on public.cart_items for each row execute function public.set_updated_at();

-- Admin check: server-side, from user_roles only. Never from client input or editable profile data.
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = auth.uid() and role = 'admin')
$$;

-- New signup -> profile + customer role. Metadata can fill name/phone; it can NEVER grant admin.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_phone text := left(new.raw_user_meta_data->>'phone', 15);
begin
  insert into public.profiles (id, full_name, phone)
  values (new.id, left(new.raw_user_meta_data->>'full_name', 100),
          case when v_phone ~ '^[6-9][0-9]{9}$' then v_phone else null end)
  on conflict (id) do nothing;
  insert into public.user_roles (user_id, role) values (new.id, 'customer') on conflict do nothing;
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();
