-- Apply only after the reviewed project-history-preflight.sql result:
-- public.project_history is absent, no alternative project history was found,
-- and sites has only the sites_updated_at custom trigger.
-- Run once. No existing rows, IDs, assignments, defaults or site policies change.
-- No baseline/backfill history is inserted. Audit starts with future changes.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
lock table public.sites in share row exclusive mode;

do $$
begin
  if to_regclass('public.project_history') is not null
    or to_regprocedure('public.project_record_history()') is not null
    or to_regprocedure('public.project_history_immutable()') is not null then
    raise exception 'Project history already exists or differs from the reviewed preflight. Stop and review; no changes applied.';
  end if;
  if to_regprocedure('public.mcpa_project_snapshot()') is null
    or to_regprocedure('public.mcpa_has_role(text[])') is null
    or to_regprocedure('mcpa_auth_private.identity()') is null
    or to_regprocedure('auth.uid()') is null then
    raise exception 'Required authenticated Projects functions are missing. Stop and review; no changes applied.';
  end if;
  if not exists(select 1 from pg_proc where oid=to_regprocedure('public.mcpa_project_snapshot()')
      and strpos(prosrc,'public.project_history')>0)
    or not exists(select 1 from pg_class where oid='public.sites'::regclass and relrowsecurity)
    or exists(select 1 from pg_trigger where tgrelid='public.sites'::regclass
      and not tgisinternal and tgname<>'sites_updated_at') then
    raise exception 'Projects definitions or triggers differ from the reviewed preflight. Stop and review; no changes applied.';
  end if;
  if exists(
    select 1 from (values ('id','uuid'),('assigned_engineer','text'),('assigned_engineer_id','uuid'),
      ('phase','text'),('status','text'),('is_active','boolean'),
      ('archived_at','timestamp with time zone'),('updated_at','timestamp with time zone')) expected(name,type)
    where not exists(select 1 from pg_attribute a where a.attrelid='public.sites'::regclass
      and a.attname=expected.name and format_type(a.atttypid,a.atttypmod)=expected.type and not a.attisdropped)
  ) then
    raise exception 'Projects columns differ from the reviewed preflight. Stop and review; no changes applied.';
  end if;
  -- Do not create a second audit store if a candidate appeared after preflight.
  if exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where c.relkind in ('r','p','v','m','f')
      and n.nspname not in ('pg_catalog','information_schema','auth','storage','vault')
      and n.nspname not like 'pg_%'
      and (c.relname ~* '(project|site).*(histor|audit)|(histor|audit).*(project|site)'
        or (exists(select 1 from pg_attribute a where a.attrelid=c.oid and a.attnum>0
              and not a.attisdropped and a.attname in ('project_id','site_id'))
          and exists(select 1 from pg_attribute a where a.attrelid=c.oid and a.attnum>0
              and not a.attisdropped and a.attname in ('before_values','after_values','changed_at'))))) then
    raise exception 'A possible project history relation exists. Stop and review it before creating another history table.';
  end if;
end $$;

create table public.project_history (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.sites(id) on delete restrict,
  changed_at timestamptz not null default clock_timestamp(),
  change_types text[] not null,
  before_values jsonb,
  after_values jsonb not null,
  actor_id uuid,
  actor_name text
);
comment on column public.project_history.actor_id is
  'Stable company profiles.id resolved through auth_user_id; null for database maintenance without an authenticated person.';
create index project_history_project_date_idx on public.project_history(project_id,changed_at desc);
alter table public.project_history enable row level security;
revoke all on public.project_history from public,anon,authenticated;
grant select on public.project_history to authenticated;
create policy mcpa_history_read on public.project_history for select to authenticated
  using(public.mcpa_has_role(array['admin','tool_handler']));
-- Engineers/Architects use the existing assigned-project snapshot, not this
-- direct table policy. No project-write policies or RPC definitions are changed.

create function public.project_record_history()
returns trigger language plpgsql security definer set search_path='' as $$
declare
  previous_values jsonb;
  next_values jsonb:=to_jsonb(new);
  kinds text[]:='{}';
  actor public.profiles;
begin
  if tg_op='INSERT' then
    kinds:=array['created'];
  else
    previous_values:=to_jsonb(old);
    if previous_values-'updated_at'=next_values-'updated_at' then return new;end if;
    if old.assigned_engineer is distinct from new.assigned_engineer
      or old.assigned_engineer_id is distinct from new.assigned_engineer_id then
      kinds:=array_append(kinds,'engineer');
    end if;
    if old.phase is distinct from new.phase then kinds:=array_append(kinds,'phase');end if;
    if old.status is distinct from new.status then kinds:=array_append(kinds,'status');end if;
    if old.archived_at is distinct from new.archived_at or old.is_active is distinct from new.is_active then
      kinds:=array_append(kinds,case when new.archived_at is not null or new.is_active=false then 'archived' else 'restored' end);
    end if;
    if previous_values-array['updated_at','assigned_engineer','assigned_engineer_id','phase','status','archived_at','is_active']
      is distinct from next_values-array['updated_at','assigned_engineer','assigned_engineer_id','phase','status','archived_at','is_active'] then
      kinds:=array_append(kinds,'details');
    end if;
  end if;
  -- auth.uid() is the login ID, not the permanent company-person ID.
  -- SQL maintenance without an Auth session must not impersonate an Admin.
  if auth.uid() is not null then actor:=mcpa_auth_private.identity();end if;
  insert into public.project_history(project_id,change_types,before_values,after_values,actor_id,actor_name)
    values(new.id,kinds,previous_values,next_values,actor.id,actor.name);
  return new;
end $$;

create function public.project_history_immutable()
returns trigger language plpgsql set search_path='' as $$
begin
  raise exception 'Project history cannot be edited or deleted.' using errcode='42501';
end $$;
revoke all on function public.project_record_history(),public.project_history_immutable() from public,anon,authenticated;
create trigger project_history_capture after insert or update on public.sites
  for each row execute function public.project_record_history();
create trigger project_history_no_changes before update or delete on public.project_history
  for each row execute function public.project_history_immutable();
create trigger project_history_no_truncate before truncate on public.project_history
  for each statement execute function public.project_history_immutable();

-- Check effective privileges too, in case role inheritance grants unexpected access.
do $$
declare browser_role text;
begin
  if has_table_privilege('anon','public.project_history','SELECT')
    or has_any_column_privilege('anon','public.project_history','SELECT') then
    raise exception 'Unexpected inherited anonymous history access. Transaction will roll back; review role memberships.';
  end if;
  foreach browser_role in array array['anon','authenticated'] loop
    if has_table_privilege(browser_role,'public.project_history','INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
      or has_any_column_privilege(browser_role,'public.project_history','INSERT,UPDATE,REFERENCES')
      or has_function_privilege(browser_role,'public.project_record_history()','EXECUTE')
      or has_function_privilege(browser_role,'public.project_history_immutable()','EXECUTE') then
      raise exception 'Unexpected inherited history write/trigger access for %. Transaction will roll back.',browser_role;
    end if;
  end loop;
end $$;
notify pgrst,'reload schema';
commit;

-- Installation verification; authenticated live UI checks follow at the next gate.
-- history_rows starts at zero unless a real project change occurred after COMMIT.
select jsonb_build_object(
  'history_table_present',to_regclass('public.project_history') is not null,
  'history_rls_enabled',(select relrowsecurity from pg_class where oid='public.project_history'::regclass),
  'capture_trigger_enabled',exists(select 1 from pg_trigger where tgrelid='public.sites'::regclass
    and tgname='project_history_capture' and tgenabled='O'),
  'immutable_triggers_enabled',(select count(*)=2 from pg_trigger where tgrelid='public.project_history'::regclass
    and tgname in ('project_history_no_changes','project_history_no_truncate') and tgenabled='O'),
  'history_rows',(select count(*) from public.project_history),
  'history_read_policy',(select jsonb_build_object('roles',roles,'command',cmd,'condition',qual)
    from pg_policies where schemaname='public' and tablename='project_history' and policyname='mcpa_history_read'),
  'project_snapshot_present',to_regprocedure('public.mcpa_project_snapshot()') is not null,
  'browser_access',(select jsonb_agg(jsonb_build_object(
    'role',r.role_name,'select_granted',has_table_privilege(r.role_name,'public.project_history','SELECT'),
    'direct_write_granted',has_table_privilege(r.role_name,'public.project_history','INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
      or has_any_column_privilege(r.role_name,'public.project_history','INSERT,UPDATE,REFERENCES'),
    'capture_function_execute',has_function_privilege(r.role_name,'public.project_record_history()','EXECUTE'),
    'snapshot_execute',has_function_privilege(r.role_name,'public.mcpa_project_snapshot()','EXECUTE')) order by r.role_name)
    from (values('anon'::text),('authenticated'::text)) r(role_name))
) as project_history_repair_verification;
