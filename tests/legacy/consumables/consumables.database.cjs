const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { database, setup } = require('./database.cjs');
const failure = (work, code) => assert.rejects(work, error => [].concat(code).includes(error.code));
let db;
(async () => {
  const test = await database(); db = test.db;
  const { rpc, asRole } = test;
  assert.equal((await asRole('anon', 'select * from consumables')).rows.length, 0);
  await db.exec('create table equipment(id integer primary key); insert into equipment values (42);');
  console.log('PASS Setup starts empty and requires no other module tables');
  for (const role of ['anon', 'authenticated']) {
    const create = { p_id: randomUUID(), p_version: null, p_name: `${role} Rods`, p_unit: 'kg', p_minimum: 10, p_opening: 4 };
    let item = await rpc('consumables_save_item', create, role);
    assert.equal(item.stock_status, 'low');
    assert.equal((await rpc('consumables_save_item', create, role)).id, item.id);
    await failure(() => rpc('consumables_save_item', { ...create, p_opening:5 }, role), '40001');
    await failure(() => rpc('consumables_save_item', { ...create, p_id: randomUUID(), p_name: `  ${role.toUpperCase()}   RODS  ` }, role), '23505');
    for (const values of [{p_name:'  '}, {p_opening:-1}, {p_minimum:0.0001}, {p_opening:1000000000}, {p_unit:null}]) {
      await failure(() => rpc('consumables_save_item', { ...create, p_id: randomUUID(), p_name: randomUUID(), ...values }, role), ['23514','22023','22003','23502']);
    }
    const requestArgs = { p_id: randomUUID(), p_item_id:item.id, p_quantity:6, p_requester:'Engineer A', p_purpose:'Restock welding supplies', p_needed_by:null };
    const request = await rpc('consumables_create_request', requestArgs, role);
    assert.equal(request.status,'pending');
    assert.equal((await rpc('consumables_create_request', requestArgs, role)).id,request.id);
    assert.equal((await asRole(role,'select current_stock from consumables where id=$1',[item.id])).rows[0].current_stock, '4.000');
    await failure(() => rpc('consumables_create_request', { ...requestArgs, p_id:randomUUID() }, role), '23505');
    const receive = { p_operation_id:randomUUID(), p_request_id:request.id, p_version:request.version, p_quantity:2.5, p_note:'Delivery DR-1' };
    const partial = await rpc('consumables_receive_request', receive, role);
    assert.equal(partial.status,'partial'); assert.equal(partial.received_quantity,2.5);
    await rpc('consumables_receive_request', receive, role);
    assert.equal((await asRole(role,'select current_stock from consumables where id=$1',[item.id])).rows[0].current_stock, '6.500');
    await failure(() => rpc('consumables_receive_request',{...receive,p_operation_id:randomUUID()},role),'40001');
    await failure(() => rpc('consumables_receive_request',{...receive,p_operation_id:randomUUID(),p_version:partial.version,p_quantity:4},role),'22023');
    await failure(() => rpc('consumables_receive_request',{...receive,p_operation_id:randomUUID(),p_version:partial.version,p_note:' '},role),'23514');
    assert.equal((await asRole(role,'select current_stock from consumables where id=$1',[item.id])).rows[0].current_stock, '6.500', 'Failed receipt rolls back the stock change');
    const received = await rpc('consumables_receive_request',{...receive,p_operation_id:randomUUID(),p_version:partial.version,p_quantity:3.5},role);
    assert.equal(received.status,'received');
    item = (await asRole(role,'select to_jsonb(c) as value from consumables c where id=$1',[item.id])).rows[0].value;
    assert.equal(item.stock_status,'ok'); assert.equal(item.current_stock,10);
    await failure(() => rpc('consumables_cancel_request',{p_request_id:request.id,p_version:received.version,p_reason:'No longer needed'},role),'40001');
    const adjustment = {p_operation_id:randomUUID(),p_item_id:item.id,p_version:item.version,p_kind:'usage',p_quantity:10,p_note:'Issued to crew'};
    const zero = await rpc('consumables_adjust_stock',adjustment,role);
    assert.equal(zero.stock_status,'out'); assert.equal(zero.current_stock,0);
    await rpc('consumables_adjust_stock',adjustment,role);
    await failure(() => rpc('consumables_adjust_stock',{...adjustment,p_quantity:1},role),'40001');
    await failure(() => rpc('consumables_adjust_stock',{...adjustment,p_operation_id:randomUUID(),p_version:zero.version,p_quantity:1},role),'22023');
    const corrected = await rpc('consumables_adjust_stock',{...adjustment,p_operation_id:randomUUID(),p_version:zero.version,p_kind:'correction',p_quantity:1.125},role);
    assert.equal(corrected.current_stock,1.125);
    const restocked = await rpc('consumables_adjust_stock',{...adjustment,p_operation_id:randomUUID(),p_version:corrected.version,p_kind:'restock',p_quantity:2},role);
    assert.equal(restocked.current_stock,3.125);
    await failure(() => rpc('consumables_save_item',{...create,p_version:zero.version,p_name:'Stale edit'},role),'40001');
    const renamed = await rpc('consumables_save_item',{...create,p_version:restocked.version,p_name:`${role} Renamed`,p_minimum:3},role);
    assert.equal(renamed.stock_status,'ok');
    assert.equal((await asRole(role,'select item_name from consumable_requests where id=$1',[request.id])).rows[0].item_name,create.p_name);
    const second = await rpc('consumables_create_request',{...requestArgs,p_id:randomUUID()},role);
    const part2 = await rpc('consumables_receive_request',{...receive,p_operation_id:randomUUID(),p_request_id:second.id,p_version:second.version,p_quantity:1},role);
    const cancelled = await rpc('consumables_cancel_request',{p_request_id:second.id,p_version:part2.version,p_reason:'Cancel remaining balance'},role);
    assert.equal(cancelled.status,'cancelled'); assert.equal(cancelled.received_quantity,1);
    assert.equal((await asRole(role,'select current_stock from consumables where id=$1',[item.id])).rows[0].current_stock,'4.125');
    await failure(() => rpc('consumables_receive_request',{...receive,p_operation_id:randomUUID(),p_request_id:second.id,p_version:cancelled.version},role),'40001');
    for (const values of [{p_quantity:0}, {p_quantity:-1}, {p_quantity:0.0001}, {p_needed_by:'2000-01-01'}, {p_requester:' '}, {p_purpose:'\t\n'}]) {
      await failure(() => rpc('consumables_create_request',{...requestArgs,p_id:randomUUID(),...values},role),['23514','22023']);
    }
    for (const table of ['consumables','consumable_requests','consumable_stock_movements']) {
      assert.ok((await asRole(role,`select * from ${table}`)).rows.length);
      await failure(() => asRole(role,`delete from ${table}`),'42501');
    }
    await failure(() => asRole(role,'update consumables set current_stock=999'),'42501');
    const totals = (await asRole(role,'select sum(quantity_change) as balance from consumable_stock_movements where consumable_id=$1',[item.id])).rows[0];
    assert.equal(totals.balance,'4.125');
    console.log(`PASS ${role}: validation, requests, partial/full delivery, retry safety, cancellation, stock ledger, stale edits and access controls`);
  }
  const before = (await db.query('select to_jsonb(c) as value from consumables c order by id')).rows;
  await db.exec(setup); await db.exec(setup);
  assert.deepEqual((await db.query('select to_jsonb(c) as value from consumables c order by id')).rows,before);
  assert.deepEqual((await db.query('select * from equipment')).rows,[{id:42}]);
  assert.equal((await db.query("select count(*) from pg_class where relname in ('consumables','consumable_requests','consumable_stock_movements') and relrowsecurity")).rows[0].count,3);
  console.log('PASS Repeated setup preserves records, RLS and unrelated tables');
})().catch(error => { console.error(error); process.exitCode=1; }).finally(async () => { await db?.close(); });
