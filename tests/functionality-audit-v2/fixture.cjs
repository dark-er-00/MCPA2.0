const fs=require('node:fs'),path=require('node:path');
const migrations=['202610260001_self_profile.sql','202610260002_consumable_whole_units.sql','202610270001_remove_user_invitations.sql'];
async function upgrade(f){for(const name of migrations)await f.db.exec(fs.readFileSync(path.join(__dirname,'../../supabase/migrations',name),'utf8'));return f;}
async function fixture(t){return upgrade(await require('../integration-quantity-custody-v2/fixture.cjs').fixture(t));}
module.exports={fixture,upgrade,migrations};
