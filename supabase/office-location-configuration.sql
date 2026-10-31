-- NEXT MANUAL STEP ONLY: the supplied preflight has no company Office record.
-- Supply the REAL receiving Office address/location below, review, then run.
-- This creates at most one location using the database-generated UUID. It does
-- not assign an Engineer, move equipment, modify old projects or deploy RPCs.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
lock table public.sites in share row exclusive mode;
do $$
declare
  verified_office_address constant text := '2826 Cagayan Valley Rd., Plaridel, Bulacan'; -- ACTUAL_OFFICE_ADDRESS
  candidates integer; office public.sites;
begin
  if verified_office_address is null or char_length(btrim(verified_office_address)) not between 1 and 240 then
    raise exception 'Enter the actual company equipment-receiving Office address/location before running this configuration. No location was created.';
  end if;
  -- A name is only a duplicate warning here, never automatic authorization.
  select count(*) into candidates from public.sites where name ~* '\moffice\M';
  if candidates>0 then
    select * into office from public.sites where name='Office';
    if candidates<>1 or not found or office.location<>btrim(verified_office_address)
      or office.is_active is distinct from true then
      raise exception 'An Office-like location already exists. Stop, rerun office-return-preflight.sql and verify its identity rather than creating or changing another record.';
    end if;
    -- A retry of this same reviewed configuration returns the existing UUID.
    return;
  end if;
  insert into public.sites(name,location,assigned_engineer,assigned_engineer_id,phase,is_active)
    values('Office',btrim(verified_office_address),'Unassigned',null,'Company equipment receiving location',true);
end $$;
commit;

-- Paste this result before binding the guarded Office-only return migration.
select jsonb_build_object('id',id,'name',name,'location',location,'is_active',is_active,
  'assigned_engineer_id',assigned_engineer_id) as receiving_office
  from public.sites where name='Office';
