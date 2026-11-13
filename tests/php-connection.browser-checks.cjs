const assert = require('node:assert/strict');

exports.verify = async ({evaluate, command, wait, click, login, base, calls}) => {
  await command('Page.navigate', {url:base+'/index.html'});
  await wait('document.querySelector("#auth-email")');
  const count = calls.length;
  await evaluate(`window.__originalAuthMethods={
    signIn:EquipmentTracking.client().auth.signInWithPassword,
    reset:EquipmentTracking.client().auth.resetPasswordForEmail
  }`);
  for (const [error, text] of [
    [{code:'MCPA_HOSTING',status:500}, 'PHP server'],
    [{status:503}, 'server could not connect'],
    [{code:'invalid_credentials',status:400}, 'Incorrect email or password'],
  ]) {
    await evaluate('EquipmentTracking.client().auth.signInWithPassword=async()=>({error:'+JSON.stringify(error)+'})');
    await login('admin');
    await wait('document.querySelector("#auth-feedback").textContent.includes('+JSON.stringify(text)+')');
    assert.equal(await evaluate('document.querySelector("#auth-form button[type=submit]").disabled'), false);
    assert.equal(await evaluate('document.querySelector("#auth-password").value'), 'test-password');
    assert.equal(await evaluate('MCPAAuth.profile'), null);
    assert.equal(await evaluate('document.querySelector("#app-shell").classList.contains("hidden")'), true);
  }
  await evaluate('EquipmentTracking.client().auth.resetPasswordForEmail=async()=>({error:{status:503}})');
  await click('[data-auth-reset]');
  await wait('document.querySelector("#auth-feedback").textContent.includes("server could not connect")');
  assert.equal(calls.length, count, 'Connection errors never enter the workspace or fetch business data');
  await evaluate(`EquipmentTracking.client().auth.signInWithPassword=__originalAuthMethods.signIn;
    EquipmentTracking.client().auth.resetPasswordForEmail=__originalAuthMethods.reset;
    delete window.__originalAuthMethods;`);
  console.log('PASS PHP hosting/server errors, password reset errors, preserved form input, retry controls and signed-out isolation');
};
