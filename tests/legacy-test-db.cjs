const {randomUUID}=require('node:crypto');
const {authDatabase}=require('./auth-test-db.cjs');
async function fixture(){
 const f=await authDatabase({accountManagement:false}),{db,actors:a,tools}=f;
 // Reproduce the newly reported live identity constraint and equal UUIDs.
 await db.exec(`insert into auth.users(id) select id from profiles on conflict do nothing;
   update profiles set auth_user_id=id;
   alter table profiles add constraint profiles_id_fkey foreign key(id) references auth.users(id);
   create table equipment_transfers(id uuid primary key,equipment_id uuid references equipment(id),
     from_user_id uuid references profiles(id),to_user_id uuid references profiles(id),status text);
   create table equipment_history(id uuid primary key default gen_random_uuid(),equipment_id uuid references equipment(id),
     previous_holder_id uuid references profiles(id),new_holder_id uuid references profiles(id),action text);
   alter table equipment_transfers enable row level security;
   create policy legacy_insert on equipment_transfers for insert to authenticated with check(auth.uid()=from_user_id);
   create policy legacy_select on equipment_transfers for select to authenticated using(auth.uid()=from_user_id or auth.uid()=to_user_id);
   grant all on equipment_transfers,equipment_history to public,anon,authenticated;
   grant select(id),update(action) on equipment_history to authenticated;
   create function public.complete_equipment_handover(p_transfer_id uuid) returns void language plpgsql security definer as $$
   declare v_equip_id uuid;v_sender_id uuid;v_receiver_id uuid;
   begin
     select equipment_id,from_user_id,to_user_id into v_equip_id,v_sender_id,v_receiver_id
       from equipment_transfers where id=p_transfer_id and status='PENDING' and to_user_id=auth.uid();
     if not found then raise exception 'Transfer request not found, already completed, or unauthorized.';end if;
     update equipment_transfers set status='COMPLETED' where id=p_transfer_id;
     update equipment set current_holder_id=v_receiver_id where id=v_equip_id;
     insert into equipment_history(equipment_id,previous_holder_id,new_holder_id,action)
       values(v_equip_id,v_sender_id,v_receiver_id,'TRANSFERRED');
   end $$;
   grant execute on function complete_equipment_handover(uuid) to anon,authenticated;`);
 for(const actor of Object.values(a))actor.authId=actor.id;
 const legacyId=randomUUID();
 await db.query("insert into equipment_transfers values($1,$2,$3,$4,'PENDING')",[legacyId,tools['TOOL-002'],a.sky.id,a.pau.id]);
 await db.query("insert into equipment_history(equipment_id,previous_holder_id,new_holder_id,action) values($1,$2,$3,'EXISTING_HISTORY')",[tools['TOOL-002'],a.sky.id,a.sky.id]);
 return {...f,legacyId};
}

module.exports={legacyDatabase:fixture};
