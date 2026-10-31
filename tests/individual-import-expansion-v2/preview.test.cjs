const test=require('node:test'),assert=require('node:assert/strict');
const C=require('../../js/upgrades/individual-import-expansion/core.js'),P=require('../../js/upgrades/individual-import-expansion/preview.js');
const sheet=text=>C.parse(Buffer.from(text),'csv')[0];
const preview=text=>{const s=sheet(text);return C.validate(s,C.autoMap(s.headers));};
const csv='Item Name,Category,Tracking Type,Quantity,Condition\nShovel,Hand Tools,Individual,20,Not Assessed\nGI Pipes,Construction Materials,Bulk,225,Fair';
test('mountable preview explains source rows, physical expansion, grouped quantities and limits',()=>{
  const host={innerHTML:''},p=preview(csv);assert.equal(P.render(host,p),true);
  assert.match(host.innerHTML,/<strong>2 spreadsheet rows<\/strong> will create <strong>21 equipment records/);
  assert.match(host.innerHTML,/Individual<\/td><td>20<\/td><td>20/);assert.match(host.innerHTML,/Bulk<\/td><td>225<\/td><td>1/);
  assert.match(host.innerHTML,/<caption>Spreadsheet rows and resulting equipment records/);assert.match(host.innerHTML,/scope="row"/);assert.match(host.innerHTML,/tabindex="0" role="region"/);
  assert.match(host.innerHTML,/500 resulting records/);assert.match(host.innerHTML,/All rows pass/);
});
test('preview safely escapes names, warnings and errors while showing blocked and empty states',()=>{
  const p=preview(csv.replace('Shovel','<img src=x onerror=alert(1)>').replace('Not Assessed',''));
  p.rows[0].warnings.push('<script>alert(1)</script>');p.errors.push('Bad <tag>');
  const host={innerHTML:''};assert.equal(P.render(host,p),false);assert.doesNotMatch(host.innerHTML,/<img|<script|Bad <tag>/);
  assert.match(host.innerHTML,/&lt;img/);assert.match(host.innerHTML,/&lt;script&gt;/);assert.match(host.innerHTML,/role="alert"/);assert.match(host.innerHTML,/Import is blocked/);
  const empty=preview(csv.split('\n')[0]);assert.match(P.html(empty),/No equipment rows to preview/);assert.match(P.html(empty),/Import is blocked/);
  assert.throws(()=>P.render(null,p),/container/);assert.throws(()=>P.html(null),/Validate/);
});
