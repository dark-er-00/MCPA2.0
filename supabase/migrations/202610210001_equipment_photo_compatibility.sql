-- MANUAL SUPABASE STEP: equipment photos only. NEVER auto-apply to production.
-- Run equipment-photos-preflight.sql first; review photo_url/other photo columns.
-- Requires authenticated access (202610040001 and recipient identity), existing
-- equipment INSERT/UPDATE RLS, Office configuration, and Supabase Storage RLS.
-- Frontend without a photo is compatible before this step; deploy this SQL and
-- pass equipment-photos-verification.sql BEFORE enabling photo saves.
-- No equipment values, custody, quantities, reservations or histories are changed.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
do $$
declare p record; b record; fn text;
begin
 if to_regclass('public.equipment') is null or to_regclass('storage.objects') is null
 or to_regclass('storage.buckets') is null
 or to_regprocedure('mcpa_auth_private.identity()') is null
 or to_regprocedure('mcpa_auth_private.can_view_tool(public.equipment,public.profiles)') is null then
  raise exception 'Authenticated equipment access and Supabase Storage are prerequisites.';
 end if;
 if not exists(select 1 from pg_class where oid='storage.objects'::regclass and relrowsecurity) then
  raise exception 'Storage RLS must already be enabled.';
 end if;
 if not exists(select 1 from pg_class where oid='public.equipment'::regclass and relrowsecurity) then
  raise exception 'Equipment RLS must already be enabled.';
 end if;
 if exists(select 1 from information_schema.columns where table_schema='public' and table_name='equipment'
 and column_name in ('photo_url','photo_path','image_path','photo','image') ) then
  raise exception 'An alternate photo column exists. Review its data and integrate it before proceeding; do not add duplicate columns.';
 end if;
 if exists(select 1 from information_schema.columns where table_schema='public' and table_name='equipment'
 and column_name='image_url' and data_type not in ('text','character varying')) then
  raise exception 'Existing image_url must be a text column. Stop and review.';
 end if;
 for p in select polname,obj_description(oid,'pg_policy') marker from pg_policy
 where polrelid='storage.objects'::regclass and (0=any(polroles) or exists(select 1 from pg_roles r where r.oid=any(polroles) and rolname in ('anon','authenticated'))) loop
  if not (p.polname in ('mcpa_equipment_photos_read','mcpa_equipment_photos_insert','mcpa_purchase_receipts_read','mcpa_purchase_receipts_insert') and p.marker is not distinct from 'MCPA feature storage v1')
  and not (p.polname='mcpa_equipment_photos_discard' and p.marker is not distinct from 'MCPA equipment photo cleanup v1') then
   raise exception 'Existing Storage policy % needs review; no unrelated policy will be changed.',p.polname;
  end if;
 end loop;
 foreach fn in array array['public.mcpa_can_read_equipment_photo(text)','public.mcpa_can_write_equipment_photo(text)'] loop
  if to_regprocedure(fn) is not null and obj_description(to_regprocedure(fn),'pg_proc') is distinct from 'MCPA feature storage v1' then
   raise exception 'Existing function % needs manual compatibility review.',fn;
  end if;
 end loop;
 if exists(select 1 from pg_proc where oid=to_regprocedure('mcpa_auth_private.guard_equipment_photo_reference()') and replace(prosrc,chr(13),'') is distinct from replace($known_guard$
declare person public.profiles; object_name text;
begin
  if tg_op='UPDATE' and new.image_url is not distinct from old.image_url then return new; end if;
  if coalesce(new.image_url,'') not like 'storage://equipment-photos/%'
    and (tg_op='INSERT' or coalesce(old.image_url,'') not like 'storage://equipment-photos/%') then return new; end if;
  person:=mcpa_auth_private.identity();
  if person.role<>'admin' then raise exception 'Only Admin can change managed equipment photos.' using errcode='42501'; end if;
  if coalesce(new.image_url,'') like 'storage://equipment-photos/%' then
    object_name:=substring(new.image_url from length('storage://equipment-photos/')+1);
    if not public.mcpa_can_write_equipment_photo(object_name)
      or not exists(select 1 from storage.objects where bucket_id='equipment-photos' and name=object_name) then
      raise exception 'Select a valid uploaded equipment photo.' using errcode='22023';
    end if;
  end if;
  return new;
end $known_guard$,chr(13),'')) then
  raise exception 'Existing photo reference guard differs from the reviewed implementation.';
 end if;
 if to_regprocedure('public.mcpa_can_discard_equipment_photo(text)') is not null
 and obj_description(to_regprocedure('public.mcpa_can_discard_equipment_photo(text)'),'pg_proc') is distinct from 'MCPA equipment photo cleanup v1' then
  raise exception 'Existing cleanup helper needs manual review.';
 end if;
 for b in select * from storage.buckets where id='equipment-photos' loop
  if b.name is distinct from b.id or b.public is distinct from false or b.file_size_limit is distinct from 5242880::bigint
  or b.allowed_mime_types is null or not (b.allowed_mime_types @> array['image/jpeg','image/png','image/webp'] and b.allowed_mime_types <@ array['image/jpeg','image/png','image/webp']) then
   raise exception 'Existing photo bucket conflicts with private 5 MB JPEG/PNG/WebP requirements.';
  end if;
 end loop;
 if exists(select 1 from pg_trigger where tgrelid='public.equipment'::regclass and tgname='mcpa_equipment_photo_guard'
 and tgfoid is distinct from to_regprocedure('mcpa_auth_private.guard_equipment_photo_reference()')) then
  raise exception 'Existing photo guard trigger needs manual review.';
 end if;
end $$;
alter table public.equipment add column if not exists image_url text;
grant update(image_url) on public.equipment to authenticated;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 values('equipment-photos','equipment-photos',false,5242880,array['image/jpeg','image/png','image/webp']) on conflict(id) do nothing;
create or replace function public.mcpa_can_write_equipment_photo(p_name text)
returns boolean language plpgsql stable security definer set search_path='' as $$
declare person public.profiles;
begin
  if p_name is null or p_name !~ '^[A-Za-z0-9_-]{1,120}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp)$' then return false; end if;
  begin person:=mcpa_auth_private.identity(); exception when insufficient_privilege then return false; end;
  return person.role='admin';
end $$;

create or replace function public.mcpa_can_read_equipment_photo(p_name text)
returns boolean language plpgsql stable security definer set search_path='' as $$
declare person public.profiles;
begin
  if p_name is null or p_name !~ '^[A-Za-z0-9_-]{1,120}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp)$' then return false; end if;
  begin person:=mcpa_auth_private.identity(); exception when insufficient_privilege then return false; end;
  if person.role='admin' then return true; end if;
  return exists(select 1 from public.equipment equipment
    where equipment.image_url='storage://equipment-photos/'||p_name
      and mcpa_auth_private.can_view_tool(equipment,person));
end $$;

comment on function public.mcpa_can_write_equipment_photo(text) is 'MCPA feature storage v1';
comment on function public.mcpa_can_read_equipment_photo(text) is 'MCPA feature storage v1';
revoke all on function public.mcpa_can_write_equipment_photo(text),public.mcpa_can_read_equipment_photo(text) from public,anon,authenticated;
grant execute on function public.mcpa_can_write_equipment_photo(text),public.mcpa_can_read_equipment_photo(text) to authenticated;
create or replace function mcpa_auth_private.guard_equipment_photo_reference()
returns trigger language plpgsql security definer set search_path='' as $$
declare person public.profiles; object_name text;
begin
  if tg_op='UPDATE' and new.image_url is not distinct from old.image_url then return new; end if;
  if coalesce(new.image_url,'') not like 'storage://equipment-photos/%'
    and (tg_op='INSERT' or coalesce(old.image_url,'') not like 'storage://equipment-photos/%') then return new; end if;
  person:=mcpa_auth_private.identity();
  if person.role<>'admin' then raise exception 'Only Admin can change managed equipment photos.' using errcode='42501'; end if;
  if coalesce(new.image_url,'') like 'storage://equipment-photos/%' then
    object_name:=substring(new.image_url from length('storage://equipment-photos/')+1);
    if not public.mcpa_can_write_equipment_photo(object_name)
      or not exists(select 1 from storage.objects where bucket_id='equipment-photos' and name=object_name) then
      raise exception 'Select a valid uploaded equipment photo.' using errcode='22023';
    end if;
  end if;
  return new;
end $$;
revoke all on function mcpa_auth_private.guard_equipment_photo_reference() from public,anon,authenticated;
do $$
begin
  if not exists(select 1 from pg_trigger where tgrelid='public.equipment'::regclass and tgname='mcpa_equipment_photo_guard') then
    create trigger mcpa_equipment_photo_guard before insert or update of image_url on public.equipment
      for each row execute function mcpa_auth_private.guard_equipment_photo_reference();
  end if;
end $$;

drop policy if exists mcpa_equipment_photos_read on storage.objects;
create policy mcpa_equipment_photos_read on storage.objects for select to authenticated
  using(bucket_id='equipment-photos' and public.mcpa_can_read_equipment_photo(name));
drop policy if exists mcpa_equipment_photos_insert on storage.objects;
create policy mcpa_equipment_photos_insert on storage.objects for insert to authenticated
  with check(bucket_id='equipment-photos' and public.mcpa_can_write_equipment_photo(name));
comment on function mcpa_auth_private.guard_equipment_photo_reference() is 'MCPA feature storage v1';
comment on policy mcpa_equipment_photos_read on storage.objects is 'MCPA feature storage v1';
comment on policy mcpa_equipment_photos_insert on storage.objects is 'MCPA feature storage v1';
create or replace function public.mcpa_can_discard_equipment_photo(p_name text)
returns boolean language sql stable security definer set search_path='' as $$
 select public.mcpa_can_write_equipment_photo(p_name)
 and not exists(select 1 from public.equipment e where e.image_url='storage://equipment-photos/'||p_name)
$$;
comment on function public.mcpa_can_discard_equipment_photo(text) is 'MCPA equipment photo cleanup v1';
revoke all on function public.mcpa_can_discard_equipment_photo(text) from public,anon,authenticated;
grant execute on function public.mcpa_can_discard_equipment_photo(text) to authenticated;
drop policy if exists mcpa_equipment_photos_discard on storage.objects;
create policy mcpa_equipment_photos_discard on storage.objects for delete to authenticated
 using(bucket_id='equipment-photos' and public.mcpa_can_discard_equipment_photo(name));
comment on policy mcpa_equipment_photos_discard on storage.objects is 'MCPA equipment photo cleanup v1';
notify pgrst,'reload schema';
commit;
