import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PassThrough, Writable} from 'node:stream';
import {target, verifyEngineerA, repairEngineerA, readHidden} from './repair-development-engineer-a.mjs';

function fixture() {
  const user = {id:target.authId, email:target.email, email_confirmed_at:'2026-10-09T10:26:56Z',
    app_metadata:{mcpa_development_account:true, mcpa_development_job_id:target.jobId}};
  const profile = {id:target.profileId, auth_user_id:target.authId, role:'engineer', account_status:'active'};
  const job = {id:target.jobId, email:target.email, profile_id:target.profileId, role:'engineer', state:'created'};
  const updates = [];
  const client = {
    auth:{admin:{
      async getUserById(id) { assert.equal(id, target.authId); return {data:{user}}; },
      async updateUserById(id, payload) { updates.push({id, payload}); return {data:{user}}; },
    }},
    from(table) {
      assert.ok(['profiles','mcpa_development_accounts'].includes(table));
      return {select() { return this; }, eq(column, value) {
        assert.equal(column, table === 'profiles' ? 'auth_user_id' : 'id');
        assert.equal(value, table === 'profiles' ? target.authId : target.jobId);
        return this;
      }, async single() { return {data:table === 'profiles' ? profile : job}; }};
    },
  };
  return {client, user, profile, job, updates};
}
const password = '  New-fixture-only-password!  ';

test('repair changes only the reviewed Auth password, preserving exact spaces and all identity records', async () => {
  const f = fixture();
  const before = structuredClone({user:f.user, profile:f.profile, job:f.job});
  await verifyEngineerA(f.client);
  assert.equal(f.updates.length, 0);
  await repairEngineerA(f.client, password, password);
  assert.deepEqual(f.updates, [{id:target.authId, payload:{password}}]);
  assert.deepEqual({user:f.user, profile:f.profile, job:f.job}, before);
});

test('repair refuses protected, untagged, inactive, relinked or incomplete identities', async () => {
  const changes = [
    f => { f.user.app_metadata.mcpa_development_account = false; },
    f => { f.user.app_metadata.mcpa_development_job_id = 'other-job'; },
    f => { f.user.email = 'someone-else@example.test'; },
    f => { f.user.email_confirmed_at = null; },
    f => { f.profile.role = 'admin'; },
    f => { f.profile.account_status = 'inactive'; },
    f => { f.profile.id = 'another-person'; },
    f => { f.profile.auth_user_id = 'another-auth-user'; },
    f => { f.job.state = 'prepared'; },
    f => { f.job.profile_id = 'another-person'; },
  ];
  for (const change of changes) {
    const f = fixture(); change(f);
    await assert.rejects(repairEngineerA(f.client, password, password));
    assert.equal(f.updates.length, 0);
  }
});

test('invalid or mismatched passwords never reach Auth; upstream errors are not forwarded', async () => {
  const f = fixture();
  for (const [a, b] of [['short','short'], [' '.repeat(12),' '.repeat(12)], ['x'.repeat(129),'x'.repeat(129)], [password,'different']]) {
    await assert.rejects(repairEngineerA(f.client, a, b));
  }
  assert.equal(f.updates.length, 0);
  f.client.auth.admin.updateUserById = async () => ({error:{message:password}});
  await assert.rejects(repairEngineerA(f.client, password, password), error => {
    assert.ok(!error.message.includes(password));
    return /Auth did not confirm/.test(error.message);
  });
});

function terminal() {
  const input = new PassThrough();
  input.isTTY = true;
  let raw = false, printed = '';
  input.setRawMode = value => { raw = value; };
  const output = new Writable({write(chunk, _encoding, done) { printed += chunk.toString(); done(); }});
  output.isTTY = true;
  return {input, output, raw:() => raw, printed:() => printed};
}
test('hidden terminal prompt preserves the entered password without echo and restores terminal mode', async () => {
  const t = terminal();
  const result = readHidden('New password: ', t.input, t.output);
  assert.equal(t.raw(), true);
  t.input.write(password + '\r');
  assert.equal(await result, password);
  assert.equal(t.printed(), 'New password: \n');
  assert.equal(t.raw(), false);
});
test('Ctrl+C cancels and redirected password input is refused', async () => {
  const t = terminal();
  const result = readHidden('New password: ', t.input, t.output);
  t.input.write('\u0003');
  await assert.rejects(result, /Cancelled/);
  assert.equal(t.raw(), false);
  t.input.isTTY = false;
  await assert.rejects(readHidden('New password: ', t.input, t.output), /interactive terminal/);
});
