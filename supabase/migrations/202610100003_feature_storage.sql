-- Additive private attachment storage. Review and apply manually; no live tests.
-- Requires the existing authenticated-access migrations and Supabase Storage.
-- No equipment rows, movements, notifications or historical records are rewritten.
-- Files are immutable: replacement inserts a new object and retains the original.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';

do $$
declare policy_row record; function_name text; bucket_row record;
begin
  if to_regclass('storage.buckets') is null or to_regclass('storage.objects') is null
    or to_regprocedure('mcpa_auth_private.identity()') is null
    or to_regprocedure('mcpa_auth_private.can_view_tool(public.equipment,public.profiles)') is null
    or to_regprocedure('public.mcpa_has_role(text[])') is null then
    raise exception 'Authenticated access and Supabase Storage must be installed before feature storage. Stop and review.';
  end if;
  if not exists(select 1 from pg_class where oid='storage.objects'::regclass and relrowsecurity) then
    raise exception 'Storage objects must already have row-level security enabled. Stop and review.';
  end if;
  if exists(select 1 from information_schema.columns where table_schema='public' and table_name='equipment'
    and column_name='image_url' and data_type not in ('text','character varying')) then
    raise exception 'Existing equipment.image_url is not a supported text column. Stop and review.';
  end if;
  -- A permissive policy can OR around another policy. Never silently replace
  -- unrelated Storage access rules or assume they exclude these new buckets.
  for policy_row in select p.polname, obj_description(p.oid,'pg_policy') as marker
    from pg_policy p where p.polrelid='storage.objects'::regclass
      and (0=any(p.polroles) or exists(select 1 from pg_roles r where r.oid=any(p.polroles) and r.rolname in ('anon','authenticated')))
  loop
    if policy_row.polname not in ('mcpa_equipment_photos_read','mcpa_equipment_photos_insert','mcpa_purchase_receipts_read','mcpa_purchase_receipts_insert')
      or policy_row.marker is distinct from 'MCPA feature storage v1' then
      raise exception 'Existing Storage policy % requires review before private feature buckets can be installed.',policy_row.polname;
    end if;
  end loop;
  foreach function_name in array array['mcpa_can_read_equipment_photo','mcpa_can_write_equipment_photo','mcpa_can_access_purchase_receipt'] loop
    if to_regprocedure('public.'||function_name||'(text)') is not null
      and obj_description(to_regprocedure('public.'||function_name||'(text)'),'pg_proc') is distinct from 'MCPA feature storage v1' then
      raise exception 'Existing function % differs from this attachment implementation. Stop and review.',function_name;
    end if;
  end loop;
  for bucket_row in select * from storage.buckets where id in ('equipment-photos','purchase-receipts') loop
    if bucket_row.name is distinct from bucket_row.id or bucket_row.public is distinct from false
      or bucket_row.file_size_limit is distinct from (case bucket_row.id when 'equipment-photos' then 5242880::bigint else 10485760::bigint end)
      or bucket_row.allowed_mime_types is null
      or not (bucket_row.allowed_mime_types @> (case bucket_row.id when 'equipment-photos' then array['image/jpeg','image/png','image/webp'] else array['application/pdf','image/jpeg','image/png','image/webp'] end)
        and bucket_row.allowed_mime_types <@ (case bucket_row.id when 'equipment-photos' then array['image/jpeg','image/png','image/webp'] else array['application/pdf','image/jpeg','image/png','image/webp'] end)) then
      raise exception 'Existing bucket % has conflicting privacy, size or MIME settings. Stop and review.',bucket_row.id;
    end if;
  end loop;
end $$;

-- Optional column already read by the operational snapshot through to_jsonb(e).
-- Preserve the current Admin/Tool Handler legacy metadata edit policy. New
-- managed private photo references and uploads are Admin-only (see guard below).
alter table public.equipment add column if not exists image_url text;
grant update(image_url) on public.equipment to authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values
  ('equipment-photos','equipment-photos',false,5242880,array['image/jpeg','image/png','image/webp']),
  ('purchase-receipts','purchase-receipts',false,10485760,array['application/pdf','image/jpeg','image/png','image/webp'])
on conflict(id) do nothing;

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

create or replace function public.mcpa_can_access_purchase_receipt(p_name text)
returns boolean language plpgsql stable security definer set search_path='' as $$
declare person public.profiles;
begin
  if p_name is null or p_name !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(pdf|jpg|png|webp)$' then return false; end if;
  begin person:=mcpa_auth_private.identity(); exception when insufficient_privilege then return false; end;
  return person.role in ('admin','secretary');
end $$;

comment on function public.mcpa_can_write_equipment_photo(text) is 'MCPA feature storage v1';
comment on function public.mcpa_can_read_equipment_photo(text) is 'MCPA feature storage v1';
comment on function public.mcpa_can_access_purchase_receipt(text) is 'MCPA feature storage v1';
revoke all on function public.mcpa_can_write_equipment_photo(text),public.mcpa_can_read_equipment_photo(text),public.mcpa_can_access_purchase_receipt(text) from public,anon,authenticated;
grant execute on function public.mcpa_can_write_equipment_photo(text),public.mcpa_can_read_equipment_photo(text),public.mcpa_can_access_purchase_receipt(text) to authenticated;

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
drop policy if exists mcpa_purchase_receipts_read on storage.objects;
create policy mcpa_purchase_receipts_read on storage.objects for select to authenticated
  using(bucket_id='purchase-receipts' and public.mcpa_can_access_purchase_receipt(name));
drop policy if exists mcpa_purchase_receipts_insert on storage.objects;
create policy mcpa_purchase_receipts_insert on storage.objects for insert to authenticated
  with check(bucket_id='purchase-receipts' and public.mcpa_can_access_purchase_receipt(name));
comment on policy mcpa_equipment_photos_read on storage.objects is 'MCPA feature storage v1';
comment on policy mcpa_equipment_photos_insert on storage.objects is 'MCPA feature storage v1';
comment on policy mcpa_purchase_receipts_read on storage.objects is 'MCPA feature storage v1';
comment on policy mcpa_purchase_receipts_insert on storage.objects is 'MCPA feature storage v1';
-- No UPDATE or DELETE policies: use unique new paths and retain prior versions.
notify pgrst,'reload schema';
commit;

select jsonb_build_object(
  'private_buckets',(select count(*)=2 from storage.buckets where id in ('equipment-photos','purchase-receipts') and not public),
  'equipment_photo_column',exists(select 1 from information_schema.columns where table_schema='public' and table_name='equipment' and column_name='image_url'),
  'anonymous_helper_access',has_function_privilege('anon','public.mcpa_can_read_equipment_photo(text)','EXECUTE'),
  'immutable_objects',not exists(select 1 from pg_policies where schemaname='storage' and tablename='objects' and cmd in ('UPDATE','DELETE','ALL'))
) as feature_storage_verification;
