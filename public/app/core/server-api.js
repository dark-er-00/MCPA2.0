/* Preserve the Supabase SDK contract while PHP processes HTTP requests. */
(function () {
  'use strict';
  const endpoint = window.MCPAPaths.url('api/index.php');
  const upstream = new URL(window.MCPA_CONFIG.supabaseUrl);
  const nativeFetch = window.fetch.bind(window);
  async function serverFetch(input, init) {
    const request = new Request(input, init);
    const target = new URL(request.url);
    if (target.origin !== upstream.origin || !/^\/(?:auth|rest|storage|functions)\/v1\//.test(target.pathname)) {
      throw new Error('The request does not belong to this application data service.');
    }
    const url = new URL(endpoint);
    url.searchParams.set('route', target.pathname + target.search);
    const headers = new Headers(request.headers);
    headers.set('X-MCPA-Request', '1');
    // Preserve JSON bytes, operation IDs, response codes, Content-Range and
    // cancellation. PHP drops unnamed multipart fields, so name the SDK file.
    const options = {method:request.method, headers, credentials:'same-origin', signal:request.signal, cache:'no-store'};
    if (!['GET','HEAD'].includes(request.method)) {
      if (headers.get('content-type')?.startsWith('multipart/form-data')) {
        const form = await request.formData(), normalized = new FormData();
        for (const [name, value] of form) normalized.append(name || 'file', value);
        headers.delete('content-type');
        options.body = normalized;
      } else options.body = await request.arrayBuffer();
    }
    const response = await nativeFetch(url, options);
    // Static preview servers can return HTML or raw PHP instead of running it.
    // Keep an actionable error inside the SDK's normal JSON response contract.
    if (response.headers.get('x-mcpa-backend') !== 'php' &&
        ([404,405].includes(response.status) || /(?:text\/html|(?:x-httpd-|x-)php)/i.test(response.headers.get('content-type') || ''))) {
      return new Response(JSON.stringify({code:'MCPA_HOSTING', error_code:'MCPA_HOSTING',
        message:'Open the application through its PHP server. For local use, run npm start and open http://127.0.0.1:4173.'}),
      {status:500, headers:{'content-type':'application/json'}});
    }
    return response;
  }
  window.MCPAServer = Object.freeze({fetch:serverFetch, options:Object.freeze({global:Object.freeze({fetch:serverFetch})})});
})();
