'use strict';
// Package indexes only. Does not execute application code, contact services, or rewrite diagram artifacts.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const OUT = path.resolve(__dirname, '..');
const allowed = new Set(['README.md','Flowchart_Index.md','Flowchart_Index.csv','Connector_Index.md','Connector_Index.csv','File_Manifest.csv']);
const write = (name, content) => {
  if (!allowed.has(name)) throw Error('Unexpected finalizer output: '+name);
  fs.writeFileSync(path.join(OUT,name), content, 'utf8');
};
const read = name => {
  const file = path.join(OUT,'validation',name);
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file,'utf8').replace(/^\uFEFF/,'')) : null;
};
const model = read('Model.json');
if (!model?.flows?.length) throw Error('Generate validation/Model.json before finalizing.');
const structure = read('Structure.json'), exported = read('Export.json'), native = read('Native_Validation.json');
read('Coverage.json'); read('baseline.json'); // Parse companion evidence if present; do not alter it.
const visualReviewed = process.argv.includes('--contact-sheets-reviewed');
const slash = value => value.replace(/\\/g,'/');
const md = value => String(value??'').replace(/\|/g,'\\|').replace(/[\r\n]+/g,' ');
const url = value => slash(value).split('/').map(part=>encodeURIComponent(part)).join('/');
const link = (label, rel) => `[${md(label)}](${url(rel)})`;
const existsLink = (label, rel) => fs.existsSync(path.join(OUT,rel)) ? link(label,rel) : md(label)+' (pending)';
const csv = rows => '\uFEFF'+rows.map(row=>row.map(value=>'"'+String(value??'').replace(/"/g,'""')+'"').join(',')).join('\r\n')+'\r\n';
const sum = (items, fn) => items.reduce((n,item)=>n+fn(item),0);
const utilityKeys = new Set(['authentication','global-search','notifications']);
const kind = flow => flow.key==='main' ? 'Main role flow' : utilityKeys.has(flow.key) ? 'Supporting workflow' : 'Implemented route / detail';
const roleLabels = [...new Set(model.flows.map(f=>f.role))];
const roleFolder = role => model.flows.find(f=>f.role===role).folder.split('/')[0];
const flowById = new Map(model.flows.map(f=>[f.id,f]));
const atlasPage = new Map();
for (const role of roleLabels) {
  let number=0;
  for (const flow of model.flows.filter(f=>f.role===role)) for (const page of flow.pages) atlasPage.set(flow.id+'/'+page.number,++number);
}
const pageAt = (flowId, number) => flowById.get(flowId)?.pages.find(p=>p.number===number);
const nodeAt = end => pageAt(end.flow,end.page)?.nodes.find(n=>n.id===end.node);
const pagePng = (flow, page) => flow.folder+'/'+page.id+'.png';
const point = end => {
  const flow=flowById.get(end.flow),page=pageAt(end.flow,end.page);
  if(!flow||!page||!nodeAt(end))throw Error('Connector endpoint missing: '+JSON.stringify(end));
  return link(end.flow+' / P'+end.page+' / '+end.node,pagePng(flow,page));
};
const allPages=sum(model.flows,f=>f.pages.length), allActions=sum(model.flows,f=>f.actionCount||0);
const consistency=[];
if(structure&&(structure.flows!==model.flows.length||structure.pages!==allPages))consistency.push('Structure.json counts do not match the current model; rerun generation/validation.');
if(exported&&((exported.exports||[]).length!==model.flows.length||model.flows.some(f=>!(exported.exports||[]).some(e=>e.flow===f.id&&e.pages===f.pages.length&&e.pdfPages===f.pages.length))))consistency.push('Export.json does not cover every current flow and page count; rerun export.');
if(native&&(native.diagrams!==model.flows.length||native.pages!==allPages||native.pagePngsDecoded!==allPages))consistency.push('Native_Validation.json counts do not match the current model; rerun native validation.');
const rows=[['Role','Category','Route or utility key','Title','Documented actions','Diagram pages','Flow ID','Page number','Page title','Editable drawio','Overview PNG','PDF','Page PNG','Page SVG','Evidence notes','Source references']];
const index=['# Flowchart index','',`Source model date: ${model.date}. ${model.flows.length} diagrams, ${allPages} pages and ${allActions} documented role-scoped action workflows. Main role flows have no separate action count.`,
  '', 'A route/detail diagram follows an implemented permission route. Authentication, global search and notifications are supporting workflows. Engineer and Architect share one verified permission set and one documentation set.',
  '', '| Role | Category | Flowchart | Actions | Pages | Editable | Overview | PDF | Evidence |','|---|---|---|---:|---:|---|---|---|---|'];
for (const flow of model.flows) {
  const base=flow.folder+'/'+flow.id;
  index.push(`| ${md(flow.role)} | ${kind(flow)} | ${md(flow.title)} | ${flow.actionCount||0} | ${flow.pages.length} | ${existsLink('.drawio',base+'.drawio')} | ${existsLink('PNG',base+'.png')} | ${existsLink('PDF',base+'.pdf')} | ${existsLink('Sources',flow.folder+'/Evidence.md')} |`);
  for(const page of flow.pages)rows.push([flow.role,kind(flow),flow.key,flow.title,flow.actionCount||0,flow.pages.length,flow.id,page.number,page.title,base+'.drawio',base+'.png',base+'.pdf',pagePng(flow,page),flow.folder+'/'+page.id+'.svg',flow.folder+'/Evidence.md',(flow.sources||[]).map(s=>s.path+':'+s.line).join('; ')]);
}
index.push('','## Full-resolution page exports','','Each page link opens its individual full-resolution PNG. Module PDFs contain the same ordered pages. The module overview PNG is a contact sheet, so individual page images are preferable for reading small text.');
for(const flow of model.flows) {
  index.push('',`### ${flow.role} — ${flow.title}`,'',flow.pages.map(page=>existsLink('P'+String(page.number).padStart(2,'0')+' · '+page.title,pagePng(flow,page))).join(' · '),'',existsLink('Source evidence and scope notes',flow.folder+'/Evidence.md'));
}
write('Flowchart_Index.csv',csv(rows));
write('Flowchart_Index.md',index.join('\n')+'\n');

const connectorRows=[['Scope','Connector code','Context','Source flow','Source page','Source node','Destination flow','Destination page','Destination diagram page ID','Destination connector node','Resume node','Resume label','Destination role-atlas page','Destination PNG']];
const connectorDoc=['# Connector index','','Lettered pentagons are package-wide off-page continuation codes. Each code below identifies its actual destination flow, diagram page and node. Numbered circles are local to the specified page; a repeated number on another page is a separate connector.',
  '', 'Source and destination links open the exact page PNG. Use the flow/page ID and atlas-page column to locate the same editable page inside the complete role atlas. Multiple source endpoints may share one destination.',
  '', '## Lettered off-page pentagons','','| Code | Context | Source endpoint(s) | Actual destination | Role-atlas page |','|---|---|---|---|---:|'];
for(const connector of model.connectors||[]) {
  const ins=connector.ends.filter(e=>e.direction==='in'),outs=connector.ends.filter(e=>e.direction==='out');
  if(ins.length!==1||!outs.length)throw Error('Unmatched off-page connector '+connector.code);
  const dest=ins[0],flow=flowById.get(dest.flow),page=pageAt(dest.flow,dest.page);
  const resumeEdge=page.edges.find(e=>e.from===dest.node),resume=resumeEdge&&page.nodes.find(n=>n.id===resumeEdge.to);
  connectorDoc.push(`| ${md(connector.code)} | ${md(connector.context)} | ${outs.map(point).join('<br>')} | ${point(dest)}<br>${md(page.id)} | ${atlasPage.get(dest.flow+'/'+dest.page)} |`);
  for(const source of outs)connectorRows.push(['Off-page',connector.code,connector.context,source.flow,source.page,source.node,dest.flow,dest.page,page.id,dest.node,resume?.id||'',resume?.text||'',atlasPage.get(dest.flow+'/'+dest.page),pagePng(flow,page)]);
}
connectorDoc.push('','## Numbered local circles','','| Page-local code | Source endpoint(s) | Matching circle | Resume process / input |','|---|---|---|---|');
let numericGroups=0;
for(const flow of model.flows)for(const page of flow.pages) {
  const codes=[...new Set(page.nodes.filter(n=>n.type==='onpage').map(n=>n.connector))];
  for(const code of codes) {
    numericGroups++;
    const nodes=page.nodes.filter(n=>n.type==='onpage'&&n.connector===code),ins=nodes.filter(n=>n.direction==='in'),outs=nodes.filter(n=>n.direction==='out');
    if(ins.length!==1||!outs.length)throw Error('Unmatched local circle '+flow.id+'/'+page.number+'/'+code);
    const dest={flow:flow.id,page:page.number,node:ins[0].id},edge=page.edges.find(e=>e.from===ins[0].id),resumeId=ins[0].target||edge?.to,resume=page.nodes.find(n=>n.id===resumeId);
    if(!resume)throw Error('Missing local circle resume target '+flow.id+'/'+page.number+'/'+code);
    const sources=outs.map(n=>({flow:flow.id,page:page.number,node:n.id}));
    connectorDoc.push(`| ${md(flow.id+' / P'+page.number+' / '+code)} | ${sources.map(point).join('<br>')} | ${point(dest)} | ${md(resume.id+' · '+resume.text)} |`);
    for(const source of sources)connectorRows.push(['On-page',code,flow.id+' / P'+page.number,flow.id,page.number,source.node,flow.id,page.number,page.id,dest.node,resume.id,resume.text,atlasPage.get(flow.id+'/'+page.number),pagePng(flow,page)]);
  }
}
connectorDoc.splice(4,0,`This model contains ${(model.connectors||[]).length} lettered codes and ${numericGroups} page-local numbered connector groups.`,'');
write('Connector_Index.csv',csv(connectorRows));
write('Connector_Index.md',connectorDoc.join('\n')+'\n');

const status=(value,label)=>!value?label+' pending (report not yet present).':value.passed?label+' passed.':label+' has unresolved failures; inspect its JSON report.';
const readme=['# SiteTrace (MCPA) standardized system flowcharts','',
  `Prepared ${model.date} from the repository and the copied ${link('FlowchartFinal.pdf','reference/FlowchartFinal.pdf')}. The package contains **${model.flows.length} individual flowcharts, ${allPages} diagram pages and ${allActions} documented role-scoped action workflows**, plus two editable role atlases.`,
  '', 'Scope follows the user correction: **Admin** and a combined **Engineer / Architect** set. Engineer and Architect have identical verified route/action permissions. The repository also defines Secretary and Tool Handler; those roles are intentionally excluded from these deliverables. Their names may still appear as actual Admin account-form options.',
  '', '## Start here','',
  '- '+link('Flowchart index and every editable / PNG / PDF download','Flowchart_Index.md')+' · '+link('CSV','Flowchart_Index.csv'),
  '- '+link('Exact continuation and retry connector destinations','Connector_Index.md')+' · '+link('CSV','Connector_Index.csv'),
  '- '+link('File inventory with byte lengths and SHA-256 hashes','File_Manifest.csv'),
  '', '| Role set | Implemented routes / details | Supporting workflows | Main role flows | Individual diagrams | Actions | Pages | Editable complete atlas |',
  '|---|---:|---:|---:|---:|---:|---:|---|'];
for(const role of roleLabels) {
  const flows=model.flows.filter(f=>f.role===role),folder=roleFolder(role),atlas=folder+'/SiteTrace_'+folder+'_Complete_Atlas.drawio';
  readme.push(`| ${md(role)} | ${flows.filter(f=>kind(f)==='Implemented route / detail').length} | ${flows.filter(f=>utilityKeys.has(f.key)).length} | ${flows.filter(f=>f.key==='main').length} | ${flows.length} | ${sum(flows,f=>f.actionCount||0)} | ${sum(flows,f=>f.pages.length)} | ${existsLink('.drawio atlas',atlas)} |`);
}
readme.push('', 'Counts include separate tool-profile and site-detail routes. The supporting workflows are Authentication/session, Global Search and Notifications. Shared behavior is counted once per delivered role set; it is not a count of unique application features.',
  '', '## Organization and conventions','',
  'Each role has a main Login → Dashboard → available-module flow, followed by a separate detailed file for every authorized route and supporting workflow. Each diagram folder contains editable native `.drawio` nodes and arrows, a multi-page PDF, an overview/contact-sheet PNG, individual full-resolution PNG and SVG pages, and `Evidence.md` source references.',
  '', 'The complete atlases contain the same editable pages in role order. They make cross-module continuation easier to follow in one file. Individual files remain independently editable; consult the connector index when a continuation points to another module.',
  '', 'Layout follows the reference: US Legal portrait (612 × 1008 PDF points), black shapes/arrows/text on white, top-to-bottom main flow and left-to-right decision/error branches. Symbols are ovals for Start/End, rectangles for processing, parallelograms for input/output, Yes/No diamonds, numbered circular on-page links and lettered pentagonal off-page links.',
  '', 'Generated module/action-selection menus are documentation maps of implemented controls and entry events. They do not introduce new application UI. An `END` or end-attempt node closes that documented branch; it does **not** assert transaction rollback. A source-confirmed save remains saved if its subsequent refresh fails. Stale-state and saved-but-unrefreshed branches require the stated refresh/reopen step before further mutation.',
  '', '## Source evidence and verification limits','',
  'Behavior was checked against actual route permissions, module loaders, event handlers, gateways and SQL migration definitions. Per-diagram '+link('evidence references','Flowchart_Index.md')+' distinguish role restrictions, confirmations, validation, retries and saved outcomes. Engineer/Architect is not given Admin-only Materials, Purchases, Reports or People routes merely because similarly named legacy files exist.',
  '', 'No live application session, Supabase database, production records or deployed authentication settings were accessed for this documentation. Website/source/database changes and production writes are outside this package. Deployment verification still needs the installed RPC/migration versions and policies, real Auth/profile links, email/SMTP capability flags, browser camera permissions and QR scanning/expiry behavior, and the monitoring scheduler / prospective historical snapshots. These are implemented source paths, not certified production test results.',
  '', 'Material Requests records actual receipts and stock changes; Purchases is a record-only ledger. Current inventory reports show present state; historical reports use existing prospective snapshots and never reconstruct unavailable past inventory.',
  '', '## Validation evidence','',
  '- '+status(structure,'Model/geometry validation')+' '+existsLink('Structure.json','validation/Structure.json'),
  '- '+status(exported,'Export/text-fit validation')+' '+existsLink('Export.json','validation/Export.json'),
  '- '+status(native,'Native artifact validation')+' '+existsLink('Native_Validation.json','validation/Native_Validation.json'));
if(structure)readme.push(`- Structure report: ${structure.flows} diagrams, ${structure.pages} pages, ${structure.nodes} nodes, ${structure.decisions} Yes/No decisions, ${structure.offPageCodes} off-page codes and ${structure.onPageGroups} local numbered connector groups.`);
if(exported)readme.push(`- Export report: ${(exported.exports||[]).length} recorded exports; ${(exported.textFitViolations||[]).length} unresolved text-fit violations. Generated-document rendering blocks outbound HTTP/HTTPS; application pages opened: ${exported.applicationPagesOpened??'not reported'}; database calls: ${exported.databaseCalls??'not reported'}.`);
if(native)readme.push(`- Native validation parsed editable drawio XML, compared native node labels and edge endpoints, decoded ${native.pagePngsDecoded} full-size page PNGs, natively rendered ${native.pages} PDF pages and checked Legal portrait geometry. ${native.allOriginalTrackedFilesUnchanged?'All '+native.originalTrackedHashesCompared+' baseline tracked-file hashes remained unchanged.':'Inspect the original-file comparison status in Native_Validation.json.'}`);
else readme.push('- Native editable-XML comparison, PNG decoding, native PDF rendering/geometry checks and baseline-file comparison are pending until Native_Validation.json is produced. Rerun the finalizer afterward.');
readme.push('- '+(visualReviewed?'Contact sheets were visually reviewed separately after generation. This statement records that explicit review; it does not claim every page was manually reviewed at full reading size.':'Contact-sheet visual review is pending separate agent inspection. Automated passes alone do not constitute visual review.'),
  '- No native drawio editor visual review is claimed. Native validation checks editable structure as XML; native editor font/rendering may vary.',
  ...consistency.map(message=>'- Pending report consistency: '+message),
  '', existsLink('Coverage report','validation/Coverage.json')+' · '+existsLink('Complete model','validation/Model.json')+' · '+existsLink('Original-file baseline','validation/baseline.json')+' · '+(fs.existsSync(path.join(OUT,'validation/PDF_Review'))?link('Native PDF review contact sheets','validation/PDF_Review'):'Native PDF review contact sheets pending.'),
  '', existsLink('Static role / source / reference audit','validation/Scope_Audit.json')+' · '+existsLink('Reference study','reference/Reference_Study.md')+' · '+existsLink('Native PDF visual review','validation/Visual_Native_PDF_Review.md'),
  '', existsLink('Admin operational visual review','validation/Visual_Admin_Operational.md')+' · '+existsLink('Admin support visual review','validation/Visual_Admin_Support.md')+' · '+existsLink('Engineer/Architect visual review','validation/Visual_Engineer_Architect.md'),
  '', '## Preserved originals and reference','',
  'This revised set lives only in `REFERENCE_STANDARDIZED/`. Earlier '+link('activity workflow documents','../Activity_Workflow_Diagrams')+' and '+link('Admin flowchart documents','../ADMIN_FLOWCHARTS')+' remain in their original directories. The explicit backup below preserves the pre-existing flowchart documentation; no original was replaced.',
  '', ...fs.readdirSync(path.join(OUT,'backups')).filter(n=>n.toLowerCase().endsWith('.zip')).map(n=>'- '+link(n,'backups/'+n)),
  '- '+link('Copied primary reference PDF','reference/FlowchartFinal.pdf')+' · '+existsLink('Reference contact sheet','reference/Contact_Sheet.png'),
  '', 'The file manifest inventories the current package, including source scripts, per-page exports, reports, copied reference and backup. Its own CSV is excluded from hashing to avoid a self-referential digest. Rerun it after any artifact change.',
  '', '## Regeneration','',
  'Run from the repository root using the existing local Node dependencies and Chrome installation. The scripts generate documentation only. `initialize.cjs` also reads the original PDF from its recorded Downloads path; the already copied reference is sufficient for later regeneration.',
  '', '```powershell',
  'node SYSTEM_DOCUMENTATION/02_SYSTEM_DIAGRAMS/REFERENCE_STANDARDIZED/source/generate.cjs',
  'node SYSTEM_DOCUMENTATION/02_SYSTEM_DIAGRAMS/REFERENCE_STANDARDIZED/source/export.cjs',
  'powershell -NoProfile -ExecutionPolicy Bypass -File SYSTEM_DOCUMENTATION/02_SYSTEM_DIAGRAMS/REFERENCE_STANDARDIZED/source/validate-native.ps1',
  'node SYSTEM_DOCUMENTATION/02_SYSTEM_DIAGRAMS/REFERENCE_STANDARDIZED/source/finalize.cjs',
  '```',
  '', 'After separate contact-sheet inspection, rerun the last command with `--contact-sheets-reviewed` to record that completed review. Rebuild copied-reference previews only if needed with `source/study-reference.cjs`. Do not run application migrations or account/movement operations to regenerate this documentation.',
  '', 'Finalizer inputs are the current model and available validation JSON reports. Missing export/native reports are recorded as pending rather than assumed successful. The finalizer writes only this README, both indexes and the manifest.');
write('README.md',readme.join('\n')+'\n');

const inventory=[];
function walk(dir) {
  for(const entry of fs.readdirSync(dir,{withFileTypes:true})) {
    const file=path.join(dir,entry.name);
    if(entry.isDirectory())walk(file);
    else if(entry.isFile()) {
      const relative=slash(path.relative(OUT,file));
      if(relative==='File_Manifest.csv')continue;
      const bytes=fs.readFileSync(file);
      inventory.push([relative,bytes.length,crypto.createHash('sha256').update(bytes).digest('hex')]);
    }
  }
}
walk(OUT);inventory.sort((a,b)=>a[0].localeCompare(b[0]));
write('File_Manifest.csv',csv([['Relative file','Bytes','SHA256'],...inventory]));
console.log(JSON.stringify({diagrams:model.flows.length,pages:allPages,actions:allActions,offPageCodes:(model.connectors||[]).length,onPageGroups:numericGroups,indexRows:rows.length-1,connectorEndpointRows:connectorRows.length-1,manifestFiles:inventory.length,structure:structure?.passed??'pending',exports:exported?.passed??'pending',native:native?.passed??'pending',consistencyWarnings:consistency,visualContactSheetsReviewed:visualReviewed}));
