-- 8/8  No account, no order.

-- New or updated orders must belong to a user. NOT VALID keeps any historical guest rows untouched
-- (on a fresh project there are none). Orders are never deleted by this migration.
alter table public.orders add constraint orders_user_required check (user_id is not null) not valid;

-- Backfill: every existing auth user gets a profile and the customer role (never admin).
insert into public.profiles (id, full_name, phone)
select u.id, left(u.raw_user_meta_data->>'full_name', 100),
       case when left(u.raw_user_meta_data->>'phone', 15) ~ '^[6-9][0-9]{9}$' then left(u.raw_user_meta_data->>'phone', 15) end
from auth.users u on conflict (id) do nothing;
insert into public.user_roles (user_id, role)
select u.id, 'customer' from auth.users u on conflict do nothing;

-- FIRST ADMIN is provisioned manually, never in a migration. See README "Create the first admin".
