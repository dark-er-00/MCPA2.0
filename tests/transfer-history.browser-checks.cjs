// Display-only checks using isolated fixture records. External HTTPS is blocked
// by auth.browser.cjs. No live Auth accounts, transfers or equipment are accessed.
const assert=require('node:assert/strict');
exports.verify=async({fixture:f,evaluate,command,wait,click,fill,go,login,logout,calls,shot})=>{
  const sender='MCPA Development Engineer A',receiver='MCPA Development Engineer B';
  const destination='MCPA Development Receiving Test';
  await f.db.query('update profiles set name=$1 where id=$2',[sender,f.actors.sky.id]);
  await f.db.query('update profiles set name=$1 where id=$2',[receiver,f.actors.pau.id]);
  await f.db.query("update equipment set name='Palakol',asset_id='T-1204' where id=$1",[f.tools['TOOL-002']]);
  const source=[{toolId:'T-1204',site:'Recorded source project',siteId:f.sites.casa,holder:sender,holderId:f.actors.sky.id}];
  const basic={toolIds:['T-1204'],sender,receiver,receiverId:f.actors.pau.id,destination,destinationId:f.sites.main,source};
  const records=[
    {...basic,id:'TRF-00003',status:'received',createdAt:'2026-10-10T08:00:00Z',receivedAt:'2026-10-10T09:00:00Z'},
    {...basic,id:'TRF-00004',status:'pending',createdAt:'2026-10-10T07:00:00Z',toolIds:['T-1204','TOOL-003','TOOL-004','TOOL-005'],source:[...source,{toolId:'TOOL-003',site:'Second recorded source project'}]},
    {...basic,id:'TRF-00005',status:'rejected',createdAt:'2026-10-09T08:00:00Z'},
    {...basic,id:'TRF-00006',status:'discrepancy',createdAt:'2026-10-08T08:00:00Z'},
    // Unknown legacy labels must retain the existing badge helper's exact output.
    {...basic,id:'TRF-00007',status:'cancelled',createdAt:'2026-10-07T08:00:00Z'},
    {id:'TRF-00008',status:'received',createdAt:null,toolIds:['UNLISTED-TOOL'],receiverId:f.actors.pau.id},
    {...basic,id:'TRF-00009',status:'received',createdAt:'2026-10-04T08:00:00Z',
      sender:sender+' — Supervising Engineer for structural rehabilitation and construction coordination',
      receiver:receiver+' — Architect for construction coordination and equipment accountability',
      destination:'Receiving project with a very long name '+ 'UnbrokenProjectReference'.repeat(8)}
  ];
  for(const record of records)await f.db.query("insert into mcpa_movements(id,kind,data,actor_id,receiver_id,destination_id) values($1,'transfer',$2,$3,$4,$5)",
    [record.id,record,f.actors.sky.id,f.actors.pau.id,record.destinationId||null]);
  await f.db.query("insert into mcpa_movements(id,kind,data,actor_id,receiver_id) values('TRF-00999','transfer',$1,$2,$3)",
    [{id:'TRF-00999',status:'pending',toolIds:[],createdAt:'2026-10-10T10:00:00Z'},f.actors.admin.id,f.actors.architect.id]);
  const snapshot=async()=>{
    const result={};
    for(const table of ['equipment','sites','profiles','mcpa_movements','mcpa_movement_operations','mcpa_account_audit'])result[table]=(await f.db.query(`select * from ${table} order by id`)).rows;
    return result;
  };
  const baseline=await snapshot(),callCount=calls.length;
  await logout();await login('sky');await wait("document.querySelector('.overview-actions')");
  await go('transfer');await wait("document.querySelector('[data-transfer-tab=history]')");await click('[data-transfer-tab=history]');
  await wait("document.querySelector('.mv-transfer-card')");
  const card=id=>`.mv-transfer-card[data-id="${id}"]`;
  const setViewport=async(width,dark=false)=>{
    await evaluate('document.activeElement?.blur()');
    await command('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:width<=600});
    await command('Emulation.setPageScaleFactor',{pageScaleFactor:1});
    await evaluate(`document.body.classList.toggle('dark',${dark});new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))`);
    assert.equal(await evaluate('innerWidth'),width,'Test the requested CSS viewport width: '+JSON.stringify(await evaluate(`({width:innerWidth,client:document.documentElement.clientWidth,scroll:document.documentElement.scrollWidth,visual:visualViewport.width,scale:visualViewport.scale,wide:[...document.querySelectorAll('body *')].filter(el=>el.getClientRects().length&&el.getBoundingClientRect().right>${width}+1&&!el.closest('.mv-transfer-table')).slice(0,25).map(el=>({tag:el.tagName,id:el.id,cls:el.className,width:el.getBoundingClientRect().width,right:el.getBoundingClientRect().right}))})`)));
  };
  const visibleIds=()=>evaluate("[...document.querySelectorAll('[data-list] button[data-action=view]')].filter(el=>el.getClientRects().length).map(el=>el.dataset.id)");
  // Preserve the existing sort, including its placement of a missing date.
  const expectedOrder=['TRF-00008','TRF-00003','TRF-00004','TRF-00005','TRF-00006','TRF-00007','TRF-00009'];
  const assertNoOverflow=async()=>{
    const invalid=await evaluate(`(()=>{
      const visible=el=>el.getClientRects().length;
      const nodes=[...document.querySelectorAll('.mv-transfer-card,.mv-transfer-card *, .mv-transfer-history .mv-input')].filter(el=>visible(el)&&!el.classList.contains('mv-sr'));
      return {page:document.documentElement.scrollWidth>innerWidth,
        nodes:nodes.filter(el=>el.clientWidth>0&&el.scrollWidth>el.clientWidth+1).map(el=>({tag:el.tagName,cls:el.className,width:el.clientWidth,scroll:el.scrollWidth}))};
    })()`);
    assert.deepEqual(invalid,{page:false,nodes:[]});
  };
  for(const dark of [false,true])for(const width of [320,360,375,393,430,600,601,768,1440]){
    await setViewport(width,dark);
    assert.deepEqual(await visibleIds(),expectedOrder,'One visible representation, same date order');
    assert.equal(await evaluate("getComputedStyle(document.querySelector('.mv-transfer-table')).display==='none'"),width<=600);
    assert.equal(await evaluate("getComputedStyle(document.querySelector('.mv-transfer-cards')).display==='none'"),width>600);
    assert.equal(await evaluate("[...document.querySelectorAll('.mv-transfer-table th')].map(el=>el.textContent).join('|')"),'Movement / tools|Details|Status|Actions');
    if(width<=600){
      await assertNoOverflow();
      assert.ok(await evaluate("[...document.querySelectorAll('.mv-transfer-card .badge')].every(el=>el.scrollHeight<=el.clientHeight+1 && getComputedStyle(el).whiteSpace==='normal')"));
      assert.ok(await evaluate("[...document.querySelectorAll('.mv-transfer-card button')].every(el=>el.getBoundingClientRect().height>=44)"));
    }
    if([393,1440].includes(width)){
      await fill('[data-record-search]','Engineer A');await shot(`transfer-history-${width}-${dark?'dark':'light'}`,true);await fill('[data-record-search]','');
    }
  }
  await setViewport(320);await fill('[data-record-search]','TRF-00009');await assertNoOverflow();
  await evaluate("document.querySelector('.mv-transfer-card').scrollIntoView({block:'start'})");await shot('transfer-history-320-long-names',true);
  const longText=await evaluate(`document.querySelector(${JSON.stringify(card('TRF-00009'))}).textContent`);
  assert.ok(longText.includes(records[6].sender)&&longText.includes(records[6].receiver)&&longText.includes(records[6].destination));
  await fill('[data-record-search]','TRF-00003');
  const contents=await evaluate(`document.querySelector(${JSON.stringify(card('TRF-00003'))}).textContent`);
  for(const value of ['Palakol','T-1204',sender,receiver,'Recorded source project',destination,'Received / Completed'])assert.ok(contents.includes(value),value);
  assert.ok(!contents.includes('Casa Buena'),'Saved source is not replaced by current equipment project');
  // The card badge uses exactly the same text and tone as the desktop badge.
  await fill('[data-record-search]','');
  assert.ok(await evaluate(`(()=>{const rows=[...document.querySelectorAll('.mv-transfer-table tbody tr')];return [...document.querySelectorAll('.mv-transfer-card')].every((el,i)=>{
    const a=el.querySelector('.badge'),b=rows[i].querySelector('.badge');return a.textContent===b.textContent&&a.className===b.className;});})()`));
  for(const width of [393,1440]){
    await setViewport(width);
    for(const query of ['TRF-00003','T-1204','Engineer A','Engineer B',destination]){
      await fill('[data-record-search]',query);
      const ids=await visibleIds();assert.ok(ids.includes('TRF-00003'));
      if(query==='TRF-00003')assert.deepEqual(ids,['TRF-00003']);
      assert.ok(!ids.includes('TRF-00999'));
    }
    await fill('[data-record-search]','no-matching-fixture');assert.deepEqual(await visibleIds(),[]);
    assert.ok(await evaluate("document.querySelector('[data-list]').textContent.includes('No matching movements')"));
    await fill('[data-record-search]','');
    for(const [status,expected] of [['pending',['TRF-00004']],['received',['TRF-00008','TRF-00003','TRF-00009']],['rejected',['TRF-00005']],['discrepancy',['TRF-00006']],['cancelled',['TRF-00007']]]){
      await fill('[data-status]',status);assert.deepEqual(await visibleIds(),expected);
    }
    await fill('[data-status]','pending');await fill('[data-record-search]','T-1204');assert.deepEqual(await visibleIds(),['TRF-00004']);
    await fill('[data-status]','');await fill('[data-record-search]','');
  }
  await setViewport(393);
  assert.ok((await evaluate(`document.querySelector(${JSON.stringify(card('TRF-00004'))}).textContent`)).includes('+ 2 more equipment items in details'));
  const key=async(name,keyCode)=>{await command('Input.dispatchKeyEvent',{type:'keyDown',key:name,code:name,windowsVirtualKeyCode:keyCode,...(name==='Enter'?{text:'\r'}:{})});await command('Input.dispatchKeyEvent',{type:'keyUp',key:name,code:name,windowsVirtualKeyCode:keyCode});};
  await evaluate(`document.querySelector(${JSON.stringify(card('TRF-00004')+' button')}).focus()`);
  assert.equal(await evaluate('document.activeElement.dataset.id'),'TRF-00004','Native card action receives keyboard focus');
  await key('Enter',13);
  await wait("document.querySelector('[data-detail]').open");
  const details=await evaluate("document.querySelector('[data-detail]').textContent");
  for(const id of records[1].toolIds)assert.ok(details.includes(id),'Full equipment list remains accessible');
  assert.equal(await evaluate("Boolean(document.querySelector('[data-form=receive]'))"),false,'Sender cannot confirm recipient receipt');
  await key('Escape',27);await wait("!document.querySelector('[data-detail]').open");
  assert.equal(await evaluate("document.activeElement.dataset.id"),'TRF-00004');
  assert.ok(await evaluate("document.activeElement.closest('.mv-transfer-card') && document.activeElement.getClientRects().length"),'Focus returns to visible card button');
  await click(card('TRF-00003')+' .mv-transfer-people');await wait("document.querySelector('[data-detail]').open");
  assert.ok((await evaluate("document.querySelector('[data-detail] h2').textContent")).includes('TRF-00003'));
  await click('[data-action=close-detail]');
  // Resizing while details are open must restore focus to the now-visible table.
  await click(card('TRF-00003')+' button');await wait("document.querySelector('[data-detail]').open");await setViewport(1440);await key('Escape',27);
  assert.ok(await evaluate("document.activeElement.closest('.mv-transfer-table') && document.activeElement.getClientRects().length"));
  await setViewport(393);await fill('[data-record-search]','TRF-00008');
  assert.equal(await evaluate("document.querySelector('.mv-transfer-equipment').textContent.trim()"),'UNLISTED-TOOL');
  assert.ok(!(await evaluate("document.querySelector('.mv-transfer-card').textContent")).includes('Source project'));
  // Same server-authorized history for receiver; only the existing modal grants
  // their receipt form. Do not submit it during these display-only checks.
  await logout();await login('pau');await wait("document.querySelector('.overview-actions')");
  await go('transfer');await wait("document.querySelector('[data-transfer-tab=history]')");await click('[data-transfer-tab=history]');
  assert.deepEqual(await visibleIds(),expectedOrder);
  await click(card('TRF-00004')+' button');await wait("document.querySelector('[data-form=receive]')");
  await click('[data-action=close-detail]');
  assert.deepEqual(await snapshot(),baseline,'UI checks leave all fixture business records unchanged');
  assert.equal(calls.slice(callCount).filter(c=>c.rpc==='mcpa_movement_action').length,0,'No movement writes requested');
  assert.ok(!(await visibleIds()).includes('TRF-00999'),'Other accounts remain excluded by the existing snapshot authorization');
  console.log('PASS Cards at 320/360/375/393/430/600; table at 601/768/1440; both themes, wrapping, badges, search/status/order, full details, keyboard/focus, actual source and A/B permissions; no business writes');
};
