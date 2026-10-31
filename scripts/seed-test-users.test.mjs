import test from 'node:test';
import assert from 'node:assert/strict';
import { seedAccounts, accounts } from './seed-test-users.mjs';

function fixture() {
  const users = Array.from({ length: 100 }, (_, i) => ({ id: `old-${i}`, email: `old-${i}@example.test` }));
  const profiles = [];
  const client = {
    auth: { admin: {
      async listUsers({ page, perPage }) { return { data: { users: users.slice((page - 1) * perPage, page * perPage) } }; },
      async createUser(values) { assert.equal(values.email_confirm, true); const user = { id: `new-${users.length}`, email: values.email }; users.push(user); return { data: { user } }; },
      async updateUserById(id, values) { assert.ok(users.some(u => u.id === id)); assert.ok(values.password); assert.equal(values.email_confirm, true); return { data: {} }; }
    } },
    async rpc() { return { data: null }; },
    from() {
      let filter, mode, values;
      const query = {
        select() { return query; }, limit() { return Promise.resolve({ data: [] }); },
        eq(key, value) { filter = p => p[key] === value; return query; },
        update(v) { mode = 'update'; values = v; return query; },
        insert(v) { mode = 'insert'; values = v; return query; },
        async maybeSingle() { return { data: profiles.find(filter) || null }; },
        async single() {
          assert.equal('password' in values, false);
          if (mode === 'insert') { assert.ok(!profiles.some(p => p.id === values.id)); profiles.push(values); return { data: values }; }
          const row = profiles.find(filter); Object.assign(row, values); return { data: row };
        }
      };
      return query;
    }
  };
  return { client, users, profiles };
}
test('pagination, repeat runs, profile repair and historical ID preservation', async () => {
  const f = fixture();
  await seedAccounts(f.client, () => {});
  assert.equal(f.users.length, 102);
  assert.equal(f.profiles.length, 2);
  for (const p of f.profiles) assert.equal(p.id, p.auth_user_id);
  f.profiles[0].id = 'historical-id';
  f.profiles[0].role = 'engineer'; f.profiles[0].account_status = 'inactive';
  f.profiles.pop();
  await seedAccounts(f.client, () => {});
  assert.equal(f.users.length, 102);
  assert.equal(f.profiles.length, 2);
  assert.equal(f.profiles[0].id, 'historical-id');
  for (let i = 0; i < 2; i++) {
    assert.equal(f.profiles[i].role, accounts[i].role);
    assert.equal(f.profiles[i].account_status, 'active');
  }
});
test('schema failure stops before Auth mutations', async () => {
  const f = fixture();
  f.client.from = () => ({ select: () => ({ limit: async () => ({ error: { message: 'private diagnostic' } }) }) });
  await assert.rejects(seedAccounts(f.client), /Profile schema preflight/);
  assert.equal(f.users.length, 100);
});
test('missing migration has an actionable error without raw database diagnostics', async () => {
  const f = fixture();
  f.client.from = () => ({ select: () => ({ limit: async () => ({ error: { code: '42703', message: 'private diagnostic' } }) }) });
  await assert.rejects(seedAccounts(f.client), error => {
    assert.match(error.message, /202610040001_authenticated_access\.sql/);
    assert.ok(!error.message.includes('private diagnostic'));
    return true;
  });
  assert.equal(f.users.length, 100);
});
