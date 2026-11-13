-- READ ONLY, run as the SQL Editor database owner. No application RPCs invoked.
-- Returns catalog metadata only, no function bodies or account/business rows.
-- Hashes identify reviewed SOURCE, not proof of runtime behavior or all dependencies.
-- Missing expected signatures are explicit; other overloads appear in candidates.
-- Unknown source/overloads require review, never an automatic migration rerun.
with expected(signature,hashes) as (values
 ('public.mcpa_movement_action(text,jsonb,uuid)',array['c26d3585fe9e140e072b12a273f7bb19']),
 ('public.mcpa_return_destination()',array['9fc76ef7f6d900d19ca88c9b1685c5c3']),
 ('mcpa_auth_private.office_return_site()',array['1880d09d0b78248e568092d8a4866bae']),
 ('mcpa_auth_private.identity()',array['8d2403750ec1bf00243db98d7293e647']),
 ('mcpa_auth_private.movement_authorized(text,jsonb,uuid)',array['d9570c5317bf900e59c3ca0d3b63f97a']),
 ('mcpa_auth_private.mcpa_movement_action(text,jsonb,uuid)',array['d1154cc85fb39b5721fcbe977a54fb76']),
 ('mcpa_auth_private.movement_before_office_returns(text,jsonb,uuid)',array['582ea68af753d0fdd81461c537dbf9ab','9aa50e5af660aea383b993a3a578f86a']),
 ('mcpa_auth_private.movement_before_cancellation(text,jsonb,uuid)',array['582ea68af753d0fdd81461c537dbf9ab']),
 ('mcpa_auth_private.can_adjust_movement(text,public.mcpa_movements,public.profiles)',array['21ae507a65e0ced34c87caf14eb50089']),
 ('mcpa_auth_private.cancellation_audit_immutable()',array['b07199b7de35927c803dac7da7e6eb3a']),
 ('public.mcpa_movement_snapshot()',array['bfc48d9588294e75f08e52429dd7ee92','3f823cb3ce510b6b20baccf07113436c']),
 ('mcpa_auth_private.movement_snapshot_before_cancellation()',array['bfc48d9588294e75f08e52429dd7ee92']),
 ('mcpa_auth_private.can_view_tool(public.equipment,public.profiles)',array['b92daf4c8aa2e1856e6621d5a7b1d149','cb05e91dd609dfa3e3a0393b60392f9b']),
 ('mcpa_auth_private.can_view_tool_before_exceptions(public.equipment,public.profiles)',array['b92daf4c8aa2e1856e6621d5a7b1d149'])
), functions as (
 select e.signature,p.oid,p.prosecdef,p.proconfig,pg_get_userbyid(p.proowner) owner,
   pg_get_function_result(p.oid) result_type,md5(replace(p.prosrc,E'\r','')) source_md5,
   coalesce(md5(replace(p.prosrc,E'\r',''))=any(e.hashes),false) reviewed_source,
   has_function_privilege('anon',p.oid,'EXECUTE') anon_execute,
   has_function_privilege('authenticated',p.oid,'EXECUTE') authenticated_execute,
   has_function_privilege('service_role',p.oid,'EXECUTE') service_role_execute
 from expected e left join pg_proc p on p.oid=to_regprocedure(e.signature)
), relations(name) as (values ('mcpa_auth_private.return_office'),
 ('public.mcpa_movement_cancellations'),('public.mcpa_movement_refusals'),('public.mcpa_notifications'))
select jsonb_build_object(
 'expected_functions',(select jsonb_agg(to_jsonb(f) order by signature) from functions f),
 'candidates',(select coalesce(jsonb_agg(jsonb_build_object(
   'schema',n.nspname,'name',p.proname,'arguments',pg_get_function_identity_arguments(p.oid),
   'source_md5',md5(replace(p.prosrc,E'\r','')),
   'references',coalesce((select jsonb_agg(distinct match[1]) from regexp_matches(p.prosrc,
     '(mcpa_auth_private\.[a-z_]+)\s*\(','g') match),'[]'::jsonb),
   'mentions_cancellation_actions',strpos(p.prosrc,'withdrawRequest')>0
 ) order by n.nspname,p.proname,p.oid),'[]'::jsonb)
 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname in ('public','mcpa_auth_private') and p.prokind='f' and (
   p.proname like '%movement%' or p.proname like '%office%' or p.proname like '%cancellation%'
   or strpos(p.prosrc,'withdrawRequest')>0 or p.proname in ('mcpa_return_destination','can_view_tool','can_view_tool_before_exceptions',
     'mcpa_monitoring_snapshot','mcpa_monitoring_mark_read','notify_new_movement_operation'))),
 'relations',(select jsonb_agg(jsonb_build_object('name',r.name,'exists',c.oid is not null,
   'rls',c.relrowsecurity,'comment',obj_description(c.oid,'pg_class'),
   'anon_select',has_table_privilege('anon',c.oid,'SELECT'),
   'anon_write',has_table_privilege('anon',c.oid,'INSERT,UPDATE,DELETE,TRUNCATE'),
   'authenticated_select',has_table_privilege('authenticated',c.oid,'SELECT'),
   'authenticated_write',has_table_privilege('authenticated',c.oid,'INSERT,UPDATE,DELETE,TRUNCATE'),
   'service_role_access',has_table_privilege('service_role',c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE'),
   'columns',(select jsonb_agg(jsonb_build_object('name',a.attname,'type',format_type(a.atttypid,a.atttypmod),
     'not_null',a.attnotnull) order by a.attnum) from pg_attribute a where a.attrelid=c.oid and a.attnum>0 and not a.attisdropped),
   'constraints',(select jsonb_agg(pg_get_constraintdef(x.oid) order by x.conname) from pg_constraint x where x.conrelid=c.oid),
   'triggers',(select jsonb_agg(jsonb_build_object('name',t.tgname,'enabled',t.tgenabled,
     'definition',pg_get_triggerdef(t.oid)) order by t.tgname) from pg_trigger t where t.tgrelid=c.oid and not t.tgisinternal)
 ) order by r.name) from relations r left join pg_class c on c.oid=to_regclass(r.name)),
 'notification_trigger',(select jsonb_agg(jsonb_build_object('name',tgname,'enabled',tgenabled,
   'definition',pg_get_triggerdef(oid))) from pg_trigger
   where tgrelid=to_regclass('public.mcpa_movement_operations') and tgname='mcpa_future_movement_notifications'),
 'notification_publications',(select coalesce(jsonb_agg(pubname),'[]'::jsonb) from pg_publication_tables
   where schemaname='public' and tablename='mcpa_notifications'),
 'migration_history_table_present',to_regclass('supabase_migrations.schema_migrations') is not null
) as release_compatibility_diagnostics;
-- A migration ledger is not proof of installation: SQL Editor executions need
-- not record it. Candidate references are source hints, not dependency proofs.
