-- Harden the anonymous demo workspace without introducing authentication.
-- This remains fictional-data-only and publicly readable/writable for the trial.

alter table public.portal_storage
  add constraint portal_storage_key_format_check
  check (
    char_length(key) between 1 and 180
    and key ~ '^school-arts-sports-[a-z0-9-]+$'
  );

alter table public.portal_storage
  add constraint portal_storage_value_size_check
  check (octet_length(value) <= 2000000);

revoke all privileges on table public.portal_storage from authenticated;
revoke truncate, references, trigger on table public.portal_storage from anon;
grant select, insert, update, delete on table public.portal_storage to anon;

revoke all privileges on function public.portal_storage_touch_updated_at()
  from public, anon, authenticated;

comment on table public.portal_storage is
  'Temporary public key-value mirror for fictional Arts & Sports Portal testing only. Replace with normalized, authenticated tables before production.';
