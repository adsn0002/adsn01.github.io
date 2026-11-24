-- Arts & Sports Portal: temporary anonymous multi-device test storage.
-- TEST DATA ONLY. This table is publicly readable and writable through the Data API
-- so the current localStorage model can be mirrored across browsers before Auth exists.
-- Do not place real student records or production election data here.

create table if not exists public.portal_storage (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);

alter table public.portal_storage enable row level security;

grant select, insert, update, delete on table public.portal_storage to anon;

drop policy if exists "portal_storage_test_select_anon" on public.portal_storage;
create policy "portal_storage_test_select_anon"
  on public.portal_storage for select to anon using (true);

drop policy if exists "portal_storage_test_insert_anon" on public.portal_storage;
create policy "portal_storage_test_insert_anon"
  on public.portal_storage for insert to anon with check (true);

drop policy if exists "portal_storage_test_update_anon" on public.portal_storage;
create policy "portal_storage_test_update_anon"
  on public.portal_storage for update to anon using (true) with check (true);

drop policy if exists "portal_storage_test_delete_anon" on public.portal_storage;
create policy "portal_storage_test_delete_anon"
  on public.portal_storage for delete to anon using (true);

create or replace function public.portal_storage_touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := pg_catalog.now();
  return new;
end;
$$;

drop trigger if exists portal_storage_touch_updated_at on public.portal_storage;
create trigger portal_storage_touch_updated_at
before update on public.portal_storage
for each row execute function public.portal_storage_touch_updated_at();

comment on table public.portal_storage is
  'Temporary public key-value mirror for fictional Arts & Sports Portal testing only. Replace with normalized, authenticated tables before production.';
