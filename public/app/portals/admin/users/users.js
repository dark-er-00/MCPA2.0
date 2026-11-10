(function () {
  'use strict';
  const root = document.getElementById('screen-users');
  window.MCPAAccounts?.dispose();
  if (!root || !MCPAAuth.canRoute('users') || MCPAAuth.isDemo) return;
  const esc = MovementOverview.escape, client = EquipmentTracking.client();
  const actorId=MCPAAuth.profile.id;let disposed=false;const alive=()=>!disposed&&root.isConnected&&MCPAAuth.profile?.id===actorId;
  const roles = Object.entries(MCPAPermissions.labels).filter(([role]) => role !== 'admin');
  const roleOptions = () => roles.map(([role,label]) => `<option value="${role}">${label}</option>`).join('');
  let records = [], busy = false, developmentId = crypto.randomUUID(), capabilities = null, capabilitiesReady=false, lifecycle = null, removals=[];
  root.innerHTML = `<div class="page-head"><div><h1 class="display">People & Accountability</h1><p class="sub">Manage company access and preserve each person’s accountability history.</p></div><div class="account-tools"><button type="button" class="btn btn-primary" data-open-account>Add Account</button><button type="button" class="btn btn-secondary" data-invite>Invite</button><button type="button" class="btn btn-secondary" data-account-history>Archives</button></div></div>
    <p id="accounts-feedback" role="status" aria-live="polite"></p>
    <p id="account-availability" class="account-message" role="status">Checking test-account availability…</p>
    <p class="sync-warning" data-sync-warning role="status"></p>
    <section class="card card-pad"><div class="account-tools"><div class="field"><label for="people-search">Find a person</label><input id="people-search" type="search" placeholder="Name, email or role"></div></div><div class="field"><label for="people-status">Status</label><select id="people-status"><option value="current">Current accounts</option><option value="active">Active</option><option value="inactive">Inactive</option><option value="removed">Removed</option></select></div><div id="accounts-list" aria-busy="true">Loading people…</div></section>
    <section id="development-panel" class="card card-pad account-section" hidden><h2>Development / Testing Only</h2>
    <p class="account-message">Create a real test login without sending email. Use a distinct test name and an email reserved for testing. These accounts access live records; deactivate them in Edit access when testing is finished.</p>
    <form id="development-form" class="account-form">
    <div class="field"><label for="development-name">Full name</label><input id="development-name" required maxlength="120" autocomplete="off"></div>
    <div class="field"><label for="development-email">Email</label><input id="development-email" type="email" required maxlength="254" autocomplete="off"></div>
    <div class="field"><label for="development-password">Temporary password</label><div class="auth-password-wrap account-password-wrap"><input id="development-password" type="password" required minlength="12" maxlength="128" autocomplete="new-password" aria-describedby="development-password-help"><button id="development-password-toggle" class="auth-password-toggle account-password-toggle" type="button" aria-controls="development-password" aria-label="Show password" title="Show password"><span aria-hidden="true">${icon('eye')}</span></button></div><small id="development-password-help">Use 12–128 characters. Keep it privately; it will not be displayed again.</small></div>
    <div class="field"><label for="development-role">Role</label><select id="development-role" required><option value="engineer">Engineer</option><option value="architect">Architect</option></select></div>
    <div class="account-wide"><button class="btn btn-primary" type="submit">Create test account</button></div></form>
    <div id="development-pending"></div></section>
    <dialog id="edit-panel" class="account-modal" hidden aria-labelledby="edit-form-title"><div class="account-modal-head"><h2 id="edit-form-title">Edit account access</h2><button type="button" class="btn btn-secondary" data-close-edit>Close</button></div><p id="edit-person" class="account-message"></p><form id="edit-form" class="account-form"><input id="edit-id" type="hidden"><div class="field"><label for="edit-role">Authorized role</label><select id="edit-role">${roleOptions()}</select></div><div class="field"><label for="edit-status">Account status</label><select id="edit-status"><option value="active">Active</option><option value="inactive">Inactive</option></select></div><div class="account-wide account-tools"><button class="btn btn-primary" type="submit">Save access</button><button class="btn btn-secondary" type="button" data-close-edit>Cancel</button></div></form></dialog>
    <dialog class="account-modal" id="account-panel" hidden aria-labelledby="account-form-title"><div class="account-modal-head"><h2 id="account-form-title">Add Account</h2><button type="button" class="btn btn-secondary" data-close-account>Close</button></div><p class="account-message">Create the sign-in account in Supabase Authentication > Users, then enter its user ID below. You can also save an inactive company profile and link its sign-in account later.</p>
    <button type="button" class="btn btn-secondary" data-open-development hidden>Development / Testing Only</button><form id="account-form" class="account-form"><div class="field account-wide"><label for="account-profile">Company profile</label><select id="account-profile"><option value="__new">New company profile</option></select></div><div class="field"><label for="account-name">Full name</label><input id="account-name" required maxlength="120" autocomplete="name"></div><div class="field"><label for="account-role">Authorized role</label><select id="account-role" required><option value="">Choose a role</option>${roleOptions()}</select></div><div class="field account-wide"><label for="account-auth-id">Supabase Auth user ID</label><input id="account-auth-id" pattern="[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}" placeholder="User ID from Authentication > Users" aria-describedby="account-auth-help"><small id="account-auth-help">Required for an active account. Existing sign-in links cannot be reassigned.</small></div><div class="field"><label for="account-status">Account status</label><select id="account-status"><option value="inactive">Inactive</option><option value="active">Active</option></select></div><div class="account-wide account-tools"><button class="btn btn-primary" type="submit">Add Account</button><button type="button" class="btn btn-secondary" data-close-account>Cancel</button></div></form></dialog>
    <dialog id="account-archive-dialog" class="account-modal" hidden aria-labelledby="account-archive-title"><div class="account-modal-head"><h2 id="account-archive-title">Archive / Account History</h2><button type="button" class="btn btn-secondary" data-close-archive>Close</button></div><p class="account-message">Recent changes, with the acting administrator and time.</p><button type="button" class="btn btn-secondary" data-audit>Load recent history</button><div id="account-audit"></div><div data-removal-history></div></dialog><dialog id="account-lifecycle-dialog" class="account-modal" aria-labelledby="account-lifecycle-title"><div class="account-modal-head account-tools"><h2 id="account-lifecycle-title"></h2><button type="button" class="btn btn-secondary" data-close-lifecycle>Close</button></div><div data-lifecycle-body></div></dialog>`;
  const $ = selector => root.querySelector(selector);
  const peoplePanel = root.querySelector('section');
  root.insertBefore($('#development-panel'), peoplePanel);
  function message(value,error=false) { if(alive()){$('#accounts-feedback').textContent=error?window.MCPADisplay.errorText(value):value;$('#accounts-feedback').setAttribute('role',error?'alert':'status');} }
  function updateControls(){
    root.querySelectorAll('button').forEach(button=>button.disabled=busy);
    $('[data-invite]').disabled=busy||!capabilitiesReady;
    $('#development-form button[type=submit]').disabled=busy||!capabilities?.development_enabled;
    root.querySelectorAll('[data-remove]').forEach(button=>button.disabled=busy||!lifecycle?.removal);
    root.querySelectorAll('form input,form select').forEach(input=>input.disabled=busy);
  }
  async function loadCapabilities(){
    try{
      const data=await invoke({action:'capabilities'});if(!alive())return;capabilities=data;
      $('#account-availability').hidden=!data.development_enabled;
      $('#account-availability').textContent=data.development_enabled?'Test-account creation is enabled.':'';
      $('#development-panel').hidden=true;$('[data-open-development]').hidden=!data.development_enabled;
      $('#development-pending').innerHTML=data.pending_development_accounts?.length?`<h3>Unfinished test accounts</h3><p class="account-message">Retry the original details and password. If Auth creation already succeeded, retry finishes linking without changing that password.</p><div class="account-tools">${data.pending_development_accounts.map(job=>`<button class="btn btn-secondary" data-development-retry="${esc(job.id)}">Retry ${esc(job.name)} · ${esc(job.email)}</button>`).join('')}</div>`:'';
    }catch(_){if(!alive())return;capabilities=null;$('#development-panel').hidden=true;$('#account-availability').hidden=false;$('#account-availability').textContent='The optional test-account service is unavailable. Add Account and existing access can still be managed.';}
    capabilitiesReady=true;updateControls();
  }
  function render() {
    const query=$('#people-search').value.trim().toLowerCase();
    const status=$('#people-status').value;
    const people=records.filter(p=>(status==='current'?p.account_status!=='removed':p.account_status===status)&&`${p.name} ${p.email||''} ${MCPAPermissions.labels[p.role]||''}`.toLowerCase().includes(query));
    $('#accounts-list').setAttribute('aria-busy','false');
    $('#accounts-list').innerHTML=people.length?`<div class="table-wrap" tabindex="0" role="region" aria-label="People and account access; scroll horizontally for all columns"><table><thead><tr><th scope="col">Person</th><th scope="col">Email</th><th scope="col">Role</th><th scope="col">Status</th><th scope="col">Account</th><th scope="col">Actions</th></tr></thead><tbody>${people.map(p=>`<tr><td>${esc(p.name)}</td><td>${esc(p.email||'Not recorded')}</td><td>${esc(MCPAPermissions.labels[p.role]||'Unconfigured')}</td><td>${esc(window.MCPADisplay.status(p.account_status, 'account'))}</td><td>${p.development_account?'Development / Testing Only':p.auth_user_id?'Linked':'Not linked'}</td><td><div class="account-row-actions">${p.account_status!=='removed'?`<button class="btn btn-secondary" data-edit="${esc(p.id)}">Edit access</button><button class="btn btn-secondary" data-remove="${esc(p.id)}" title="${lifecycle?.removal?'Request approval from a different Admin':'Removal requires the reviewed backend update'}">Remove</button>`:'Removed · history retained'}</div></td></tr>`).join('')}</tbody></table></div>`:'<p class="account-message">No people match your search.</p>';
    updateControls();
  }
  async function load(){
    const {data,error}=await client.rpc('mcpa_accounts');if(error)throw new Error('People could not load. Confirm your Admin access with your administrator, then refresh.');if(!alive())return;
    if ($('#accounts-list').getAttribute('aria-busy') === 'false' && JSON.stringify(records) === JSON.stringify(data || [])) return;
    records=data||[];render();
    const options=records.map(p=>`<option value="${esc(p.id)}">${esc(p.name)} · ${esc(p.id)}</option>`).join('');
    const select=$('#account-profile'),value=select.value;
    select.innerHTML='<option value="__new">New company profile</option>'+options;
    if([...select.options].some(option=>option.value===value))select.value=value;
  }
  async function run(work,success){
    if(busy)return;busy=true;updateControls();message('Saving account changes…');
    try{const result=await work();if(!alive())return;try{await load();message(result?.message||success);}catch(_){message('The action completed, but the list could not refresh. Refresh before making another change.',true);}}
    catch(error){message(error.message,true);try{await load();}catch(_){} }
    finally{busy=false;if(alive()){updateControls();await loadCapabilities();}}
  }
  async function invoke(body){const {data,error}=await client.functions.invoke('manage-accounts',{body});if(error){let detail;try{detail=await error.context?.json();}catch(_){}throw new Error(detail?.error||'Account service could not complete the request. Verify the PHP account service and approved database setup; review before retrying.');}return data;}
  async function save(p,role,status,authId=p.auth_user_id){const {error}=await client.rpc('mcpa_save_account',{p_id:p.id,p_name:p.name,p_role:role,p_status:status,p_auth_user_id:authId||null});if(error)throw new Error(['22023','42501'].includes(error.code)?error.message:error.code==='23505'?'This sign-in account is already linked to another person.':'Account changes could not be saved. Refresh and try again.');}
  let accountFocus=null,editFocus=null,archiveFocus=null;
  function closeAccountModal(){const d=$('#account-panel');if(d.open)d.close();d.hidden=true;}
  function closeEditModal(){const d=$('#edit-panel');if(d.open)d.close();d.hidden=true;}
  function closeArchiveModal(){const d=$('#account-archive-dialog');if(d.open)d.close();d.hidden=true;}
  $('#account-panel').onclose=()=>{$('#account-panel').hidden=true;(accountFocus?.isConnected?accountFocus:$('[data-open-account]'))?.focus();};
  $('#edit-panel').onclose=()=>{$('#edit-panel').hidden=true;editFocus?.isConnected&&editFocus.focus();};
  $('#account-archive-dialog').onclose=()=>{$('#account-archive-dialog').hidden=true;(archiveFocus?.isConnected?archiveFocus:$('[data-account-history]'))?.focus();};
  function openArchiveHistory(trigger){
    archiveFocus=trigger||document.activeElement;closeAccountModal();closeEditModal();
    const d=$('#account-archive-dialog');d.hidden=false;if(!d.open)d.showModal();
    $('[data-close-archive]').focus({preventScroll:true});
    root.querySelector('[data-audit]')?.click();
    void loadRemovalHistory();
  }
  $('#people-search').oninput=render;$('#people-status').onchange=()=>{render();if($('#people-status').value==='removed')void loadRemovalHistory();};
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
    accountFocus=document.activeElement;closeEditModal();closeArchiveModal();$('#development-panel').hidden=true;
    const d=$('#account-panel');d.hidden=false;if(!d.open)d.showModal();
    if($('#account-profile').value!=='__new'){$('#account-form').reset();chooseAccountProfile();}
    $('#account-name').focus({preventScroll:true});
  }
  $('#account-profile').onchange=chooseAccountProfile;
  $('#account-status').onchange=()=>{$('#account-auth-id').required=$('#account-status').value==='active';};
  $('#account-form').onsubmit=event=>{
    event.preventDefault();if(!event.target.reportValidity())return;
    const person=$('#account-profile').value==='__new'?{id:null,name:$('#account-name').value.trim()}:records.find(p=>p.id===$('#account-profile').value);
    if(person)run(async()=>{
      await save({...person,name:$('#account-name').value.trim()},$('#account-role').value,$('#account-status').value,$('#account-auth-id').value.trim());
      event.target.reset();chooseAccountProfile();closeAccountModal();
    },person.id?'Account access saved. Existing custody and history remain attached to this person.':'Account added.');
  };
  $('#edit-form').onsubmit=event=>{event.preventDefault();const p=records.find(p=>p.id===$('#edit-id').value);if(p)run(async()=>{await save(p,$('#edit-role').value,$('#edit-status').value);closeEditModal();},'Account access updated.');};
  root.addEventListener('click',event=>{
    const button=event.target.closest('button');if(!button||busy)return;
    if(button.hasAttribute('data-close-account'))closeAccountModal();
    if(button.hasAttribute('data-close-archive'))closeArchiveModal();
    if(button.hasAttribute('data-account-history'))openArchiveHistory(button);
    if(button.hasAttribute('data-open-development')&&capabilities?.development_enabled){closeAccountModal();$('#development-panel').hidden=false;$('#development-name').focus();}
    if(button.hasAttribute('data-open-account'))openAddAccount();
    if(button.hasAttribute('data-invite')){openInvite();}
    if(button.dataset.remove&&lifecycle?.removal){const p=records.find(p=>p.id===button.dataset.remove);openLifecycle('Request account removal',`<p>${esc(p.name)} · A different active Admin must approve. Custody and history are retained.</p><form data-removal-form data-profile="${esc(p.id)}"><label>Reason<textarea name="reason" required maxlength="2000"></textarea></label><button type="submit" class="btn btn-primary">Request removal</button></form>`);}
    if(button.dataset.removalDecision&&lifecycle?.removal){void run(async()=>{const {error}=await client.rpc('mcpa_decide_account_removal',{p_id:button.dataset.removalId,p_approve:button.dataset.removalDecision==='approve'});if(error)throw error;await loadRemovalHistory();},'Removal decision recorded.');}
    if(button.hasAttribute('data-close-lifecycle'))$('#account-lifecycle-dialog').close();
    if(button.hasAttribute('data-close-edit'))closeEditModal();
    if(button.dataset.developmentRetry){const job=capabilities?.pending_development_accounts?.find(job=>job.id===button.dataset.developmentRetry);if(job){developmentId=job.id;$('#development-name').value=job.name;$('#development-email').value=job.email;$('#development-role').value=job.role;clearDevelopmentPassword();$('#development-password').focus();}}
    if(button.dataset.edit){closeAccountModal();closeArchiveModal();const p=records.find(p=>p.id===button.dataset.edit);if(!p)return;editFocus=button;const d=$('#edit-panel');d.hidden=false;if(!d.open)d.showModal();$('#edit-id').value=p.id;$('#edit-person').textContent=`${p.name} · ${p.email||'No linked email'}`;$('#edit-role').innerHTML=roleOptions()+(p.role==='admin'?'<option value="admin">Admin</option>':'');$('#edit-role').value=p.role||'';$('#edit-status').value=p.account_status;$('#edit-role').focus();}
    if(button.hasAttribute('data-audit')){button.disabled=true;client.from('mcpa_account_audit').select('actor_id,profile_id,event,created_at').order('created_at',{ascending:false}).limit(100).then(({data,error})=>{if(!alive())return;if(error){$('#account-audit').textContent='History could not load. Refresh and try again.';return;}const name=id=>window.MCPADisplay.person(records.find(p=>p.id===id)?.name);$('#account-audit').innerHTML=data?.length?`<ol class="account-history">${data.map(row=>`<li><strong>${esc(window.MCPADisplay.event(row.event, 'account').title)}</strong><div>${esc(window.MCPADisplay.event(row.event, 'account').description)}</div> · ${esc(name(row.profile_id))}<br><small>${esc(name(row.actor_id))} · ${esc(window.MCPADisplay.dateTime(row.created_at))} (Manila)</small></li>`).join('')}</ol>`:'<p>No account changes recorded yet.</p>';}).catch(()=>{if(alive())$('#account-audit').textContent='History could not load. Try again.';}).finally(()=>{button.disabled=false;});}
  });
  let lifecycleFocus=null;
  function openInvite(){
    const enabled=capabilities?.invitation_enabled===true;
    openLifecycle('Invite',`<p>Create a link for one person. It expires after 24 hours and can register one account. Access starts after they verify the invited email address.</p>${enabled?'':'<p role="status">Invitations require the approved database and server configuration.</p>'}<form data-invite-form><div class="field"><label for="invite-name">Full name</label><input id="invite-name" name="name" required maxlength="120" ${enabled?'':'disabled'} autocomplete="name"></div><div class="field"><label for="invite-email">Invited email</label><input id="invite-email" name="email" type="email" required maxlength="254" ${enabled?'':'disabled'} autocomplete="email"></div><div class="field"><label for="invite-role">Authorized role</label><select id="invite-role" name="role" ${enabled?'':'disabled'}>${roleOptions()}</select></div><button type="submit" class="btn btn-primary" ${enabled?'':'disabled'}>Create secure link</button></form><div data-invite-result role="status" aria-live="polite"></div>${enabled?'<button type="button" class="btn btn-secondary" data-review-invitations>Review invitations</button><div data-invitation-review></div>':''}`);
  }
  async function reviewInvitations(){
    const data=await invoke({action:'reviewInvitations'});if(!alive())return;
    $('[data-invitation-review]').innerHTML=(data.invitations||[]).map(i=>`<article><p>${esc(i.name)} · ${esc(i.email)}<br>${esc(i.state.replaceAll('_',' '))} · Expires ${esc(window.MCPADisplay.dateTime(i.verification_expires_at||i.expires_at))} (Manila)</p>${i.state==='prepared'?`<button type="button" class="btn btn-secondary" data-invitation-action="revokeInvitation" data-id="${esc(i.id)}">Revoke unused link</button>`:['claimed','reconciliation_required','awaiting_verification'].includes(i.state)?`<button type="button" class="btn btn-secondary" data-invitation-action="reconcileInvitation" data-id="${esc(i.id)}">Reconcile registration</button>`:''}</article>`).join('')||'<p>No invitations yet.</p>';
  }
  root.addEventListener('submit',async event=>{
    const form=event.target.closest('[data-invite-form]');if(!form)return;event.preventDefault();if(busy||!capabilities?.invitation_enabled||!form.reportValidity())return;
    busy=true;updateControls();const output=$('[data-invite-result]');output.textContent='Creating invitation…';
    try{const data=await invoke({action:'createInvitation',name:form.elements.name.value.trim(),email:form.elements.email.value.trim(),role:form.elements.role.value});if(!alive())return;
      output.innerHTML=`<p>Link created. Expires ${esc(window.MCPADisplay.dateTime(data.expires_at))} (Manila). Share privately with the invited person. Copy it now; it is not stored in readable form.</p><label for="invite-link">Registration link</label><input id="invite-link" readonly value="${esc(data.link)}"><button type="button" class="btn btn-secondary" data-copy-invite>Copy link</button>`;form.reset();
    }catch(error){output.textContent=error.message+' If the result was interrupted, review invitations before creating another link.';}
    finally{busy=false;if(alive())updateControls();}
  });
  root.addEventListener('click',async event=>{
    const button=event.target.closest('[data-copy-invite],[data-review-invitations],[data-invitation-action]');if(!button||busy)return;
    if(button.hasAttribute('data-copy-invite')){const input=$('#invite-link');try{await navigator.clipboard.writeText(input.value);button.textContent='Copied';}catch(_){input.focus();input.select();button.textContent='Select link and copy';}return;}
    busy=true;updateControls();try{if(button.dataset.invitationAction){const result=await invoke({action:button.dataset.invitationAction,id:button.dataset.id});$('[data-invite-result]').textContent=result.message;}await reviewInvitations();}catch(error){$('[data-invite-result]').textContent=error.message;}finally{busy=false;if(alive())updateControls();}
  });
  function openLifecycle(title,body){lifecycleFocus=document.activeElement;$('#account-lifecycle-title').textContent=title;$('[data-lifecycle-body]').innerHTML=body;$('#account-lifecycle-dialog').showModal();$('[data-close-lifecycle]').focus();}
  $('#account-lifecycle-dialog').onclose=()=>lifecycleFocus?.isConnected&&lifecycleFocus.focus();
  root.addEventListener('submit',event=>{const form=event.target.closest('[data-removal-form]');if(!form)return;event.preventDefault();if(!lifecycle?.removal||!form.reportValidity())return;void run(async()=>{const {error}=await client.rpc('mcpa_request_account_removal',{p_profile_id:form.dataset.profile,p_reason:form.elements.reason.value,p_operation_id:crypto.randomUUID()});if(error)throw error;$('#account-lifecycle-dialog').close();await loadRemovalHistory();},'Removal requested. Access is unchanged until second-Admin approval.');});
  async function loadRemovalHistory(){if(!lifecycle?.removal){$('[data-removal-history]').textContent='Removal history requires the approved backend update.';return;}const {data,error}=await client.rpc('mcpa_account_removals');if(error){message('Removal history could not load.',true);return;}if(!alive())return;removals=data||[];$('[data-removal-history]').innerHTML='<h3>Removal requests and decisions</h3>'+removals.map(r=>`<article><p>${esc(records.find(p=>p.id===r.profile_id)?.name||r.profile_id)} · ${esc(r.status)}</p><p>${esc(r.reason)}</p><p>Requested: ${esc(r.requested_at)} · Requesting Admin: ${esc(r.requested_by)}${r.decided_by?' · Deciding Admin: '+esc(r.decided_by):''}</p>${r.status==='pending'&&r.requested_by!==actorId?'<button type="button" class="btn btn-secondary" data-removal-id="'+esc(r.id)+'" data-removal-decision="approve">Approve removal</button><button type="button" class="btn btn-secondary" data-removal-id="'+esc(r.id)+'" data-removal-decision="reject">Reject</button>':''}</article>`).join('');}
  async function loadLifecycle(){const {data,error}=await client.rpc('mcpa_admin_lifecycle_capabilities');if(!alive())return;lifecycle=!error&&data?.version===1?data:null;updateControls();if(lifecycle?.removal){const {data:rows,error:err}=await client.rpc('mcpa_account_removals');if(!err&&alive()){removals=rows||[];if(removals.some(r=>r.status==='pending')||$('#people-status').value==='removed')void loadRemovalHistory();}}}
  const stop = EquipmentTracking.watch(async () => {
    if (!alive() || busy) return;
    await load(); await loadCapabilities();
  }, value => { if(alive()) $('[data-sync-warning]').textContent=value; }, {tables:['mcpa_account_audit']});
  window.MCPAAccounts = {dispose(){disposed=true;stop();closeAccountModal();closeEditModal();closeArchiveModal();$('#account-lifecycle-dialog')?.close();}};
  const ready = load().catch(()=>{$('#accounts-list').textContent='People are unavailable. Retrying automatically.';});
  window.MCPANavigation?.track(root, ready);
  updateControls();loadCapabilities();void loadLifecycle();
})();
