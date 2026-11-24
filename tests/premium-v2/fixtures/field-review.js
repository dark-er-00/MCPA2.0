// Optional direct link to a prefilled synthetic draft. Only the loopback fixture loads this file.
if(new URLSearchParams(location.search).get('sample')==='confirm'){
  document.addEventListener('mcpa:navigation-ready',()=>{
    const project=document.querySelector('[data-field="site_id"]');
    const quantity=document.querySelector('[data-quantity]');
    if(!project?.options[1]||!quantity)return;
    project.selectedIndex=1;project.dispatchEvent(new Event('input',{bubbles:true}));
    quantity.value='2';quantity.dispatchEvent(new Event('input',{bubbles:true}));
    document.querySelector('[data-action="review-request"]')?.click();
  },{once:true});
}
