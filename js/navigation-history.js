/* One History API owner for both entry pages. Each visit has its own identity. */
(function () {
  'use strict';
  const storageKey = 'mcpa.navigation.v1', mounts = new WeakMap();
  let session, current, revision = 0, restoring = false, frame = 0, layoutObserver;
  const owner = () => {
    const auth = window.MCPAAuth, user = auth?.profile;
    return user ? `${auth.isDemo ? 'demo' : 'live'}:${user.id}:${user.role}` : '';
  };
  const uid = () => crypto.randomUUID();
  const read = () => { try { return JSON.parse(sessionStorage.getItem(storageKey)); } catch (_) { return null; } };
  const persist = () => { try { sessionStorage.setItem(storageKey, JSON.stringify(session)); } catch (_) {} };
  const valid = entry => entry?.version === 1 && session && entry.owner === owner() && entry.session === session.id;
  // Drafts live only in the session cache, which logout can erase. Older browser
  // entries cannot be deleted, so never embed form data in history.state.
  const historyEntry = ({view, ...entry}) => entry;
  const url = route => '#' + route;
  function updateButton() {
    const button = document.getElementById('mobile-back');
    if (button) button.hidden = !canBack();
  }
  function canBack() { return Boolean(valid(current) && current.index > 0); }
  function elements() {
    const content = document.getElementById('content');
    return [content, ...content.querySelectorAll('[id]'), ...document.querySelectorAll('#main-col,#app-shell')];
  }
  function position() {
    const nodes = {};
    for (const el of elements()) if (el.scrollTop || el.scrollLeft) nodes[el.id] = [el.scrollLeft, el.scrollTop];
    return {window: [window.scrollX, window.scrollY], nodes};
  }
  function view() {
    return {
      overview: window.MovementOverview?.capture?.(),
      movement: window.MovementUI?.capture?.(),
      projects: window.MCPAProjects?.capture?.(),
      equipment: window.AdminEquipment?.capture?.()
    };
  }
  function save() {
    if (!current || !session || restoring) return;
    current.scroll = position(); current.view = view();
    session.entries[current.key] = current;
    // During popstate the browser already points to the destination entry.
    if (history.state?.mcpa?.key === current.key) history.replaceState({mcpa: historyEntry(current)}, '', url(current.route));
    persist();
  }
  function start() {
    if (session?.owner === owner()) return;
    const stored = read();
    session = stored?.owner === owner() && typeof stored.id === 'string' && stored.entries && typeof stored.entries === 'object' ? stored : {owner: owner(), id: uid(), entries: {}};
    persist();
  }
  function begin(route, options = {}) {
    layoutObserver?.disconnect(); layoutObserver = null;
    start(); save();
    const previous = current;
    const existing = options.entry || history.state?.mcpa;
    const restore = options.history === 'restore' || options.history === 'initial';
    if (restore && valid(existing) && existing.route === route) {
      current = session.entries[existing.key] || existing;
    } else if (previous?.route === route && valid(previous) && options.history !== 'replace') {
      current = previous; // Repeated search updates/retries do not add visits.
    } else {
      const push = !!previous && options.history !== 'replace' && !restore;
      current = {version: 1, owner: owner(), session: session.id, key: uid(), index: push ? previous.index + 1 : 0, route};
      history[push ? 'pushState' : 'replaceState']({mcpa: historyEntry(current)}, '', url(route));
    }
    session.entries[current.key] = current; persist();
    restoring = true;
    const ticket = {revision: ++revision, entry: current, restore: restore || current === previous};
    updateButton();
    return ticket;
  }
  function isCurrent(ticket) { return ticket.revision === revision && valid(ticket.entry); }
  async function ready(target) {
    // Module scripts register their real data-loading promise before onload fires.
    for (let node = target; node; node = node.parentElement) if (mounts.has(node)) await mounts.get(node);
    const styles = [...document.querySelectorAll('link[data-module]')];
    await Promise.all(styles.filter(link => !link.sheet && !link.dataset.loaded).map(link => new Promise(resolve => {
      const done = () => { link.removeEventListener('load', done); link.removeEventListener('error', done); resolve(); };
      link.addEventListener('load', done); link.addEventListener('error', done);
    })));
  }
  async function activate(ticket, target, afterActivate) {
    await ready(target);
    if (!isCurrent(ticket)) return;
    if (ticket.restore && ticket.entry.view) {
      const state = ticket.entry.view;
      window.MovementOverview?.restore?.(state.overview);
      window.MovementUI?.restore?.(state.movement);
      window.MCPAProjects?.restore?.(state.projects);
      window.AdminEquipment?.restore?.(state.equipment);
    }
    await afterActivate();
    if (!isCurrent(ticket)) return;
    if (ticket.restore) window.MovementUI?.restoreDetail?.(ticket.entry.view?.movement);
    // Layout is measured after data, record dialogs and styles have settled.
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    if (!isCurrent(ticket)) return;
    const scroll = ticket.restore && ticket.entry.scroll;
    const place = () => {
      if (!isCurrent(ticket)) return;
      for (const el of elements()) {
        const point = scroll?.nodes?.[el.id] || [0, 0];
        el.scrollLeft = point[0]; el.scrollTop = point[1];
      }
      window.scrollTo({left: scroll?.window?.[0] || 0, top: scroll?.window?.[1] || 0, behavior: 'instant'});
    };
    place();
    // Late images, nested reads and Realtime renders can change the available
    // height. Keep the saved position until the user starts interacting again.
    if (scroll && target) {
      let layoutFrame = 0;
      const schedule = () => {
        if (!layoutFrame) layoutFrame = requestAnimationFrame(() => { layoutFrame = 0; place(); });
      };
      const resize = new ResizeObserver(schedule), mutation = new MutationObserver(schedule);
      resize.observe(target); resize.observe(document.getElementById('content'));
      // A render can briefly collapse and regrow to the same dimensions within
      // one frame. ResizeObserver alone cannot see that scroll-clamping case.
      mutation.observe(target, {subtree:true, childList:true, attributes:true, characterData:true});
      layoutObserver = {disconnect() { resize.disconnect(); mutation.disconnect(); cancelAnimationFrame(layoutFrame); }};
    }
    restoring = false; save(); updateButton();
    document.dispatchEvent(new CustomEvent('mcpa:navigation-ready', {detail: {route: current.route}}));
  }
  function traverse() {
    if (!owner() || document.getElementById('app-shell').classList.contains('hidden')) return;
    const entry = history.state?.mcpa;
    if (valid(entry) && entry.key === current?.key) return; // hashchange accompanying popstate
    save();
    const route = location.hash.slice(1);
    if (entry && !valid(entry)) {
      // Old account/session entries cannot reopen records. Browser history cannot be deleted.
      current = null;
      showScreen(MCPAPermissions.home(window.MCPAAuth.profile.role), null, {history: 'replace'});
      return;
    }
    showScreen(route, null, {history: valid(entry) ? 'restore' : 'replace', entry});
  }
  function suspend() { layoutObserver?.disconnect(); layoutObserver = null; ++revision; restoring = false; current = null; updateButton(); }
  function endSession() {
    suspend(); session = null;
    try { sessionStorage.removeItem(storageKey); } catch (_) {}
  }
  window.MCPANavigation = {
    begin, activate, isCurrent, save, suspend, endSession, canBack,
    failed() { restoring = false; save(); updateButton(); },
    back() { if (canBack()) { save(); history.back(); } },
    track(element, promise) { if (element) mounts.set(element, promise); return promise; },
    initialRoute(requested) {
      start();
      const entry = history.state?.mcpa;
      return entry && !valid(entry) ? MCPAPermissions.home(window.MCPAAuth.profile.role) : requested;
    },
    get restoring() { return restoring; }
  };
  history.scrollRestoration = 'manual';
  window.addEventListener('popstate', traverse);
  window.addEventListener('hashchange', traverse);
  window.addEventListener('pagehide', save);
  for (const type of ['pointerdown','touchstart','wheel','keydown']) document.addEventListener(type, () => {
    layoutObserver?.disconnect(); layoutObserver = null;
  }, {capture: true, passive: true});
  // Capture nested scrolling containers as well as the document viewport.
  document.addEventListener('scroll', () => {
    if (frame || restoring) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      // Avoid History API rate limits and synchronous storage on every frame.
      // Navigation/pagehide persist the outgoing entry, including form state.
      if (current && !restoring) current.scroll = position();
    });
  }, {capture: true, passive: true});
})();
