/* Supabase owns credentials and sessions. Profiles are fetched through an authenticated RPC. */
(function () {
  'use strict';
  let profile = null, demo = false, revision = 0, sessionUser = null, recovering = false, busy = false;
  const callbackParams = new URLSearchParams(location.hash.slice(1));
  // Reject retired setup links, including a setup interrupted on an older page.
  let legacySetup=false;
  try{legacySetup=JSON.parse(sessionStorage.getItem('mcpa.password-setup'))?.kind==='invite';}catch(_){}
  const retiredCallback = callbackParams.get('type') === 'invite' || new URLSearchParams(location.search).get('account_setup') === 'invite' || legacySetup;
  const callbackError = callbackParams.has('error') || new URLSearchParams(location.search).has('error');
  let rejectCallback = callbackError || retiredCallback;
  async function setupPassword(session) {
    if (!session?.user) return false;
    ++revision; recovering = true; profile = null; demo = false;
    try { sessionStorage.removeItem('mcpa.demo.role'); sessionStorage.setItem('mcpa.password-setup', JSON.stringify({userId:session.user.id,kind:'recovery'})); } catch (_) {}
    history.replaceState(null,'',location.pathname);
    login('', 'recovery');
    return true;
  }
  function pendingSetup(session) {
    try { const saved=JSON.parse(sessionStorage.getItem('mcpa.password-setup')); return saved?.userId===session?.user?.id && saved.kind==='recovery'; } catch (_) { return false; }
  }
  const esc = value => String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const client = () => window.EquipmentTracking.client();
  const rootUrl = () => new URL(location.pathname.includes('/2-engr/') ? '../index.html' : 'index.html',location.href).href.split('#')[0];
  function clearApplication() {
    window.MCPAIntegration?.dispose();
    window.MCPAAccountMenu?.close(false);
    window.MCPANavigation?.suspend();
    window.resetApplication?.();
    window.MovementStore?.clear();
    if (typeof TOOLS !== 'undefined') TOOLS.splice(0,TOOLS.length);
    document.getElementById('app-shell').classList.add('hidden');
    document.getElementById('nav-list').replaceChildren();
    document.getElementById('content').replaceChildren();
    document.getElementById('movement-context').replaceChildren();
  }
  function login(message = '', kind = 'login') {
    clearApplication();
    const host=document.getElementById('login-screen');
    host.classList.remove('hidden');
    window.MCPALoginSlideshow?.show();
    document.getElementById('login-content').innerHTML=`<section class="login-card"><div class="login-mark">MCPA</div><h1 class="display">${kind==='recovery'?'Set your password':'Welcome back'}</h1><p class="sub">Construction Asset Management<br>and Accountability System</p><div id="auth-feedback" role="status">${esc(message)}</div>${kind==='loading'?'<p class="auth-loading" role="status">Checking your session…</p>':kind==='demo'?`<h2>Offline demonstration</h2><p class="auth-help">Sample identities and browser-only records. This workspace cannot access the live database.</p><div class="auth-demo-choices"><button class="btn btn-secondary" data-demo-role="admin">Admin demonstration</button><button class="btn btn-secondary" data-demo-role="engineer">Engineer demonstration</button><button class="btn btn-secondary" data-demo-role="architect">Architect demonstration</button></div><button class="link-btn" data-auth-back>Back to sign in</button>`:`<form id="auth-form">${kind==='recovery'?'':`<div class="field"><label for="auth-email">Email</label><input id="auth-email" type="email" autocomplete="username" required></div>`}<div class="field"><label for="auth-password">${kind==='recovery'?'New password':'Password'}</label><div class="auth-password-wrap"><input id="auth-password" type="password" autocomplete="${kind==='recovery'?'new-password':'current-password'}" ${kind==='recovery'?'minlength="12"':''} required><button class="auth-password-toggle" type="button" aria-controls="auth-password" aria-label="Show password" data-auth-toggle-password>Show</button></div></div><button class="btn btn-primary btn-block" type="submit">${kind==='recovery'?'Save password':'Sign In'}</button></form>${kind==='recovery'?'<button class="link-btn" data-auth-logout>Cancel and sign out</button>':'<button class="link-btn" data-auth-reset>Forgot password?</button><p class="auth-help">Company accounts are issued by your administrator.</p><button class="btn btn-secondary btn-block" data-auth-demo>Try offline demo</button>'}`}</section>`;
    // Native form submission handles Enter from either input, including mobile keyboards.
    host.querySelector('form')?.addEventListener('submit',signIn);
    host.querySelector('[data-auth-toggle-password]')?.addEventListener('click',event=>{
      const input=host.querySelector('#auth-password');
      const show=input.type==='password';
      input.type=show?'text':'password';
      event.currentTarget.textContent=show?'Hide':'Show';
      event.currentTarget.setAttribute('aria-label',show?'Hide password':'Show password');
    });
    host.querySelector('[data-auth-reset]')?.addEventListener('click',resetPassword);
    host.querySelector('[data-auth-demo]')?.addEventListener('click',()=>login('','demo'));
    host.querySelector('[data-auth-back]')?.addEventListener('click',()=>login());
    host.querySelector('[data-auth-logout]')?.addEventListener('click',logout);
    host.querySelectorAll('[data-demo-role]').forEach(b=>b.addEventListener('click',()=>startDemo(b.dataset.demoRole)));
  }
  function feedback(message) { const el=document.getElementById('auth-feedback');if(el) {el.textContent=message;el.setAttribute('role','alert');} }
  // One delegated dismissal pair for every account/header rerender.
  window.MCPAAccountMenu?.dispose();
  const accountEvents = new AbortController();
  function closeAccount(restore = false) {
    const menu=document.getElementById('account-menu');
    if(!menu)return;
    const wasOpen=menu.open;menu.open=false;
    menu.querySelector('summary')?.setAttribute('aria-expanded','false');
    if(wasOpen&&restore)menu.querySelector('summary')?.focus();
  }
  document.addEventListener('click',event=>{
    const menu=document.getElementById('account-menu');
    if(menu?.open&&!menu.contains(event.target))closeAccount();
  },{signal:accountEvents.signal});
  document.addEventListener('keydown',event=>{
    if(event.key==='Escape'&&document.getElementById('account-menu')?.open){event.preventDefault();closeAccount(true);}
  },{signal:accountEvents.signal});
  window.MCPAAccountMenu={close:closeAccount,dispose:()=>accountEvents.abort()};
  function accountUI() {
    const label=MCPAPermissions.labels[profile.role], name=profile.name;
    document.querySelector('.sidebar-foot .name').textContent=name;
    document.querySelector('.sidebar-foot .role').textContent=label;
    const initials=name.split(/\s+/).slice(0,2).map(n=>n[0]).join('').toUpperCase();
    document.querySelectorAll('.avatar').forEach(el=>el.textContent=initials);
    let menu=document.getElementById('account-menu');
    if(!menu){menu=document.createElement('details');menu.id='account-menu';document.querySelector('.topbar-actions').append(menu);}
    document.querySelector('.topbar-actions > .avatar')?.classList.add('hidden');
    menu.innerHTML=`<summary aria-label="Account menu" aria-expanded="${menu.open}" aria-controls="account-dropdown"><span class="account-name">${esc(name)}</span><span>${esc(label)}${demo?' · Demo':''}</span></summary><div class="account-dropdown" id="account-dropdown">${profile.username?`<p class="account-message">@${esc(profile.username)}</p>`:''}<button data-account-profile>My Account</button><button data-account-theme>Change theme</button><button data-account-logout>${demo?'Exit demo':'Log Out'}</button></div>`;
    menu.querySelector('summary').onclick=()=>{if(!menu.open)window.MCPAMonitoring?.close(false);};
    menu.ontoggle=()=>{menu.querySelector('summary')?.setAttribute('aria-expanded',String(menu.open));if(menu.open)window.MCPAMonitoring?.close(false);};
    menu.querySelector('[data-account-profile]').onclick=()=>{closeAccount();showScreen('settings');};
    menu.querySelector('[data-account-theme]').onclick=event=>toggleTheme(event.currentTarget);
    menu.querySelector('[data-account-logout]').onclick=logout;
    document.querySelector('.bell-wrap')?.classList.toggle('hidden',!canRoute('activity'));
    document.querySelector('.search-wrap')?.classList.toggle('hidden',!canRoute('masterlist'));
    document.getElementById('mobile-search-toggle')?.classList.toggle('hidden',!canRoute('masterlist'));
  }
  function enter() {
    window.MCPALoginSlideshow?.hide();
    document.getElementById('login-screen').classList.add('hidden');
    document.getElementById('app-shell').classList.remove('hidden');
    accountUI(); buildNav();
    window.MCPAMonitoring?.initialize();
    const requested=window.MCPANavigation?.initialRoute(location.hash.slice(1)) ?? location.hash.slice(1);
    showScreen(window.MCPAMovementLinks.parse(requested).screen in SCREEN_MODULE ? requested : MCPAPermissions.home(profile.role), null, {history:'initial'});
  }
  async function restore(session) {
    if(demo || recovering) return;
    const generation=++revision;
    if(!session){window.MCPANavigation?.endSession();profile=null;sessionUser=null;login('Sign in to access your company workspace.');return;}
    if(sessionUser!==session.user.id){profile=null;login('','loading');}
    try {
      const {data,error}=await client().rpc('mcpa_my_profile');
      if(generation!==revision || demo || recovering) return;
      if(error) throw error;
      if(!data || !MCPAPermissions.labels[data.role]) {profile=null;login('Your account is not assigned an authorized company profile. Contact your administrator.');return;}
      if(data.account_status!=='active'){profile=null;login('Your account is inactive. Contact your administrator.');return;}
      const changed=!profile || profile.id!==data.id || profile.role!==data.role;
      profile=data;sessionUser=session.user.id;
      if(changed){clearApplication();await MovementStore.useLive();enter();}else accountUI();
    } catch (_) {if(generation===revision){profile=null;login('Your authorized profile could not be verified. Check your connection or contact your administrator, then sign in again.');}}
  }
  async function signIn(event) {
    event?.preventDefault();if(busy)return;busy=true;
    const button=document.querySelector('#auth-form button[type=submit]');if(button)button.disabled=true;
    try {
      rejectCallback = false;
      if(recovering){const {error}=await client().auth.updateUser({password:document.getElementById('auth-password').value});if(error)throw error;await logout();feedback('Password saved. Sign in with your new password.');return;}
      const {data,error}=await client().auth.signInWithPassword({email:document.getElementById('auth-email').value.trim(),password:document.getElementById('auth-password').value});
      if(error)throw error;
      const passwordInput=document.getElementById('auth-password');if(passwordInput)passwordInput.value='';await restore(data.session);
    } catch(error){feedback(recovering?'Password could not be saved. Use at least 12 characters, check your connection, and try again. If the link expired, request a new password reset.':error?.code==='invalid_credentials'?'Incorrect email or password.':error?.code==='email_not_confirmed'?'Your email is not confirmed. Contact your administrator.':'Sign in could not be completed. Check your connection and try again.');}
    finally {busy=false;if(button?.isConnected)button.disabled=false;}
  }
  async function resetPassword() {
    const input=document.getElementById('auth-email');if(!input?.reportValidity())return;
    try{const {error}=await client().auth.resetPasswordForEmail(input.value.trim(),{redirectTo:rootUrl()});if(error)throw error;feedback('If an account exists for this email, a password reset link has been sent.');}
    catch(_){feedback('Unable to request a password reset. Check your connection and try again.');}
  }
  async function startDemo(role, restoring = false) {
    if(!['admin','engineer','architect'].includes(role))return;
    ++revision;demo=true;profile={id:'demo-'+role,name:role==='admin'?'Engr Pau':'Engr Sky',role,account_status:'active'};
    sessionStorage.setItem('mcpa.demo.role',role);
    clearApplication();await MovementStore.useDemo();if(!restoring)history.replaceState(null,'',location.pathname);enter();
  }
  async function logout() {
    window.MCPANavigation?.endSession();
    const wasDemo=demo;++revision;profile=null;sessionUser=null;demo=false;recovering=false;
    sessionStorage.removeItem('mcpa.password-setup');
    sessionStorage.removeItem('mcpa.demo.role');clearApplication();history.replaceState(null,'',location.pathname);login(wasDemo?'Demo closed. Your sample records remain in this browser.':'Signing out…');
    if(wasDemo)return;
    try{const {error}=await client().auth.signOut({scope:'local'});if(error)throw error;login('You have been signed out.');}
    catch(_){login('Sign out could not be confirmed. Retry before leaving this device.');document.getElementById('auth-feedback').insertAdjacentHTML('beforeend','<button class="btn btn-secondary" id="retry-signout">Retry sign out</button>');document.getElementById('retry-signout').onclick=logout;}
  }
  const canRoute=route=>!!profile && MCPAPermissions.route(profile.role,route) && !(demo && ['users','consumables','purchase'].includes(route));
  const canAction=action=>!!profile && MCPAPermissions.action(profile.role,action);
  function deny(){document.getElementById('content').innerHTML='<section class="card card-pad" role="alert"><h1>Access restricted</h1><p>This page is not available for your account.</p><button class="btn btn-secondary" id="auth-home">Return to your workspace</button></section>';document.getElementById('auth-home').onclick=()=>showScreen(MCPAPermissions.home(profile.role));}
  window.MCPAAuth={get profile(){return profile?{...profile}:null;},get isDemo(){return demo;},canRoute,canAction,signIn,logout,deny,accountUI,
    async verify(){if(demo)return true;const {data,error}=await client().auth.getSession();if(error)throw error;await restore(data.session);return !!profile;},
    requireLive(){if(demo || !profile)throw new Error('Sign in with an active company account to access live records.');return {...profile};}
  };
  async function boot(){
    login('','loading');
    let demoRole;try{demoRole=sessionStorage.getItem('mcpa.demo.role');}catch(_){}
    try{
      client().auth.onAuthStateChange((event,session)=>{
        if(demo || rejectCallback)return;
        if(event==='PASSWORD_RECOVERY'){setupPassword(session);return;}
        if(event==='SIGNED_OUT'){window.MCPANavigation?.endSession();++revision;profile=null;sessionUser=null;recovering=false;sessionStorage.removeItem('mcpa.password-setup');login('Your session ended. Sign in again.');return;}
        if(recovering)return;
        if(session && pendingSetup(session)){setupPassword(session);return;}
        if(event==='INITIAL_SESSION'||event==='SIGNED_IN'||event==='TOKEN_REFRESHED'||event==='USER_UPDATED')setTimeout(()=>restore(session),0);
      });
      if(retiredCallback){
        sessionStorage.removeItem('mcpa.password-setup');sessionStorage.removeItem('mcpa.demo.role');
        history.replaceState(null,'',location.pathname);
        try{await client().auth.signOut({scope:'local'});}catch(_){}
        login('This account setup link is no longer supported. Contact your administrator for access.');return;
      }
      if(callbackError){history.replaceState(null,'',location.pathname);login('This password reset link is invalid or expired. Use Forgot password to request a new one.');return;}
      if(demoRole && !callbackParams.get('type') && ['admin','engineer','architect'].includes(demoRole)){await startDemo(demoRole,true);return;}
      const {data,error}=await client().auth.getSession();if(error)throw error;
      if(recovering)return;
      if(data.session && pendingSetup(data.session)){setupPassword(data.session);return;}
      await restore(data.session);
    }catch(_){login('The sign-in service could not load. Check your connection and refresh. Offline demo remains available.');}
  }
  window.addEventListener('focus',()=>{if(profile&&!demo&&!recovering)MCPAAuth.verify().catch(()=>{});});
  window.addEventListener('storage',event=>{if(event.key?.includes('auth-token')&&!demo)MCPAAuth.verify().catch(()=>{});});
  setInterval(()=>{if(profile&&!demo&&!document.hidden&&!recovering)MCPAAuth.verify().catch(()=>{});},60000);
  boot();
})();
