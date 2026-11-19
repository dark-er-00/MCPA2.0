-- READ ONLY preflight. Run manually only after separate authorization to connect.
begin transaction read only;
select current_database(),current_user;
select to_regprocedure('public.mcpa_update_my_profile(text,text)') as profile_editor,
 to_regprocedure('mcpa_auth_private.identity()') as verified_identity,
 to_regprocedure('public.mcpa_inventory_office()') as office_reader,
 to_regprocedure('public.mcpa_admin_lifecycle_capabilities()') as removal_draft_installed;
select column_name,data_type from information_schema.columns where table_schema='public' and table_name='profiles' order by ordinal_position;
select c.conname,pg_get_constraintdef(c.oid) from pg_constraint c where c.conrelid='public.profiles'::regclass;
select p.proname,pg_get_userbyid(p.proowner) as owner,p.prosecdef,p.proconfig,p.proacl from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('mcpa_my_profile','mcpa_update_my_profile','mcpa_accounts','mcpa_save_account');
-- Save these definitions/ACLs as the exact rollback baseline. Unknown bodies
-- intentionally fail the drafts' compatibility guards; never bypass them.
select p.oid::regprocedure as signature,pg_get_function_result(p.oid) as result_type,
 md5(replace(p.prosrc,E'\r','')) as normalized_body_md5,pg_get_functiondef(p.oid) as definition
 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and p.proname in ('mcpa_my_profile','mcpa_update_my_profile','mcpa_accounts','mcpa_save_account');
select pg_describe_object(d.classid,d.objid,d.objsubid) as dependent,d.deptype
 from pg_depend d where d.refobjid=to_regprocedure('public.mcpa_accounts()');
select indexname,indexdef from pg_indexes where schemaname='public' and tablename='profiles';
select tgrelid::regclass as table_name,tgname,pg_get_triggerdef(oid) as definition
 from pg_trigger where not tgisinternal and tgrelid in ('public.profiles'::regclass,'auth.users'::regclass);
-- pg_depend does not discover every SQL-text caller. Review matching bodies too.
select oid::regprocedure as caller from pg_proc where prosrc like '%mcpa_accounts%';
select to_regclass('public.mcpa_wa_equipment_requests') as quantity_requests,
 to_regclass('public.mcpa_wa_material_requests') as material_requests,
 to_regclass('public.mcpa_b_return_items') as return_inspections;
select id,name,public,file_size_limit,allowed_mime_types from storage.buckets where id='mcpa-profile-photos';
select policyname,cmd,roles,qual,with_check from pg_policies where schemaname='storage' and tablename='objects';
select account_status,role,count(*) from public.profiles group by account_status,role;
select site_id from mcpa_auth_private.return_office;
rollback;
