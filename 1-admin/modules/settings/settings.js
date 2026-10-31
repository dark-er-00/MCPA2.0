(function () {
  const root=document.getElementById('screen-settings'),user=MCPAAuth.profile;
  if(!root||!user)return;
  const esc=MovementOverview.escape;
  const client=EquipmentTracking.client();
  root.innerHTML=`<div class="page-head"><div><h1 class="display">My account</h1><p class="sub">Your authorized identity and display preferences</p></div></div><section class="card card-pad profile-settings"><h2 data-profile-name>${esc(user.name)}</h2><p class="account-message">${esc(MCPAPermissions.labels[user.role])} · ${MCPAAuth.isDemo?'Offline demonstration':'Active company account'}</p><p id="profile-feedback" role="status" aria-live="polite"></p><form id="profile-form"><div class="field"><label for="profile-name">Display name</label><input id="profile-name" autocomplete="name" required maxlength="120" value="${esc(user.name)}"></div><div class="field"><label for="profile-username">Username</label><input id="profile-username" autocomplete="nickname" minlength="3" maxlength="30" pattern="[a-zA-Z0-9][a-zA-Z0-9._-]{1,28}[a-zA-Z0-9]" aria-describedby="profile-username-help" value="${esc(user.username || '')}"><p class="account-message" id="profile-username-help">Optional. Use 3–30 letters, numbers, dots, underscores or hyphens. Start and end with a letter or number. You still sign in with your email.</p></div><div class="field"><label for="profile-email">Registered email</label><input id="profile-email" type="email" readonly value="${esc(user.email || '')}" aria-describedby="profile-email-help"><p class="account-message" id="profile-email-help">Your sign-in email is managed through company account administration.</p></div><button type="submit" class="btn btn-primary" ${MCPAAuth.isDemo?'disabled':''}>Save profile</button></form><p class="account-message">${MCPAAuth.isDemo?'Profile changes are unavailable in the offline demo. ':''}Account roles are managed by an administrator. To reset your password, sign out and choose Forgot password on the login screen.</p><div class="account-tools"><button class="btn btn-secondary" id="account-theme">Change light / night mode</button><button class="btn btn-secondary" id="account-logout">${MCPAAuth.isDemo?'Exit demo':'Log Out'}</button></div></section>`;
  let saving=false;
  root.querySelector('#profile-form').onsubmit=async event=>{
    event.preventDefault();if(saving||MCPAAuth.isDemo||!event.target.reportValidity())return;
    const feedback=root.querySelector('#profile-feedback'),button=event.target.querySelector('[type=submit]');
    const name=root.querySelector('#profile-name').value.trim(),username=root.querySelector('#profile-username').value.trim().toLowerCase();
    if(!name||/[\u0000-\u001f\u007f]/.test(name)){feedback.textContent='Enter a display name without blank or control characters.';feedback.setAttribute('role','alert');return;}
    saving=true;button.disabled=true;feedback.textContent='Saving profile…';feedback.setAttribute('role','status');
    try {
      const {data,error}=await client.rpc('mcpa_update_my_profile',{p_name:name,p_username:username || null});
      if(error)throw error;if(!data?.id||data.id!==user.id)throw Error('The server did not confirm your profile. Refresh before retrying.');
      await MCPAAuth.verify();
      if(!root.isConnected||MCPAAuth.profile?.id!==user.id)return;
      root.querySelector('[data-profile-name]').textContent=data.name;
      root.querySelector('#profile-name').value=data.name;
      root.querySelector('#profile-username').value=data.username || '';
      root.querySelector('#profile-email').value=data.email || '';
      MovementOverview.contextBar();feedback.textContent='Profile saved.';
    }catch(error){
      if(!root.isConnected)return;
      feedback.textContent=error.code==='23505'?'That username is already in use. Choose another.':['42883','PGRST202'].includes(error.code)?'Profile editing is not installed. Ask your administrator to review the profile migration.':error.code==='42501'?'Your account cannot update this profile. Sign in again.':error.message || 'Profile could not be saved. Check your connection and retry.';
      feedback.setAttribute('role','alert');
    }finally{saving=false;if(button.isConnected)button.disabled=false;}
  };
  root.querySelector('#account-theme').onclick=event=>toggleTheme(event.currentTarget);
  applyTheme(document.body.classList.contains('dark'), false);
  root.querySelector('#account-logout').onclick=()=>MCPAAuth.logout();
})();
