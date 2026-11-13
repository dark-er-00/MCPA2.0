-- MANUAL SUPABASE STEP: review equipment-office-preflight.sql before running.
-- Requires the verified Office configuration from 202610120002_office_returns.sql.
-- Prospective INSERT default only. No existing equipment or history is updated.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
lock table public.equipment in share row exclusive mode;

do $$
declare policy_check text; office public.sites;
begin
  if to_regprocedure('mcpa_auth_private.office_return_site()') is null
    or to_regprocedure('mcpa_auth_private.identity()') is null then
    raise exception 'Configure the verified Office through the Office returns migration first.';
  end if;
  office:=mcpa_auth_private.office_return_site();
  if not (select relrowsecurity from pg_class where oid='public.equipment'::regclass) then
    raise exception 'Equipment RLS must be enabled. Stop and review the preflight.';
  end if;
  if (select count(*) from pg_policies where schemaname='public' and tablename='equipment' and cmd in ('INSERT','ALL'))<>1 then
    raise exception 'Unexpected equipment insert policies. Stop rather than weakening access.';
  end if;
  select lower(regexp_replace(replace(replace(with_check,'public.',''),'::text',''),'[[:space:]()]','','g'))
    into policy_check from pg_policies where schemaname='public' and tablename='equipment'
      and policyname='mcpa_equipment_insert' and cmd='INSERT' and roles=array['authenticated']::name[];
  if policy_check is null or policy_check not in (
    'mcpa_has_rolearray[''admin'',''tool_handler'']andcurrent_holder_idisnullandsite_idisnullandstatus=''available''',
    'mcpa_has_rolearray[''admin'',''tool_handler'']andcurrent_holder_idisnullandsite_id=mcpa_inventory_office->>''id''::uuidandstatus=''available'''
  ) then
    raise exception 'The equipment insert policy differs from the reviewed policy. Stop and inspect it.';
  end if;
  if exists(select 1 from pg_proc where oid=to_regprocedure('public.mcpa_inventory_office()')
    and obj_description(oid,'pg_proc') is distinct from 'MCPA inventory Office v1')
    or exists(select 1 from pg_proc where oid=to_regprocedure('mcpa_auth_private.new_equipment_office()')
      and obj_description(oid,'pg_proc') is distinct from 'MCPA inventory Office v1') then
    raise exception 'An unrelated Office function already exists. Stop and review.';
  end if;
  if exists(select 1 from pg_trigger where tgrelid='public.equipment'::regclass
    and tgname='mcpa_new_equipment_office' and not tgisinternal
    and (tgfoid<>coalesce(to_regprocedure('mcpa_auth_private.new_equipment_office()'),0::oid) or tgtype<>7)) then
    raise exception 'An unrelated equipment Office trigger exists. Stop and review.';
  end if;
end $$;

-- Narrow metadata getter; field accounts retain their existing scoped equipment RPCs.
create or replace function public.mcpa_inventory_office()
returns jsonb language plpgsql security definer set search_path='' as $$
declare person public.profiles; office public.sites;
begin
  person:=mcpa_auth_private.identity();
  if person.role not in ('admin','tool_handler','engineer','architect') then
    raise exception 'Equipment access required.' using errcode='42501';
  end if;
  office:=mcpa_auth_private.office_return_site();
  return jsonb_build_object('id',office.id,'name',office.name,'location',office.location,'label','Office');
end $$;
comment on function public.mcpa_inventory_office() is 'MCPA inventory Office v1';
revoke all on function public.mcpa_inventory_office() from public,anon,service_role;
grant execute on function public.mcpa_inventory_office() to authenticated;

create or replace function mcpa_auth_private.new_equipment_office()
returns trigger language plpgsql security definer set search_path='' as $$
declare office public.sites;
begin
  -- Trusted imports with an explicit location or custody keep that information.
  -- Client inserts are further restricted to new, available Office stock by RLS.
  if new.site_id is null and new.current_holder_id is null and new.status::text='AVAILABLE' then
    office:=mcpa_auth_private.office_return_site();
    new.site_id:=office.id;
  end if;
  return new;
end $$;
comment on function mcpa_auth_private.new_equipment_office() is 'MCPA inventory Office v1';
revoke all on function mcpa_auth_private.new_equipment_office() from public,anon,authenticated,service_role;
drop trigger if exists mcpa_new_equipment_office on public.equipment;
create trigger mcpa_new_equipment_office before insert on public.equipment
  for each row execute function mcpa_auth_private.new_equipment_office();

alter policy mcpa_equipment_insert on public.equipment to authenticated with check (
  public.mcpa_has_role(array['admin','tool_handler']) and current_holder_id is null
  and site_id=((public.mcpa_inventory_office()->>'id')::uuid) and status::text='AVAILABLE'
);
notify pgrst,'reload schema';
commit;
