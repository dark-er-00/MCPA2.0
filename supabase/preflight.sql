-- Read-only: run in the existing project's SQL Editor before the auth migration.
-- Review results privately; no passwords, JWTs or service-role credentials are needed.
select table_name,column_name,data_type,is_nullable,column_default
from information_schema.columns where table_schema='public'
and table_name in ('profiles','equipment','sites','mcpa_movements','mcpa_movement_operations','consumables','consumable_requests','consumable_stock_movements')
order by table_name,ordinal_position;
select schemaname,tablename,policyname,roles,cmd,qual,with_check from pg_policies
where schemaname in ('public','storage') order by schemaname,tablename,policyname;
select table_schema,table_name,grantee,privilege_type from information_schema.table_privileges
where grantee in ('anon','authenticated','PUBLIC') and table_schema in ('public','storage') order by table_name,grantee;
select table_name,column_name,grantee,privilege_type from information_schema.column_privileges
where table_schema='public' and grantee in ('anon','authenticated','PUBLIC') order by table_name,column_name;
select n.nspname,p.proname,pg_get_function_identity_arguments(p.oid) arguments,p.prosecdef security_definer,
has_function_privilege('anon',p.oid,'EXECUTE') anonymous_execute,
has_function_privilege('authenticated',p.oid,'EXECUTE') authenticated_execute
from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' order by p.proname;
select c.relname,t.tgname,pg_get_triggerdef(t.oid) definition
from pg_trigger t join pg_class c on c.oid=t.tgrelid where not t.tgisinternal and t.tgrelid in ('auth.users'::regclass,'public.profiles'::regclass);
select schemaname,viewname,definition from pg_views where schemaname='public';
