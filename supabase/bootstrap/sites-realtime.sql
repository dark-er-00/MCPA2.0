-- Apply once in Supabase SQL Editor, after Sites setup.sql. Safe to rerun.
-- Keeps sites/site_id and all custody and history references intact.
begin;
alter table public.sites add column if not exists is_active boolean;
update public.sites set is_active = (archived_at is null) where is_active is null;
alter table public.sites alter column is_active set default true;
alter table public.sites alter column is_active set not null;

-- Keep earlier archived_at readers and the existing history trigger consistent.
create or replace function public.sites_sync_archive()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    if new.archived_at is not null then new.is_active := false; end if;
  elsif new.is_active is not distinct from old.is_active
    and new.archived_at is distinct from old.archived_at then
    new.is_active := new.archived_at is null;
  end if;
  if new.is_active then new.archived_at := null;
  else new.archived_at := coalesce(new.archived_at, clock_timestamp()); end if;
  return new;
end;
$$;
drop trigger if exists sites_archive_sync on public.sites;
create trigger sites_archive_sync before insert or update on public.sites
for each row execute function public.sites_sync_archive();

revoke delete on public.sites from anon, authenticated;
drop policy if exists sites_delete on public.sites;

-- Add only these tables; preserve the publication's existing subscribers.
do $$
declare tab text;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
  foreach tab in array array['equipment', 'sites'] loop
    if not exists (select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = tab) then
      execute format('alter publication supabase_realtime add table public.%I', tab);
    end if;
  end loop;
end;
$$;
notify pgrst, 'reload schema';
commit;
