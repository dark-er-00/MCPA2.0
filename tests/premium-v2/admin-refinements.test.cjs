const test=require('node:test');
const assert=require('node:assert/strict');
const A=require('../../public/app/features/consumables-requests/analytics.js');
const {createFixture}=require('./engineer-assignment-preview-fixture.cjs');
const row=(id,created_at)=>({id,created_at});
test('Manila midnight, daily and monthly request buckets agree with submitted request counts',()=>{
  const input=[row(1,'2026-10-31T15:59:59Z'),row(2,'2026-10-31T16:00:00Z'),row(3,'2026-11-01T15:59:59Z'),row(4,'2026-11-01T16:00:00Z')];
  const filters={to:'2026-11-01'};
  const today=A.requestTrend(input,filters,'today');
  assert.equal(today.step,'hour');assert.equal(today.points.length,24);
  assert.deepEqual(today.records.map(r=>r.id),[2,3]);assert.equal(today.points[0].value,1);assert.equal(today.points.at(-1).value,1);
  for(const [period,len,step] of [['week',7,'day'],['month',30,'day'],['year',12,'month']]){
    const t=A.requestTrend(input,filters,period);
    assert.equal(t.step,step);assert.equal(t.points.length,len);assert.equal(t.points.reduce((a,p)=>a+p.value,0),3);
  }
  assert.equal(A.requestTrend([],filters,'week').records.length,0);
  assert.equal(A.requestTrend(input,{...filters,from:filters.to},'year').step,'hour');
});
test('multi-line requests count once and movement receipts reconcile under combined filters',()=>{
 const fixture=createFixture({adminReview:true});
 const s=fixture.handle('admin',{rpc:'mcpa_wa_consumables_snapshot'}).data;
 const r=s.requests.at(-1);r.items.push({...r.items[0],id:'second-line'});r.issues.push(r.issues[0]);
 const report=A.report(s,{requester_id:r.requester_id,site_id:r.site_id,consumable_id:r.items[0].consumable_id});
 assert.equal(report.submitted.filter(x=>x.id===r.id).length,1);
 assert.equal(report.transactions.length,new Set(report.transactions.map(t=>t.stock_movement_id)).size);
 for(const groups of [report.bySite,report.trend])assert.equal(groups.reduce((sum,g)=>sum+g.transactions,0),report.transactions.length);
 assert.equal(report.summary.reduce((sum,g)=>sum+g.issuances,0),report.transactions.length);
 assert.equal(A.transactionsCSV(report).split('\r\n').length,report.transactions.length+1);
 assert.equal(A.summaryCSV(report).split('\r\n').length,report.summary.length+1);
 assert.ok(report.transactions.every(t=>t.unit===r.items[0].unit));
 s.catalog.push({id:'unconfigured',current_stock:0,minimum_stock:null});
 assert.ok(!A.report(s).lowStock.some(i=>i.id==='unconfigured'));
});
