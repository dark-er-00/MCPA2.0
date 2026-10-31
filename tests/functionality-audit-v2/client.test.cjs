const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const C=require('../../js/upgrades/consumables-requests/core.js'),units=require('../../js/consumables-catalog.js');
test('count units reject the reported manual/pasted values without rounding; measured units retain three decimals',()=>{
 for(const unit of ['pcs','pieces','PCS.','bag','bags','boxes','sets','roll','bottles','length','pair']){
  assert.equal(units.isWholeUnit(unit),true);assert.equal(units.quantityRules(unit).step,1);assert.equal(units.quantityRules(unit).min,1);
  for(const value of [1,5,100])assert.equal(C.quantity(value,false,unit),value);
  for(const value of [0,-2,0.002,1.5,'abc','',null,'1e2'])assert.throws(()=>C.quantity(value,false,unit));
  assert.equal(C.quantity(0,true,unit),0,'Zero approval/optional issuance remains legal');
 }
 for(const unit of ['kg','liters','litres','L','m','meters','custom measurement']){
  assert.equal(units.isWholeUnit(unit),false);assert.equal(units.quantityRules(unit).step,0.001);assert.equal(C.quantity('1.125',false,unit),1.125);
 }
});
test('request validation applies the actual SKU unit and preserves legitimate measured requests',()=>{
 const id='00000000-0000-4000-8000-000000000001',site='00000000-0000-4000-8000-000000000002';
 const request=unit=>({site_id:site,items:[{consumable_id:id,unit,quantity:0.002}]});
 assert.throws(()=>C.validateRequest(request('pcs'),[{id,unit:'pcs'}],[{id:site}]));
 assert.equal(C.validateRequest(request('kg'),[{id,unit:'kg'}],[{id:site}]).items[0].quantity,0.002);
});
test('Sold/Disposed filters use retirement metadata without changing availability or duplicating equipment',()=>{
 const window={MCPADisplay:{status:value=>value}},document=new EventTarget();
 vm.runInNewContext(fs.readFileSync(require.resolve('../../js/equipment-tracking.js'),'utf8'),{window,document});
 const api=window.EquipmentTracking,sold={status:'disposed',retirementDisposition:'sold',quantity:1},disposed={status:'disposed',retirementDisposition:'disposed',quantity:1};
 assert.equal(api.matchesStatus(sold,'Sold'),true);assert.equal(api.matchesStatus(sold,'Disposed'),false);assert.equal(api.matchesStatus(disposed,'Disposed'),true);assert.equal(api.matchesStatus(disposed,'Sold'),false);
 assert.equal(api.availability(sold),'Unavailable');assert.equal(api.availability(disposed),'Unavailable');assert.equal(api.matchesStatus({status:'UNDER_REPAIR'},'For Repair'),true);
 assert.equal([sold,disposed].filter(row=>api.matchesStatus(row,'')).length,2);
});
