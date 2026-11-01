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
    return nativeFetch(url, options);
  }
  window.MCPAServer = Object.freeze({fetch:serverFetch, options:Object.freeze({global:Object.freeze({fetch:serverFetch})})});
})();
