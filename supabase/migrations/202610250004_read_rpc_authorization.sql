-- Forward correction after quantity/custody integration (003).
-- Apply only to an independently verified target; production requires release approval.
-- STABLE PostgREST readers run READ ONLY and cannot acquire wa_actor's row lock.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';

create function mcpa_auth_private.wa_read_actor(roles text[])
returns public.profiles language plpgsql stable security definer set search_path='' as $$
declare actor public.profiles;
begin
  actor:=mcpa_auth_private.identity();
  if (actor.role=any(roles)) is distinct from true then
    raise exception 'This action is not permitted for your account.' using errcode='42501';
  end if;
  return actor;
end $$;
revoke all on function mcpa_auth_private.wa_read_actor(text[]) from public,anon,authenticated,service_role;

-- Change only the authorization call in the installed reader definitions.
-- This retains their complete SQL bodies, owners, settings and existing ACLs.
do $$
declare signature text; reader_oid oid; definition text; original_acl aclitem[];
  mutation_definition text:=pg_get_functiondef('mcpa_auth_private.wa_actor(text[])'::regprocedure);
begin
  if to_regprocedure('mcpa_auth_private.integration_equipment_identity()') is null then
    raise exception 'Install quantity/custody integration 003 before this correction.';
  end if;
  if position('for share' in lower(mutation_definition))=0 then
    raise exception 'Expected locking mutation authorization helper; stop and inspect drift.';
  end if;
  foreach signature in array array[
    'public.mcpa_wa_equipment_catalog()',
    'public.mcpa_wa_equipment_requests()',
    'public.mcpa_wa_suggest_equipment(uuid)',
    'public.mcpa_wa_consumables_catalog()',
    'public.mcpa_wa_consumables_snapshot()',
    'public.mcpa_wa_consumables_analytics(timestamp with time zone,timestamp with time zone)',
    'public.mcpa_import_equipment_v2_receipt(uuid)'
  ] loop
    reader_oid:=to_regprocedure(signature);
    if reader_oid is null or not exists(select 1 from pg_proc where oid=reader_oid
        and provolatile='s' and prosecdef and proconfig=array['search_path=""']) then
      raise exception 'Expected STABLE SECURITY DEFINER reader with empty search_path: %',signature;
    end if;
    definition:=pg_get_functiondef(reader_oid);
    if (length(definition)-length(replace(definition,'mcpa_auth_private.wa_actor(','')))
        <>length('mcpa_auth_private.wa_actor(') then
      raise exception 'Expected exactly one locking authorization call: %',signature;
    end if;
    select proacl into original_acl from pg_proc where oid=reader_oid;
    execute replace(definition,'mcpa_auth_private.wa_actor(','mcpa_auth_private.wa_read_actor(');
    if pg_get_functiondef(reader_oid)<>replace(definition,'mcpa_auth_private.wa_actor(','mcpa_auth_private.wa_read_actor(')
        or (select proacl from pg_proc where oid=reader_oid) is distinct from original_acl then
      raise exception 'Unexpected reader definition or grant change: %',signature;
    end if;
  end loop;
  if pg_get_functiondef('mcpa_auth_private.wa_actor(text[])'::regprocedure)<>mutation_definition then
    raise exception 'Mutation authorization helper changed unexpectedly.';
  end if;
  if exists(select 1 from unnest(array['anon','authenticated','service_role']) r
      where has_function_privilege(r,'mcpa_auth_private.wa_read_actor(text[])','EXECUTE')) then
    raise exception 'Read authorization helper must remain private.';
  end if;
end $$;
commit;
