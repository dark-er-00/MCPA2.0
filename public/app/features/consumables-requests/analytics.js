(function(scope,factory){const api=factory(typeof module==='object'&&module.exports?require('./core.js'):scope.MCPAConsumablesRequests);if(typeof module==='object'&&module.exports)module.exports=api;else scope.MCPAConsumablesAnalytics=api;})(globalThis,function(C){
  'use strict';
  function report(snapshot, {from='',to='',requester_id='',site_id='',consumable_id=''}={}) {
    const bounds=C.dateRange(from,to), start=bounds.from?Date.parse(bounds.from):-Infinity, end=bounds.to?Date.parse(bounds.to):Infinity;
    const inside=value=>{const t=Date.parse(value);return Number.isFinite(t)&&t>=start&&t<end;};
    const requests=(snapshot.requests||[]).filter(r=>(!requester_id||r.requester_id===requester_id)&&(!site_id||r.site_id===site_id));
    const totals=new Map(), transactions=[], seen=new Set(), submitted=[];
    function total(item) {
      const key=JSON.stringify([item.consumable_id,item.unit]);
      if(!totals.has(key))totals.set(key,{consumable_id:item.consumable_id,item_name:item.item_name,item_code:item.item_code,specification:item.specification,unit:item.unit,requested:0,approved:0,issued:0,issuances:0,confirmed_consumed_quantity:null});
      return totals.get(key);
    }
    for(const request of requests) {
      const items=request.items.filter(i=>!consumable_id||i.consumable_id===consumable_id);
      if(items.length && inside(request.created_at)) submitted.push(request);
      if(inside(request.created_at))for(const item of items){const sum=total(item);sum.requested=C.add(sum.requested,item.requested_quantity);sum.approved=C.add(sum.approved,item.approved_quantity||0);}
      for(const issue of request.issues||[]) {
        const item=items.find(item=>item.id===issue.item_id);
        if(!item||!inside(issue.issued_at))continue;
        const key=issue.stock_movement_id||issue.id;
        if(!key||seen.has(key))continue;
        seen.add(key);
        const transaction={...issue,consumable_id:item.consumable_id,item_name:item.item_name,item_code:item.item_code,specification:item.specification,unit:item.unit,request_id:request.id,request_number:request.request_number,requester_id:request.requester_id,requester_name:request.requester_name,site_id:request.site_id,site_name:request.site_name};
        transactions.push(transaction);
        const sum=total(item);sum.issued=C.add(sum.issued,issue.quantity);sum.issuances++;
      }
    }
    const summary=[...totals.values()].sort((a,b)=>b.issuances-a.issuances||a.item_name.localeCompare(b.item_name));
    transactions.sort((a,b)=>Date.parse(b.issued_at)-Date.parse(a.issued_at));
    return {submitted,summary,transactions,byRequester:C.aggregate(transactions,'requester',snapshot.catalog),bySite:C.aggregate(transactions,'site',snapshot.catalog),trend:C.aggregate(transactions,'day',snapshot.catalog).sort((a,b)=>a.value.localeCompare(b.value)||a.item_name.localeCompare(b.item_name)),lowStock:(snapshot.catalog||[]).filter(i=>!i.archived_at&&(!consumable_id||i.id===consumable_id)&&i.minimum_stock!=null&&i.current_stock!=null&&Number(i.current_stock)<=Number(i.minimum_stock))};
  }
  function summaryCSV(value) {return C.csv(['Consumable ID','Item code','Item','Specification','Unit','Requested in period','Approved for requests in period','Issued in period','Issuance transactions','Confirmed consumed'],value.summary.map(r=>[r.consumable_id,r.item_code,r.item_name,r.specification,r.unit,r.requested,r.approved,r.issued,r.issuances,'Not recorded']));}
  function transactionsCSV(value) {return C.csv(['Issuance ID','Stock movement ID','Request','Consumable ID','Item','Unit','Quantity issued','Requester','Requester ID','Project/site','Site ID','Issued by','Issued at'],value.transactions.map(r=>[r.id,r.stock_movement_id,r.request_number,r.consumable_id,r.item_name,r.unit,r.quantity,r.requester_name,r.requester_id,r.site_name,r.site_id,r.issued_by_name,r.issued_at]));}
  // The upper date is inclusive. Align buckets to Manila calendar boundaries.
  function requestTrend(submitted, filters, period='month', now=new Date()) {
    const day=86400000, hour=3600000;
    const today=C.dayInManila(now);
    const last=Date.parse((filters.to||today)+'T00:00:00+08:00');
    const end=last+day;
    const local=new Date(last+8*hour);
    const annualStart=Date.UTC(local.getUTCFullYear(),local.getUTCMonth()-11,1)-8*hour;
    const start=Math.max(period==='year'?annualStart:last-(period==='today'?0:period==='week'?6:29)*day,
      filters.from?Date.parse(filters.from+'T00:00:00+08:00'):-Infinity);
    const step=end-start<=day?'hour':end-start<=31*day?'day':'month';
    const buckets=new Map(), records=[];
    const key=t=>new Date(t+8*hour).toISOString().slice(0,step==='hour'?13:step==='day'?10:7);
    for(let t=start;t<end;){
      buckets.set(key(t),0);
      const d=new Date(t+8*hour);
      t=step==='month'?Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,1)-8*hour:t+(step==='hour'?hour:day);
    }
    for(const r of submitted){
      const t=Date.parse(r.created_at);
      if(t>=start&&t<end){records.push(r);buckets.set(key(t),buckets.get(key(t))+1);}
    }
    return {records,step,points:Array.from(buckets,([label,value])=>({label,value}))};
  }
  function counts(rows,key,label){
    const grouped=new Map();
    for(const row of rows){
      const id=key(row);
      const group=grouped.get(id)||{id,label:label(row),value:0};
      group.value++;
      grouped.set(id,group);
    }
    return [...grouped.values()].sort((a,b)=>b.value-a.value||a.label.localeCompare(b.label));
  }
  return {report,summaryCSV,transactionsCSV,requestTrend,counts};
});
