/* Mountable, read-only preview for the existing import confirmation flow. */
(function(root,factory){
  'use strict';
  if(typeof module==='object'&&module.exports)module.exports=factory(require('./core.js'));
  else root.MCPAIndividualImportPreview=factory(root.MCPAIndividualImport);
})(globalThis,function(C){
  'use strict';
  if(!C)throw Error('Load the Individual import core before its preview.');
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function html(preview){
    if(!preview||!Array.isArray(preview.rows)||!Array.isArray(preview.errors))throw Error('Validate the worksheet before rendering its preview.');
    const errors=preview.errors.map(e=>`<li>${esc(e)}</li>`).join('');
    return `<section class="wa-import-preview" aria-label="Import quantity expansion preview">
      <h3>Review equipment records</h3>
      <p class="wa-import-summary" role="status" aria-live="polite"><strong>${esc(preview.spreadsheetRows)} spreadsheet rows</strong> will create <strong>${esc(preview.records)} equipment records</strong>.</p>
      <p>Individual quantities become separate physical assets, each with a generated Asset ID. Explicit Bulk quantities stay in one grouped record.</p>
      <dl class="wa-import-counts"><div><dt>Valid rows</dt><dd>${esc(preview.valid)}</dd></div><div><dt>Invalid rows</dt><dd>${esc(preview.invalid)}</dd></div><div><dt>Rows to review</dt><dd>${esc(preview.duplicates)}</dd></div></dl>
      ${errors?`<div class="wa-import-errors" role="alert"><strong>Fix these errors before confirming</strong><ul>${errors}</ul></div>`:''}
      ${preview.rows.length?`<div class="wa-import-scroll" tabindex="0" role="region" aria-label="Source rows and resulting records; scroll for all columns"><table><caption>Spreadsheet rows and resulting equipment records</caption><thead><tr><th scope="col">Source row</th><th scope="col">Item</th><th scope="col">Tracking</th><th scope="col">Provided quantity</th><th scope="col">Resulting records</th><th scope="col">Review</th></tr></thead><tbody>${preview.rows.map(row=>`<tr><th scope="row">${esc(row.data.source_row)}</th><td>${esc(row.data.name)}</td><td>${esc(row.data.tracking_type)}</td><td>${esc(row.data.quantity)}</td><td>${esc(row.records)}</td><td><strong class="${row.errors.length?'wa-import-error':''}">${row.errors.length?'Fix row':row.warnings.length?'Review warning':'Valid'}</strong>${row.errors.length||row.warnings.length?`<ul>${[...row.errors,...row.warnings].map(e=>`<li>${esc(e)}</li>`).join('')}</ul>`:''}</td></tr>`).join('')}</tbody></table></div>`:'<p>No equipment rows to preview. Choose a worksheet containing equipment.</p>'}
      <p class="wa-import-decision">${preview.canConfirm?'All rows pass validation. Review warnings before continuing to confirmation.':'Import is blocked. Correct all validation errors and validate the worksheet again.'}</p>
      <p class="wa-import-limits">Limits: 2 MiB upload; 500 spreadsheet rows; 50 columns; 500 resulting records; 2 MiB original and expanded row data. No rows are skipped.</p>
    </section>`;
  }
  function render(host,preview){
    if(!host||typeof host.innerHTML!=='string')throw Error('Provide a preview container element.');
    host.innerHTML=html(preview);return preview.canConfirm;
  }
  return {html,render};
});
