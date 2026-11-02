const assert = require('node:assert/strict');

exports.verify = async ({evaluate, command, wait, click, fill, submit, login, logout, base, calls}) => {
  await command('Page.navigate', {url:base+'/index.html'});
  await wait('document.querySelector("#auth-email")');
  await login('sky','wrong');
  await wait('document.querySelector("#auth-feedback").textContent.includes("Incorrect")');
  for (const [actor, message] of [['inactive','inactive'],['missing','not assigned']]) {
    await login(actor);
    await wait('document.querySelector("#auth-feedback").textContent.includes('+JSON.stringify(message)+')');
    assert.equal(await evaluate('MCPAAuth.profile'), null);
    await logout();
  }
  for (const [actor, role] of [['admin','admin'],['sky','engineer'],['architect','architect'],['secretary','secretary'],['handler','tool_handler']]) {
    await login(actor);
    await wait('window.MCPAAuth?.profile?.role==='+JSON.stringify(role)+' && !document.querySelector("#app-shell").classList.contains("hidden")');
    assert.equal(await evaluate('MCPAAuth.canRoute("users")'), role==='admin');
    if (role !== 'admin') {
      await evaluate('showScreen("users")');
      await wait('document.querySelector("#content").textContent.includes("Access restricted")');
    }
    await logout();
    assert.equal(await evaluate('MovementStore.getState().tools.length'), 0);
  }
  await fill('#auth-email','admin@example.test');
  await click('[data-auth-reset]');
  await wait('document.querySelector("#auth-feedback").textContent.includes("password reset link has been sent")');
  await login('admin');
  await wait('window.MCPAAuth?.profile?.role==="admin" && !document.querySelector("#app-shell").classList.contains("hidden")');
  await command('Page.reload');
  await wait('window.MCPAAuth?.profile?.role==="admin" && !document.querySelector("#app-shell").classList.contains("hidden")');
  await evaluate('__authEvent("PASSWORD_RECOVERY")');
  await wait('document.querySelector("#auth-password")?.autocomplete==="new-password"');
  assert.equal(await evaluate('document.querySelector("#auth-email")'), null);
  assert.equal(await evaluate('MCPAAuth.profile'), null);
  await fill('#auth-password','Recovery-fixture-password-2026!');
  await submit('#auth-form');
  await wait('document.querySelector("#auth-feedback").textContent.includes("Password saved")');
  assert.equal(await evaluate('window.__savedPassword'), 'Recovery-fixture-password-2026!');
  assert.equal(await evaluate('JSON.stringify({...localStorage,...sessionStorage}).includes("Recovery-fixture-password")'), false);
  for (const [suffix, text] of [
    ['?account_setup=invite#type=invite','no longer supported'],
    ['?expired_test=1#error=access_denied&error_code=otp_expired','invalid or expired'],
  ]) {
    const before = calls.length;
    await command('Page.navigate', {url:base+'/index.html'+suffix});
    await wait('document.querySelector("#auth-feedback")?.textContent.includes('+JSON.stringify(text)+')');
    assert.equal(await evaluate('MCPAAuth.profile'), null);
    assert.equal(calls.length, before, 'Rejected callbacks load no business records');
  }
  const beforeDemo = calls.length;
  await click('[data-auth-demo]');
  await click('[data-demo-role=engineer]');
  await wait('window.MCPAAuth?.isDemo && MovementStore.mode==="demo" && !document.querySelector("#app-shell").classList.contains("hidden")');
  await command('Page.reload');
  await wait('window.MCPAAuth?.isDemo && MovementStore.mode==="demo"');
  assert.equal(calls.length, beforeDemo, 'An offline demo and its reload make no live data requests');
  await logout();
  await login('sky');
  await wait('window.MCPAAuth?.profile?.role==="engineer" && !document.querySelector("#app-shell").classList.contains("hidden")');
  await evaluate('__expire()');
  await wait('document.querySelector("#auth-email")');
  assert.equal(await evaluate('MCPAAuth.profile'), null);
  assert.equal(await evaluate('MovementStore.getState().tools.length'), 0);
  console.log('PASS All five roles, rejected accounts, route guards, logout cleanup, reload, password recovery, expired/retired links, offline demo isolation and session expiry');
};
