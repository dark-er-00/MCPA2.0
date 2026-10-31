/* Local, read-only PDF reports. Callers supply their existing authorized rows. */
(function () {
  'use strict';
  const assets = new URL('../vendor/pdf/', document.currentScript.src);
  const zone = 'Asia/Manila';
  let libraries, active = false;
  const dateKey = value => new Intl.DateTimeFormat('en-CA', {timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit'}).format(new Date(value));
  const dateTime = value => window.MCPADisplay.dateTime(value) + ' PHT (UTC+08:00)';
  const icon = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M12 3v12m-5-5 5 5 5-5M5 16v5h14v-5"/></svg>';
  const activityColumns = ['Date / time · Manila','Action','Reference ID','Recorded by','Equipment IDs','Details'];
  function activityRows(records, data) {
    return records.map(record => {
      const event = window.MCPADisplay.activity(record, data);
      return [dateTime(record.createdAt), event.title, event.reference, event.actor,
        (record.toolIds || []).map(id => window.MCPADisplay.reference(id, 'Equipment reference unavailable')).join(', '), event.description];
    });
  }
  function script(name) {
    return new Promise((resolve, reject) => {
      const element = document.createElement('script');
      element.src = new URL(name, assets).href;
      element.onload = resolve;
      element.onerror = () => { element.remove(); reject(new Error('PDF resources could not load. Reload SiteTrace and try again.')); };
      document.head.appendChild(element);
    });
  }
  function prepare() {
    if (!libraries) libraries = (async () => {
      if (!window.jspdf) await script('jspdf.umd.min.js');
      if (!window.jspdf.jsPDF.API.autoTable) await script('jspdf.plugin.autotable.min.js');
      if (!window.SiteTracePDFFonts) await script('noto-sans.js');
    })().catch(error => { libraries = null; throw error; });
    return libraries;
  }
  function create(report, generatedAt = new Date()) {
    const landscape = report.columns.length > 4;
    const doc = new window.jspdf.jsPDF({orientation: landscape ? 'landscape' : 'portrait', format: 'a4', unit: 'mm', compress: true, putOnlyUsedFonts: true});
    for (const style of ['normal', 'bold']) {
      const file = 'NotoSans-' + style + '.ttf';
      doc.addFileToVFS(file, window.SiteTracePDFFonts[style]);
      doc.addFont(file, 'SiteTrace', style);
    }
    doc.setFont('SiteTrace', 'normal');
    doc.setProperties({title: report.title, subject: 'SiteTrace / MCPA report', author: 'MCPA Build Right Corp.', creator: 'SiteTrace'});
    doc.setCreationDate(new Date(generatedAt));
    const width = doc.internal.pageSize.getWidth(), height = doc.internal.pageSize.getHeight();
    const margin = 14, usable = width - margin * 2;
    const glyph = doc.getFont().metadata.characterToGlyph.bind(doc.getFont().metadata);
    let escapedGlyphs = false;
    // Never silently drop a character absent from the embedded font. Preserve
    // its exact code point with an explicit notation explained in the report.
    const text = value => Array.from(String(value ?? '')).map(char => {
      if (char === '\n' || char === '\r' || char === '\t' || glyph(char.codePointAt(0))) return char;
      escapedGlyphs = true;
      return '[U+' + char.codePointAt(0).toString(16).toUpperCase().padStart(4, '0') + ']';
    }).join('');
    const rows = report.rows.map(row => row.map(text));
    const metadata = [
      'Generated: ' + dateTime(generatedAt),
      ...(report.filters || []).map(text),
      'Records: ' + rows.length + ' · All matching records'
    ];
    if (escapedGlyphs) metadata.push('Characters outside the embedded font are preserved as [U+XXXX] Unicode code points.');
    const headedPages = new Set();
    const header = () => {
      const page = doc.internal.getCurrentPageInfo().pageNumber;
      if (headedPages.has(page)) return;
      headedPages.add(page);
      doc.setFont('SiteTrace','bold').setTextColor(32,35,40).setFontSize(11);
      doc.text('SiteTrace / MCPA',margin,14);
      doc.setFont('SiteTrace','normal').setFontSize(9);
      doc.text('MCPA Build Right Corp.',width-margin,14,{align:'right'});
      doc.setFont('SiteTrace','bold').setFontSize(18);
      doc.text(report.title,margin,26);
      doc.setDrawColor(160,124,45).setLineWidth(0.6).line(margin,32,width-margin,32);
    };
    const common = {
      margin: {top:38,right:margin,bottom:19,left:margin},
      styles: {font:'SiteTrace',fontStyle:'normal',fontSize:9,cellPadding:3,overflow:'linebreak',textColor:[32,35,40],lineWidth:0},
      willDrawPage: header, rowPageBreak:'avoid'
    };
    doc.autoTable({...common,startY:38,theme:'plain',body:metadata.map(value=>[value]),styles:{...common.styles,fontSize:9,cellPadding:{top:1,right:0,bottom:1.5,left:0}}});
    const weights = report.widths || report.columns.map(()=>1), total = weights.reduce((sum,value)=>sum+value,0);
    doc.autoTable({
      ...common,startY:doc.lastAutoTable.finalY+5,theme:'striped',head:[report.columns],
      body: rows.length ? rows : [{0:{content:'No records match this report.',colSpan:report.columns.length}}],
      showHead:'everyPage',headStyles:{fillColor:[39,43,48],textColor:255,fontStyle:'bold',fontSize:9},
      alternateRowStyles:{fillColor:[245,246,248]},
      columnStyles:Object.fromEntries(weights.map((value,index)=>[index,{cellWidth:usable*value/total}]))
    });
    const pages = doc.getNumberOfPages();
    for (let page=1;page<=pages;page++) {
      doc.setPage(page);
      doc.setDrawColor(210,212,215).setLineWidth(0.2).line(margin,height-15,width-margin,height-15);
      doc.setFont('SiteTrace','normal').setFontSize(8).setTextColor(80,85,92);
      doc.text('Generated by SiteTrace',margin,height-9);
      doc.text('Page '+page+' of '+pages,width-margin,height-9,{align:'right'});
    }
    return doc;
  }
  async function download({button, feedback, route, report}) {
    if (active || button.disabled) return;
    const account = window.MCPAAuth?.profile;
    const owner = button.closest('.screen'), buttonSelector = button.id ? '#'+button.id : '[data-export]';
    const feedbackSelector = feedback?.id ? '#'+feedback.id : null;
    const allowed = () => window.MCPAAuth?.canRoute(route) && window.MCPAAuth.profile?.id === account?.id && window.MCPAAuth.profile?.role === account?.role;
    const message = (value,error=false) => {
      const target = feedbackSelector ? owner?.querySelector(feedbackSelector) : feedback;
      if(target?.isConnected){target.textContent=value;target.setAttribute('role',error?'alert':'status');}
    };
    if (!allowed()) {message('Your account cannot export this report.',true);return;}
    active = true;
    const original = button.innerHTML;
    button.disabled = true;button.setAttribute('aria-busy','true');button.textContent='Preparing PDF…';
    message('Preparing your PDF report…');
    try {
      await prepare();
      if (!owner?.isConnected || !owner.classList.contains('active') || !allowed()) return;
      const now = new Date(), doc = create(report, now);
      const bytes = doc.output('arraybuffer');
      if (!(bytes instanceof ArrayBuffer) || !bytes.byteLength) throw new Error('Empty PDF output');
      const blob = new Blob([bytes],{type:'application/pdf'});
      const url = URL.createObjectURL(blob), link = document.createElement('a');
      link.href=url;link.download='SiteTrace_'+report.filename+'_'+dateKey(now)+'.pdf';
      document.body.appendChild(link);
      try {link.click();} finally {link.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);}
      message('PDF report ready. Check your downloads.');
      // Keep the lock through rapid repeated clicks, even with cached resources.
      await new Promise(resolve=>setTimeout(resolve,500));
    } catch (error) {
      message(error.message?.startsWith('PDF resources') ? error.message : 'The PDF could not be generated. Please try again. If this continues, reload SiteTrace.',true);
    } finally {
      active=false;
      const currentButton = owner?.querySelector(buttonSelector);
      if(currentButton?.isConnected){currentButton.innerHTML=original;currentButton.disabled=false;currentButton.removeAttribute('aria-busy');}
    }
  }
  window.SiteTracePDF = Object.freeze({download,create,prepare,dateKey,dateTime,activityRows,activityColumns,icon,get busy(){return active;}});
})();
