(function () {
  const root=document.getElementById('screen-settings'),user=MCPAAuth.profile;
  if(!root||!user)return;
  const esc=MovementOverview.escape;
  const client=EquipmentTracking.client();
  root.innerHTML=`<div class="page-head"><div><h1 class="display">My account</h1><p class="sub">Your company profile and sign-in address</p></div></div><section class="card card-pad profile-settings"><h2 data-profile-name>${esc(user.name)}</h2><p class="account-message">${esc(MCPAPermissions.labels[user.role])} · ${MCPAAuth.isDemo?'Offline demonstration':'Active company account'}</p><p id="profile-feedback" role="status" aria-live="polite"></p><section class="profile-picture"><img id="profile-picture-preview" alt="Your current profile picture" width="80" height="80" hidden><form id="profile-picture-form"><label for="profile-picture-file">Profile picture</label><input id="profile-picture-file" type="file" accept="image/jpeg,image/png,image/webp" aria-describedby="profile-picture-help" disabled><p class="account-message" id="profile-picture-help">JPEG, PNG or WebP, up to 2 MiB. Checking secure photo storage…</p><button type="submit" class="btn btn-secondary" disabled>Save profile picture</button></form></section><form id="profile-form"><div class="field"><label for="profile-name">Display name</label><input id="profile-name" autocomplete="name" required maxlength="120" value="${esc(user.name)}"></div><div class="field"><label for="profile-username">Username</label><input id="profile-username" autocomplete="nickname" minlength="3" maxlength="30" pattern="[a-zA-Z0-9][a-zA-Z0-9._-]{1,28}[a-zA-Z0-9]" aria-describedby="profile-username-help" value="${esc(user.username || '')}"><p class="account-message" id="profile-username-help">Optional. Use 3–30 letters, numbers, dots, underscores or hyphens. Start and end with a letter or number. You still sign in with your email.</p></div><div class="field"><label for="profile-email">Sign-in email (read-only)</label><input id="profile-email" type="email" readonly value="${esc(user.email || '')}" aria-describedby="profile-email-help"><p class="account-message" id="profile-email-help">This is the verified address used to sign in. This form does not change it. Contact your administrator if it needs updating.</p></div><button type="submit" class="btn btn-primary" ${MCPAAuth.isDemo?'disabled':''}>Save profile</button></form><p class="account-message">${MCPAAuth.isDemo?'Profile changes are unavailable in the offline demo. ':''}Account roles are managed by an administrator. To reset your password, sign out and choose Forgot password on the login screen.</p></section>`;
  let saving=false,photoReady=false,photoSaving=false;
  const photoForm=root.querySelector('#profile-picture-form'),photoFile=root.querySelector('#profile-picture-file'),photoHelp=root.querySelector('#profile-picture-help');
  async function showPhoto(path){if(!path)return;const {data,error}=await client.storage.from('mcpa-profile-photos').createSignedUrl(path,300);if(!root.isConnected||error)return;const img=root.querySelector('#profile-picture-preview');img.src=data.signedUrl;img.hidden=false;}
  if(!MCPAAuth.isDemo)void client.rpc('mcpa_my_profile_picture').then(({data,error})=>{if(!root.isConnected)return;photoReady=!error&&data?.version===1;photoFile.disabled=!photoReady;photoForm.querySelector('button').disabled=!photoReady;photoHelp.textContent=photoReady?'JPEG, PNG or WebP, up to 2 MiB. Only your own picture can be edited.':'Photo editing requires the approved private storage update. Your existing profile can still be saved.';if(photoReady)void showPhoto(data.object_name);});
  photoForm.onsubmit=async event=>{
    event.preventDefault();if(!photoReady||photoSaving)return;const file=photoFile.files[0];
    if(!file||!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size===0||file.size>2*1024*1024){photoHelp.textContent='Choose a JPEG, PNG or WebP image up to 2 MiB.';return;}
    photoSaving=true;photoForm.querySelector('button').disabled=true;let objectName,uploaded=false,saved=false;
    try{const signature=new Uint8Array(await file.slice(0,12).arrayBuffer());const valid=file.type==='image/jpeg'?signature[0]===255&&signature[1]===216&&signature[2]===255:file.type==='image/png'?[137,80,78,71,13,10,26,10].every((v,i)=>signature[i]===v):String.fromCharCode(...signature.slice(0,4))==='RIFF'&&String.fromCharCode(...signature.slice(8,12))==='WEBP';if(!valid)throw Error('The file contents do not match a supported image.');
      objectName=user.id+'/'+crypto.randomUUID()+'.'+({ 'image/jpeg':'jpg','image/png':'png','image/webp':'webp'}[file.type]);
      const result=await client.storage.from('mcpa-profile-photos').upload(objectName,file,{contentType:file.type,upsert:false});if(result.error)throw result.error;uploaded=true;
      const {error}=await client.rpc('mcpa_set_my_profile_picture',{p_object_name:objectName});if(error)throw error;saved=true;
      if(root.isConnected){photoHelp.textContent='Profile picture saved.';photoFile.value='';await showPhoto(objectName);}
    }catch(error){if(uploaded&&!saved)await client.storage.from('mcpa-profile-photos').remove([objectName]);if(root.isConnected)photoHelp.textContent=error.message||'Picture could not be saved. Try again.';}
    finally{photoSaving=false;if(root.isConnected)photoForm.querySelector('button').disabled=!photoReady;}
  };
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

  applyTheme(document.body.classList.contains('dark'), false);

})();
