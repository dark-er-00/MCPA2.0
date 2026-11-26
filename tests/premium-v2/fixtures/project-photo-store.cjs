// Isolated, process-local photo storage. Uses only synthetic preview identities.
const {randomUUID,randomBytes,createHash,createHmac} = require('node:crypto');
const {loadImage} = require('@napi-rs/canvas');
const prefix = '/assets/images/project-photos/';
const maxBytes = 5 * 1024 * 1024;
const formats = {'image/png':'png','image/jpeg':'jpg','image/webp':'webp'};

module.exports = function photoStore(fixture) {
  const objects = new Map(), operations = new Map(), secret = randomBytes(32);
  const sign = (ref,key,until) => createHmac('sha256',secret).update(JSON.stringify([ref,key,until])).digest('hex');
  function eligible(id,key) {
    const person = fixture.actors[key];
    if (person?.account_status !== 'active' || id === fixture.sites.office.id) return false;
    return person.role === 'admin' || (['engineer','architect'].includes(person.role) && fixture.activeAssigned(person).some(row => row.id === id));
  }
  function decorate(value,key) {
    if (!value || typeof value !== 'object') return value;
    const ref = value.project_photo_url;
    if (typeof ref === 'string' && ref.startsWith(prefix)) {
      const until = Date.now()+3600000;
      if (objects.get(ref)?.id === value.id && eligible(value.id,key)) {
        value.project_photo_url = ref+'?'+new URLSearchParams({actor:key,until:String(until),ticket:sign(ref,key,until)});
      } else delete value.project_photo_url;
    }
    for (const child of Object.values(value)) if (typeof child === 'object') decorate(child,key);
    return value;
  }
  async function save(req,res,key,send) {
    const actor = fixture.actors[key];
    if (actor?.role !== 'admin' || actor.account_status !== 'active') return send(res,{error:'Admin access required.'},403);
    const chunks = []; let size = 0;
    for await (const chunk of req) {
      size += chunk.length;
      if (size > maxBytes + 65536) return send(res,{error:'Photo or form is too large.'},413);
      chunks.push(chunk);
    }
    const form = await new Response(Buffer.concat(chunks),{headers:{'Content-Type':req.headers['content-type']}}).formData();
    const file = form.get('photo'), args = JSON.parse(form.get('project'));
    if (!file || !Object.hasOwn(formats,file.type) || !file.size || file.size > maxBytes)
      return send(res,{error:'Choose a JPEG, PNG or WebP photo of up to 5 MB.'},400);
    const bytes = Buffer.from(await file.arrayBuffer());
    const type = bytes.subarray(0,8).toString('hex') === '89504e470d0a1a0a' ? 'image/png'
      : bytes.subarray(0,3).toString('hex') === 'ffd8ff' ? 'image/jpeg'
      : bytes.toString('ascii',0,4) === 'RIFF' && bytes.toString('ascii',8,12) === 'WEBP' ? 'image/webp' : null;
    if (type !== file.type) return send(res,{error:'Photo content does not match the selected format.'},400);
    try { const image = await loadImage(bytes); if (!image.width || !image.height) throw Error(); }
    catch { return send(res,{error:'Photo content could not be decoded.'},400); }
    if (!/^[a-f0-9-]{36}$/i.test(args.p_operation_id)) return send(res,{error:'Invalid save reference.'},400);
    const operation = actor.id+'/'+args.p_operation_id;
    const fingerprint = createHash('sha256').update(JSON.stringify(args)).update(bytes).digest('hex');
    const prior = operations.get(operation);
    if (prior && prior.fingerprint !== fingerprint) return send(res,{error:'Save reference already used.'},409);
    if (!prior) {
      const saved = fixture.handle(key,{rpc:'mcpa_save_project',args});
      if (saved.error) return send(res,{error:saved.error.message},400);
      const row = Object.values(fixture.sites).find(s=>s.id===saved.data.id);
      const ref = prefix+row.id+'/'+randomUUID()+'.'+formats[type];
      objects.set(ref,{id:row.id,type,bytes});
      row.project_photo_url = ref;
      operations.set(operation,{fingerprint,row:{...row}});
    }
    return send(res,decorate({...operations.get(operation).row},key));
  }
  return {decorate,async route(req,res,url,send) {
    if (url.pathname === '/__project-photo-save' && req.method === 'POST') {
      await save(req,res,req.headers.authorization,send); return true;
    }
    if (!url.pathname.startsWith(prefix)) return false;
    const ref = url.pathname, q = url.searchParams, key = q.get('actor'), until = Number(q.get('until'));
    const object = objects.get(ref);
    const current = object && Object.values(fixture.sites).find(s=>s.id===object.id);
    if (req.method !== 'GET' || !object || current?.project_photo_url !== ref || !eligible(object.id,key)
      || until <= Date.now() || q.get('ticket') !== sign(ref,key,until)) send(res,{error:'Photo unavailable.'},403);
    else { res.setHeader('Content-Type',object.type);res.end(object.bytes); }
    return true;
  }};
};
