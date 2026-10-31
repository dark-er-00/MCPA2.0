import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {seedTransferUsers} from './seed-transfer-users.mjs';
function fixture(){
 const users=[],profiles=[];
 const client={auth:{admin:{listUsers:async({page,perPage})=>({data:{users:users.slice((page-1)*perPage,page*perPage)}}),createUser:async values=>{const user={id:randomUUID(),email:values.email,user_metadata:values.user_metadata};users.push(user);return {data:{user}};}}},from(){let filters=[],insert,update;const q={select(){return q},eq(k,v){filters.push(p=>p[k]===v);return q},is(k,v){filters.push(p=>p[k]===v);return q},limit:async()=>({data:[]}),insert(v){insert=v;return q},update(v){update=v;return q},async maybeSingle(){return {data:profiles.find(p=>filters.every(f=>f(p)))||null}},async single(){if(insert){assert.ok(!('password' in insert));profiles.push(insert);return {data:insert}}const row=profiles.find(p=>filters.every(f=>f(p)));if(!row)return {error:{}};if(update)Object.assign(row,update);return {data:row}},then(resolve,reject){return Promise.resolve({data:profiles.filter(p=>filters.every(f=>f(p)))}).then(resolve,reject)}};return q;}};
 const accounts=['A','B'].map(letter=>({name:`Engineer ${letter}`,email:`engineer-${letter.toLowerCase()}@example.test`,password:'Unique-test-password-2026!'}));
 return {client,users,profiles,accounts};
}
test('two real-account inputs preserve historical IDs and repeat without changing credentials',async()=>{
 const f=fixture(),historical=randomUUID();f.profiles.push({id:historical,name:'Engineer A',role:'engineer',auth_user_id:null});f.accounts[0].profileId=historical;
 const first=await seedTransferUsers(f.client,f.accounts);assert.equal(first[0].profileId,historical);assert.equal(f.users.length,2);
 for(const p of f.profiles)assert.notEqual(p.id,p.auth_user_id);
 const repeat=await seedTransferUsers(f.client,f.accounts);assert.equal(f.users.length,2);assert.equal(f.profiles.length,2);assert.ok(repeat.every(r=>r.reused));
});
test('development helper refuses protected emails, duplicate people and existing unrelated accounts',async()=>{
 let f=fixture();await assert.rejects(()=>seedTransferUsers(f.client,[{...f.accounts[0],email:'engineer.demo@mcpa.test'},f.accounts[1]]),/existing accounts/);assert.equal(f.users.length,0);
 f=fixture();f.profiles.push({id:randomUUID(),name:'Engineer A'});await assert.rejects(()=>seedTransferUsers(f.client,f.accounts),/already has this name/);assert.equal(f.users.length,0);
 f=fixture();f.users.push({id:randomUUID(),email:f.accounts[0].email});await assert.rejects(()=>seedTransferUsers(f.client,f.accounts),/another Auth account/);assert.equal(f.profiles.length,0);
});
