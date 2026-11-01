/* Resolve application resources from this script, including hosted subpaths. */
(function () {
  'use strict';
  const root = new URL('../../', document.currentScript.src);
  window.MCPAPaths = Object.freeze({
    root: root.href,
    url: relative => new URL(relative, root),
    module: (portal, name) => new URL(`app/portals/${portal}/${name}/${name}`, root).href
  });
})();
