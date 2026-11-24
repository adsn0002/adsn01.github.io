-- Arts & Sports Portal: temporary anonymous multi-device test storage.
-- TEST DATA ONLY. Anonymous clients can read and write this table during the demo phase.
-- Never store real student records, credentials, or production election data here.

create table if not exists public.portal_storage (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now(),
  constraint portal_storage_key_format_check
    check (char_length(key) between 1 and 180 and key ~ '^school-arts-sports-[a-z0-9-]+$'),
  constraint portal_storage_value_size_check
    check (octet_length(value) <= 2000000)
);

alter table public.portal_storage enable row level security;

-- Keep the unauthenticated trial surface narrow. Auth is intentionally deferred.
revoke all privileges on table public.portal_storage from authenticated;
revoke truncate, references, trigger on table public.portal_storage from anon;
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
  new.updated_at := pg_catalog.clock_timestamp();
  return new;
end;
$$;

revoke all privileges on function public.portal_storage_touch_updated_at()
  from public, anon, authenticated;

drop trigger if exists portal_storage_touch_updated_at on public.portal_storage;
create trigger portal_storage_touch_updated_at
before update on public.portal_storage
for each row execute function public.portal_storage_touch_updated_at();

comment on table public.portal_storage is
  'Temporary public key-value mirror for fictional Arts & Sports Portal testing only. Replace with normalized, authenticated tables before production.';


-- Atomically replace the explicitly published fictional demo workspace.
-- SECURITY INVOKER preserves the caller's RLS and table privileges.
create or replace function public.portal_storage_replace_workspace(p_rows jsonb)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  row_count integer;
  item jsonb;
begin
  if pg_catalog.jsonb_typeof(p_rows) <> 'array' then
    raise exception 'Workspace payload must be a JSON array';
  end if;
  if pg_catalog.jsonb_array_length(p_rows) > 10000 then
    raise exception 'Workspace contains too many keys (maximum 10,000)';
  end if;

  for item in select value from pg_catalog.jsonb_array_elements(p_rows)
  loop
    if pg_catalog.jsonb_typeof(item) <> 'object'
      or not (item ? 'key')
      or not (item ? 'value')
      or pg_catalog.jsonb_typeof(item->'key') <> 'string'
      or pg_catalog.jsonb_typeof(item->'value') <> 'string'
      or pg_catalog.char_length(item->>'key') not between 1 and 180
      or (item->>'key') !~ '^school-arts-sports-[a-z0-9-]+$'
      or pg_catalog.octet_length(item->>'value') > 2000000 then
      raise exception 'Workspace contains an invalid key or value';
    end if;
  end loop;

  delete from public.portal_storage;
  insert into public.portal_storage(key, value)
    select x.key, x.value
    from pg_catalog.jsonb_to_recordset(p_rows) as x(key text, value text);

  get diagnostics row_count = ROW_COUNT;
  return row_count;
end;
$$;

revoke all privileges on function public.portal_storage_replace_workspace(jsonb)
  from public, authenticated;
grant execute on function public.portal_storage_replace_workspace(jsonb) to anon;
