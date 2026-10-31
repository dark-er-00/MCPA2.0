-- MANUAL ONLY: receipts storage, after deployed equipment-photo compatibility,
-- BEFORE 202610100005_purchase_ledger and Consumables 202610220000/001/002.
-- Deliberately not chronological deployment order. See supabase/migrations/README.md.
-- Once-only clean install; existing receipt artifacts require explicit review.
-- No equipment bucket/policy/function/trigger/column or existing object is changed.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
set local search_path=pg_catalog,public;

do $$
declare policy_row record; expected_command "char"; expected_expression text; expected_marker text;
  authenticated_oid oid; bucket_row record;
begin
  if to_regclass('storage.buckets') is null or to_regclass('storage.objects') is null
    or to_regprocedure('mcpa_auth_private.identity()') is null
    or to_regprocedure('public.mcpa_has_role(text[])') is null
    or to_regprocedure('auth.uid()') is null then
    raise exception 'Authenticated identity/role helpers and existing Supabase Storage are required.';
  end if;
  if not exists(select 1 from pg_class where oid='storage.objects'::regclass and relrowsecurity)
    or not exists(select 1 from pg_class where oid='storage.buckets'::regclass and relrowsecurity) then
    raise exception 'Storage objects/buckets RLS must already be enabled. Nothing installed.';
  end if;
  if not exists(select 1 from pg_proc where oid='mcpa_auth_private.identity()'::regprocedure
      and prorettype='public.profiles'::regtype and prosecdef and provolatile='s' and proconfig=array['search_path=""'])
    or not exists(select 1 from pg_proc where oid='public.mcpa_has_role(text[])'::regprocedure
      and prorettype='boolean'::regtype and prosecdef and provolatile='s' and proconfig=array['search_path=""']) then
    raise exception 'Identity/role helper signature or security configuration differs. Review its definition.';
  end if;
  if exists(select 1 from pg_roles where rolname in ('anon','authenticated') and (rolsuper or rolbypassrls)) then
    raise exception 'Browser roles must not bypass RLS.';
  end if;
  if exists(select 1 from pg_class c where c.oid in ('storage.objects'::regclass,'storage.buckets'::regclass)
    and (pg_has_role('authenticated',c.relowner,'MEMBER') or pg_has_role('anon',c.relowner,'MEMBER'))) then
    raise exception 'Browser roles must not inherit Storage table ownership.';
  end if;
  -- Review-compatible bodies from authenticated_access.sql. Whitespace/CRLF is
  -- immaterial; a different role/active-account implementation requires review,
  -- never replacement of existing authentication helpers by this migration.
  if (select regexp_replace(prosrc,'[[:space:]]+','','g') from pg_proc where oid='mcpa_auth_private.identity()'::regprocedure)
    is distinct from regexp_replace($identity$
declare p public.profiles;
begin
  select * into p from public.profiles where auth_user_id=auth.uid();
  if p.id is null or p.account_status<>'active' or p.role is null or p.role not in ('admin','secretary','tool_handler','engineer','architect') then
    raise exception 'An active authorized account is required.' using errcode='42501';
  end if;
  return p;
end $identity$,'[[:space:]]+','','g')
    or (select regexp_replace(prosrc,'[[:space:]]+','','g') from pg_proc where oid='public.mcpa_has_role(text[])'::regprocedure)
    is distinct from regexp_replace($roles$
  select exists(select 1 from public.profiles where auth_user_id=auth.uid() and account_status='active' and role=any(roles));
$roles$,'[[:space:]]+','','g') then
    raise exception 'Identity/role helper definition differs from reviewed authentication. Stop for manual review.';
  end if;
  -- Fail closed on ANY overload or existing definition; never CREATE OR REPLACE
  -- a helper merely because its name/comment resembles the expected implementation.
  if exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname='mcpa_can_access_purchase_receipt') then
    raise exception 'Receipt access helper already exists (possibly another signature). Review; no function replaced.';
  end if;
  if exists(select 1 from pg_policy where polrelid='storage.objects'::regclass
    and polname in ('mcpa_purchase_receipts_read','mcpa_purchase_receipts_insert')) then
    raise exception 'Receipt policies already exist. Review installation/history; no policy replaced.';
  end if;
  for bucket_row in select * from storage.buckets where id='purchase-receipts' or name='purchase-receipts' loop
    if bucket_row.id is distinct from 'purchase-receipts' or bucket_row.name is distinct from 'purchase-receipts'
      or bucket_row.public is distinct from false or bucket_row.file_size_limit is distinct from 10485760::bigint
      or bucket_row.allowed_mime_types is null
      or not (bucket_row.allowed_mime_types @> array['application/pdf','image/jpeg','image/png','image/webp']
        and bucket_row.allowed_mime_types <@ array['application/pdf','image/jpeg','image/png','image/webp']) then
      raise exception 'Existing receipt bucket has incompatible settings; nothing changed.';
    end if;
    raise exception 'Receipt bucket already exists. Review objects and migration history before proceeding.';
  end loop;
  if exists(select 1 from storage.objects where bucket_id='purchase-receipts') then
    raise exception 'Existing receipt objects require manual reconciliation; nothing changed.';
  end if;
  select oid into authenticated_oid from pg_roles where rolname='authenticated';
  if authenticated_oid is null or not exists(select 1 from pg_roles where rolname='anon') then
    raise exception 'Expected Supabase browser roles are missing.';
  end if;
  if pg_has_role('anon','authenticated','MEMBER') then
    raise exception 'Anonymous role must not inherit authenticated helper permissions.';
  end if;
  -- A browser-capable bucket mutation policy could make the new private bucket
  -- public or remove its limits. Stop for review rather than modifying it.
  if exists(select 1 from pg_policy p where p.polrelid='storage.buckets'::regclass and p.polcmd in ('a','w','d','*') and
    (0=any(p.polroles) or exists(select 1 from pg_roles r where r.oid=any(p.polroles)
      and (pg_has_role('authenticated',r.oid,'MEMBER') or pg_has_role('anon',r.oid,'MEMBER'))))) then
    raise exception 'Storage bucket mutation policies require review before installing private receipts.';
  end if;
  -- Policies combine with OR. Validate the entire definitions of the ONLY known
  -- browser-applicable policies, including inherited roles, not only names/markers.
  -- These predicates cannot authorize purchase-receipts because their bucket
  -- equality is conjoined with the equipment helper. The cleanup DELETE is valid.
  for policy_row in select p.*,obj_description(p.oid,'pg_policy') marker,
      pg_get_expr(p.polqual,p.polrelid) using_expression,pg_get_expr(p.polwithcheck,p.polrelid) check_expression
    from pg_policy p where p.polrelid='storage.objects'::regclass and
    (0=any(p.polroles) or exists(select 1 from pg_roles r where r.oid=any(p.polroles)
      and (pg_has_role('authenticated',r.oid,'MEMBER') or pg_has_role('anon',r.oid,'MEMBER'))))
  loop
    case policy_row.polname
      when 'mcpa_equipment_photos_read' then
        expected_command:='r';expected_expression:='((bucket_id = ''equipment-photos''::text) AND mcpa_can_read_equipment_photo(name))';expected_marker:='MCPA feature storage v1';
      when 'mcpa_equipment_photos_insert' then
        expected_command:='a';expected_expression:='((bucket_id = ''equipment-photos''::text) AND mcpa_can_write_equipment_photo(name))';expected_marker:='MCPA feature storage v1';
      when 'mcpa_equipment_photos_discard' then
        expected_command:='d';expected_expression:='((bucket_id = ''equipment-photos''::text) AND mcpa_can_discard_equipment_photo(name))';expected_marker:='MCPA equipment photo cleanup v1';
      else raise exception 'Storage policy % needs review; unrelated permissions will not be changed.',policy_row.polname;
    end case;
    if policy_row.polcmd is distinct from expected_command or policy_row.polpermissive is distinct from true
      or policy_row.polroles is distinct from array[authenticated_oid] or policy_row.marker is distinct from expected_marker
      or (expected_command='a' and (policy_row.using_expression is not null or
        replace(policy_row.check_expression,'public.','') is distinct from expected_expression))
      or (expected_command<>'a' and (policy_row.check_expression is not null or
        replace(policy_row.using_expression,'public.','') is distinct from expected_expression)) then
      raise exception 'Storage policy % differs from the reviewed bucket-scoped equipment definition.',policy_row.polname;
    end if;
  end loop;
end $$;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('purchase-receipts','purchase-receipts',false,10485760,array['application/pdf','image/jpeg','image/png','image/webp']);

create function public.mcpa_can_access_purchase_receipt(p_name text)
returns boolean language plpgsql stable security definer set search_path='' as $$
declare person public.profiles;
begin
  if p_name is null or p_name !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(pdf|jpg|png|webp)$' then return false;end if;
  begin person:=mcpa_auth_private.identity();exception when insufficient_privilege then return false;end;
  return person.role in ('admin','secretary');
end $$;
comment on function public.mcpa_can_access_purchase_receipt(text) is 'MCPA purchase receipt storage compatibility v1';
revoke all on function public.mcpa_can_access_purchase_receipt(text) from public,anon,authenticated;
grant execute on function public.mcpa_can_access_purchase_receipt(text) to authenticated;

create policy mcpa_purchase_receipts_read on storage.objects for select to authenticated
using(bucket_id='purchase-receipts' and public.mcpa_can_access_purchase_receipt(name));
create policy mcpa_purchase_receipts_insert on storage.objects for insert to authenticated
with check(bucket_id='purchase-receipts' and public.mcpa_can_access_purchase_receipt(name));
comment on policy mcpa_purchase_receipts_read on storage.objects is 'MCPA purchase receipt storage compatibility v1';
comment on policy mcpa_purchase_receipts_insert on storage.objects is 'MCPA purchase receipt storage compatibility v1';
-- No object UPDATE/DELETE grants or policies, and no table/service grants changed.
notify pgrst,'reload schema';
commit;
