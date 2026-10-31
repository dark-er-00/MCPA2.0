/* Shared live repository. Demo data is used only after an explicit mode change. */
(function () {
  'use strict';
  const empty = () => ({version: 1, revision: 0, tools: [], sites: [], users: [], requests: [], transfers: [], returns: [], repairs: [], missing: [], activity: []});
  let state = empty(), ready = false, loading = null, saving = false, stale = false, availabilityError = false;
  let mode = 'live';
  const pending = new Map();
  const clone = value => JSON.parse(JSON.stringify(value));
  let revision = 0;
  const notify = () => window.dispatchEvent(new CustomEvent('mcpa:movement-change'));
  function client() {
    if (!window.supabaseClient) {
      if (!window.supabase?.createClient) throw new Error('The database connection could not load. Check your connection and refresh, or explicitly open demo data.');
      window.supabaseClient = window.supabase.createClient('https://zpqxlmiqwevhlstjirei.supabase.co', 'sb_publishable_RgF8h8rkushKhKIm6iGJ4g_HH02YW58');
    }
    return window.supabaseClient;
  }
  function explain(error) {
    if (['PGRST202', 'PGRST205', '42P01', '42883'].includes(error?.code)) return new Error('Movement storage is not configured. Ask your administrator to follow supabase/AUTH-DEPLOYMENT.md, then refresh.');
    if (error?.code === '42501') return new Error('Your account is not permitted to perform this operation. Sign in again or contact your administrator.');
    if (['22023','40001'].includes(error?.code)) return new Error(error.message);
    return new Error('Movement records could not be loaded or saved. Your form has been kept; check your connection and retry.');
  }
  function context() {
    const user = window.MCPAAuth?.profile;
    if (!user) return {role:null,name:'',id:null};
    return {role:user.role,name:user.name,id:user.id};
  }
  async function refresh() {
    if (mode === 'demo') {
      window.MovementDemoStore.activate();
      return window.MovementDemoStore.refresh();
    }
    window.MCPAAuth.requireLive();
    const requestRevision = revision;
    if (loading) return loading;
    loading = (async () => {
      const {data, error} = await client().rpc('mcpa_movement_snapshot');
      if (error) throw explain(error);
      if (!data || !Array.isArray(data.tools) || !Array.isArray(data.requests)) throw new Error('The movement database returned an invalid snapshot. Refresh after checking the setup.');
      // Ignore a live response after the user has switched to demo mode.
      if (mode !== 'live' || requestRevision !== revision) return clone(state);
      const next = {...empty(), ...data, availabilityLoaded: true};
      const changed = JSON.stringify(next) !== JSON.stringify(state);
      state = next; ready = true; stale = false;
      const recovered = availabilityError;
      availabilityError = false;
      TOOLS.splice(0, TOOLS.length, ...clone(state.tools));
      if (changed || recovered) notify();
      return clone(state);
    })();
    try { return await loading; }
    catch (error) {
      if (mode === 'live' && requestRevision === revision) { availabilityError = true; notify(); }
      throw error;
    } finally { if (requestRevision === revision) loading = null; }
  }
  async function mutate(action, payload) {
    if (!window.MCPAAuth?.canAction(action)) throw new Error('This action is not permitted for your account.');
    if (mode === 'demo') return window.MovementDemoStore[action](...payload.args);
    window.MCPAAuth.requireLive();
    const requestRevision = revision;
    if (saving) throw new Error('A movement is already saving. Please wait.');
    if (stale) throw new Error('A movement was saved, but the latest records could not load. Refresh before making another change.');
    if (action === 'createRequest' && availabilityError) throw new Error('The latest inventory verification failed. Refresh before requesting equipment.');
    if (!ready) await refresh();
    if (requestRevision !== revision) throw new Error('Your session changed. Sign in again before continuing.');
    const actor = context();
    if (!actor.id) throw new Error('Sign in to record a movement.');
    const values = {...payload.values};
    const key = JSON.stringify([action, values]);
    if (!pending.has(key)) pending.set(key, crypto.randomUUID());
    saving = true;
    try {
      const {data, error} = await client().rpc('mcpa_movement_action', {p_action: action, p_payload: values, p_operation_id: pending.get(key)});
      if (requestRevision !== revision) throw new Error('Your session changed. Check the saved records after signing in again.');
      if (error) throw explain(error);
      // A background read may have started before this write. Finish it first,
      // then fetch the committed result instead of reusing its older snapshot.
      try { if (loading) await loading.catch(() => {}); await refresh(); }
      catch (error) { if (requestRevision === revision) stale = true; throw new Error('Saved successfully, but the updated records could not load. Refresh before continuing. ' + error.message); }
      if (requestRevision !== revision) throw new Error('Your session changed. Check the saved records after signing in again.');
      pending.delete(key);
      return data;
    } finally { if (requestRevision === revision) saving = false; }
  }
  const api = {
    get mode() { return mode; },
    getState() { return mode === 'demo' ? window.MovementDemoStore.getState() : {...clone(state), ...(availabilityError ? {availabilityError:true} : {})}; },
    getContext: context,
    async returnDestination() {
      if (mode === 'demo') return window.MovementDemoStore.returnDestination();
      window.MCPAAuth.requireLive();
      const {data,error} = await client().rpc('mcpa_return_destination');
      if (error) {
        if (['PGRST202','42883','42P01'].includes(error.code)) throw new Error('Office returns are not configured yet. Contact Admin.');
        throw explain(error);
      }
      if (!data?.id || typeof data.name !== 'string' || !data.name.trim()) throw new Error('The Office destination could not be verified. Contact Admin.');
      return data;
    },
    async initialize() { if (mode === 'demo') return window.MovementDemoStore.activate(); return ready ? clone(state) : refresh(); },
    refresh,
    clear() {
      ++revision; loading = null; ready = false; saving = false; stale = false; availabilityError = false; state = empty(); pending.clear();
      window.MovementDemoStore.deactivate(); mode='live';
      TOOLS.splice(0,TOOLS.length);
    },
    async useLive() { api.clear(); return clone(state); },
    async useDemo() { api.clear(); mode='demo'; window.MovementDemoStore.activate(); return api.getState(); },
    async setMode(value) {
      if (value !== mode) throw new Error('Exit this workspace before changing between demo and company data.');
      return refresh();
    },
    findTransfer(code) {
      if (mode === 'demo') return window.MovementDemoStore.findTransfer(code);
      const value = String(code || '').trim().toUpperCase();
      return clone(state.transfers.find(t => t.id === value || t.code === value) || null);
    },
    resolveQr(value) {
      if (mode === 'demo') return window.MovementDemoStore.resolveQr(value);
      const code = String(value || '').trim();
      const actor = context();
      const addressed = transfer => transfer.receiverId === actor.id;
      const transfer = api.findTransfer(code);
      if (transfer) {
        if (!addressed(transfer)) throw new Error('Only the named receiver can confirm this handover.');
        return {kind: 'transfer', transfer};
      }
      const assets = state.tools.filter(tool => tool.id === code);
      if (assets.length !== 1) throw new Error('No unique equipment tag or transfer matches this code. Scan the original tag or enter its exact ID.');
      const asset = assets[0];
      const matches = state.transfers.filter(record => record.status === 'pending' && record.toolIds.includes(asset.id) && addressed(record));
      if (matches.length > 1) throw new Error('This equipment has multiple pending handovers. Use the transfer reference and ask Admin to review the conflict.');
      return matches.length ? {kind: 'transfer', transfer: clone(matches[0]), asset: clone(asset)} : {kind: 'asset', asset: clone(asset), reason: 'No pending handover is addressed to you. Equipment details are available; scanning does not change custody.'};
    }
  };
  ['createRequest', 'createTransfer', 'createReturn', 'reportRepair', 'reportMissing'].forEach(action => {
    api[action] = values => mutate(action, {values, args: [values]});
  });
  ['approveRequest', 'releaseRequest', 'startRepair'].forEach(action => {
    api[action] = id => mutate(action, {values: {id}, args: [id]});
  });
  api.rejectRequest = (id, reason) => mutate('rejectRequest', {values: {id, reason}, args: [id, reason]});
  // Cancellation stays behind canAction and the authenticated database gateway.
  // A retained operation UUID makes a network retry reuse the same transaction.
  ['withdrawRequest', 'cancelReservation', 'cancelTransfer', 'refuseTransfer', 'reopenTransfer'].forEach(action => {
    api[action] = (id, values = {}) => mutate(action, {
      values: {id, reason: values.reason, confirmed: values.confirmed === true, ...(action === 'refuseTransfer' ? {inspections: values.inspections} : {})},
      args: [id, values]
    });
  });
  ['receiveTransfer', 'completeRepair', 'recoverMissing'].forEach(action => {
    api[action] = (id, values = {}) => mutate(action, {values: {id, ...values}, args: [id, values]});
  });
  window.MovementStore = api;
  // Active modules own focus/reconnect/polling through EquipmentTracking.watch.
  // Keeping a second global focus reader here would fetch the same snapshot twice.
})();
