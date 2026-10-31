-- Current manual gate: run only after verified legacy handover lockdown.
-- Removes only profiles_id_fkey. No IDs, account links, rows or policies change.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

do $$
declare
  person_id_column smallint; auth_link_column smallint; auth_id_column smallint;
  legacy_constraint pg_constraint; table_name text; browser_role text;
  profiles_before jsonb; profiles_after jsonb;
  constraints_before jsonb; constraints_after jsonb;
begin
  if to_regclass('public.profiles') is null or to_regclass('auth.users') is null
    or to_regprocedure('public.complete_equipment_handover(uuid)') is null then
    raise exception 'Schema differs from reviewed preflight. Stop and review.';
  end if;
  foreach table_name in array array['equipment_transfers','equipment_history'] loop
    if not exists(select 1 from pg_class where oid=to_regclass('public.'||table_name) and relrowsecurity) then
      raise exception 'Complete and verify legacy handover lockdown first.';
    end if;
    foreach browser_role in array array['anon','authenticated'] loop
      if has_table_privilege(browser_role,'public.'||table_name,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
        or has_any_column_privilege(browser_role,'public.'||table_name,'SELECT,INSERT,UPDATE,REFERENCES')
        or has_function_privilege(browser_role,'public.complete_equipment_handover(uuid)','EXECUTE') then
        raise exception 'Legacy browser access remains. Complete and verify lockdown first.';
      end if;
    end loop;
  end loop;

  -- A short exclusive lock prevents profile changes during the identity check.
  -- A busy database causes a timeout/rollback, not an indefinite wait.
  lock table public.profiles in access exclusive mode;
  select attnum into person_id_column from pg_attribute
    where attrelid='public.profiles'::regclass and attname='id' and not attisdropped;
  select attnum into auth_link_column from pg_attribute
    where attrelid='public.profiles'::regclass and attname='auth_user_id' and not attisdropped;
  select attnum into auth_id_column from pg_attribute
    where attrelid='auth.users'::regclass and attname='id' and not attisdropped;
  if person_id_column is null or auth_link_column is null or auth_id_column is null then
    raise exception 'Required identity columns are missing. Stop and review.';
  end if;
  if not exists(select 1 from pg_constraint where conrelid='public.profiles'::regclass
    and contype='p' and conkey=array[person_id_column]) then
    raise exception 'profiles.id must remain the primary key. Stop and review.';
  end if;
  if not exists(select 1 from pg_constraint where conrelid='public.profiles'::regclass
    and contype='f' and conkey=array[auth_link_column] and confrelid='auth.users'::regclass
    and confkey=array[auth_id_column] and confdeltype='n' and convalidated) then
    raise exception 'Expected validated auth_user_id -> auth.users(id) ON DELETE SET NULL is missing.';
  end if;
  select * into legacy_constraint from pg_constraint
    where conrelid='public.profiles'::regclass and conname='profiles_id_fkey';
  if legacy_constraint.oid is not null and (
    legacy_constraint.contype<>'f' or legacy_constraint.conkey<>array[person_id_column]
    or legacy_constraint.confrelid<>'auth.users'::regclass
    or legacy_constraint.confkey<>array[auth_id_column]
    or legacy_constraint.confdeltype<>'a' or legacy_constraint.confupdtype<>'a'
    or not legacy_constraint.convalidated
  ) then
    raise exception 'profiles_id_fkey differs from the reviewed constraint. Stop and review.';
  end if;
  if exists(select 1 from pg_constraint where conrelid='public.profiles'::regclass
    and contype='f' and person_id_column=any(conkey) and confrelid='auth.users'::regclass
    and conname<>'profiles_id_fkey') then
    raise exception 'An additional profile-ID/Auth foreign key exists. Stop and review.';
  end if;

  select coalesce(jsonb_agg(to_jsonb(p) order by p.id),'[]'::jsonb)
    into profiles_before from public.profiles p;
  select coalesce(jsonb_agg(to_jsonb(c) order by c.oid),'[]'::jsonb)
    into constraints_before from pg_constraint c
    where (c.conrelid='public.profiles'::regclass or c.confrelid='public.profiles'::regclass)
      and not (c.conrelid='public.profiles'::regclass and c.conname='profiles_id_fkey');

  if legacy_constraint.oid is not null then
    -- RESTRICT deliberately refuses unexpected dependencies. Never use CASCADE.
    alter table public.profiles drop constraint profiles_id_fkey restrict;
  end if;

  select coalesce(jsonb_agg(to_jsonb(p) order by p.id),'[]'::jsonb)
    into profiles_after from public.profiles p;
  select coalesce(jsonb_agg(to_jsonb(c) order by c.oid),'[]'::jsonb)
    into constraints_after from pg_constraint c
    where c.conrelid='public.profiles'::regclass or c.confrelid='public.profiles'::regclass;
  if profiles_after is distinct from profiles_before or constraints_after is distinct from constraints_before then
    raise exception 'Profile data or retained constraints changed unexpectedly. Rolling back.';
  end if;
end $$;

notify pgrst,'reload schema';
commit;

select jsonb_build_object(
  'profile_id_auth_fk_present',exists(
    select 1 from pg_constraint c join pg_attribute a on a.attrelid=c.conrelid and a.attnum=any(c.conkey)
    where c.conrelid='public.profiles'::regclass and c.contype='f'
      and c.confrelid='auth.users'::regclass and a.attname='id'),
  'profile_primary_key',(
    select pg_get_constraintdef(oid) from pg_constraint
    where conrelid='public.profiles'::regclass and contype='p'),
  'auth_link_foreign_key',(
    select pg_get_constraintdef(oid) from pg_constraint
    where conrelid='public.profiles'::regclass and conname='profiles_auth_user_id_fkey'),
  'existing_accounts',(
    select jsonb_agg(jsonb_build_object('id',id,'name',name,'role',role,
      'account_status',account_status,'auth_user_id',auth_user_id,'same_uuid',id=auth_user_id) order by name)
    from public.profiles where id in ('b28645de-d763-4cd8-91a3-68c31b7d03a5','9c31f387-788d-4ff5-9a87-96d13a394fe3')),
  'incoming_foreign_keys',(
    select jsonb_agg(jsonb_build_object('table',conrelid::regclass::text,'constraint',conname,
      'definition',pg_get_constraintdef(oid)) order by conrelid,conname)
    from pg_constraint where contype='f' and confrelid='public.profiles'::regclass)
) as profile_identity_verification;
