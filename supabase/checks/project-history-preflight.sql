-- READ ONLY. Run this entire SELECT in the existing project's SQL Editor.
-- Returns schema/permissions/definitions only: no account data or credentials.
-- Do not run the old Projects setup.sql or rerun the portal migration.
with related_relations as (
  select c.oid, n.nspname, c.relname, c.relkind, c.relrowsecurity, c.relforcerowsecurity
  from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where c.relkind in ('r','p','v','m','f')
    and n.nspname not in ('pg_catalog','information_schema','auth','storage','vault')
    and n.nspname not like 'pg_%'
    and (
      (n.nspname='public' and c.relname in ('sites','projects','project_history'))
      or c.relname ~* '(project|site).*(histor|audit)|(histor|audit).*(project|site)'
      or (exists(select 1 from pg_attribute a where a.attrelid=c.oid
            and a.attnum>0 and not a.attisdropped and a.attname in ('project_id','site_id'))
        and exists(select 1 from pg_attribute a where a.attrelid=c.oid
            and a.attnum>0 and not a.attisdropped and a.attname in ('before_values','after_values','changed_at')))
    )
), related_triggers as (
  select t.* from pg_trigger t
  where not t.tgisinternal and t.tgrelid in (select oid from related_relations)
), related_functions as (
  select p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where (n.nspname='public' and p.proname in (
    'mcpa_project_snapshot','project_record_history','project_history_immutable',
    'sites_touch_updated_at','sites_sync_archive','mcpa_has_role'))
    or p.oid in (select tgfoid from related_triggers)
)
select jsonb_build_object(
  'project_history_exists',to_regclass('public.project_history') is not null,
  'project_snapshot_exists',to_regprocedure('public.mcpa_project_snapshot()') is not null,
  'snapshot_references_project_history',(
    select strpos(p.prosrc,'public.project_history')>0 from pg_proc p
    where p.oid=to_regprocedure('public.mcpa_project_snapshot()')),
  'relations',coalesce((select jsonb_agg(jsonb_build_object(
    'schema',r.nspname,'name',r.relname,'kind',r.relkind,
    'rls_enabled',r.relrowsecurity,'rls_forced',r.relforcerowsecurity,
    'columns',coalesce((select jsonb_agg(jsonb_build_object(
      'name',a.attname,'type',format_type(a.atttypid,a.atttypmod),
      'not_null',a.attnotnull,'default',pg_get_expr(d.adbin,d.adrelid)) order by a.attnum)
      from pg_attribute a left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum
      where a.attrelid=r.oid and a.attnum>0 and not a.attisdropped),'[]'::jsonb),
    'constraints',coalesce((select jsonb_agg(jsonb_build_object(
      'name',c.conname,'definition',pg_get_constraintdef(c.oid)) order by c.conname)
      from pg_constraint c where c.conrelid=r.oid),'[]'::jsonb),
    'view_definition',case when r.relkind in ('v','m') then pg_get_viewdef(r.oid,true) end
  ) order by r.nspname,r.relname) from related_relations r),'[]'::jsonb),
  'triggers',coalesce((select jsonb_agg(jsonb_build_object(
    'relation',t.tgrelid::regclass::text,'name',t.tgname,'enabled',t.tgenabled,
    'definition',pg_get_triggerdef(t.oid)) order by t.tgrelid::regclass::text,t.tgname)
    from related_triggers t),'[]'::jsonb),
  'functions',coalesce((select jsonb_agg(jsonb_build_object(
    'function',f.oid::regprocedure::text,'definition',pg_get_functiondef(f.oid),
    'anon_execute',has_function_privilege('anon',f.oid,'EXECUTE'),
    'authenticated_execute',has_function_privilege('authenticated',f.oid,'EXECUTE'))
    order by f.oid::regprocedure::text) from related_functions f),'[]'::jsonb),
  'policies',coalesce((select jsonb_agg(to_jsonb(p) order by p.tablename,p.policyname)
    from pg_policies p join related_relations r on r.nspname=p.schemaname and r.relname=p.tablename),'[]'::jsonb),
  'effective_privileges',coalesce((select jsonb_agg(jsonb_build_object(
    'relation',r.oid::regclass::text,'role',browser.role_name,
    'select',has_table_privilege(browser.role_name,r.oid,'SELECT'),
    'insert',has_table_privilege(browser.role_name,r.oid,'INSERT'),
    'update',has_table_privilege(browser.role_name,r.oid,'UPDATE'),
    'delete',has_table_privilege(browser.role_name,r.oid,'DELETE'),
    'truncate',has_table_privilege(browser.role_name,r.oid,'TRUNCATE'),
    'any_column_write',has_any_column_privilege(browser.role_name,r.oid,'INSERT,UPDATE'))
    order by r.oid::regclass::text,browser.role_name)
    from related_relations r cross join (values ('anon'::text),('authenticated'::text)) browser(role_name)),'[]'::jsonb)
) as project_history_dependency_review;
