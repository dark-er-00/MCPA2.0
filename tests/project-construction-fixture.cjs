const fs=require('node:fs'),path=require('node:path');
const read=file=>fs.readFileSync(path.join(__dirname,'..',file),'utf8');
const migration=read('supabase/migrations/202610230002_project_construction.sql');
const labels=['Structural','Mechanical','Electrical','Plumbing','Fire Safety','Architectural / Finishing Stage'];
const areas=(completions=[100,40,60,0,0,0],weights=[30,15,15,10,10,20])=>Object.fromEntries(labels.map((label,i)=>[label,{completion:completions[i],weight:weights[i],applicable:true,note:''}]));
async function upgrade(f){await f.db.exec(migration);}
module.exports={read,migration,labels,areas,upgrade};
