(function () {
  'use strict';
  const root = document.getElementById('screen-users');
  window.MCPAAccounts?.dispose();
  if (!root || !MCPAAuth.canRoute('users') || MCPAAuth.isDemo) return;
  const esc = MovementOverview.escape, client = EquipmentTracking.client();
  const roles = Object.entries(MCPAPermissions.labels).filter(([role]) => role !== 'admin');
  const roleOptions = () => roles.map(([role,label]) => `<option value="${role}">${label}</option>`).join('');
  let records = [], busy = false, developmentId = crypto.randomUUID(), capabilities = null;
  root.innerHTML = `<div class="page-head"><div><h1 class="display">People & Accountability</h1><p class="sub">Manage company access and preserve each person’s accountability history.</p></div><button type="button" class="btn btn-primary" data-open-account>Add Account</button></div>
    <p id="accounts-feedback" role="status" aria-live="polite"></p>
    <p id="account-availability" class="account-message" role="status">Checking test-account availability…</p>
    <p class="sync-warning" data-sync-warning role="status"></p>
    <section class="card card-pad"><div class="account-tools"><div class="field"><label for="people-search">Find a person</label><input id="people-search" type="search" placeholder="Name, email or role"></div></div><div id="accounts-list" aria-busy="true">Loading people…</div></section>
    <section id="development-panel" class="card card-pad account-section" hidden><h2>Development / Testing Only</h2>
    <p class="account-message">Create a real test login without sending email. Use a distinct test name and an email reserved for testing. These accounts access live records; deactivate them in Edit access when testing is finished.</p>
    <form id="development-form" class="account-form">
    <div class="field"><label for="development-name">Full name</label><input id="development-name" required maxlength="120" autocomplete="off"></div>
    <div class="field"><label for="development-email">Email</label><input id="development-email" type="email" required maxlength="254" autocomplete="off"></div>
    <div class="field"><label for="development-password">Temporary password</label><div class="auth-password-wrap account-password-wrap"><input id="development-password" type="password" required minlength="12" maxlength="128" autocomplete="new-password" aria-describedby="development-password-help"><button id="development-password-toggle" class="auth-password-toggle account-password-toggle" type="button" aria-controls="development-password" aria-label="Show password" title="Show password"><span aria-hidden="true">${icon('eye')}</span></button></div><small id="development-password-help">Use 12–128 characters. Keep it privately; it will not be displayed again.</small></div>
    <div class="field"><label for="development-role">Role</label><select id="development-role" required><option value="engineer">Engineer</option><option value="architect">Architect</option></select></div>
    <div class="account-wide"><button class="btn btn-primary" type="submit">Create test account</button></div></form>
    <div id="development-pending"></div></section>
    <section id="edit-panel" class="card card-pad account-section" hidden><h2>Edit account access</h2><p id="edit-person" class="account-message"></p><form id="edit-form" class="account-form"><input id="edit-id" type="hidden"><div class="field"><label for="edit-role">Authorized role</label><select id="edit-role">${roleOptions()}</select></div><div class="field"><label for="edit-status">Account status</label><select id="edit-status"><option value="active">Active</option><option value="inactive">Inactive</option></select></div><div class="account-wide account-tools"><button class="btn btn-primary" type="submit">Save access</button><button class="btn btn-secondary" type="button" data-close-edit>Cancel</button></div></form></section>
    <section class="card card-pad account-section" id="account-panel" aria-labelledby="account-form-title"><h2 id="account-form-title">Add Account</h2><p class="account-message">Create the sign-in account in Supabase Authentication > Users, then enter its user ID below. You can also save an inactive company profile and link its sign-in account later.</p>
    <form id="account-form" class="account-form"><div class="field account-wide"><label for="account-profile">Company profile</label><select id="account-profile"><option value="__new">New company profile</option></select></div><div class="field"><label for="account-name">Full name</label><input id="account-name" required maxlength="120" autocomplete="name"></div><div class="field"><label for="account-role">Authorized role</label><select id="account-role" required><option value="">Choose a role</option>${roleOptions()}</select></div><div class="field account-wide"><label for="account-auth-id">Supabase Auth user ID</label><input id="account-auth-id" pattern="[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}" placeholder="User ID from Authentication > Users" aria-describedby="account-auth-help"><small id="account-auth-help">Required for an active account. Existing sign-in links cannot be reassigned.</small></div><div class="field"><label for="account-status">Account status</label><select id="account-status"><option value="inactive">Inactive</option><option value="active">Active</option></select></div><div class="account-wide"><button class="btn btn-primary" type="submit">Add Account</button></div></form></section>
    <details class="card card-pad account-section"><summary>Account access history</summary><p class="account-message">Recent changes, with the acting administrator and time.</p><button class="btn btn-secondary" data-audit>Load recent history</button><div id="account-audit"></div></details>`;
  const $ = selector => root.querySelector(selector);
  const peoplePanel = root.querySelector('section');
  root.insertBefore($('#account-panel'), peoplePanel); root.insertBefore($('#development-panel'), peoplePanel); root.insertBefore($('#edit-panel'), peoplePanel);
  function message(value,error=false) { if(root.isConnected){$('#accounts-feedback').textContent=error?window.MCPADisplay.errorText(value):value;$('#accounts-feedback').setAttribute('role',error?'alert':'status');} }
  function updateControls(){
    root.querySelectorAll('button').forEach(button=>button.disabled=busy);
    $('#development-form button[type=submit]').disabled=busy||!capabilities?.development_enabled;
    root.querySelectorAll('form input,form select').forEach(input=>input.disabled=busy);
  }
  async function loadCapabilities(){
    try{
      const data=await invoke({action:'capabilities'});if(!root.isConnected)return;capabilities=data;
      $('#account-availability').hidden=!data.development_enabled;
      $('#account-availability').textContent=data.development_enabled?'Test-account creation is enabled.':'';
      $('#development-panel').hidden=!data.development_enabled;
      $('#development-pending').innerHTML=data.pending_development_accounts?.length?`<h3>Unfinished test accounts</h3><p class="account-message">Retry the original details and password. If Auth creation already succeeded, retry finishes linking without changing that password.</p><div class="account-tools">${data.pending_development_accounts.map(job=>`<button class="btn btn-secondary" data-development-retry="${esc(job.id)}">Retry ${esc(job.name)} · ${esc(job.email)}</button>`).join('')}</div>`:'';
    }catch(_){if(!root.isConnected)return;capabilities=null;$('#development-panel').hidden=true;$('#account-availability').hidden=false;$('#account-availability').textContent='The optional test-account service is unavailable. Add Account and existing access can still be managed.';}
    updateControls();
  }
  function render() {
    const query=$('#people-search').value.trim().toLowerCase();
    const people=records.filter(p=>`${p.name} ${p.email||''} ${MCPAPermissions.labels[p.role]||''}`.toLowerCase().includes(query));
    $('#accounts-list').setAttribute('aria-busy','false');
    $('#accounts-list').innerHTML=people.length?`<div class="table-wrap" tabindex="0" role="region" aria-label="People and account access; scroll horizontally for all columns"><table><thead><tr><th scope="col">Person</th><th scope="col">Email</th><th scope="col">Role</th><th scope="col">Status</th><th scope="col">Account</th><th scope="col">Actions</th></tr></thead><tbody>${people.map(p=>`<tr><td>${esc(p.name)}</td><td>${esc(p.email||'Not recorded')}</td><td>${esc(MCPAPermissions.labels[p.role]||'Unconfigured')}</td><td>${esc(window.MCPADisplay.status(p.account_status, 'account'))}</td><td>${p.development_account?'Development / Testing Only':p.auth_user_id?'Linked':'Not linked'}</td><td><div class="account-row-actions"><button class="btn btn-secondary" data-edit="${esc(p.id)}">Edit access</button></div></td></tr>`).join('')}</tbody></table></div>`:'<p class="account-message">No people match your search.</p>';
    updateControls();
  }
  async function load(){
    const {data,error}=await client.rpc('mcpa_accounts');if(error)throw new Error('People could not load. Confirm your Admin access with your administrator, then refresh.');if(!root.isConnected)return;
    if ($('#accounts-list').getAttribute('aria-busy') === 'false' && JSON.stringify(records) === JSON.stringify(data || [])) return;
    records=data||[];render();
    const options=records.map(p=>`<option value="${esc(p.id)}">${esc(p.name)} · ${esc(p.id)}</option>`).join('');
    const select=$('#account-profile'),value=select.value;
    select.innerHTML='<option value="__new">New company profile</option>'+options;
    if([...select.options].some(option=>option.value===value))select.value=value;
  }
  async function run(work,success){
    if(busy)return;busy=true;updateControls();message('Saving account changes…');
    try{const result=await work();if(!root.isConnected)return;try{await load();message(result?.message||success);}catch(_){message('The action completed, but the list could not refresh. Refresh before making another change.',true);}}
    catch(error){message(error.message,true);try{await load();}catch(_){} }
    finally{busy=false;if(root.isConnected){updateControls();await loadCapabilities();}}
  }
  async function invoke(body){const {data,error}=await client.functions.invoke('manage-accounts',{body});if(error){let detail;try{detail=await error.context?.json();}catch(_){}throw new Error(detail?.error||'Account service could not complete the request. Verify Edge Function deployment and refresh; retry the same account request.');}return data;}
  async function save(p,role,status,authId=p.auth_user_id){const {error}=await client.rpc('mcpa_save_account',{p_id:p.id,p_name:p.name,p_role:role,p_status:status,p_auth_user_id:authId||null});if(error)throw new Error(['22023','42501'].includes(error.code)?error.message:error.code==='23505'?'This sign-in account is already linked to another person.':'Account changes could not be saved. Refresh and try again.');}
  $('#people-search').oninput=render;
  function setDevelopmentPasswordVisible(visible){
    const input=$('#development-password'),button=$('#development-password-toggle');
    const selection=document.activeElement===input?[input.selectionStart,input.selectionEnd,input.selectionDirection]:null;
    input.type=visible?'text':'password';
    button.setAttribute('aria-label',visible?'Hide password':'Show password');
    button.title=visible?'Hide password':'Show password';
    button.innerHTML=`<span aria-hidden="true">${icon(visible?'eyeOff':'eye')}</span>`;
    if(selection)input.setSelectionRange(...selection);
  }
  function clearDevelopmentPassword(){$('#development-password').value='';setDevelopmentPasswordVisible(false);}
  $('#development-password-toggle').onpointerdown=event=>{
    if(event.button===0&&document.activeElement===$('#development-password'))event.preventDefault();
  };
  $('#development-password-toggle').onclick=()=>setDevelopmentPasswordVisible($('#development-password').type==='password');
  $('#development-form').onreset=()=>setDevelopmentPasswordVisible(false);
  $('#development-form').oninput=event=>{if(event.target.id!=='development-password')developmentId=crypto.randomUUID();};
  $('#development-form').onsubmit=event=>{event.preventDefault();if(!capabilities?.development_enabled||!event.target.reportValidity())return;run(async()=>{
    try{const result=await invoke({action:'createDevelopmentAccount',id:developmentId,name:$('#development-name').value.trim(),email:$('#development-email').value.trim(),password:$('#development-password').value,role:$('#development-role').value});event.target.reset();developmentId=crypto.randomUUID();return result;}
    finally{clearDevelopmentPassword();}
  });};
  function chooseAccountProfile(){
    const person=records.find(p=>p.id===$('#account-profile').value);
    $('#account-name').value=person?.name||'';
    $('#account-role').innerHTML='<option value="">Choose a role</option>'+roleOptions()+(person?.role==='admin'?'<option value="admin">Admin</option>':'');
    $('#account-role').value=person?.role||'';
    $('#account-auth-id').value=person?.auth_user_id||'';
    $('#account-auth-id').readOnly=!!person?.auth_user_id;
    $('#account-status').value=person?.account_status||'inactive';
    $('#account-auth-id').required=$('#account-status').value==='active';
    $('#account-form-title').textContent=person?'Edit account':'Add Account';
    $('#account-form button[type=submit]').textContent=person?'Save account access':'Add Account';
  }
  function openAddAccount(){
    if($('#account-profile').value!=='__new'){$('#account-form').reset();chooseAccountProfile();}
    $('#account-name').focus({preventScroll:true});$('#account-panel').scrollIntoView({block:'start'});
  }
  $('#account-profile').onchange=chooseAccountProfile;
  $('#account-status').onchange=()=>{$('#account-auth-id').required=$('#account-status').value==='active';};
  $('#account-form').onsubmit=event=>{
    event.preventDefault();if(!event.target.reportValidity())return;
    const person=$('#account-profile').value==='__new'?{id:null,name:$('#account-name').value.trim()}:records.find(p=>p.id===$('#account-profile').value);
    if(person)run(async()=>{
      await save({...person,name:$('#account-name').value.trim()},$('#account-role').value,$('#account-status').value,$('#account-auth-id').value.trim());
      event.target.reset();chooseAccountProfile();
    },person.id?'Account access saved. Existing custody and history remain attached to this person.':'Account added.');
  };
  $('#edit-form').onsubmit=event=>{event.preventDefault();const p=records.find(p=>p.id===$('#edit-id').value);if(p)run(async()=>{await save(p,$('#edit-role').value,$('#edit-status').value);$('#edit-panel').hidden=true;},'Account access updated.');};
  root.addEventListener('click',event=>{
    const button=event.target.closest('button');if(!button||busy)return;
    if(button.hasAttribute('data-open-account'))openAddAccount();
    if(button.hasAttribute('data-close-edit'))$('#edit-panel').hidden=true;
    if(button.dataset.developmentRetry){const job=capabilities?.pending_development_accounts?.find(job=>job.id===button.dataset.developmentRetry);if(job){developmentId=job.id;$('#development-name').value=job.name;$('#development-email').value=job.email;$('#development-role').value=job.role;clearDevelopmentPassword();$('#development-password').focus();}}
    if(button.dataset.edit){const p=records.find(p=>p.id===button.dataset.edit);if(!p)return;$('#edit-panel').hidden=false;$('#edit-id').value=p.id;$('#edit-person').textContent=`${p.name} · ${p.email||'No linked email'}`;$('#edit-role').innerHTML=roleOptions()+(p.role==='admin'?'<option value="admin">Admin</option>':'');$('#edit-role').value=p.role||'';$('#edit-status').value=p.account_status;$('#edit-role').focus();}
    if(button.hasAttribute('data-audit')){button.disabled=true;client.from('mcpa_account_audit').select('actor_id,profile_id,event,created_at').order('created_at',{ascending:false}).limit(100).then(({data,error})=>{if(!root.isConnected)return;if(error){$('#account-audit').textContent='History could not load. Refresh and try again.';return;}const name=id=>window.MCPADisplay.person(records.find(p=>p.id===id)?.name);$('#account-audit').innerHTML=data?.length?`<ol class="account-history">${data.map(row=>`<li><strong>${esc(window.MCPADisplay.event(row.event, 'account').title)}</strong><div>${esc(window.MCPADisplay.event(row.event, 'account').description)}</div> · ${esc(name(row.profile_id))}<br><small>${esc(name(row.actor_id))} · ${esc(window.MCPADisplay.dateTime(row.created_at))} (Manila)</small></li>`).join('')}</ol>`:'<p>No account changes recorded yet.</p>';}).catch(()=>{if(root.isConnected)$('#account-audit').textContent='History could not load. Try again.';}).finally(()=>{button.disabled=false;});}
  });
  const stop = EquipmentTracking.watch(async () => {
    if (!root.isConnected || busy) return;
    await load(); await loadCapabilities();
  }, value => { if(root.isConnected) $('[data-sync-warning]').textContent=value; }, {tables:['mcpa_account_audit']});
  window.MCPAAccounts = {dispose(){stop();}};
  const ready = load().catch(()=>{$('#accounts-list').textContent='People are unavailable. Retrying automatically.';});
  window.MCPANavigation?.track(root, ready);
  updateControls();loadCapabilities();
})();
