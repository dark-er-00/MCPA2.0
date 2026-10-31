// Disposable existing Office site for local tests; never a production UUID.
const {randomUUID}=require('node:crypto'),fs=require('node:fs'),path=require('node:path');
const migration=fs.readFileSync(path.join(__dirname,'../supabase/migrations/202610120002_office_returns.sql'),'utf8');
exports.migration=migration;
const withOfficeId=officeId=>migration.replace(/verified_office_id constant uuid := [^\r\n]*; -- OFFICE_ID_FROM_PREFLIGHT/,
 "verified_office_id constant uuid := "+(officeId?"'"+officeId+"'":'null')+"; -- OFFICE_ID_FROM_PREFLIGHT");
exports.withOfficeId=withOfficeId;
exports.configure=async fixture=>{
 const officeId=randomUUID();
 await fixture.db.query("insert into sites(id,name,location,assigned_engineer) values($1,'Main Office','Local equipment receiving fixture','Office test receiver')",[officeId]);
 await fixture.db.exec(withOfficeId(officeId));
 fixture.sites.office=officeId;return officeId;
};
