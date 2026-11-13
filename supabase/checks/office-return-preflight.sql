-- READ ONLY: existing location IDs/names and return implementation metadata.
-- No accounts, equipment, custody, movements, emails, tokens or records changed.
-- The legacy cancellation_gateway_installed field checks a SAVED DELEGATE only.
-- It is not an Office prerequisite or proof that cancellation is reachable.
-- Read gateway_architecture and run release-compatibility-diagnostics.sql next.
with gateway as (
  select md5(replace(prosrc,E'\r','')) hash from pg_proc
  where oid=to_regprocedure('public.mcpa_movement_action(text,jsonb,uuid)')
), office_delegate as (
  select md5(replace(prosrc,E'\r','')) hash from pg_proc
  where oid=to_regprocedure('mcpa_auth_private.movement_before_office_returns(text,jsonb,uuid)')
), cancellation_delegate as (
  select md5(replace(prosrc,E'\r','')) hash from pg_proc
  where oid=to_regprocedure('mcpa_auth_private.movement_before_cancellation(text,jsonb,uuid)')
)
select jsonb_build_object(
  'gateway_architecture',case
    when (select hash from gateway)='c26d3585fe9e140e072b12a273f7bb19' then case
      when (select hash from office_delegate)='582ea68af753d0fdd81461c537dbf9ab' then 'office_over_portal_without_cancellation'
      when (select hash from office_delegate)='9aa50e5af660aea383b993a3a578f86a'
        and (select hash from cancellation_delegate)='582ea68af753d0fdd81461c537dbf9ab' then 'office_over_cancellation_over_portal'
      else 'office_with_missing_or_unreviewed_delegate' end
    when (select hash from gateway)='582ea68af753d0fdd81461c537dbf9ab' then 'portal_without_office_or_cancellation'
    when (select hash from gateway)='9aa50e5af660aea383b993a3a578f86a'
      and (select hash from cancellation_delegate)='582ea68af753d0fdd81461c537dbf9ab' then 'cancellation_over_portal_without_office'
    else 'missing_or_unreviewed_gateway' end,
  'cancellation_delegate_name_present',exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='mcpa_auth_private' and p.proname='movement_before_cancellation'),
  'locations',coalesce((select jsonb_agg(jsonb_build_object(
    'id',s.id,'name',s.name,'location',s.location,
    'is_active',to_jsonb(s)->'is_active') order by s.name,s.id)
    from public.sites s),'[]'::jsonb),
  'identity_installed',to_regprocedure('mcpa_auth_private.identity()') is not null,
  'portal_gateway_installed',to_regprocedure('mcpa_auth_private.movement_authorized(text,jsonb,uuid)') is not null,
  'cancellation_gateway_installed',to_regprocedure('mcpa_auth_private.movement_before_cancellation(text,jsonb,uuid)') is not null,
  'office_return_installed',to_regprocedure('public.mcpa_return_destination()') is not null,
  'movement_gateway_source_md5',(select md5(replace(prosrc,E'\r','')) from pg_proc
    where oid=to_regprocedure('public.mcpa_movement_action(text,jsonb,uuid)')),
  'return_implementation_source_md5',(select md5(replace(prosrc,E'\r','')) from pg_proc
    where oid=to_regprocedure('mcpa_auth_private.mcpa_movement_action(text,jsonb,uuid)')),
  'reviewed_lifecycle_compatible',(select md5(replace(replace(prosrc,E'\r',''),
    $optional$if char_length(p_payload->>'purpose')>2000 then raise exception 'Purpose must be at most 2000 characters.' using errcode='22023'; end if;$optional$,
    $required$if nullif(btrim(p_payload->>'purpose'),'') is null or char_length(p_payload->>'purpose')>2000 then raise exception 'Enter a purpose of at most 2000 characters.' using errcode='22023'; end if;$required$))='5b94b3b5642f26981a80382a2b1b6be7'
    from pg_proc where oid=to_regprocedure('mcpa_auth_private.mcpa_movement_action(text,jsonb,uuid)')),
  'optional_purpose_installed',(select strpos(prosrc,$optional$if char_length(p_payload->>'purpose')>2000 then raise exception 'Purpose must be at most 2000 characters.' using errcode='22023'; end if;$optional$)>0
    from pg_proc where oid=to_regprocedure('mcpa_auth_private.mcpa_movement_action(text,jsonb,uuid)')),
  'stable_recipient_preserved',(select strpos(prosrc,$identity$v_receiver_id := nullif(p_payload->>'receiverId','')::uuid;$identity$)>0
    from pg_proc where oid=to_regprocedure('mcpa_auth_private.mcpa_movement_action(text,jsonb,uuid)')),
  'anonymous_movement_execute',coalesce(has_function_privilege('anon',
    to_regprocedure('public.mcpa_movement_action(text,jsonb,uuid)')::oid,'EXECUTE'),false)
) as office_return_preflight;
