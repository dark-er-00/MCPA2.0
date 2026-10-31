-- READ ONLY. Run immediately after migration, before allowing new writes.
begin read only;
select 'sites' as relation,count(*) as rows,md5(coalesce(jsonb_agg(to_jsonb(s)-array['project_stage','current_work_area','construction_work_areas','construction_completion','project_version'] order by id)::text,'[]')) as legacy_fingerprint from public.sites s
union all select 'project_history',count(*),md5(coalesce(jsonb_agg(to_jsonb(h)-array['reason','site_update_type','work_area','correction_of'] order by id)::text,'[]')) from public.project_history h
union all select 'equipment',count(*),md5(coalesce(jsonb_agg(to_jsonb(e) order by id)::text,'[]')) from public.equipment e;
select count(*) filter(where construction_work_areas is not null) as configured_projects,
  count(*) filter(where construction_completion is distinct from public.mcpa_construction_completion(construction_work_areas)) as calculation_mismatches,
  min(project_version) as minimum_revision from public.sites;
select c.relname,c.relrowsecurity from pg_class c where c.oid in ('public.sites'::regclass,'public.project_history'::regclass);
select c.relname,t.tgname,t.tgenabled,pg_get_triggerdef(t.oid) as definition from pg_trigger t join pg_class c on c.oid=t.tgrelid
  where t.tgrelid in ('public.sites'::regclass,'public.project_history'::regclass) and not t.tgisinternal order by c.relname,t.tgname;
select * from pg_policies where schemaname='public' and tablename in ('sites','project_history') order by tablename,policyname;
select r.name as role,
  has_table_privilege(r.name,'public.project_history','INSERT,UPDATE,DELETE,TRUNCATE,TRIGGER') or has_any_column_privilege(r.name,'public.project_history','INSERT,UPDATE') as forbidden_history_write,
  has_table_privilege(r.name,'mcpa_auth_private.project_operations','SELECT,INSERT,UPDATE,DELETE') as forbidden_operations_access,
  has_function_privilege(r.name,'public.mcpa_save_project(uuid,bigint,uuid,jsonb,text)','EXECUTE') as save_rpc,
  has_function_privilege(r.name,'public.mcpa_add_site_update(uuid,uuid,text,text,text,uuid)','EXECUTE') as site_update_rpc,
  has_function_privilege(r.name,'public.project_record_history()','EXECUTE') as forbidden_trigger_execute
  from (values('anon'),('authenticated')) r(name);
select p.oid::regprocedure as function,p.prosecdef as security_definer,p.proconfig as settings
  from pg_proc p where p.oid in ('public.mcpa_save_project(uuid,bigint,uuid,jsonb,text)'::regprocedure,'public.mcpa_add_site_update(uuid,uuid,text,text,text,uuid)'::regprocedure,'public.project_record_history()'::regprocedure);
commit;
