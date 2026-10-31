-- Apply only this containment migration at the current manual gate.
-- Preserves all records, profile IDs, foreign keys and current mcpa_* RPCs.
-- Retires browser access to the separate legacy handover path.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

do $$
declare table_name text; columns_sql text; browser_role text; legacy_function regprocedure;
begin
  legacy_function := to_regprocedure('public.complete_equipment_handover(uuid)');
  if legacy_function is null
    or to_regclass('public.equipment_transfers') is null
    or to_regclass('public.equipment_history') is null then
    raise exception 'Legacy schema differs from the reviewed preflight. Stop and review; no changes applied.';
  end if;

  -- PUBLIC's default EXECUTE grant must also be removed. RLS on equipment
  -- alone does not contain a privileged SECURITY DEFINER function.
  revoke all on function public.complete_equipment_handover(uuid)
    from public, anon, authenticated;

  foreach table_name in array array['equipment_transfers','equipment_history'] loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('revoke all on table public.%I from public, anon, authenticated', table_name);
    -- Separately granted column privileges survive table-level revocation.
    select string_agg(quote_ident(a.attname), ',' order by a.attnum)
      into columns_sql
    from pg_attribute a
    where a.attrelid = to_regclass('public.' || table_name)
      and a.attnum > 0 and not a.attisdropped;
    execute format('revoke all (%s) on public.%I from public, anon, authenticated', columns_sql, table_name);

    foreach browser_role in array array['anon','authenticated'] loop
      if has_table_privilege(browser_role, 'public.' || table_name,
           'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
        or has_any_column_privilege(browser_role, 'public.' || table_name,
           'SELECT,INSERT,UPDATE,REFERENCES') then
        raise exception 'Unexpected inherited access remains for % on %. Transaction will roll back; review role memberships.', browser_role, table_name;
      end if;
    end loop;
  end loop;
  foreach browser_role in array array['anon','authenticated'] loop
    if has_function_privilege(browser_role, legacy_function, 'EXECUTE') then
      raise exception 'Unexpected inherited legacy RPC access remains for %. Transaction will roll back; review role memberships.', browser_role;
    end if;
  end loop;
end $$;

notify pgrst, 'reload schema';
commit;

-- Return this single verification result after a successful COMMIT.
select jsonb_build_object(
  'legacy_access', (
    select jsonb_agg(jsonb_build_object(
      'table', c.oid::regclass::text,
      'role', r.role_name,
      'rls_enabled', c.relrowsecurity,
      'any_table_access', has_table_privilege(r.role_name, c.oid,
        'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'),
      'any_column_access', has_any_column_privilege(r.role_name, c.oid,
        'SELECT,INSERT,UPDATE,REFERENCES'),
      'legacy_rpc_execute', has_function_privilege(r.role_name,
        'public.complete_equipment_handover(uuid)', 'EXECUTE')
    ) order by c.relname, r.role_name)
    from pg_class c cross join (values ('anon'::text),('authenticated'::text)) r(role_name)
    where c.oid in ('public.equipment_transfers'::regclass,'public.equipment_history'::regclass)
  ),
  'profile_id_foreign_key_still_present', exists(
    select 1 from pg_constraint where conrelid='public.profiles'::regclass
      and conname='profiles_id_fkey' and contype='f'
  )
) as legacy_lockdown_verification;
