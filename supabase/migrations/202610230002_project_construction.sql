-- Review project-construction-preflight.sql first. Never run against production
-- automatically. Additive; no baseline, legacy-value conversion or business DML.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';
lock table public.sites, public.project_history in share row exclusive mode;
do $$
begin
  if to_regprocedure('mcpa_auth_private.identity()') is null
    or to_regprocedure('public.mcpa_has_role(text[])') is null
    or to_regprocedure('public.mcpa_project_snapshot()') is null
    or to_regprocedure('public.project_record_history()') is null
    or to_regprocedure('public.project_history_immutable()') is null then
    raise exception 'Required authenticated Projects/history prerequisites missing; review preflight.';
  end if;
  if exists(select 1 from pg_attribute where attrelid='public.sites'::regclass and attname='project_version' and not attisdropped)
    or exists(select 1 from pg_class where oid in ('public.sites'::regclass,'public.project_history'::regclass) and not relrowsecurity)
    or not exists(select 1 from pg_trigger where tgrelid='public.sites'::regclass and tgname='project_history_capture' and tgfoid='public.project_record_history()'::regprocedure and tgenabled='O')
    or not exists(select 1 from pg_trigger where tgrelid='public.project_history'::regclass and tgname='project_history_no_changes' and tgfoid='public.project_history_immutable()'::regprocedure and tgenabled='O')
    or exists(select 1 from pg_trigger where tgrelid='public.sites'::regclass and not tgisinternal and tgname not in ('sites_updated_at','project_history_capture'))
    or exists(select 1 from pg_trigger where tgrelid='public.project_history'::regclass and tgname='project_history_no_truncate' and (tgfoid<>'public.project_history_immutable()'::regprocedure or tgenabled<>'O'))
    or exists(select 1 from pg_policies where schemaname='public' and tablename in ('sites','project_history') and ('anon'=any(roles) or 'public'=any(roles))) then
    raise exception 'Unexpected Projects schema/security or already installed; stop and review preflight.';
  end if;
  if exists(select 1 from (values ('phase','text'),('progress','integer'),('status','text'),('assigned_engineer_id','uuid'),('updated_at','timestamp with time zone')) e(n,t)
    where not exists(select 1 from pg_attribute a where a.attrelid='public.sites'::regclass and a.attname=e.n and format_type(a.atttypid,a.atttypmod)=e.t and not a.attisdropped)) then
    raise exception 'Unexpected legacy columns; no changes applied.';
  end if;
end $$;

alter table public.sites
  add column project_stage text check(project_stage in ('Planning/Designing','Permitting','Groundbreaking','Construction Phase','Turnover')),
  add column current_work_area text check(current_work_area in ('Structural','Mechanical','Electrical','Plumbing','Fire Safety','Architectural / Finishing Stage')),
  add column construction_work_areas jsonb,
  add column construction_completion numeric(5,2) check(construction_completion between 0 and 100),
  add column project_version bigint not null default 1 check(project_version > 0);
comment on column public.sites.progress is 'Legacy completion percentage; never repurposed as measured construction completion.';
comment on column public.sites.phase is 'Original legacy free-text phase, retained independently of current_work_area.';
comment on column public.sites.construction_work_areas is 'Fixed six-area aggregate: exact label keys with completion, weight, applicable and note. NULL means not configured. Validated atomically with computed completion.';

alter table public.project_history
  add column reason text check(char_length(reason) <= 4000),
  add column site_update_type text,
  add column work_area text check(work_area in ('Structural','Mechanical','Electrical','Plumbing','Fire Safety','Architectural / Finishing Stage')),
  add column correction_of uuid references public.project_history(id) on delete restrict;

-- NUMERIC arithmetic, two decimal inputs/output. N/A retains its measurement
-- and note, but must have zero weight. No automatic weight redistribution.
create function public.mcpa_construction_completion(p_areas jsonb)
returns numeric language plpgsql immutable set search_path='' as $$
declare label text; a jsonb; c numeric; w numeric; total numeric:=0; weighted numeric:=0;
  labels text[]:=array['Structural','Mechanical','Electrical','Plumbing','Fire Safety','Architectural / Finishing Stage'];
begin
  if p_areas is null then return null; end if;
  if jsonb_typeof(p_areas)<>'object' or (select count(*) from jsonb_object_keys(p_areas))<>6
    or not p_areas ?& labels then raise exception 'All six work areas are required.' using errcode='23514'; end if;
  foreach label in array labels loop
    a:=p_areas->label;
    if jsonb_typeof(a)<>'object' or not a ?& array['completion','weight','applicable','note']
      or (select count(*) from jsonb_object_keys(a))<>4
      or jsonb_typeof(a->'completion')<>'number' or jsonb_typeof(a->'weight')<>'number'
      or jsonb_typeof(a->'applicable')<>'boolean' or jsonb_typeof(a->'note')<>'string'
      or char_length(a->>'note')>1000 then raise exception 'Invalid work area values.' using errcode='23514'; end if;
    c:=(a->>'completion')::numeric; w:=(a->>'weight')::numeric;
    if c<0 or c>100 or w<0 or w>100 or c<>round(c,2) or w<>round(w,2) then
      raise exception 'Completion and weight must be 0–100 with at most two decimals.' using errcode='23514';
    end if;
    if (a->>'applicable')::boolean then total:=total+w; weighted:=weighted+c*w/100;
    elsif w<>0 then raise exception 'N/A work areas require zero weight.' using errcode='23514'; end if;
  end loop;
  if total<>100 then raise exception 'Applicable weights must total 100%%.' using errcode='23514'; end if;
  return round(weighted,2);
end $$;

create function public.project_validate_construction()
returns trigger language plpgsql set search_path='' as $$
begin
  -- Derived values and revisions cannot be supplied or forged by a client.
  new.construction_completion:=public.mcpa_construction_completion(new.construction_work_areas);
  if tg_op='UPDATE' then
    if old.construction_work_areas is not null and new.construction_work_areas is null then
      raise exception 'Configured construction tracking cannot be discarded.' using errcode='23514'; end if;
    new.project_version:=old.project_version+1;
  else new.project_version:=1; end if;
  return new;
end $$;
create trigger project_construction_validate before insert or update on public.sites
  for each row execute function public.project_validate_construction();

-- Extend the existing audit store and capture trigger; old rows are untouched.
create or replace function public.project_record_history()
returns trigger language plpgsql security definer set search_path='' as $$
declare before_row jsonb; after_row jsonb:=to_jsonb(new); kinds text[]:='{}'; actor public.profiles; k text;
begin
  if tg_op='INSERT' then kinds:=array['created'];
  else
    before_row:=to_jsonb(old);
    if before_row-array['updated_at','project_version']=after_row-array['updated_at','project_version'] then return new; end if;
    foreach k in array array['name','location','phase','current_work_area','project_stage','status','last_inventory_check','progress'] loop
      if before_row->k is distinct from after_row->k then kinds:=array_append(kinds,k); end if;
    end loop;
    if old.assigned_engineer is distinct from new.assigned_engineer or old.assigned_engineer_id is distinct from new.assigned_engineer_id then kinds:=array_append(kinds,'engineer'); end if;
    if old.is_active is distinct from new.is_active or old.archived_at is distinct from new.archived_at then
      kinds:=array_append(kinds,case when new.is_active=false or new.archived_at is not null then 'archived' else 'restored' end);
    end if;
    if old.construction_work_areas is distinct from new.construction_work_areas then
      kinds:=array_append(kinds,'construction_progress');
      if exists(select 1 from jsonb_each(new.construction_work_areas) a where
        old.construction_work_areas->a.key->'weight' is distinct from a.value->'weight'
        or old.construction_work_areas->a.key->'applicable' is distinct from a.value->'applicable') then kinds:=array_append(kinds,'weights'); end if;
    end if;
    if cardinality(kinds)=0 then kinds:=array['details']; end if;
  end if;
  if auth.uid() is not null then actor:=mcpa_auth_private.identity(); end if;
  insert into public.project_history(project_id,change_types,before_values,after_values,actor_id,actor_name,reason)
    values(new.id,kinds,before_row,after_row,actor.id,actor.name,nullif(current_setting('mcpa.project_reason',true),''));
  return new;
end $$;
-- Older installations may have only the row-level immutable guard.
do $$ begin
  if not exists(select 1 from pg_trigger where tgrelid='public.project_history'::regclass and tgname='project_history_no_truncate') then
    create trigger project_history_no_truncate before truncate on public.project_history for each statement execute function public.project_history_immutable();
  end if;
end $$;

create table mcpa_auth_private.project_operations (
  operation_id uuid primary key,
  actor_id uuid not null,
  request jsonb not null,
  result jsonb,
  created_at timestamptz not null default clock_timestamp()
);
revoke all on mcpa_auth_private.project_operations from public,anon,authenticated;

-- One RPC for metadata, progress and archive/restore. Row lock + revision check
-- applies even when an older client changed the row since the form was opened.
create function public.mcpa_save_project(p_id uuid,p_version bigint,p_operation_id uuid,p_patch jsonb,p_reason text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor public.profiles; s public.sites; op mcpa_auth_private.project_operations; req jsonb; saved_result jsonb; target uuid; key text; profile public.profiles;
begin
  actor:=mcpa_auth_private.identity();
  if actor.id is null or actor.role<>'admin' then raise exception 'Admin required.' using errcode='42501'; end if;
  if p_operation_id is null or p_patch is null or jsonb_typeof(p_patch)<>'object' or char_length(coalesce(p_reason,''))>4000 then raise exception 'Invalid project request.' using errcode='23514'; end if;
  if p_id is null and p_patch ? 'is_active' then
    raise exception 'is_active cannot be set during project creation. Use archive/restore after creation.' using errcode='23514';
  end if;
  req:=jsonb_build_object('id',p_id,'version',p_version,'patch',p_patch,'reason',p_reason);
  insert into mcpa_auth_private.project_operations(operation_id,actor_id,request) values(p_operation_id,actor.id,req) on conflict do nothing;
  select * into op from mcpa_auth_private.project_operations where operation_id=p_operation_id for update;
  if op.actor_id<>actor.id or op.request<>req then raise exception 'Retry key belongs to another request.' using errcode='23514'; end if;
  if op.result is not null then return op.result; end if;
  for key in select jsonb_object_keys(p_patch) loop
    if key<>all(array['name','location','assigned_engineer_id','project_stage','current_work_area','status','last_inventory_check','construction_work_areas','is_active']) then
      raise exception 'Unsupported project field.' using errcode='23514'; end if;
  end loop;
  if p_id is not null then
    select * into s from public.sites where id=p_id for update;
    if not found then raise exception 'Project unavailable.' using errcode='40001'; end if;
    if p_version is null or s.project_version<>p_version then raise exception 'Project changed. Reload and retry.' using errcode='40001'; end if;
  elsif p_version is not null then raise exception 'Invalid create revision.' using errcode='23514'; end if;
  -- A null legacy assignment may be retained; new/reassigned projects require a
  -- real active Engineer/Architect. Display names come from company identity.
  if p_id is null or (p_patch ? 'assigned_engineer_id' and (p_patch->>'assigned_engineer_id')::uuid is distinct from s.assigned_engineer_id) then
    select * into profile from public.profiles where id=(p_patch->>'assigned_engineer_id')::uuid and role in ('engineer','architect') and account_status='active';
    if not found then raise exception 'Select an active Engineer / Architect.' using errcode='23514'; end if;
    s.assigned_engineer_id:=profile.id; s.assigned_engineer:=profile.name;
  end if;
  if p_patch ? 'name' then s.name:=btrim(p_patch->>'name'); end if;
  if p_patch ? 'location' then s.location:=btrim(p_patch->>'location'); end if;
  if p_patch ? 'status' then s.status:=p_patch->>'status'; end if;
  if p_patch ? 'project_stage' then s.project_stage:=p_patch->>'project_stage'; end if;
  if p_patch ? 'current_work_area' then s.current_work_area:=p_patch->>'current_work_area'; end if;
  if p_patch ? 'last_inventory_check' then s.last_inventory_check:=(p_patch->>'last_inventory_check')::date; end if;
  if p_patch ? 'construction_work_areas' then s.construction_work_areas:=p_patch->'construction_work_areas'; end if;
  if p_patch ? 'is_active' then
    if jsonb_typeof(p_patch->'is_active')<>'boolean' then raise exception 'Invalid archive state.' using errcode='23514'; end if;
    s.is_active:=(p_patch->>'is_active')::boolean;
    s.archived_at:=case when s.is_active then null else coalesce(s.archived_at,clock_timestamp()) end;
  end if;
  perform set_config('mcpa.project_reason',coalesce(p_reason,''),true);
  if p_id is null then
    insert into public.sites(name,location,assigned_engineer,assigned_engineer_id,status,project_stage,current_work_area,last_inventory_check,construction_work_areas)
      values(s.name,s.location,s.assigned_engineer,s.assigned_engineer_id,coalesce(s.status,'planning'),s.project_stage,s.current_work_area,s.last_inventory_check,s.construction_work_areas) returning id into target;
  else
    update public.sites set name=s.name,location=s.location,assigned_engineer=s.assigned_engineer,assigned_engineer_id=s.assigned_engineer_id,
      status=s.status,project_stage=s.project_stage,current_work_area=s.current_work_area,last_inventory_check=s.last_inventory_check,
      construction_work_areas=s.construction_work_areas,is_active=s.is_active,archived_at=s.archived_at where id=p_id returning id into target;
  end if;
  perform set_config('mcpa.project_reason','',true);
  select to_jsonb(t) into saved_result from public.sites t where id=target;
  update mcpa_auth_private.project_operations set result=saved_result where operation_id=p_operation_id;
  return saved_result;
end $$;

create function public.mcpa_add_site_update(p_project_id uuid,p_operation_id uuid,p_type text,p_description text,p_work_area text default null,p_correction_of uuid default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor public.profiles; op mcpa_auth_private.project_operations; req jsonb; saved_result jsonb;
begin
  actor:=mcpa_auth_private.identity();
  if actor.id is null or actor.role<>'admin' then raise exception 'Admin required.' using errcode='42501'; end if;
  if p_operation_id is null or p_type is null or p_type<>all(array['Site inspection','Milestone','Delay','Work started','Work completed','Safety inspection','Work suspended','Work resumed','Correction','Other'])
    or p_description is null or char_length(btrim(p_description)) not between 1 and 4000 then raise exception 'Invalid site update.' using errcode='23514'; end if;
  req:=jsonb_build_object('project',p_project_id,'type',p_type,'description',p_description,'area',p_work_area,'correction',p_correction_of);
  insert into mcpa_auth_private.project_operations(operation_id,actor_id,request) values(p_operation_id,actor.id,req) on conflict do nothing;
  select * into op from mcpa_auth_private.project_operations where operation_id=p_operation_id for update;
  if op.actor_id<>actor.id or op.request<>req then raise exception 'Retry key belongs to another request.' using errcode='23514'; end if;
  if op.result is not null then return op.result; end if;
  perform 1 from public.sites where id=p_project_id for share;
  if not found then raise exception 'Project unavailable.' using errcode='23503'; end if;
  if p_correction_of is not null and not exists(select 1 from public.project_history where id=p_correction_of and project_id=p_project_id) then
    raise exception 'Correction must reference this project history.' using errcode='23514'; end if;
  insert into public.project_history(project_id,change_types,after_values,actor_id,actor_name,reason,site_update_type,work_area,correction_of)
    values(p_project_id,array['site_update'],'{}',actor.id,actor.name,btrim(p_description),p_type,p_work_area,p_correction_of) returning to_jsonb(project_history.*) into saved_result;
  update mcpa_auth_private.project_operations set result=saved_result where operation_id=p_operation_id;
  return saved_result;
end $$;

revoke all on function public.mcpa_save_project(uuid,bigint,uuid,jsonb,text),public.mcpa_add_site_update(uuid,uuid,text,text,text,uuid),
  public.project_validate_construction(),public.project_record_history(),public.project_history_immutable(),public.mcpa_construction_completion(jsonb) from public,anon,authenticated;
grant execute on function public.mcpa_save_project(uuid,bigint,uuid,jsonb,text),public.mcpa_add_site_update(uuid,uuid,text,text,text,uuid),public.mcpa_construction_completion(jsonb) to authenticated;
-- Existing sites policies and write grants remain for deployed older clients;
-- triggers enforce validation, revision bumps and atomic history for those too.
revoke insert,update,delete,truncate,references,trigger on public.project_history from public,anon,authenticated;
do $$ declare r text; begin
  foreach r in array array['anon','authenticated'] loop
    if has_table_privilege(r,'public.project_history','INSERT,UPDATE,DELETE,TRUNCATE,TRIGGER')
      or has_any_column_privilege(r,'public.project_history','INSERT,UPDATE')
      or has_table_privilege(r,'mcpa_auth_private.project_operations','SELECT,INSERT,UPDATE,DELETE') then
      raise exception 'Unexpected inherited audit/operation privileges for %.',r; end if;
  end loop;
end $$;
notify pgrst,'reload schema';
commit;
