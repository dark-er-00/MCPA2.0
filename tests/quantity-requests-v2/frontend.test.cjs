'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const Q = require('../../js/upgrades/quantity-requests/client.js');
const site = '11111111-1111-4111-8111-111111111111';
const requestId = '22222222-2222-4222-8222-222222222222';
const assets = [1, 2, 3].map(index => ({ id: `33333333-3333-4333-8333-${String(index).padStart(12, '0')}`, asset_id: `TOOL-${index}`, name: 'Shovel (Pala, Lapad)' }));
function catalog(role = 'engineer') {
  return {
    profile: { id: site, name: 'Fixture actor', role }, sites: [{ id: site, name: 'Fixture site' }],
    groups: [
      { type_id: 'exact-lapad-good', type_name: 'Shovel (Pala, Lapad)', tracking_type: 'Individual', condition: 'good', available_quantity: 3, reserved_quantity: 2, deployed_quantity: 5, physical_records: 10, requestable: true },
      { type_id: 'exact-tulis-good', type_name: 'Shovel (Pala, Tulis)', tracking_type: 'Individual', condition: 'good', available_quantity: 7, reserved_quantity: 1, deployed_quantity: 0, physical_records: 8, requestable: true },
      { type_id: 'exact-lapad-fair', type_name: 'Shovel (Pala, Lapad)', tracking_type: 'Individual', condition: 'fair', available_quantity: 1, reserved_quantity: 0, deployed_quantity: 0, physical_records: 1, requestable: true },
      { type_id: 'bulk-pipes', type_name: 'GI Pipes', tracking_type: 'Bulk', available_quantity: 225, reserved_quantity: 0, deployed_quantity: 0, physical_records: 1, requestable: false }
    ]
  };
}
function fake(role = 'engineer', handler = () => ({ id: requestId, status: 'pending' })) {
  const calls = [];
  const client = Q.createClient({ async rpc(name, args) { calls.push({ name, args }); return { data: name === Q.RPC.catalog ? catalog(role) : name === Q.RPC.history ? [] : await handler(name, args) }; } });
  return { client, calls };
}
const input = () => ({ typeId: 'exact-lapad-good', siteId: site, quantity: 3, purpose: ' Foundation works ' });

test('positive safe whole quantities only; no decimals, signs, exponent strings or blank values', () => {
  for (const value of [true, false, null, {}, [], 0, -1, 1.5, '', ' ', '1.5', '1e3', '+2', '03', NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) assert.throws(() => Q.quantity(value), /whole quantity/);
  assert.equal(Q.quantity(' 8 '), 8); assert.equal(Q.quantity(8), 8);
});
test('server compatibility groups preserve variants and conditions without name merging', () => {
  const result = Q.normalizedCatalog(catalog());
  assert.equal(result.groups.length, 4);
  assert.deepEqual(result.groups.slice(0, 3).map(group => group.type_id), ['exact-lapad-good', 'exact-tulis-good', 'exact-lapad-fair']);
  assert.equal(result.groups[0].available_quantity, 3);
  assert.equal(result.groups[0].reserved_quantity, 2);
  assert.equal(result.groups[0].deployed_quantity, 5);
  assert.equal(result.groups[3].requestable, false);
});
test('missing availability fails closed instead of counting reserved/deployed as available', () => {
  const data = catalog(); delete data.groups[0].available_quantity;
  const result = Q.normalizedCatalog(data);
  assert.equal(result.groups[0].available_quantity, null);
  assert.equal(result.groups[0].requestable, false);
  assert.throws(() => Q.validateRequest(input(), result), /eligible individual/);
  assert.throws(() => Q.validateRequest({ ...input(), quantity: 4 }, Q.normalizedCatalog(catalog())), /Only 3/);
  const large = catalog(); large.groups[0].available_quantity = 300;
  assert.throws(() => Q.validateRequest({ ...input(), quantity: 101 }, Q.normalizedCatalog(large)), /up to 100/);
  assert.equal(Q.count(true), null); assert.equal(Q.count('1e3'), null);
});
test('invalid type, Bulk, unassigned site and invalid purpose are rejected before RPC', async () => {
  const { client, calls } = fake(); await client.catalog();
  for (const patch of [{ typeId: 'missing' }, { typeId: 'bulk-pipes' }, { siteId: requestId }, { purpose: 'x'.repeat(2001) }, { quantity: 0 }, { quantity: 4 }]) {
    await assert.rejects(client.submit({ ...input(), ...patch }));
  }
  assert.equal(calls.filter(call => call.name === Q.RPC.submit).length, 0);
});
test('Engineer and Architect submit one type and quantity with an operation UUID, without Asset IDs', async () => {
  for (const role of ['engineer', 'architect']) {
    const { client, calls } = fake(role); await client.catalog(); await client.submit(input());
    const write = calls.find(call => call.name === Q.RPC.submit);
    assert.equal(write.args.p_quantity, 3); assert.equal(write.args.p_type_id, 'exact-lapad-good');
    assert.equal(write.args.p_purpose, 'Foundation works'); assert.ok(!Object.hasOwn(write.args, 'p_asset_ids'));
    assert.match(write.args.p_operation_id, /^[a-f0-9-]{36}$/);
  }
});
test('role hints fail closed; only Admin allocates/rejects; only Engineer/Architect submit', async () => {
  for (const role of ['admin', 'secretary', 'tool_handler', 'unknown']) {
    const { client } = fake(role); await client.catalog(); await assert.rejects(client.submit(input()), /role/);
  }
  for (const role of ['engineer', 'architect', 'secretary', 'tool_handler']) {
    const { client, calls } = fake(role); await client.catalog();
    await assert.rejects(client.suggest(requestId), /role/);
    await assert.rejects(client.allocate({ requestId, assetIds: assets.map(asset => asset.id), requestedQuantity: 3, eligibleAssets: assets }), /role/);
    await assert.rejects(client.reject({ requestId, reason: 'Unavailable' }), /role/);
    assert.equal(calls.length, 1);
  }
  const { client } = fake(); await assert.rejects(client.submit(input()), /Refresh inventory/);
});
test('allocation requires the exact number of distinct eligible physical UUIDs', async () => {
  const { client, calls } = fake('admin'); await client.catalog();
  const base = { requestId, requestedQuantity: 2, eligibleAssets: assets };
  await assert.rejects(client.allocate({ ...base, assetIds: [assets[0].id] }), /exactly 2/);
  await assert.rejects(client.allocate({ ...base, assetIds: [assets[0].id, assets[0].id] }), /only be selected once/);
  await assert.rejects(client.allocate({ ...base, assetIds: [assets[0].id, site] }), /no longer eligible/);
  await client.allocate({ ...base, assetIds: [assets[0].id, assets[1].id] });
  const write = calls.find(call => call.name === Q.RPC.allocate);
  assert.deepEqual(write.args.p_asset_ids, [assets[0].id, assets[1].id]);
  assert.equal(Object.keys(write.args).sort().join(','), 'p_asset_ids,p_operation_id,p_request_id');
});
test('uncertain responses reuse operation IDs; successful independent requests get fresh IDs', async () => {
  let attempt = 0;
  const { client, calls } = fake('engineer', () => { if (attempt++ === 0) throw new Error('Transport interrupted after server commit'); return { id: requestId, status: 'pending' }; });
  await client.catalog(); await assert.rejects(client.submit(input()), /Retry the same action/);
  await client.submit(input()); await client.submit(input());
  const writes = calls.filter(call => call.name === Q.RPC.submit);
  assert.equal(writes[0].args.p_operation_id, writes[1].args.p_operation_id);
  assert.notEqual(writes[1].args.p_operation_id, writes[2].args.p_operation_id);
});
test('uncertain operation IDs survive a remount; storage keeps only profile-scoped fingerprints', async () => {
  const values = new Map(), calls = [];
  const storage = { getItem: key => values.get(key), setItem: (key, value) => values.set(key, value) };
  function make(actorId, fail) {
    return Q.createClient({ async rpc(name, args) {
      const data = catalog(); data.profile.id = actorId;
      if (name === Q.RPC.catalog) return { data };
      calls.push(args);
      if (fail) throw Error('Connection lost');
      return { data: { id: requestId } };
    } }, { storage });
  }
  const first = make(site, true); await first.catalog(); await assert.rejects(first.submit(input()));
  assert.equal(values.size, 1); assert.ok(![...values.values()].join('').includes('Foundation works'));
  assert.match(Object.keys(JSON.parse([...values.values()][0]))[0], /^[a-f0-9]{64}$/);
  const otherActor = make(requestId, false); await otherActor.catalog(); await otherActor.submit(input());
  const remounted = make(site, false); await remounted.catalog(); await remounted.submit(input());
  assert.equal(calls[0].p_operation_id, calls[2].p_operation_id);
  assert.notEqual(calls[0].p_operation_id, calls[1].p_operation_id);
  assert.deepEqual(JSON.parse(values.get('mcpa.wa.quantity.pending.' + site)), {});
});
test('server errors propagate; no fallback equipment table writes or fabricated success', async () => {
  const calls = [], client = Q.createClient({ async rpc(name, args) { calls.push({ name, args }); return name === Q.RPC.catalog ? { data: catalog('admin') } : { error: { code: '40001', message: 'Asset is already reserved. Refresh the allocation.' } }; } });
  await client.catalog();
  await assert.rejects(client.allocate({ requestId, requestedQuantity: 1, assetIds: [assets[0].id], eligibleAssets: assets }), error => error.code === '40001' && /already reserved/.test(error.message));
  assert.deepEqual(calls.map(call => call.name), [Q.RPC.catalog, Q.RPC.allocate]);
});
test('rejection requires a meaningful bounded reason and carries stable request ID', async () => {
  const { client, calls } = fake('admin'); await client.catalog();
  await assert.rejects(client.reject({ requestId, reason: ' ' }), /rejection reason/);
  await client.reject({ requestId, reason: ' No compatible stock ' });
  const write = calls.find(call => call.name === Q.RPC.reject);
  assert.equal(write.args.p_reason, 'No compatible stock'); assert.equal(write.args.p_request_id, requestId);
});
