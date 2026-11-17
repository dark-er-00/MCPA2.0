const fs=require('node:fs'),path=require('node:path');
const {open}=require('./driver.cjs');
(async()=>{const b=await open();try{
 await b.navigate('/index.html?fixture=admin&theme=dark#dashboard');
 await b.wait('document.querySelector("[data-pie-chart]")');
 console.log(JSON.stringify(await b.evaluate('({kpis:[...document.querySelectorAll(".kpi .num")].map(n=>n.textContent),pie:[...document.querySelectorAll(".v2-legend-row strong")].map(n=>n.textContent),body:document.body.innerText.slice(-1000)})')));
 await b.shot('integrated-admin-dark',false);
 console.log(JSON.stringify({errors:b.errors,blocked:b.blocked,console:b.logs.filter(x=>x.level==='error')}));
}finally{await b.close()}})().catch(e=>{console.error(e);process.exitCode=1});
