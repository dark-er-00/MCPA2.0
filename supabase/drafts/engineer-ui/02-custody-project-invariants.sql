-- REVIEW DRAFT ONLY. Not a deployed migration. No remote execution authorized.
-- Production custody and project-assignment invariant guards for equipment and sites.
-- Ensures:
-- 1. Unheld AVAILABLE equipment is always located at the verified Office site (never an unassigned tool at a construction project).
-- 2. Held equipment at a construction project always matches that project's assigned Engineer/Architect.
-- 3. Projects cannot be reassigned or archived while active equipment custody or open handovers remain at that project.

create or replace function mcpa_auth_private.enforce_equipment_custody_project_invariant()
returns trigger language plpgsql security definer set search_path='' as $$
declare
  office_id uuid;
  site_row public.sites;
begin
  office_id := (public.mcpa_inventory_office()->>'id')::uuid;
  if office_id is null then
    raise exception 'Office configuration could not be verified.' using errcode='22023';
  end if;

  -- Unheld available stock belongs at Office (including after repair completion or missing recovery).
  if new.current_holder_id is null and new.status::text = 'AVAILABLE' and coalesce(new.quantity, 0) > 0 then
    new.site_id := office_id;
    return new;
  end if;

  -- Equipment held by a field custodian must be located at an active project assigned to that custodian.
  if new.current_holder_id is not null and new.status::text <> 'DISPOSED' and coalesce(new.quantity, 0) > 0 then
    if new.site_id is null or new.site_id = office_id then
      raise exception 'Equipment in custody must be assigned to an active project, not Office.' using errcode='23514';
    end if;
    select * into site_row from public.sites where id = new.site_id;
    if site_row.id is null or site_row.is_active is distinct from true or site_row.archived_at is not null then
      raise exception 'Equipment custody requires an active, non-archived project.' using errcode='23514';
    end if;
    if site_row.assigned_engineer_id is distinct from new.current_holder_id then
      raise exception 'Equipment holder must match the assigned Engineer or Architect of the project.' using errcode='23514';
    end if;
  end if;

  return new;
end $$;

drop trigger if exists mcpa_equipment_custody_project_guard on public.equipment;
create trigger mcpa_equipment_custody_project_guard
  before insert or update of site_id, current_holder_id, status, quantity on public.equipment
  for each row execute function mcpa_auth_private.enforce_equipment_custody_project_invariant();

create or replace function mcpa_auth_private.enforce_site_reassignment_custody_guard()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if (new.assigned_engineer_id is distinct from old.assigned_engineer_id
      or new.is_active is distinct from old.is_active
      or new.archived_at is distinct from old.archived_at) then
    if exists(
      select 1 from public.equipment e
      where e.site_id = old.id
        and e.status::text <> 'DISPOSED'
        and coalesce(e.quantity, 0) > 0
        and (
          new.is_active is distinct from true
          or new.archived_at is not null
          or e.current_holder_id is distinct from new.assigned_engineer_id
        )
    ) then
      raise exception 'Transfer or return all active equipment at this project before changing its assigned personnel or archiving it.' using errcode='23514';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists mcpa_site_reassignment_custody_guard on public.sites;
create trigger mcpa_site_reassignment_custody_guard
  before update of assigned_engineer_id, is_active, archived_at on public.sites
  for each row execute function mcpa_auth_private.enforce_site_reassignment_custody_guard();

revoke all on function mcpa_auth_private.enforce_equipment_custody_project_invariant() from public, anon, authenticated;
revoke all on function mcpa_auth_private.enforce_site_reassignment_custody_guard() from public, anon, authenticated;
