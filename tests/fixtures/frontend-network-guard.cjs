// Fail before any non-loopback connection or database dependency in the focused frontend suite.
const assert=require('node:assert/strict'),Module=require('node:module'),net=require('node:net');
const local=host=>!host||['localhost','127.0.0.1','::1','[::1]'].includes(host);
const load=Module._load;Module._load=function(name,...args){assert.ok(!/pglite|postgres|auth-test-db|movement-test-db|^(pg|sqlite|better-sqlite3)$/.test(name),'Database module blocked: '+name);return load.call(this,name,...args);};
const connect=net.Socket.prototype.connect;net.Socket.prototype.connect=function(...args){const first=args[0];const host=first&&typeof first==='object'?first.host:(typeof args[1]==='string'?args[1]:undefined);assert.ok(local(host),'Non-loopback socket blocked');return connect.apply(this,args);};
const originalFetch=globalThis.fetch;globalThis.fetch=(input,...args)=>{const url=new URL(typeof input==='string'||input instanceof URL?input:input.url);assert.ok(local(url.hostname),'Non-loopback fetch blocked');return originalFetch(input,...args);};
