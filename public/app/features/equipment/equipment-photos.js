/* Private equipment photos: immutable uploads and short-lived, authorized display URLs. */
(function () {
  'use strict';
  const bucket = 'equipment-photos', prefix = 'storage://' + bucket + '/';
  const maxBytes = 5 * 1024 * 1024, types = {'image/jpeg':'jpg','image/png':'png','image/webp':'webp'};
  const cache = new Map(), inFlight = new Map();
  let sessionKey = null;
  function identity(admin = false) {
    const user = window.MCPAAuth?.requireLive();
    if (!user || (admin && user.role !== 'admin')) throw new Error('Only an active Admin account can save equipment photos.');
    if (sessionKey !== user.id) { cache.clear(); inFlight.clear(); sessionKey = user.id; }
    return user;
  }
  function pathFromReference(reference) {
    if (typeof reference !== 'string' || !reference.startsWith(prefix)) return null;
    const path = reference.slice(prefix.length);
    return /^[A-Za-z0-9_-]{1,120}\/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\.(jpg|png|webp)$/i.test(path) ? path : null;
  }
  async function validate(file) {
    if (!file || !types[file.type]) throw new Error('Choose a JPEG, PNG, or WebP photo.');
    if (!Number.isFinite(file.size) || file.size <= 0 || file.size > maxBytes) throw new Error('Choose a photo between 1 byte and 5 MB.');
    const bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer());
    const png = [137,80,78,71,13,10,26,10].every((value,index) => bytes[index] === value);
    const jpeg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
    const webp = String.fromCharCode(...bytes.slice(0,4)) === 'RIFF' && String.fromCharCode(...bytes.slice(8,12)) === 'WEBP';
    if (!(file.type === 'image/png' && png || file.type === 'image/jpeg' && jpeg || file.type === 'image/webp' && webp)) throw new Error('The selected file is not a valid JPEG, PNG, or WebP photo.');
    return file;
  }
  async function prepare(file, assetId, previous = null) {
    const user = identity(true);
    await validate(file);
    if (!assetId || !String(assetId).trim()) throw new Error('Save the photo with a valid equipment ID.');
    // Reuse the staged upload after a metadata error; keep the existing photo untouched.
    const sameUpload = previous?.file === file && previous.assetId === assetId && previous.ownerId === user.id;
    if (sameUpload && previous.uploaded !== false) return previous;
    // Storage paths use safe identifiers; unusual legacy IDs still associate
    // through equipment.image_url without depending on URL percent decoding.
    const folder = /^[A-Za-z0-9_-]{1,120}$/.test(String(assetId)) ? String(assetId) : 'asset-' + crypto.randomUUID();
    const path = sameUpload ? previous.path : folder + '/' + crypto.randomUUID() + '.' + types[file.type];
    const staged = sameUpload ? previous : {file,assetId,ownerId:user.id,path,reference:prefix + path,uploaded:false};
    const failure = message => Object.assign(new Error(message),{staged});
    if (sameUpload && staged.uncertain) {
      // A dropped upload response can still mean the immutable object exists.
      // Reconcile that exact path instead of creating a second file.
      try {
        const check = await window.EquipmentTracking.client().storage.from(bucket).createSignedUrl(path,60);
        if (!check.error && check.data?.signedUrl) { identity(true); staged.uploaded = true; return staged; }
      } catch (_) { /* The normal upload will report a genuine access/network failure. */ }
    }
    let result;
    try { result = await window.EquipmentTracking.client().storage.from(bucket).upload(path, file, {contentType:file.type,cacheControl:'3600',upsert:false}); }
    catch (_) { staged.uncertain = true; throw failure('Photo upload could not complete. Your item has not been saved. Check your connection and retry.'); }
    if (result.error) throw failure('Photo upload failed. Check your connection and that equipment photo storage is installed, then retry. Your item has not been saved.');
    if (identity(true).id !== user.id) throw failure('Your account changed during the upload. Sign in again before saving the item.');
    staged.uploaded = true;
    return staged;
  }
  async function checkSchema() {
    identity(true);
    const {error} = await window.EquipmentTracking.client().from('equipment').select('image_url').limit(0);
    if (error) {
      if (['42703','PGRST204'].includes(error.code)) throw new Error('Equipment photo setup is missing. Ask your administrator to complete equipment photo setup, then retry. Your form and selected photo have been kept.');
      throw new Error('Equipment photo access could not be verified. Check your connection and retry. ' + error.message);
    }
  }
  async function discard(staged) {
    const user = identity(true);
    const path = pathFromReference(staged?.reference);
    if (!path || staged.ownerId !== user.id) throw new Error('Sign in with the uploading account to clear the pending photo.');
    const {error} = await window.EquipmentTracking.client().storage.from(bucket).remove([path]);
    // RLS permits deleting unlinked uploads only; a committed image is protected
    // even when its save response was lost. Never delete equipment to compensate.
    if (error) throw new Error('The pending photo could not be cleared. Check your connection and retry Cancel. Your form has been kept.');
  }
  async function resolve(reference) {
    const path = pathFromReference(reference);
    if (!path) return null;
    const user = identity();
    const key = user.id + ':' + path;
    const saved = cache.get(key);
    if (saved && saved.expires > Date.now()) return saved.url;
    if (inFlight.has(key)) return inFlight.get(key);
    const pending = (async () => {
      const {data,error} = await window.EquipmentTracking.client().storage.from(bucket).createSignedUrl(path, 3600);
      if (error || !data?.signedUrl) throw new Error('The saved photo could not load.');
      if (identity().id !== user.id) throw new Error('Your account changed while loading the photo.');
      cache.set(key,{url:data.signedUrl,expires:Date.now() + 50 * 60 * 1000});
      return data.signedUrl;
    })();
    inFlight.set(key,pending);
    try { return await pending; } finally { inFlight.delete(key); }
  }
  function hydrate(root = document) {
    const targets = [...(root.matches?.('[data-equipment-photo]') ? [root] : []), ...root.querySelectorAll('[data-equipment-photo]')];
    targets.forEach(target => {
      const reference = target.dataset.equipmentPhoto;
      resolve(reference).then(url => {
        if (!url || !target.isConnected || target.dataset.equipmentPhoto !== reference) return;
        let img = target.querySelector('img');
        if (!img) { img = document.createElement('img'); img.alt = target.dataset.photoAlt || 'Equipment photo'; img.loading='lazy'; img.decoding='async'; target.append(img); }
        if (img.src !== url) img.src = url;
        target.removeAttribute('title');
      }).catch(() => { if (target.isConnected) target.title = 'Photo unavailable. The equipment details remain available.'; });
    });
  }
  window.EquipmentPhotos = {bucket, maxBytes, validate, prepare, checkSchema, discard, resolve, pathFromReference, hydrate};
  if (typeof MutationObserver === 'function') {
    const observer = new MutationObserver(records => records.forEach(record => record.addedNodes.forEach(node => {if (node.nodeType === 1) hydrate(node);} )));
    observer.observe(document.body,{childList:true,subtree:true});
    window.addEventListener('pagehide',() => observer.disconnect(),{once:true});
  }
  // Refresh expiring signed images while a details page stays open.
  const interval = setInterval(() => { if (!document.hidden && window.MCPAAuth?.profile && !window.MCPAAuth.isDemo) hydrate(); },60000);
  window.addEventListener('pagehide',() => clearInterval(interval),{once:true});
})();
