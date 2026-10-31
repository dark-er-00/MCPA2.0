-- Compatibility repair for installations of the original setup.sql.
-- The updated setup.sql already includes these permissions.
-- Rerun the updated setup.sql instead to apply all Sites fixes, including dates.
-- Anyone with this project's public API access can then create/edit/delete sites.
-- This changes permissions only for sites, not equipment or any other table.
begin;
alter table public.sites enable row level security;
grant select, insert, update, delete on public.sites to anon, authenticated;
drop policy if exists sites_read on public.sites;
create policy sites_read on public.sites for select to anon, authenticated using (true);
drop policy if exists sites_insert on public.sites;
create policy sites_insert on public.sites for insert to anon, authenticated with check (true);
drop policy if exists sites_update on public.sites;
create policy sites_update on public.sites for update to anon, authenticated using (true) with check (true);
drop policy if exists sites_delete on public.sites;
create policy sites_delete on public.sites for delete to anon, authenticated using (true);
notify pgrst, 'reload schema';
commit;
