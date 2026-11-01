/* Workstream A: additive quantity requests. No equipment writes outside transactional RPCs. */
(function (scope, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else scope.MCPAQuantityRequests = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';
  const RPC = Object.freeze({
    catalog: 'mcpa_wa_equipment_catalog', history: 'mcpa_wa_equipment_requests',
    submit: 'mcpa_wa_submit_equipment', suggest: 'mcpa_wa_suggest_equipment',
    allocate: 'mcpa_wa_allocate_equipment', reject: 'mcpa_wa_reject_equipment'
  });
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const MAX_REQUEST_QUANTITY = 100;
  function quantity(value) {
    if (typeof value !== 'number' && typeof value !== 'string') throw new Error('Enter a whole quantity of at least 1.');
    if (typeof value === 'string' && !/^[1-9]\d*$/.test(value.trim())) throw new Error('Enter a whole quantity of at least 1.');
    const result = Number(value);
    if (!Number.isSafeInteger(result) || result < 1) throw new Error('Enter a whole quantity of at least 1.');
    return result;
  }
  function count(value) {
    if (value === null || value === undefined || value === '') return null;
    if (typeof value !== 'number' && typeof value !== 'string') return null;
    if (typeof value === 'string' && !/^\d+$/.test(value.trim())) return null;
    const result = Number(value);
    return Number.isSafeInteger(result) && result >= 0 ? result : null;
  }
  function operationId() {
    if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
    if (!globalThis.crypto?.getRandomValues) throw new Error('A secure browser context is required to submit requests.');
    const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 15) | 64; bytes[8] = (bytes[8] & 63) | 128;
    const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }
  function id(value, label) {
    if (typeof value !== 'string' || !UUID.test(value)) throw new Error(`Choose a valid ${label}.`);
    return value;
  }
  function normalizedCatalog(data) {
    if (!data || !Array.isArray(data.groups) || !Array.isArray(data.sites) || !data.profile?.role) {
      throw new Error('Inventory could not be verified. Refresh or ask Admin to check the Workstream A migration.');
    }
    const seen = new Set();
    // Compatibility is decided on the server. Never merge groups by display name.
    const groups = data.groups.map(raw => {
      if (typeof raw.type_id !== 'string' || !raw.type_id || seen.has(raw.type_id)) throw new Error('Inventory returned an invalid equipment type. Refresh before requesting.');
      seen.add(raw.type_id);
      const result = { ...raw };
      for (const key of ['available_quantity', 'reserved_quantity', 'deployed_quantity', 'physical_records']) result[key] = count(raw[key]);
      result.requestable = raw.requestable === true && String(raw.tracking_type).toLowerCase() === 'individual' && result.available_quantity !== null;
      return Object.freeze(result);
    });
    return { groups, sites: data.sites.map(site => ({ ...site })), profile: { ...data.profile } };
  }
  function validateRequest(input, catalog) {
    const group = catalog.groups.find(item => item.type_id === input.typeId);
    if (!group?.requestable) throw new Error('Choose an eligible individual equipment type. Grouped Bulk is unavailable in this quantity workflow.');
    const requested = quantity(input.quantity);
    if (requested > MAX_REQUEST_QUANTITY) throw new Error('Request up to 100 individual assets per submission.');
    if (requested > group.available_quantity) throw new Error(`Only ${group.available_quantity} are currently available. Refresh stock or reduce the quantity.`);
    id(input.siteId, 'project / site');
    if (!catalog.sites.some(site => site.id === input.siteId)) throw new Error('Choose one of your assigned active projects / sites.');
    const purpose = String(input.purpose ?? '').trim();
    if (purpose.length > 2000) throw new Error('Keep the purpose to 2,000 characters or fewer.');
    return { typeId: group.type_id, siteId: input.siteId, quantity: requested, purpose };
  }
  function validateAllocation(assetIds, requestedQuantity, eligibleAssets) {
    const requested = quantity(requestedQuantity);
    if (!Array.isArray(assetIds) || assetIds.length !== requested) throw new Error(`Select exactly ${requested} distinct Asset IDs to approve this request.`);
    const distinct = new Set(assetIds);
    if (distinct.size !== requested) throw new Error('An Asset ID can only be selected once.');
    const eligible = new Set(eligibleAssets.map(asset => asset.id));
    for (const asset of assetIds) {
      id(asset, 'physical asset');
      if (!eligible.has(asset)) throw new Error('A selected asset is no longer eligible. Refresh the proposed allocation.');
    }
    return [...assetIds];
  }
  function createClient(supabase, options = {}) {
    if (!supabase || typeof supabase.rpc !== 'function') throw new Error('Pass the authenticated Supabase client.');
    let snapshot = null;
    const retryKeys = new Map();
    let storage = options.storage;
    if (storage === undefined) { try { storage = globalThis.sessionStorage; } catch (_) { storage = null; } }
    async function rpc(name, args = {}) {
      let response;
      try { response = await supabase.rpc(name, args); }
      catch (_) { throw new Error('The server could not be reached. Retry the same action to check whether it completed.'); }
      if (response?.error) {
        const error = new Error(response.error.message || 'The action could not be completed. Refresh and try again.');
        error.code = response.error.code;
        throw error;
      }
      if (!response || response.data === undefined || response.data === null) throw new Error('The server returned no result. Retry the same action to check whether it completed.');
      return response.data;
    }
    function role(allowed) {
      if (!snapshot) throw new Error('Refresh inventory before continuing.');
      if (!allowed.includes(snapshot.profile.role)) throw new Error('Your account role cannot perform this action.');
    }
    async function write(name, args, explicitId) {
      // Persist only a SHA-256 payload fingerprint and UUID, scoped to the authenticated profile.
      // This allows the same uncertain action to be retried after a route remount or tab reload.
      const actorId = snapshot.profile.id;
      const signature = actorId + ':' + name + JSON.stringify(args);
      let fingerprint = signature;
      if (globalThis.crypto?.subtle) {
        const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(signature));
        fingerprint = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
      }
      const storageKey = 'mcpa.wa.quantity.pending.' + actorId;
      let persisted = {};
      if (storage && fingerprint !== signature) {
        try { persisted = JSON.parse(storage.getItem(storageKey) || '{}'); if (!persisted || typeof persisted !== 'object' || Array.isArray(persisted)) persisted = {}; } catch (_) { persisted = {}; }
      }
      const persist = value => {
        if (storage && fingerprint !== signature) {
          try {
            let latest = JSON.parse(storage.getItem(storageKey) || '{}');
            if (!latest || typeof latest !== 'object' || Array.isArray(latest)) latest = {};
            if (value) latest[fingerprint] = value; else delete latest[fingerprint];
            storage.setItem(storageKey, JSON.stringify(latest));
          } catch (_) { /* In-memory retry remains available. */ }
        }
      };
      let key = explicitId || retryKeys.get(fingerprint) || (UUID.test(persisted[fingerprint]) ? persisted[fingerprint] : null);
      if (!key) key = (options.operationId || operationId)();
      id(key, 'operation identifier');
      retryKeys.set(fingerprint, key); persist(key);
      const result = await rpc(name, { p_operation_id: key, ...args });
      retryKeys.delete(fingerprint); persist(null);
      return result;
    }
    return Object.freeze({
      async catalog() { snapshot = normalizedCatalog(await rpc(RPC.catalog)); return snapshot; },
      async history() {
        const records = await rpc(RPC.history);
        if (!Array.isArray(records)) throw new Error('Request history could not be read. Refresh and try again.');
        return records;
      },
      async submit(input) {
        role(['engineer', 'architect']);
        const valid = validateRequest(input, snapshot);
        return write(RPC.submit, { p_type_id: valid.typeId, p_site_id: valid.siteId, p_quantity: valid.quantity, p_purpose: valid.purpose }, input.operationId);
      },
      async suggest(requestId) {
        role(['admin']); id(requestId, 'request');
        const result = await rpc(RPC.suggest, { p_request_id: requestId });
        if (!Array.isArray(result.eligible_assets) || !Array.isArray(result.suggested_asset_ids)) throw new Error('Eligible Asset IDs could not be verified. Refresh this request.');
        return result;
      },
      async allocate(input) {
        role(['admin']); id(input.requestId, 'request');
        const assetIds = validateAllocation(input.assetIds, input.requestedQuantity, input.eligibleAssets);
        return write(RPC.allocate, { p_request_id: input.requestId, p_asset_ids: assetIds }, input.operationId);
      },
      async reject(input) {
        role(['admin']); id(input.requestId, 'request');
        const reason = String(input.reason ?? '').trim();
        if (!reason || reason.length > 2000) throw new Error('Enter a rejection reason of 1 to 2,000 characters.');
        return write(RPC.reject, { p_request_id: input.requestId, p_reason: reason }, input.operationId);
      }
    });
  }
  return Object.freeze({ RPC, MAX_REQUEST_QUANTITY, quantity, count, operationId, normalizedCatalog, validateRequest, validateAllocation, createClient });
});
