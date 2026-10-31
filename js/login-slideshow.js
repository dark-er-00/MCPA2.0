/* Decorative media only. Authentication explicitly starts/stops this controller. */
(function () {
  'use strict';
  const host = document.getElementById('login-screen');
  const stage = document.getElementById('login-slideshow');
  const buttons = [...(host?.querySelectorAll('[data-login-step]') || [])];
  if (!stage || buttons.length !== 2) return;
  // Resolve from this script, including /MCPA/ and /MCPA/2-engr/ entry points.
  const directory = new URL('../images/login-slideshow/', document.currentScript.src);
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const compact = matchMedia('(max-width: 900px), (max-width: 1200px) and (max-aspect-ratio: 3/2)');
  const FADE = 650;
  // Project identity stays independent of its position in the manual gallery.
  const projects = [10, 1, 2, 3, 4, 5, 6, 7, 8, 9];
  const firstLayer = stage.querySelector('.login-slide');
  const layers = [firstLayer, firstLayer.cloneNode(true)];
  layers[1].style.opacity = '0';
  layers[1].querySelector('picture').replaceWith(document.createElement('img'));
  layers[1].querySelector('img').className = 'login-photo';
  layers[1].querySelector('img').alt = '';
  stage.append(layers[1]);
  const mobilePhoto = stage.querySelector('.login-mobile-photo');
  for (const image of [...layers.map(layer => layer.querySelector('img')), mobilePhoto]) {
    image.addEventListener('error', () => { image.style.visibility = 'hidden'; });
    if (image.complete && !image.naturalWidth) image.style.visibility = 'hidden';
  }
  const cache = new Map();
  let visible = true, ready = false, slot = 0, index = 0;
  let generation = 0, advancing = false;
  let fade = null;
  const navigable = () => visible && ready && !host.hidden && !host.classList.contains('hidden') && !document.hidden && !compact.matches;
  const url = (number, extension) => new URL(`project-${projects[number]}.${extension}`, directory).href;
  function load(number) {
    if (cache.has(number)) return cache.get(number);
    const pending = (async () => {
      for (const extension of projects[number] === 10 ? ['jpg'] : ['webp', 'png']) {
        const image = new Image();
        image.decoding = 'async';
        try {
          await new Promise((resolve, reject) => {
            const timeout = setTimeout(() => { image.onload = image.onerror = null; reject(new Error('Image timeout')); }, 10000);
            image.onload = () => { clearTimeout(timeout); resolve(); };
            image.onerror = () => { clearTimeout(timeout); reject(new Error('Image unavailable')); };
            image.src = url(number, extension);
          });
          await image.decode();
          return image;
        } catch (_) { /* Try the preserved PNG, then skip this photograph. */ }
      }
      return null;
    })();
    cache.set(number, pending);
    return pending;
  }
  function prepare(layer, image, number) {
    // Insert the actual decoded node. Reassigning its URL to a different async
    // image can start another decode and leave a blank frame during a crossfade.
    // Replacing the initial picture also removes sources that override PNG fallback.
    image.className = 'login-photo';
    image.alt = '';
    layer.querySelector('.login-scene').replaceChildren(image);
    layer.dataset.project = String(projects[number]);
  }
  function updateCounter() {
    host.querySelector('[data-login-number]').textContent = String(index + 1).padStart(2, '0');
    host.querySelector('[data-login-counter]').setAttribute('aria-label', `Photograph ${index + 1} of ${projects.length}`);
    host.querySelector('[data-login-progress]').style.transform = `scaleX(${(index + 1) / projects.length})`;
  }
  async function advance(direction) {
    // Ignore overlapping loads/fades rather than reusing a layer mid-transition.
    if (!navigable() || advancing || (fade && fade.playState !== 'finished')) return;
    const revision = generation;
    advancing = true;
    try {
      for (let step = 1; step < projects.length; step++) {
        const next = (index + direction * step + projects.length) % projects.length;
        const image = await load(next);
        if (revision !== generation || !navigable()) return;
        if (!image) continue;
        const previous = layers[slot];
        slot = 1 - slot;
        const incoming = layers[slot];
        prepare(incoming, image, next);
        // A delayed finish event from the last fade must not hide a reused layer.
        // This can happen when the browser suspends or defers animation frames.
        if (fade) { fade.onfinish = null; fade.cancel(); }
        previous.style.zIndex = '0';
        previous.style.opacity = '1';
        incoming.style.zIndex = '1';
        incoming.style.opacity = '1';
        // Fade over an opaque outgoing image, avoiding a dark dip midway.
        const transition = incoming.animate([{ opacity: 0 }, { opacity: 1 }], { duration: reducedMotion.matches ? 0 : FADE, easing: 'ease-in-out' });
        fade = transition;
        transition.onfinish = () => {
          if (fade === transition) {
            previous.style.opacity = '0'; incoming.style.opacity = '1';
            // A completed Animation can restart from zero when paused then played.
            // Retire it so visibility changes only resume an unfinished crossfade.
            transition.onfinish = null;
            transition.cancel();
            fade = null;
          }
        };
        index = next;
        stage.dataset.project = String(projects[index]);
        updateCounter();
        // Keep only the displayed and upcoming decoded images in our cache.
        for (const key of cache.keys()) if (key !== index) cache.delete(key);
        load((index + 1) % projects.length);
        return;
      }
    } finally {
      advancing = false;
      sync();
    }
  }
  function sync() {
    buttons.forEach(button => { button.hidden = compact.matches || !ready; });
    stage.dataset.paused = 'true'; // Compatibility: this gallery is always manual.
    if (reducedMotion.matches && fade) {
      fade.onfinish = null; fade.cancel(); fade = null;
      layers[slot].style.opacity = '1'; layers[1 - slot].style.opacity = '0';
    }
    if (navigable()) {
      if (fade?.playState === 'paused') fade.play();
      load((index + 1) % projects.length);
    } else fade?.pause();
  }
  buttons.forEach(button => button.addEventListener('click', () => advance(Number(button.dataset.loginStep))));
  document.addEventListener('visibilitychange', sync);
  reducedMotion.addEventListener('change', sync);
  compact.addEventListener('change', sync);
  // Also cover direct host hiding and back/forward-cache restoration.
  new MutationObserver(sync).observe(host, { attributes: true, attributeFilter: ['class', 'hidden'] });
  window.addEventListener('pagehide', () => { visible = false; ++generation; sync(); });
  window.addEventListener('pageshow', event => { visible = !host.classList.contains('hidden'); if(event.persisted) void reset(); sync(); });
  window.MCPALoginSlideshow = {
    show() { const returning = !visible; visible = true; if(returning) void reset(); sync(); },
    hide() { visible = false; ++generation; sync(); }
  };
  // The HTML already displays the high-priority first photo while JS initializes.
  async function reset() {
    const revision = ++generation;
    ready = false;
    delete stage.dataset.project;
    if(fade){fade.onfinish=null;fade.cancel();fade=null;}
    for (let first = 0; first < projects.length; first++) {
      const image = await load(first);
      if(revision !== generation) return;
      if (!image) continue;
      slot = 0;
      prepare(layers[0], image, first);
      layers[0].style.opacity = '1'; layers[0].style.zIndex = '1';
      layers[1].style.opacity = '0'; layers[1].style.zIndex = '0';
      // One deterministic image for this visit, independent of desktop slides and
      // authentication rerenders. Use the first successful source after failures.
      mobilePhoto.closest('picture').querySelector('source')?.remove();
      mobilePhoto.src = image.src;
      mobilePhoto.style.visibility = 'visible';
      mobilePhoto.dataset.project = String(projects[first]);
      index = first;
      stage.dataset.project = String(projects[first]);
      updateCounter();
      break;
    }
    ready = Boolean(stage.dataset.project);
    stage.dataset.unavailable = String(!ready);
    sync();
  }
  void reset();
})();
