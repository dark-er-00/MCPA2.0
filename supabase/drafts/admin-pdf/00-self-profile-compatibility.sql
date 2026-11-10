-- DRAFT ONLY / REVIEW REQUIRED. Compatible installation for the page-12 missing-RPC error.
-- Run the read-only preflight first. Never replay an unrelated profile function.
-- REVIEW ONLY / UNAPPLIED. Add own-profile editing; never change Auth identity,
-- email, roles, activation, project assignments, or historical profile IDs.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';

do $$ begin
 if exists(select 1 from pg_proc where oid=to_regprocedure('public.mcpa_my_profile()') and md5(replace(prosrc,E'\r','')) not in ('bace4923627146cb959a1d8d9a575db7','a70e318efc08d148f9d0362a58f529b8')) then raise exception 'Unreviewed mcpa_my_profile body. Compare preflight before proceeding.';end if;
 if exists(select 1 from pg_proc where oid=to_regprocedure('public.mcpa_update_my_profile(text,text)') and md5(replace(prosrc,E'\r','')) not in ('0038fdc5380a4009d1ff5c1c844edb91')) then raise exception 'Unreviewed mcpa_update_my_profile body. Compare preflight before proceeding.';end if;
end $$;

alter table public.profiles add column if not exists username text;
do $$ begin
 if (select data_type from information_schema.columns where table_schema='public' and table_name='profiles' and column_name='username')<>'text' then raise exception 'Unexpected username type. Stop and review.';end if;
 if not exists(select 1 from pg_constraint where conrelid='public.profiles'::regclass and conname='mcpa_username_format') then
  alter table public.profiles add constraint mcpa_username_format check(username is null or (username=lower(username) and username ~ '^[a-z0-9][a-z0-9._-]{1,28}[a-z0-9]$'));
 end if;
end $$;
create unique index if not exists mcpa_profile_username on public.profiles(lower(username)) where username is not null;
do $$ begin
 if not exists(select 1 from pg_index where indexrelid='public.mcpa_profile_username'::regclass and indisunique and indisvalid and pg_get_expr(indexprs,indrelid)='lower(username)' and pg_get_expr(indpred,indrelid)='(username IS NOT NULL)') then raise exception 'Unexpected username index. Stop and review.';end if;
end $$;

create or replace function public.mcpa_my_profile()
returns jsonb language sql stable security definer set search_path='' as $$
  select jsonb_build_object('id',p.id,'name',p.name,'username',p.username,'role',p.role,
    'account_status',p.account_status,'email',u.email)
  from public.profiles p left join auth.users u on u.id=p.auth_user_id where p.auth_user_id=auth.uid();
$$;

create or replace function public.mcpa_update_my_profile(p_name text,p_username text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor public.profiles; old_name text; old_username text;
  display_name text:=btrim(p_name); handle text:=nullif(lower(btrim(p_username)),'');
begin
  actor:=mcpa_auth_private.identity();
  select name,username into old_name,old_username from public.profiles where id=actor.id for update;
  -- Recheck authorization after waiting on concurrent access changes.
  actor:=mcpa_auth_private.identity();
  if display_name is null or char_length(display_name) not between 1 and 120
    or display_name ~ '[[:cntrl:]]' then
    raise exception 'Enter a display name from 1 to 120 characters without control characters.' using errcode='22023';
  end if;
  if handle is not null and handle !~ '^[a-z0-9][a-z0-9._-]{1,28}[a-z0-9]$' then
    raise exception 'Use 3 to 30 letters, numbers, dots, underscores or hyphens; start and end with a letter or number.' using errcode='22023';
  end if;
  update public.profiles set name=display_name,username=handle,updated_at=clock_timestamp() where id=actor.id;
  if old_name is distinct from display_name then
    insert into public.mcpa_account_audit(actor_id,profile_id,event,details)
      values(actor.id,actor.id,'person_renamed',jsonb_build_object('from',old_name,'to',display_name));
  end if;
  if old_username is distinct from handle then
    insert into public.mcpa_account_audit(actor_id,profile_id,event,details)
      values(actor.id,actor.id,'username_changed',jsonb_build_object('from',old_username,'to',handle));
  end if;
  return public.mcpa_my_profile();
end $$;
revoke all on function public.mcpa_my_profile(),public.mcpa_update_my_profile(text,text) from public,anon,authenticated;
grant execute on function public.mcpa_my_profile(),public.mcpa_update_my_profile(text,text) to authenticated;
notify pgrst,'reload schema';
commit;
