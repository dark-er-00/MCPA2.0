-- DRAFT ONLY. Apply once after separate approval/preflight, after 00/01.
-- Integrated PHP adapter: server/Invitations.php; disabled by default.
begin;
create table public.mcpa_registration_invites(
 id uuid primary key default gen_random_uuid(), token_hash text not null unique check(token_hash ~ '^[a-f0-9]{64}$'),
 name text not null check(length(name) between 1 and 120), email text not null,
 role text not null check(role in ('engineer','architect','secretary','tool_handler')),
 created_by uuid not null references public.profiles(id) on delete restrict,
 created_at timestamptz not null default now(), expires_at timestamptz not null default (now()+interval '24 hours'),
 state text not null default 'prepared' check(state in ('prepared','claimed','awaiting_verification','completed','reconciliation_required','revoked')),
 claimed_at timestamptz, verification_expires_at timestamptz, last_mail_at timestamptz, mail_count integer not null default 0,
 auth_user_id uuid references auth.users(id) on delete restrict,profile_id uuid references public.profiles(id) on delete restrict
);
create unique index mcpa_registration_pending_email on public.mcpa_registration_invites(email) where state<>'revoked';
alter table public.mcpa_registration_invites enable row level security;
revoke all on public.mcpa_registration_invites from public,anon,authenticated,service_role;
create table public.mcpa_registration_limits(key text not null,minute timestamptz not null,attempts integer not null,primary key(key,minute));
alter table public.mcpa_registration_limits enable row level security;
revoke all on public.mcpa_registration_limits from public,anon,authenticated,service_role;
create function public.mcpa_registration_throttle(p_key text) returns void language plpgsql security definer set search_path='' as $$
declare n integer;slot timestamptz:=date_trunc('minute',clock_timestamp());
begin
 if p_key is null or p_key !~ '^[a-f0-9]{64}$' then raise exception 'Invalid request boundary.' using errcode='42501';end if;
 perform pg_advisory_xact_lock(672341,2028);
 delete from public.mcpa_registration_limits where minute<slot-interval '2 minutes';
 if coalesce((select sum(attempts) from public.mcpa_registration_limits where minute=slot),0)>=1000 then raise exception 'Registration is rate limited. Wait a minute.' using errcode='P0001';end if;
 insert into public.mcpa_registration_limits(key,minute,attempts) values(p_key,slot,1) on conflict(key,minute) do update set attempts=mcpa_registration_limits.attempts+1 returning attempts into n;
 if n>60 then raise exception 'Registration is rate limited. Wait a minute.' using errcode='P0001';end if;
end $$;
revoke all on function public.mcpa_registration_throttle(text) from public,anon,authenticated;
grant execute on function public.mcpa_registration_throttle(text) to service_role;
create function public.mcpa_registration_prepare(p_actor uuid,p_name text,p_email text,p_role text,p_token_hash text) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor public.profiles; r public.mcpa_registration_invites;
begin
 perform pg_advisory_xact_lock(672341,2027);
 select * into actor from public.profiles where id=p_actor and role='admin' and account_status='active' and auth_user_id is not null;
 if not found then raise exception 'Active Admin required.' using errcode='42501';end if;
 if (select count(*) from public.mcpa_registration_invites where created_by=p_actor and created_at>clock_timestamp()-interval '1 hour')>=10 or (select count(*) from public.mcpa_registration_invites where created_at>clock_timestamp()-interval '1 hour')>=100 then raise exception 'Invitation creation is rate limited. Try later.' using errcode='P0001';end if;
 if p_role is null or p_role not in ('engineer','architect','secretary','tool_handler') or p_name is null or length(btrim(p_name)) not between 1 and 120 or p_name ~ '[[:cntrl:]]' or p_email is null or length(p_email)>254 or p_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception 'Invalid invitation details.' using errcode='22023';end if;
 if exists(select 1 from auth.users where lower(email)=lower(btrim(p_email))) or exists(select 1 from public.mcpa_registration_invites where email=lower(btrim(p_email)) and state<>'revoked') then raise exception 'An account or invitation already exists; review it before retrying.' using errcode='22023';end if;
 insert into public.mcpa_registration_invites(token_hash,name,email,role,created_by) values(p_token_hash,btrim(p_name),lower(btrim(p_email)),p_role,actor.id) returning * into r;
 insert into public.mcpa_account_audit(actor_id,profile_id,event,details) values(actor.id,actor.id,'registration_invited',jsonb_build_object('invite_id',r.id));
 return jsonb_build_object('id',r.id,'expires_at',r.expires_at);
end $$;
create function public.mcpa_registration_claim(p_token_hash text) returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.mcpa_registration_invites;
begin perform pg_advisory_xact_lock(672341,2027);select * into r from public.mcpa_registration_invites where token_hash=p_token_hash for update;
 if not found or r.state<>'prepared' or r.expires_at<=clock_timestamp() then raise exception 'Invitation is invalid or expired.' using errcode='22023';end if;
 perform mcpa_auth_private.registration_admin(r.created_by);
 update public.mcpa_registration_invites set claimed_at=clock_timestamp(),verification_expires_at=clock_timestamp()+interval '24 hours',state='claimed' where id=r.id;return jsonb_build_object('id',r.id,'name',r.name,'email',r.email,'role',r.role);
end $$;
create function public.mcpa_registration_finish(p_id uuid,p_auth_id uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare r public.mcpa_registration_invites; u auth.users; result uuid;
begin perform pg_advisory_xact_lock(672341,2027);select * into r from public.mcpa_registration_invites where id=p_id for update;
 if not found or r.state not in ('claimed','reconciliation_required','awaiting_verification') then raise exception 'Invitation requires review.' using errcode='22023';end if;
 if r.state='awaiting_verification' and r.auth_user_id=p_auth_id then return r.profile_id;end if;
 select * into u from auth.users where id=p_auth_id;
 if not found or lower(u.email)<>r.email or u.raw_app_meta_data->>'mcpa_invite_id' is distinct from r.id::text or exists(select 1 from public.profiles where auth_user_id=p_auth_id) then raise exception 'Verified invitation identity does not match.' using errcode='42501';end if;
 result:=gen_random_uuid();insert into public.profiles(id,name,role,account_status,auth_user_id) values(result,r.name,r.role,'inactive',u.id);
 update public.mcpa_registration_invites set state='awaiting_verification',auth_user_id=u.id,profile_id=result where id=r.id;
 insert into public.mcpa_account_audit(actor_id,profile_id,event,details) values(r.created_by,result,'registration_link_used',jsonb_build_object('invite_id',r.id));return result;
end $$;
create function public.mcpa_registration_hold(p_id uuid) returns void language sql security definer set search_path='' as $$update public.mcpa_registration_invites set state='reconciliation_required' where id=p_id and state='claimed'$$;
revoke all on function public.mcpa_registration_prepare(uuid,text,text,text,text),public.mcpa_registration_claim(text),public.mcpa_registration_finish(uuid,uuid),public.mcpa_registration_hold(uuid) from public,anon,authenticated;
grant execute on function public.mcpa_registration_prepare(uuid,text,text,text,text),public.mcpa_registration_claim(text),public.mcpa_registration_finish(uuid,uuid),public.mcpa_registration_hold(uuid) to service_role;
create function mcpa_auth_private.registration_admin(p_actor uuid) returns void language plpgsql security definer set search_path='' as $$
begin if not exists(select 1 from public.profiles where id=p_actor and role='admin' and account_status='active' and auth_user_id is not null) then raise exception 'Active Admin required.' using errcode='42501';end if;end $$;
create function public.mcpa_registration_list(p_actor uuid) returns jsonb language plpgsql security definer set search_path='' as $$
begin perform mcpa_auth_private.registration_admin(p_actor);
 return jsonb_build_object('version',2,'invitations',coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name,'email',email,'role',role,'state',state,'expires_at',expires_at,'verification_expires_at',verification_expires_at) order by created_at desc) from public.mcpa_registration_invites),'[]'::jsonb));
end $$;
create function public.mcpa_registration_reconcile(p_actor uuid,p_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.mcpa_registration_invites;uid uuid;
begin
 perform pg_advisory_xact_lock(672341,2027);perform mcpa_auth_private.registration_admin(p_actor);
 select * into r from public.mcpa_registration_invites where id=p_id for update;
 if not found or r.state not in ('claimed','reconciliation_required','awaiting_verification') then raise exception 'Choose a registration needing review.' using errcode='22023';end if;
 select id into uid from auth.users where lower(email)=r.email and raw_app_meta_data->>'mcpa_invite_id'=r.id::text;
 if uid is null then return jsonb_build_object('message','No matching Auth identity is visible. Keep this registration on hold; do not recreate or reset its password.');end if;
 perform public.mcpa_registration_finish(r.id,uid);
 return jsonb_build_object('message','Matching account linked without changing its password. The invitee can use Send verification email in the original link.');
end $$;
create function public.mcpa_registration_revoke(p_actor uuid,p_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.mcpa_registration_invites;
begin
 perform pg_advisory_xact_lock(672341,2027);perform mcpa_auth_private.registration_admin(p_actor);
 select * into r from public.mcpa_registration_invites where id=p_id for update;
 if not found or r.state<>'prepared' then raise exception 'Only unused invitations can be revoked here. Claimed registrations require review.' using errcode='22023';end if;
 update public.mcpa_registration_invites set state='revoked' where id=r.id;
 insert into public.mcpa_account_audit(actor_id,profile_id,event,details) values(p_actor,p_actor,'registration_revoked',jsonb_build_object('invite_id',r.id));return jsonb_build_object('message','Unused invitation revoked.');
end $$;
create function public.mcpa_registration_mail(p_token_hash text) returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.mcpa_registration_invites;
begin
 select * into r from public.mcpa_registration_invites where token_hash=p_token_hash for update;
 if not found or r.state<>'awaiting_verification' or r.verification_expires_at<=clock_timestamp() then raise exception 'Registration requires Admin review or has expired.' using errcode='22023';end if;
 if r.mail_count>=5 or r.last_mail_at>clock_timestamp()-interval '60 seconds' then raise exception 'Verification email is rate limited. Wait a minute; contact your Admin after five attempts.' using errcode='P0001';end if;
 update public.mcpa_registration_invites set mail_count=mail_count+1,last_mail_at=clock_timestamp() where id=r.id;
 return jsonb_build_object('email',r.email);
end $$;
-- A session and server-owned Auth confirmation, never browser metadata, activate access.
create function public.mcpa_activate_registration() returns boolean language plpgsql security definer set search_path='' as $$
declare r public.mcpa_registration_invites;u auth.users;
begin
 perform pg_advisory_xact_lock(672341,2027);
 select * into r from public.mcpa_registration_invites where auth_user_id=auth.uid() for update;
 if not found then return false;end if;
 if r.state='completed' then return true;end if;
 if r.state<>'awaiting_verification' or r.verification_expires_at<=clock_timestamp() then raise exception 'Registration requires Admin review or has expired.' using errcode='42501';end if;
 perform mcpa_auth_private.registration_admin(r.created_by);
 select * into u from auth.users where id=auth.uid();
 if u.email_confirmed_at is null or lower(u.email)<>r.email or u.raw_app_meta_data->>'mcpa_invite_id' is distinct from r.id::text then raise exception 'Verify the invited email before activation.' using errcode='42501';end if;
 update public.profiles set account_status='active',updated_at=clock_timestamp() where id=r.profile_id and auth_user_id=u.id and role=r.role and account_status='inactive';
 if not found then raise exception 'The invited profile needs Admin review.' using errcode='42501';end if;
 update public.mcpa_registration_invites set state='completed' where id=r.id;
 insert into public.mcpa_account_audit(actor_id,profile_id,event,details) values(r.profile_id,r.profile_id,'registration_verified',jsonb_build_object('invite_id',r.id));return true;
end $$;
-- Prevent the older Add Account/Edit access route from bypassing email verification.
create function mcpa_auth_private.registration_profile_guard() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.account_status='active' and exists(select 1 from public.mcpa_registration_invites i join auth.users u on u.raw_app_meta_data->>'mcpa_invite_id'=i.id::text where u.id=new.auth_user_id) and not exists(select 1 from auth.users u join public.mcpa_registration_invites i on i.auth_user_id=u.id where u.id=new.auth_user_id and u.email_confirmed_at is not null and lower(u.email)=i.email and (i.state='completed' or (i.state='awaiting_verification' and i.verification_expires_at>clock_timestamp())) and new.id=i.profile_id and (i.state='completed' or new.role=i.role)) then raise exception 'Verify the invited email and complete registration before activation.' using errcode='42501';end if;
 return new;
end $$;
create trigger mcpa_registration_profile_guard before insert or update on public.profiles for each row execute function mcpa_auth_private.registration_profile_guard();
revoke all on function mcpa_auth_private.registration_admin(uuid),mcpa_auth_private.registration_profile_guard() from public,anon,authenticated,service_role;
revoke all on function public.mcpa_registration_list(uuid),public.mcpa_registration_reconcile(uuid,uuid),public.mcpa_registration_revoke(uuid,uuid),public.mcpa_registration_mail(text),public.mcpa_activate_registration() from public,anon,authenticated,service_role;
grant execute on function public.mcpa_registration_list(uuid),public.mcpa_registration_reconcile(uuid,uuid),public.mcpa_registration_revoke(uuid,uuid),public.mcpa_registration_mail(text) to service_role;
grant execute on function public.mcpa_activate_registration() to authenticated;
notify pgrst,'reload schema';
commit;
commit;
