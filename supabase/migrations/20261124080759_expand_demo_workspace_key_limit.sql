-- Expand the atomic demo workspace publisher to the 10,000-key paginated read ceiling.
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
