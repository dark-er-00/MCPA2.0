const assert=require('node:assert/strict');
exports.run=async c=>{
  const {check,execute,query,wa,as,identity,hold,finish,waitLocks,fails,parse,imported,row,lit,json,uid,actors,sites,equipmentRequests,allocateSQL}=c;
  const actionSQL=(action,payload,operation=uid())=>`select jsonb_build_object('pid',pg_backend_pid(),'value',public.mcpa_b_action(${lit(action)},${json(payload)},${lit(operation)}::uuid))`;
  const action=(action,payload,actor='sky',operation=uid())=>query(as(actionSQL(action,payload,operation),actor),'combined-'+action);
  const held=async label=>{
    const e=(await imported(uid(),[row(2,{name:label})],label)).value.assets[0];
    await execute(`update equipment set status='IN_USE',current_holder_id=${lit(actors.sky.id)},site_id=${lit(sites.casa)} where id=${lit(e.id)}`);return e;
  };
  actors.admin2={id:uid(),auth:uid(),role:'admin'};
  await execute(`insert into auth.users(id) values(${lit(actors.admin2.auth)});insert into profiles(id,name,auth_user_id,role,account_status) values(${lit(actors.admin2.id)},'Native second Admin',${lit(actors.admin2.auth)},'admin','active')`);
  await check('combined independent return submissions and Admin inspections admit one winner each',async()=>{
    const e=await held('Native inspected return'),payload={assetIds:[e.asset_id],destinationId:sites.office};
    const first=await hold('begin;'+identity('sky')+actionSQL('submitReturn',payload)+';','combined-return-holder');
    const loser=action('submitReturn',payload),rejected=fails(loser,['40001'],/unavailable/);
    const waits=await waitLocks('combined-submitReturn',1);const b=parse(await finish(first)).value;await rejected;
    const inspections={id:b.id,inspections:[{assetId:e.asset_id,outcome:'good',physicallyReceived:true}]};
    const inspect=await hold('begin;'+identity()+actionSQL('inspectReturn',inspections)+';','combined-inspect-holder');
    const other=action('inspectReturn',inspections,'admin2'),denied=fails(other,['40001'],/changed/);
    const inspectionWaits=await waitLocks('combined-inspectReturn',1);await finish(inspect);await denied;
    const end=await query(`select jsonb_build_object('status',status,'holder',current_holder_id,'reservations',(select count(*) from mcpa_movement_reservations where equipment_id=equipment.id)) from equipment where id=${lit(e.id)}`);
    assert.equal(end.status,'AVAILABLE');assert.equal(end.holder,null);assert.equal(end.reservations,0);return {waits,inspectionWaits};
  });
  await check('combined retirement approval loses to a concurrent quantity allocation',async()=>{
    const {items,requests}=await equipmentRequests('Native retirement allocation race');
    const proposal=(await action('proposeRetirement',{assetId:items[0].asset_id,disposition:'disposed',reason:'Native review',effectiveDate:'2026-10-01'},'admin')).value;
    await fails(action('approveRetirement',{id:proposal.id},'admin'),['42501'],/different/);
    const leader=await hold('begin;'+identity()+allocateSQL(requests[0].id,items.map(e=>e.id))+';','combined-retirement-holder');
    const contender=action('approveRetirement',{id:proposal.id},'admin2'),rejected=fails(contender,['40001'],/prevent retirement/);
    const waits=await waitLocks('combined-approveRetirement',1);await finish(leader);await rejected;
    await fails(query(as(`update equipment set tracking_type='Bulk' where id=${lit(items[0].id)} returning jsonb_build_object('changed',true)`),'metadata-attempt'),['42501'],/identity/);
    return {waits};
  });
  await check('combined evidence attachment blocks an independent privileged deletion and keeps the object',async()=>{
    const e=await held('Native evidence race'),ticket=uid();
    const staged=(await wa('mcpa_b_evidence_action',`'stage',${json({assetId:e.asset_id,phase:'submit_return',mimeType:'image/png',byteSize:8})},${lit(ticket)}::uuid`,'combined-stage','sky')).value;
    await execute(as(`insert into storage.objects(bucket_id,name,metadata) values('mcpa-movement-evidence-v2',${lit(staged.objectName)},'{"mimetype":"image/png","size":8}')`,'sky'));
    await wa('mcpa_b_evidence_action',`'complete','{}',${lit(ticket)}::uuid`,'combined-complete','sky');
    const leader=await hold('begin;'+identity('sky')+actionSQL('submitReturn',{assetIds:[e.asset_id],destinationId:sites.office,evidenceIds:[ticket]})+';','combined-evidence-holder');
    const deletion=execute(`delete from storage.objects where name=${lit(staged.objectName)}`,'combined-evidence-delete'),denied=fails(deletion,['42501'],/retained/);
    const waits=await waitLocks('combined-evidence-delete',1);await finish(leader);await denied;
    const end=await query(`select jsonb_build_object('attached',attached_at is not null,'object',exists(select 1 from storage.objects where name=e.object_name)) from mcpa_b_evidence e where id=${lit(ticket)}`);
    assert.equal(end.attached,true);assert.equal(end.object,true);return {waits};
  });
};
