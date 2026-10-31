-- READ ONLY. Run as the database owner; retain all result sets for comparison.
-- If a prerequisite is missing or differs, stop; do not run legacy setup.sql.
begin read only;
select to_regclass('public.sites') as sites,
  to_regclass('public.project_history') as history,
  to_regprocedure('mcpa_auth_private.identity()') as identity_helper,
  to_regprocedure('public.mcpa_project_snapshot()') as engineer_snapshot,
  to_regprocedure('public.mcpa_save_project(uuid,bigint,uuid,jsonb,text)') as upgrade_already_present;
select table_name,column_name,data_type,udt_name,is_nullable,column_default
  from information_schema.columns where table_schema='public' and table_name in ('sites','project_history','profiles') order by table_name,ordinal_position;
select c.relname,c.relrowsecurity,c.relforcerowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public' and c.relname in ('sites','project_history');
select * from pg_policies where schemaname='public' and tablename in ('sites','project_history','profiles') order by tablename,policyname;
select c.relname,con.conname,pg_get_constraintdef(con.oid) as definition
  from pg_constraint con join pg_class c on c.oid=con.conrelid where con.conrelid in (to_regclass('public.sites'),to_regclass('public.project_history')) order by c.relname,con.conname;
select c.relname,t.tgname,t.tgenabled,pg_get_triggerdef(t.oid) as definition from pg_trigger t join pg_class c on c.oid=t.tgrelid
  where t.tgrelid in (to_regclass('public.sites'),to_regclass('public.project_history')) and not t.tgisinternal order by c.relname,t.tgname;
select p.oid::regprocedure as function,pg_get_functiondef(p.oid) as definition
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where (n.nspname='public' and p.proname in ('project_record_history','project_history_immutable','sites_touch_updated_at','mcpa_project_snapshot','mcpa_has_role'))
     or (n.nspname='mcpa_auth_private' and p.proname='identity') order by 1;
select r.name as role,t.name as relation,
  has_table_privilege(r.name,'public.'||t.name,'SELECT') as can_read,
  has_table_privilege(r.name,'public.'||t.name,'INSERT') as can_insert,
  has_table_privilege(r.name,'public.'||t.name,'UPDATE') as can_update,
  has_table_privilege(r.name,'public.'||t.name,'DELETE,TRUNCATE,TRIGGER') as other_write,
  has_any_column_privilege(r.name,'public.'||t.name,'INSERT,UPDATE') as column_write
  from (values('anon'),('authenticated')) r(name) cross join (values('sites'),('project_history')) t(name);
select phase,count(*) as projects from public.sites group by phase order by phase;
select status,is_active,count(*) as projects from public.sites group by status,is_active order by status,is_active;
-- Compare these legacy projections with postflight before allowing new writes.
select 'sites' as relation,count(*) as rows,md5(coalesce(jsonb_agg(to_jsonb(s)-array['project_stage','current_work_area','construction_work_areas','construction_completion','project_version'] order by id)::text,'[]')) as legacy_fingerprint from public.sites s
union all select 'project_history',count(*),md5(coalesce(jsonb_agg(to_jsonb(h)-array['reason','site_update_type','work_area','correction_of'] order by id)::text,'[]')) from public.project_history h
union all select 'equipment',count(*),md5(coalesce(jsonb_agg(to_jsonb(e) order by id)::text,'[]')) from public.equipment e;
commit;
