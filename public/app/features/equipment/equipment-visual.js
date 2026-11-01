/* Code-native equipment symbols and status-derived tracking labels. */
(function () {
  'use strict';
  const drawings = {
    drill: '<path d="M4 7h12v6H4zM16 9h4M20 8v4M8 13l-1 8h5l1-8M3 8H1M6 5h6M6 10h3"/>',
    grinder: '<circle cx="16" cy="16" r="6"/><circle cx="16" cy="16" r="2"/><path d="M12 11L5 4 1 8l8 7M5 4l3-3M17 10V6M13 20l-3 2"/>',
    saw: '<path d="M3 5h6l2 3 11 10-2 3-3-1-2 1-2-3-2 1-2-3-2 1L3 9zM4 6l3 3 2-1-2-2z"/>',
    scaffold: '<path d="M4 2v20M20 2v20M4 5h16M4 12h16M4 19h16M5 6l14 12M19 6L5 18M1 22h6M17 22h6"/>',
    compressor: '<rect x="3" y="9" width="18" height="9" rx="4"/><path d="M7 9V5h6v4M10 5V2h5v4M21 12h2M7 18v2M17 18v2"/><circle cx="7" cy="21" r="1"/><circle cx="17" cy="21" r="1"/>',
    hammer: '<path d="M3 3h11l6 5-4 4-4-5H9v5H3zM9 12l-4 9 4 2 5-12"/>',
    equipment: '<rect x="2" y="7" width="20" height="15" rx="2"/><path d="M8 7V3h8v4M2 13h20M10 12v4h4v-4"/>'
  };
  function icon(name, category) {
    const text = `${name || ''} ${category || ''}`.toLowerCase();
    const key = /grind/.test(text) ? 'grinder' : /drill|barena/.test(text) ? 'drill' : /saw|cut/.test(text) ? 'saw' : /scaff|structur/.test(text) ? 'scaffold' : /compress|pump/.test(text) ? 'compressor' : /hammer|hand tool/.test(text) ? 'hammer' : 'equipment';
    return `<span class="equipment-symbol equipment-symbol-${key}" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${drawings[key]}</svg></span>`;
  }
  function roleGroup(value) {
    const role = String(value || '').trim().toLowerCase();
    if (['admin','administrator','boss','ceo','management'].includes(role)) return 'admin';
    if (['engineer','engr','architect'].includes(role)) return 'engineer';
    return null;
  }
  function thumbnail(tool) {
    const name = tool.name || tool.equipmentType || 'Equipment';
    const escape = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    let url = '', reference = '';
    try {
      const value = tool.image_url || tool.imageUrl;
      if (window.EquipmentPhotos?.pathFromReference(value)) reference = value;
      else if (value) {
        const parsed = new URL(value, location.href);
        if (['http:', 'https:'].includes(parsed.protocol)) url = parsed.href;
      }
    } catch (_) { /* Invalid image URLs use the tool symbol. */ }
    return `<span class="equipment-thumbnail"${reference ? ` data-equipment-photo="${escape(reference)}" data-photo-alt="${escape(name)}"` : ''}>${icon(name, tool.category || tool.cat)}${url ? `<img src="${escape(url)}" alt="${escape(name)}" loading="lazy" decoding="async">` : ''}</span>`;
  }
  document.addEventListener('error', event => {
    if (event.target.matches?.('.equipment-thumbnail img')) event.target.remove();
  }, true);
  window.EquipmentVisual = {icon, thumbnail, roleGroup, availability: tool => window.EquipmentTracking.availability(tool)};
})();
