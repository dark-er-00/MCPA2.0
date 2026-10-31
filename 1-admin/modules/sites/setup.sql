-- Projects retains the public.sites name and IDs for existing assignments.
-- Prototype metadata writes remain public; UI roles are not authentication.
begin;

create table if not exists public.sites (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 120),
  location text not null check (char_length(btrim(location)) between 1 and 240),
  assigned_engineer text not null check (char_length(btrim(assigned_engineer)) between 1 and 120),
  phase text not null default '' check (char_length(btrim(phase)) <= 80),
  status text not null default 'planning'
    check (status in ('active', 'discrepancy', 'verified', 'turnover', 'idle', 'planning', 'completed')),
  progress integer not null default 0 check (progress between 0 and 100),
  last_inventory_check date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.sites add column if not exists assigned_engineer_id uuid;
alter table public.sites add column if not exists archived_at timestamptz;
alter table public.sites add column if not exists is_active boolean;
update public.sites set is_active = (archived_at is null) where is_active is null;
alter table public.sites alter column is_active set default true;
alter table public.sites alter column is_active set not null;
alter table public.sites alter column phase set default '';
alter table public.sites drop constraint if exists sites_phase_check;
alter table public.sites add constraint sites_phase_check check (char_length(btrim(phase)) <= 80);

-- Preserve legacy text. Only an exact, unique profile match can link a record.
-- Some original installations have no profiles table yet.
do $$
begin
  if to_regclass('public.profiles') is not null then
    if not exists (select 1 from pg_constraint where conname = 'sites_assigned_engineer_id_fkey' and conrelid = 'public.sites'::regclass) then
      alter table public.sites add constraint sites_assigned_engineer_id_fkey
        foreign key (assigned_engineer_id) references public.profiles(id) on delete restrict;
    end if;
    execute 'update public.sites s set assigned_engineer_id = p.id
      from public.profiles p where s.assigned_engineer_id is null
      and s.assigned_engineer = p.name
      and (select count(*) from public.profiles matched where matched.name = s.assigned_engineer) = 1';
  end if;
end;
$$;

create unique index if not exists sites_name_unique
  on public.sites (lower(regexp_replace(btrim(name), '\s+', ' ', 'g')));

create or replace function public.sites_touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = clock_timestamp();
  return new;
end;
$$;

drop trigger if exists sites_updated_at on public.sites;
create trigger sites_updated_at
before update on public.sites
for each row execute function public.sites_touch_updated_at();

create table if not exists public.project_history (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.sites(id) on delete restrict,
  changed_at timestamptz not null default clock_timestamp(),
  change_types text[] not null,
  before_values jsonb,
  after_values jsonb not null,
  actor_id uuid,
  actor_name text
);
create index if not exists project_history_project_date_idx on public.project_history(project_id, changed_at desc);

-- Existing records get a baseline, never a fictional previous engineer or phase.
insert into public.project_history(project_id, change_types, after_values)
select s.id, array['baseline'], to_jsonb(s) from public.sites s
where not exists (select 1 from public.project_history h where h.project_id = s.id);

create or replace function public.project_record_history()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  previous_values jsonb;
  next_values jsonb := to_jsonb(new);
  kinds text[] := '{}';
  actor uuid;
  actor_label text;
  claims jsonb;
begin
  if tg_op = 'INSERT' then
    kinds := array['created'];
  else
    previous_values := to_jsonb(old);
    if previous_values - 'updated_at' = next_values - 'updated_at' then return new; end if;
    if old.assigned_engineer is distinct from new.assigned_engineer or old.assigned_engineer_id is distinct from new.assigned_engineer_id then kinds := array_append(kinds, 'engineer'); end if;
    if old.phase is distinct from new.phase then kinds := array_append(kinds, 'phase'); end if;
    if old.status is distinct from new.status then kinds := array_append(kinds, 'status'); end if;
    if old.archived_at is distinct from new.archived_at then kinds := array_append(kinds, case when new.archived_at is null then 'restored' else 'archived' end); end if;
    if previous_values - array['updated_at','assigned_engineer','assigned_engineer_id','phase','status','archived_at']
       is distinct from next_values - array['updated_at','assigned_engineer','assigned_engineer_id','phase','status','archived_at'] then kinds := array_append(kinds, 'details'); end if;
  end if;
  -- An anonymous prototype selection is not a verified actor. Use a real JWT
  -- subject only when supplied by the authenticated database request context.
  begin
    claims := nullif(current_setting('request.jwt.claims', true), '')::jsonb;
    if claims->>'role' = 'authenticated' and claims->>'sub' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      actor := (claims->>'sub')::uuid;
      if to_regclass('public.profiles') is not null then
        execute 'select name from public.profiles where id = $1' into actor_label using actor;
      end if;
    end if;
  exception when invalid_text_representation then actor := null; actor_label := null;
  end;
  insert into public.project_history(project_id, change_types, before_values, after_values, actor_id, actor_name)
    values(new.id, kinds, previous_values, next_values, actor, actor_label);
  return new;
end;
$$;
drop trigger if exists project_history_capture on public.sites;
create trigger project_history_capture after insert or update on public.sites
for each row execute function public.project_record_history();

create or replace function public.project_history_immutable()
returns trigger language plpgsql set search_path = '' as $$
begin
  raise exception 'Project history cannot be edited or deleted.' using errcode = '42501';
end;
$$;
drop trigger if exists project_history_no_changes on public.project_history;
create trigger project_history_no_changes before update or delete on public.project_history
for each row execute function public.project_history_immutable();
alter table public.project_history enable row level security;
revoke all on public.project_history from public, anon, authenticated;
grant select on public.project_history to anon, authenticated;
drop policy if exists project_history_read on public.project_history;
create policy project_history_read on public.project_history for select to anon, authenticated using (true);
revoke all on function public.project_record_history() from public, anon, authenticated;
revoke all on function public.project_history_immutable() from public, anon, authenticated;

alter table public.equipment
  add column if not exists site_id uuid references public.sites(id) on delete restrict;
create index if not exists equipment_site_id_idx on public.equipment(site_id);

-- Use the same business date as the UI, including after midnight in Manila.
alter table public.sites drop constraint if exists sites_last_inventory_check_check;
alter table public.sites add constraint sites_last_inventory_check_check
  check (last_inventory_check <= (current_timestamp at time zone 'Asia/Manila')::date);

-- Only the future assignment/movement workflow should change equipment.site_id.
-- RESTRICT prevents deleting a site with equipment, including zero-quantity rows.
comment on column public.equipment.site_id is
  'Current site assignment. Read-only in the Sites module; maintained by the assignment/movement workflow.';

alter table public.sites enable row level security;

grant select, insert, update on public.sites to anon, authenticated;
revoke delete on public.sites from anon, authenticated;

drop policy if exists sites_read on public.sites;
create policy sites_read on public.sites
for select to anon, authenticated using (true);
drop policy if exists sites_insert on public.sites;
create policy sites_insert on public.sites
for insert to anon, authenticated with check (true);
drop policy if exists sites_update on public.sites;
create policy sites_update on public.sites
for update to anon, authenticated using (true) with check (true);
drop policy if exists sites_delete on public.sites;

-- No mock projects, engineers, phases, quantities or transfers are inserted.
-- Projects are archived in the UI. Every recorded project retains its history.
notify pgrst, 'reload schema';
commit;
