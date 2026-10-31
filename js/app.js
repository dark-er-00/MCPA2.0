/* ============================================================
   MODULE LOADING
   Maps every screen id (used by showScreen / nav / cross-module
   links) to the module folder that owns it. A couple of detail
   screens (tool-profile, site-detail) are bundled inside a
   parent module's HTML file rather than getting their own folder.
   ============================================================ */
const SCREEN_MODULE = {
  "dashboard":    "dashboard",
  "masterlist":   "masterlist",
  "tool-profile": "masterlist",
  "sites":        "sites",
  "site-detail":  "sites",
  "consumables":  "consumables",
  "request":      "requests",
  "transfer":     "transfers",
  "return":       "returns",
  "repair":       "repairs",
  "missing":      "missing",
  "purchase":     "purchases",
  "reports":      "reports",
  "activity":     "activity",
  "users":        "users",
  "settings":     "settings",
};

let currentModule = null;
let moduleAbort = null;
let pendingModule = null;

function disposeLoadedModule(){
  window.MCPAIntegration?.dispose();
  window.MovementUI?.dispose();
  window.MovementOverview?.dispose();
  window.TrackingView?.dispose();
  window.MCPAProjects?.dispose();
  window.AdminEquipment?.dispose();
  window.MCPAAccounts?.dispose();
  window.MCPAPurchases?.dispose();
  window.MCPAReports?.dispose();
}

/* Loads (or reuses, if already the active module) the module that
   owns `screenId`, then calls `callback`. HTML is re-fetched and
   re-inserted whenever the module changes so module scripts
   (e.g. renderMasterlist) always run against fresh markup; the
   module's CSS is only ever attached once. */
function loadModule(screenId, callback, route = screenId){
  if (!window.MCPAAuth?.canRoute(screenId)) { if (window.MCPAAuth?.profile) MCPAAuth.deny(); return; }
  if(window.MCPAIntegration?.handles(screenId)){
    moduleAbort?.abort();moduleAbort=null;pendingModule=null;
    disposeLoadedModule();currentModule=null;
    const content=document.getElementById('content'),root=document.createElement('section');
    root.id='screen-'+screenId;root.className='screen active';content.replaceChildren(root);content.setAttribute('aria-busy','true');
    const active=pendingModule={mod:'integration:'+screenId,callback,route};
    const ready=window.MCPAIntegration.mount(screenId,root,window.MCPAMovementLinks.parse(route));
    window.MCPANavigation?.track?.(root,ready);
    ready.then(()=>{if(pendingModule!==active)return;pendingModule=null;content.removeAttribute('aria-busy');active.callback();})
      .catch(error=>{if(pendingModule!==active)return;pendingModule=null;content.removeAttribute('aria-busy');root.replaceChildren();const message=document.createElement('p');message.setAttribute('role','alert');message.textContent=error.message;root.append(message);window.MCPANavigation?.failed?.();});
    return;
  }
  const mod = SCREEN_MODULE[screenId];
  if(!mod){
    console.error('Unknown screen: ' + screenId);
    return;
  }
  // A second link to the same loading module must wait for its script too.
  if(pendingModule?.mod === mod){
    pendingModule.callback = callback;
    pendingModule.route = route;
    return;
  }
  moduleAbort?.abort();
  moduleAbort = null;
  pendingModule = null;
  if(mod === currentModule){
    document.getElementById('content').removeAttribute('aria-busy');
    callback();
    return;
  }

  moduleAbort = new AbortController();
  const active = pendingModule = {mod, callback, route};
  function failed(err) {
    if (err.name === 'AbortError' || pendingModule !== active) return;
    pendingModule = null;
    currentModule = null;
    disposeLoadedModule();
    const content = document.getElementById('content');
    content.removeAttribute('aria-busy');
    content.innerHTML = '<div class="card card-pad" role="alert"><h2>Unable to load this screen</h2><p>Please check your connection and try again.</p><button class="btn btn-secondary" id="retry-module">Retry</button></div>';
    document.getElementById('retry-module').onclick = () => showScreen(active.route);
    window.MCPANavigation?.failed?.();
  }
  const relative = location.pathname.includes('/2-engr/') ? '../' : '';
  const user = window.MCPAAuth.profile;
  const operational = MCPAPermissions.operational(user.role);
  let pathPrefix = relative + (operational ? '2-engr/modules/' : '1-admin/modules/');
  if (['sites','consumables','users','settings','reports','purchases'].includes(mod)) pathPrefix = relative + '1-admin/modules/';
  if (mod === 'masterlist' && (operational || user.role === 'tool_handler' || window.MCPAAuth.isDemo)) pathPrefix = relative + '2-engr/modules/';
  const base = pathPrefix + mod + '/' + mod;
  
  document.getElementById('content').setAttribute('aria-busy', 'true');
  fetch(base + '.html', {signal: moduleAbort.signal})
    .then(function(res){ if (!res.ok) throw new Error('Screen could not load (' + res.status + ').'); return res.text(); })
    .then(function(html){
      if (pendingModule !== active) return;
      // Keep the current screen usable until the replacement actually arrives.
      disposeLoadedModule();
      document.getElementById('content').innerHTML = html;
      currentModule = null;
      ensureModuleCSS(mod, base + '.css');
      loadModuleScript(mod, base + '.js', function(){
        if (pendingModule !== active) return;
        currentModule = mod;
        pendingModule = null;
        document.getElementById('content').removeAttribute('aria-busy');
        active.callback();
      }, failed);
    })
    .catch(failed);
}

function ensureModuleCSS(mod, href){
  if(document.querySelector('link[data-module="' + mod + '"]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = href + '?v=' + new Date().getTime();
  link.dataset.module = mod;
  link.onload = link.onerror = () => { link.dataset.loaded = 'true'; };
  document.head.appendChild(link);
}

function loadModuleScript(mod, src, callback, failed){
  const old = document.querySelector('script[data-module="' + mod + '"]');
  if(old) old.remove();
  const script = document.createElement('script');
  script.src = src + '?v=' + new Date().getTime();
  script.dataset.module = mod;
  script.onload = callback;
  script.onerror = function(){
    console.error('Failed to load script for "' + mod + '"');
    failed(new Error('Failed to load script for "' + mod + '"'));
  };
  document.body.appendChild(script);
}

/* ============================================================
   APP INITIALIZATION
   ============================================================ */
function enterApp(event){ return window.MCPAAuth?.signIn(event); }
function resetApplication({keepMonitoring = false} = {}){
  if (!keepMonitoring) window.MCPAMonitoring?.dispose();
  window.MCPADrawer?.close(false);
  moduleAbort?.abort(); pendingModule=null; currentModule=null; clearTimeout(searchTimer);
  disposeLoadedModule(); closeMobileSearch(false);
  window.mcpaSearch='';
  window.MCPAGlobalSearch?.reset();
  window.movementDraft=null;
  if (typeof equipmentList !== 'undefined') equipmentList=[];
  if (typeof selectedAssets !== 'undefined') selectedAssets=[];
}
/* ============================================================
   GLOBAL EVENT HANDLING
   ============================================================ */
let themeTransitionRunning = false;
function applyTheme(dark, persist = true){
  document.body.classList.toggle('dark', dark);
  const label = document.getElementById('theme-label');
  if (label) label.textContent = dark ? 'Light mode' : 'Night mode';
  const button = document.querySelector('.theme-toggle');
  if (button) {
    button.setAttribute('aria-label', dark ? 'Switch to light mode' : 'Switch to night mode');
    button.setAttribute('aria-pressed', String(dark));
    button.title = button.getAttribute('aria-label');
  }
  const icon = document.getElementById('theme-icon');
  if (icon) icon.innerHTML = ICONS[dark ? 'sun' : 'moon'];
  document.querySelectorAll('#account-theme,[data-account-theme]').forEach(control => {
    control.textContent = dark ? 'Switch to light mode' : 'Switch to night mode';
    control.setAttribute('aria-pressed', String(dark));
  });
  if(persist) try { localStorage.setItem('mcpa.theme', dark ? 'dark' : 'light'); } catch (_) {}
}
async function toggleTheme(button = document.querySelector('.theme-toggle')){
  if(themeTransitionRunning) return;
  const dark = !document.body.classList.contains('dark');
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  // Accept event handlers as well as element callers, including older modules.
  button = button?.currentTarget || button;
  if (typeof button?.getBoundingClientRect !== 'function') button = document.querySelector('.theme-toggle');
  if(typeof document.startViewTransition !== 'function' || reducedMotion.matches){ applyTheme(dark); return; }

  // Viewport coordinates stay correct when the page is scrolled.
  const rect = typeof button?.getBoundingClientRect === 'function' ? button.getBoundingClientRect() : {left:innerWidth / 2,top:innerHeight / 2,width:0,height:0};
  const x = rect.left + rect.width / 2, y = rect.top + rect.height / 2;
  // Extend just past the farthest corner to cover the antialiased circle edge.
  const radius = Math.ceil(Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y))) + 1;
  const root = document.documentElement;
  root.style.setProperty('--theme-x', x + 'px');
  root.style.setProperty('--theme-y', y + 'px');
  root.style.setProperty('--theme-radius', radius + 'px');
  root.classList.add('theme-transition');
  themeTransitionRunning = true;
  let transition;
  const stopReveal = () => transition.skipTransition();
  try {
    transition = document.startViewTransition(() => applyTheme(dark));
    // A skipped reveal can reject ready; a failed update can reject both promises.
    transition.ready.catch(() => {});
    transition.updateCallbackDone.catch(() => {});
    reducedMotion.addEventListener?.('change', stopReveal);
    window.addEventListener('resize', stopReveal, {once: true});
    await transition.finished;
  } catch (_) { applyTheme(dark); }
  finally {
    reducedMotion.removeEventListener?.('change', stopReveal);
    window.removeEventListener('resize', stopReveal);
    root.classList.remove('theme-transition');
    ['--theme-x','--theme-y','--theme-radius'].forEach(name => root.style.removeProperty(name));
    themeTransitionRunning = false;
  }
}

let searchTimer;
function globalSearch(q){ window.MCPAGlobalSearch?.search(q); }

const compactSearch = matchMedia('(max-width: 900px)');
// A breakpoint can hide the focused close button before the media-change
// callback runs. Remember ownership so focus moves to the visible search field.
let searchHadFocus = false;
document.addEventListener('focusin',event=>{searchHadFocus=Boolean(event.target.closest?.('#global-search-panel,#mobile-search-toggle'));});
document.addEventListener('pointerdown',event=>{if(!event.target.closest('#global-search-panel,#mobile-search-toggle'))searchHadFocus=false;});
function closeMobileSearch(restoreFocus = true, cancelPending = true){
  const panel = document.getElementById('global-search-panel'), button = document.getElementById('mobile-search-toggle');
  const wasOpen = panel?.classList.contains('is-open');
  window.MCPAGlobalSearch?.close();
  panel?.classList.remove('is-open'); button?.setAttribute('aria-expanded','false');
  if(cancelPending) clearTimeout(searchTimer);
  if(!restoreFocus)searchHadFocus=false;
  if(wasOpen && restoreFocus && compactSearch.matches) button?.focus();
}
function openMobileSearch(){
  window.MCPADrawer?.close(false);
  if(!window.MCPAAuth?.profile) return;
  const panel = document.getElementById('global-search-panel');
  if(panel.classList.contains('is-open')) { closeMobileSearch(); return; }
  document.getElementById('account-menu')?.removeAttribute('open');
  document.getElementById('sidebar')?.classList.remove('open');
  panel.classList.add('is-open'); document.getElementById('mobile-search-toggle').setAttribute('aria-expanded','true');
  document.getElementById('global-search-input').focus();
}
function updateSearchLayout(){
  const input = document.getElementById('global-search-input'), button = document.getElementById('mobile-search-toggle');
  const focused = document.activeElement;
  const restore = searchHadFocus || focused === input || focused === button || Boolean(focused?.closest('.mobile-search-close'));
  closeMobileSearch(false);
  input.placeholder = compactSearch.matches ? 'Search SiteTrace\u2026' : 'Search equipment, projects, or reference IDs\u2026';
  if(restore) (compactSearch.matches ? button : input).focus();
}
compactSearch.addEventListener('change', updateSearchLayout); updateSearchLayout();
document.getElementById('global-search-panel').addEventListener('keydown', event => {
  if(event.key === 'Escape'){ event.preventDefault(); closeMobileSearch(); }

});
document.addEventListener('click', event => {
  if(event.target.closest('.mobile-menu-btn,.bell-wrap,#account-menu summary,[data-tool]')) closeMobileSearch(false);
});

function logout(){ return window.MCPAAuth?.logout(); }
applyTheme(document.body.classList.contains('dark'), false);

document.addEventListener('click', event => {
  const link = event.target.closest('a[data-movement-link]');
  if (!link || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
  event.preventDefault();
  // History links can also appear inside the existing equipment detail dialog.
  document.querySelectorAll('.overview-dialog[open]').forEach(dialog => dialog.close());
  showScreen(link.hash.slice(1));
});

// Close sidebar on mobile when clicking outside of it
document.addEventListener('click', function(e) {
  const sidebar = document.getElementById('sidebar');
  const menuBtn = document.querySelector('.mobile-menu-btn');
  
  // If the sidebar is open and the click target is NOT the sidebar or the menu button
  if (sidebar && sidebar.classList.contains('open')) {
    if (!sidebar.contains(e.target) && (!menuBtn || !menuBtn.contains(e.target))) {
      sidebar.classList.remove('open');
    }
  }
});

// Close sidebar on mobile when a navigation item is clicked
document.getElementById('sidebar').addEventListener('click', function(e) {
  if (e.target.closest('.nav-item')) {
    this.classList.remove('open');
  }
});
