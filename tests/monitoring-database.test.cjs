// Actual SQL in a local PostgreSQL fixture only. Never connects to Supabase.
const {test}=require('node:test'),assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
const fs=require('node:fs'),path=require('node:path');
const {authDatabase}=require('./auth-test-db.cjs');
const migration=fs.readFileSync(path.join(__dirname,'../supabase/migrations/202610100006_monitoring.sql'),'utf8');

test('Monitoring generates scoped overdue notices, immutable prospective snapshots and own-only read state without altering pending requests',async()=>{
  const f=await authDatabase(),{db,actors:a}=f;
  const act=(actor,action,payload)=>f.rpc(actor,'mcpa_movement_action',{p_action:action,p_payload:payload,p_operation_id:randomUUID()});
  const snapshot=async actor=>(await f.query(actor,'select public.mcpa_monitoring_snapshot() as value')).rows[0].value;
  const report=async(actor,start,end)=>(await f.query(actor,'select public.mcpa_monitoring_report($1::date,$2::date) as value',[start,end])).rows[0].value;
  const service=async sql=>{await db.exec('set role service_role');try{return await db.query(sql);}finally{await db.exec('reset role');}};
  try{
    const dates=(await db.query("select to_char((current_timestamp at time zone 'Asia/Manila')::date,'YYYY-MM-DD') as today,to_char((current_timestamp at time zone 'Asia/Manila')::date-2,'YYYY-MM-DD') as past,to_char((current_timestamp at time zone 'Asia/Manila')::date+1,'YYYY-MM-DD') as future")).rows[0];
    const pending=await act(a.sky,'createRequest',{toolIds:['TOOL-001'],destination:'Casa Buena',purpose:'Protected pending fixture',neededUntil:dates.today});
    assert.equal(pending.id,'REQ-00001');
    const protectedBefore=(await db.query('select * from mcpa_movements where id=$1',[pending.id])).rows;
    const operationsBefore=(await db.query('select * from mcpa_movement_operations order by id')).rows;
    await db.exec(migration);
    assert.deepEqual((await db.query('select * from mcpa_movements where id=$1',[pending.id])).rows,protectedBefore);
    assert.deepEqual((await db.query('select * from mcpa_movement_operations order by id')).rows,operationsBefore);
    assert.equal((await db.query('select count(*)::int as n from mcpa_notifications')).rows[0].n,0,'Installing does not fabricate old notifications');
    assert.equal((await db.query('select count(*)::int as n from mcpa_inventory_snapshots')).rows[0].n,0,'No historical backfill');

    const received=[];
    for(const [asset,due]of [['OVERDUE',dates.past],['DUE-TODAY',dates.today],['FUTURE',dates.future]]){
      await db.query("insert into equipment(id,asset_id,name,quantity,status) values($1,$2,$2,1,'AVAILABLE')",[randomUUID(),asset]);
      const req=await act(a.sky,'createRequest',{toolIds:[asset],destination:'Casa Buena',purpose:'Isolated monitoring timing',neededUntil:dates.today});
      await act(a.admin,'approveRequest',{id:req.id});
      const handover=await act(a.admin,'releaseRequest',{id:req.id});
      await act(a.sky,'receiveTransfer',{id:handover.id,inspections:[{toolId:asset,condition:'good',tested:true}]});
      // Model elapsed time in this isolated fixture; never change a live request.
      await db.query("update mcpa_movements set data=data||jsonb_build_object('neededUntil',$1::text) where id=$2",[due,req.id]);
      received.push({...req,asset,due});
    }
    const current=await snapshot(a.sky);
    assert.equal(current.serverDate,dates.today);
    assert.equal(current.overdue.length,1);
    assert.equal(current.overdue[0].requestId,received[0].id);
    assert.equal(current.overdue[0].daysOverdue,2);
    assert.deepEqual(current.overdue[0].toolIds,['OVERDUE']);
    assert.equal((await snapshot(a.admin)).overdue.length,1);
    assert.equal((await snapshot(a.handler)).overdue.length,1);
    assert.equal((await snapshot(a.pau)).overdue.length,0,'Unrelated Engineer does not see other custody');
    assert.equal((await snapshot(a.architect)).overdue.length,0);
    for(const actor of [null,a.inactive,a.secretary])await assert.rejects(snapshot(actor),error=>error.code==='42501');
    for(const actor of [null,a.admin,a.sky,a.architect,a.secretary,a.handler,a.inactive]){
      await assert.rejects(f.query(actor,'select public.mcpa_generate_monitoring()'),error=>error.code==='42501');
      await assert.rejects(f.query(actor,'select public.mcpa_capture_inventory_snapshot()'),error=>error.code==='42501');
    }
    const first=(await service('select public.mcpa_generate_monitoring() as value')).rows[0].value;
    assert.ok(first.notificationsCreated>=2);
    const notices=(await db.query("select * from mcpa_notifications where kind='overdue' order by recipient_id")).rows;
    assert.equal(notices.length,2);
    assert.deepEqual(new Set(notices.map(n=>n.recipient_id)),new Set([a.admin.id,a.sky.id]));
    const second=(await service('select public.mcpa_generate_monitoring() as value')).rows[0].value;
    assert.equal(second.notificationsCreated,0,'Same daily and weekly keys deduplicate');
    const mine=(await snapshot(a.sky)).notifications.find(n=>n.kind==='overdue');
    const admins=(await snapshot(a.admin)).notifications.find(n=>n.kind==='overdue');
    assert.ok(mine&&admins);assert.notEqual(mine.id,admins.id);
    assert.ok((await f.query(a.sky,'select * from mcpa_notifications')).rows.every(n=>n.recipient_id===a.sky.id),'RLS reads only own notices');
    assert.ok((await f.query(a.admin,'select * from mcpa_notifications')).rows.every(n=>n.recipient_id===a.admin.id),'Admin cannot read another recipient notification');
    await assert.rejects(f.query(a.pau,'select public.mcpa_monitoring_mark_read($1)',[mine.id]),error=>error.code==='42501');
    await assert.rejects(f.query(a.admin,'select public.mcpa_monitoring_mark_read($1)',[mine.id]),error=>error.code==='42501');
    await f.query(a.sky,'select public.mcpa_monitoring_mark_read($1)',[mine.id]);
    const readAt=(await db.query('select read_at from mcpa_notifications where id=$1',[mine.id])).rows[0].read_at;
    await f.query(a.sky,'select public.mcpa_monitoring_mark_read($1)',[mine.id]);
    assert.deepEqual((await db.query('select read_at from mcpa_notifications where id=$1',[mine.id])).rows[0].read_at,readAt,'Mark-read retry keeps original timestamp');
    for(const actor of [a.sky,a.admin,a.handler])for(const sql of ["update mcpa_notifications set title='forged'",'delete from mcpa_notifications','truncate mcpa_notifications'])await assert.rejects(f.query(actor,sql),error=>error.code==='42501');
    await assert.rejects(db.exec("update mcpa_notifications set message='forged'"),error=>error.code==='42501');
    await assert.rejects(db.exec('delete from mcpa_notifications'),error=>error.code==='42501');
    await assert.rejects(db.exec('truncate mcpa_notifications'),error=>error.code==='42501');

    const capture=(await service('select public.mcpa_capture_inventory_snapshot() as id')).rows[0].id;
    assert.equal((await service('select public.mcpa_capture_inventory_snapshot() as id')).rows[0].id,capture,'One actual snapshot per week');
    const historical=(await report(a.admin,dates.today,dates.today));
    assert.ok(historical.activity.length>=13,'Date range includes real existing movement operations');
    assert.equal(historical.snapshots.length,1);
    assert.equal(historical.historicalAvailableFrom,dates.today);
    assert.equal(historical.timezone,'Asia/Manila');
    assert.equal(historical.snapshots[0].localDate,dates.today);
    assert.equal(historical.snapshots[0].tools.find(t=>t.id==='OVERDUE').holderId,a.sky.id);
    const outside=await report(a.admin,dates.past,dates.past);
    assert.deepEqual(outside.activity,[]);assert.deepEqual(outside.snapshots,[],'Current state is not mislabeled as a past snapshot');
    for(const actor of [null,a.sky,a.pau,a.architect,a.handler,a.secretary,a.inactive])await assert.rejects(report(actor,dates.today,dates.today),error=>error.code==='42501');
    for(const actor of [a.sky,a.pau,a.architect,a.handler,a.secretary,a.inactive])assert.deepEqual((await f.query(actor,'select * from mcpa_inventory_snapshots')).rows,[]);
    await assert.rejects(report(a.admin,dates.future,dates.past),error=>error.code==='22023');
    await assert.rejects(report(a.admin,'2000-01-01',dates.today),error=>error.code==='22023');
    for(const sql of ["update mcpa_inventory_snapshots set tools='[]'::jsonb",'delete from mcpa_inventory_snapshots','truncate mcpa_inventory_snapshots'])await assert.rejects(db.exec(sql),error=>error.code==='42501');
    await assert.rejects(f.query(a.admin,"insert into mcpa_inventory_snapshots(local_date,week_start,tools) values(current_date,current_date,'[]')"),error=>error.code==='42501');

    await act(a.sky,'createReturn',{toolIds:['OVERDUE'],destination:'Main Warehouse',conditions:[{toolId:'OVERDUE',condition:'good'}],notes:'Isolated completed return'});
    assert.deepEqual((await snapshot(a.sky)).overdue,[],'Confirmed return removes current overdue custody');
    const afterReturn=await report(a.admin,dates.today,dates.today);
    assert.equal(afterReturn.current.find(t=>t.id==='OVERDUE').holderId,null);
    assert.equal(afterReturn.snapshots[0].tools.find(t=>t.id==='OVERDUE').holderId,a.sky.id,'Historical capture remains unchanged after return');
    const notificationRows=(await db.query('select * from mcpa_notifications order by id')).rows;
    const snapshotRows=(await db.query('select * from mcpa_inventory_snapshots order by id')).rows;
    await db.exec(migration);
    assert.deepEqual((await db.query('select * from mcpa_notifications order by id')).rows,notificationRows);
    assert.deepEqual((await db.query('select * from mcpa_inventory_snapshots order by id')).rows,snapshotRows);
    assert.deepEqual((await db.query('select * from mcpa_movements where id=$1',[pending.id])).rows,protectedBefore,'Protected fixture remains pending and unchanged');
    await db.query("update profiles set account_status='inactive' where id=$1",[a.sky.id]);
    assert.deepEqual((await f.query(a.sky,'select * from mcpa_notifications')).rows,[]);
    await assert.rejects(f.query(a.sky,'select public.mcpa_monitoring_mark_read($1)',[mine.id]),error=>error.code==='42501');
  }finally{await f.close();}
});

test('Monitoring date parser ignores malformed legacy dates instead of failing all notices',async()=>{
  const f=await authDatabase();
  try{
    await f.db.exec(migration);
    for(const value of [null,'','yesterday','2026-02-30','2026-13-01','10/10/2026'])assert.equal((await f.db.query('select mcpa_auth_private.monitoring_due_date($1) as value',[value])).rows[0].value,null);
    assert.ok((await f.db.query("select mcpa_auth_private.monitoring_due_date('2026-10-10') as value")).rows[0].value);
    for(const actor of [null,f.actors.admin,f.actors.sky])await assert.rejects(f.query(actor,'select mcpa_auth_private.monitoring_overdue()'),error=>error.code==='42501');
  }finally{await f.close();}
});

test('Only future movement operations notify stable affected recipients; cancellation/refusal retries do not duplicate notices',async()=>{
  const f=await authDatabase({engineerPortal:true}),{db,actors:a}=f;
  const act=(actor,action,payload,operation=randomUUID())=>f.rpc(actor,'mcpa_movement_action',{p_action:action,p_payload:payload,p_operation_id:operation});
  try{
    await db.exec(fs.readFileSync(path.join(__dirname,'../supabase/migrations/202610100004_movement_cancellation.sql'),'utf8'));
    const oldRequest=await act(a.sky,'createRequest',{toolIds:['TOOL-001'],destination:'Casa Buena',purpose:'Protected old operation fixture'});
    const oldMovements=(await db.query('select * from mcpa_movements order by id')).rows;
    const oldOperations=(await db.query('select * from mcpa_movement_operations order by id')).rows;
    await db.exec(migration);
    assert.deepEqual((await db.query('select * from mcpa_movements order by id')).rows,oldMovements);
    assert.deepEqual((await db.query('select * from mcpa_movement_operations order by id')).rows,oldOperations);
    assert.equal((await db.query('select count(*)::int as n from mcpa_notifications')).rows[0].n,0,'Old operation not backfilled');
    // Deliberately duplicated display names must never select a recipient.
    await db.query('update profiles set name=$1 where id in ($2,$3)',['Same Person Name',a.sky.id,a.pau.id]);
    const site=randomUUID();await db.query("insert into sites(id,name,location,assigned_engineer,assigned_engineer_id) values($1,'Prospective notices','Fixture',$2,$3)",[site,'Same Person Name',a.pau.id]);
    const operation=randomUUID();
    const transfer=await act(a.sky,'createTransfer',{toolIds:['TOOL-002'],destination:'Prospective notices',receiverId:a.pau.id,notes:'Prospective notification test'},operation);
    const recipients=async action=>(await db.query("select recipient_id,data,entity_id from mcpa_notifications where kind='movement' and data->>'action'=$1 order by recipient_id",[action])).rows;
    const created=await recipients('createTransfer');
    assert.deepEqual(new Set(created.map(n=>n.recipient_id)),new Set([a.admin.id,a.pau.id]));
    assert.ok(created.every(n=>n.entity_id===transfer.id&&n.data.route==='transfer'));
    await act(a.sky,'createTransfer',{toolIds:['TOOL-002'],destination:'Prospective notices',receiverId:a.pau.id,notes:'Prospective notification test'},operation);
    assert.equal((await recipients('createTransfer')).length,2,'Operation retry creates no duplicate');
    const refusalPayload={id:transfer.id,reason:'Guard visibly damaged',confirmed:true,inspections:[{toolId:'TOOL-002',condition:'damaged',tested:true,disposition:'declined',notes:'Cracked guard'}]};
    const refused=await act(a.pau,'refuseTransfer',refusalPayload);
    assert.equal(refused.status,'refused');
    assert.deepEqual(new Set((await recipients('refuseTransfer')).map(n=>n.recipient_id)),new Set([a.admin.id,a.sky.id]),'Refusing receiver is excluded; sender and Admin notified');
    await act(a.sky,'reopenTransfer',{id:transfer.id,reason:'Guard inspected; inspect the handover again',confirmed:true});
    assert.deepEqual(new Set((await recipients('reopenTransfer')).map(n=>n.recipient_id)),new Set([a.admin.id,a.pau.id]));
    await act(a.sky,'cancelTransfer',{id:transfer.id,reason:'New work schedule requires a later handover',confirmed:true});
    assert.deepEqual(new Set((await recipients('cancelTransfer')).map(n=>n.recipient_id)),new Set([a.admin.id,a.pau.id]));
    const priorNotices=(await db.query('select * from mcpa_notifications order by id')).rows;
    const priorOperations=(await db.query('select * from mcpa_movement_operations order by id')).rows;
    await db.exec('begin');
    await act(a.sky,'createTransfer',{toolIds:['TOOL-003'],destination:'Prospective notices',receiverId:a.pau.id,notes:'Rolled back local operation'});
    assert.ok((await db.query('select count(*)::int as n from mcpa_notifications')).rows[0].n>priorNotices.length);
    await db.exec('rollback');
    assert.deepEqual((await db.query('select * from mcpa_notifications order by id')).rows,priorNotices,'Notices roll back with their operation');
    assert.deepEqual((await db.query('select * from mcpa_movement_operations order by id')).rows,priorOperations);
    assert.deepEqual((await db.query('select * from mcpa_movements where id=$1',[oldRequest.id])).rows,[oldMovements.find(row=>row.id===oldRequest.id)],'Protected pending request stays unchanged');
    assert.ok((await db.query("select * from mcpa_notifications where kind='movement'")).rows.every(n=>!['Same Person Name'].includes(n.recipient_id)),'Recipient IDs remain permanent profile UUIDs');
  }finally{await f.close();}
});

test('An old received request never becomes overdue again after return and reacquisition; zero inventory and unrelated receipts are excluded',async()=>{
  const f=await authDatabase(),{db,actors:a}=f;
  const act=(actor,action,payload)=>f.rpc(actor,'mcpa_movement_action',{p_action:action,p_payload:payload,p_operation_id:randomUUID()});
  const overdue=async()=>(await f.query(a.sky,'select public.mcpa_monitoring_snapshot() as value')).rows[0].value.overdue;
  try{
    await db.exec(migration);
    const dates=(await db.query("select to_char((current_timestamp at time zone 'Asia/Manila')::date,'YYYY-MM-DD') as today,to_char((current_timestamp at time zone 'Asia/Manila')::date-1,'YYYY-MM-DD') as past,to_char((current_timestamp at time zone 'Asia/Manila')::date+1,'YYYY-MM-DD') as future")).rows[0];
    const borrow=async due=>{
      const request=await act(a.sky,'createRequest',{toolIds:['TOOL-001'],destination:'Casa Buena',purpose:'Independent loan regression',neededUntil:due===dates.past?dates.today:due});
      await act(a.admin,'approveRequest',{id:request.id});
      const transfer=await act(a.admin,'releaseRequest',{id:request.id});
      await act(a.sky,'receiveTransfer',{id:transfer.id,inspections:[{toolId:'TOOL-001',condition:'good',tested:true}]});
      if(due===dates.past)await db.query("update mcpa_movements set data=data||jsonb_build_object('neededUntil',$1::text) where id=$2",[due,request.id]);
      return request;
    };
    const returnTool=()=>act(a.sky,'createReturn',{toolIds:['TOOL-001'],destination:'Main Warehouse',conditions:[{toolId:'TOOL-001',condition:'good'}],notes:'Confirmed local return'});
    const first=await borrow(dates.past);
    assert.deepEqual((await overdue()).map(item=>item.requestId),[first.id]);
    await returnTool();assert.deepEqual(await overdue(),[]);
    const oldRequest=(await db.query('select * from mcpa_movements where id=$1',[first.id])).rows;
    const second=await borrow(dates.future);
    assert.deepEqual(await overdue(),[],'Same holder reacquiring under a future due date does not revive old loan');
    assert.deepEqual((await db.query('select * from mcpa_movements where id=$1',[first.id])).rows,oldRequest,'Earlier request remains historical and unchanged');
    await db.query("update mcpa_movements set data=data||jsonb_build_object('neededUntil',$1::text) where id=$2",[dates.past,second.id]);
    assert.deepEqual((await overdue()).map(item=>item.requestId),[second.id],'Only newest current loan becomes overdue');
    await db.query("update equipment set quantity=0 where asset_id='TOOL-001'");
    assert.deepEqual(await overdue(),[],'Zero quantity cannot be overdue equipment');
    await db.query("update equipment set quantity=1 where asset_id='TOOL-001'");
    assert.deepEqual((await overdue()).map(item=>item.requestId),[second.id]);
    await returnTool();
    const direct=await act(a.handler,'createTransfer',{toolIds:['TOOL-001'],destination:'Casa Buena',receiverId:a.sky.id,notes:'New direct handover without an old request'});
    await act(a.sky,'receiveTransfer',{id:direct.id,inspections:[{toolId:'TOOL-001',condition:'good',tested:true}]});
    assert.deepEqual(await overdue(),[],'A new direct handover is not attached to an old request due date');
    const outgoing=await act(a.sky,'createTransfer',{toolIds:['TOOL-001'],destination:'Main Warehouse',receiverId:a.pau.id,notes:'Later handover with one missing tool'});
    await act(a.pau,'receiveTransfer',{id:outgoing.id,inspections:[{toolId:'TOOL-001',condition:'lost',notes:'Not physically received',tested:false}]});
    assert.equal((await db.query("select current_holder_id from equipment where asset_id='TOOL-001'")).rows[0].current_holder_id,a.sky.id);
    assert.deepEqual(await overdue(),[],'Lost receipt does not invent a new successful acquisition or restore older loans');
  }finally{await f.close();}
});
