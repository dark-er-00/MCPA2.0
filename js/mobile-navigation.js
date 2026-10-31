// One drawer controller for both entry pages; role-filtered navigation is unchanged.
(function(){
 const sidebar=document.getElementById('sidebar'),main=document.getElementById('main-col');
 const trigger=document.querySelector('.mobile-menu-btn'),compact=matchMedia('(max-width:900px)');
 if(!sidebar||!trigger)return;
 trigger.setAttribute('aria-label','Open navigation');trigger.setAttribute('aria-controls','sidebar');trigger.setAttribute('aria-expanded','false');
 const backdrop=document.createElement('div');backdrop.className='drawer-backdrop';backdrop.hidden=true;
 sidebar.before(backdrop);
 const closeButton=document.createElement('button');closeButton.type='button';closeButton.className='icon-btn drawer-close';closeButton.setAttribute('aria-label','Close navigation');
 closeButton.innerHTML='<svg aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="m6 6 12 12M6 18 18 6"/></svg>';
 sidebar.querySelector('.brand').append(closeButton);
 let opened=false;
 function close(restore=true){
  const wasOpen=opened;opened=false;sidebar.classList.remove('open');backdrop.hidden=true;
  main.inert=false;sidebar.inert=compact.matches;sidebar.removeAttribute('aria-modal');sidebar.removeAttribute('role');sidebar.removeAttribute('aria-label');
  document.documentElement.classList.remove('drawer-open');trigger.setAttribute('aria-expanded','false');
  if(wasOpen&&restore)trigger.focus({preventScroll:true});
 }
 function open(){
  if(!compact.matches)return;
  window.closeMobileSearch?.(false);document.querySelector('#account-menu')?.removeAttribute('open');
  opened=true;sidebar.inert=false;sidebar.classList.add('open');backdrop.hidden=false;main.inert=true;
  sidebar.setAttribute('role','dialog');sidebar.setAttribute('aria-modal','true');sidebar.setAttribute('aria-label','Navigation');
  document.documentElement.classList.add('drawer-open');trigger.setAttribute('aria-expanded','true');closeButton.focus({preventScroll:true});
 }
 trigger.onclick=()=>opened?close():open();closeButton.onclick=()=>close();backdrop.onclick=()=>close();
 document.addEventListener('keydown',event=>{
  if(!opened)return;
  if(event.key==='Escape'){event.preventDefault();close();return;}
  if(event.key==='Tab'){
   const controls=[...sidebar.querySelectorAll('button,a[href],input,select,[tabindex="0"]')].filter(el=>!el.disabled&&el.getClientRects().length);
   const first=controls[0],last=controls.at(-1);
   if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
   else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
  }
 });
 compact.addEventListener('change',()=>close(false));close(false);
 window.MCPADrawer={open,close};
})();


// The visible control uses the same traversal as the phone/browser Back action.
document.getElementById('mobile-back')?.addEventListener('click', () => window.MCPANavigation.back());
