-- READ ONLY. Save results for manual review; do not automatically apply anything.
-- Baseline engine plus the verified-inventory guard; optional purpose normalized.
with source as (
  select replace(prosrc,E'\r','') body from pg_proc
  where oid=to_regprocedure('mcpa_auth_private.mcpa_movement_action(text,jsonb,uuid)')
), normalized as (
  select replace(body,
    $optional$if char_length(p_payload->>'purpose')>2000 then raise exception 'Purpose must be at most 2000 characters.' using errcode='22023'; end if;$optional$,
    $required$if nullif(btrim(p_payload->>'purpose'),'') is null or char_length(p_payload->>'purpose')>2000 then raise exception 'Enter a purpose of at most 2000 characters.' using errcode='22023'; end if;$required$) body
  from source
)
select jsonb_build_object(
  'reviewed_engine',coalesce((select md5(body)='a3855ca864dc46f2f53bb4b2f309e524' from normalized),false),
  'identity',to_regprocedure('mcpa_auth_private.identity()') is not null,
  'office_returns',to_regprocedure('mcpa_auth_private.office_return_site()') is not null,
  'verified_inventory',to_regprocedure('mcpa_auth_private.inventory_lock(uuid)') is not null,
  'monitoring',to_regclass('public.mcpa_notifications') is not null,
  'storage',to_regclass('storage.objects') is not null,
  'b_migration_not_installed',to_regclass('public.mcpa_b_return_items') is null,
  'b_migration_filename','202610250002_custody_lifecycle.sql'
) as custody_v2_preflight;
-- Also review pg_policies/ACLs for the actual target. This file makes no changes.
