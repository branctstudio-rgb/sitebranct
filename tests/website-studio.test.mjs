import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import net from 'node:net';
import {createHash} from 'node:crypto';
import {spawn,spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const entry=new URL('../fixtures/website-project/studio/server.mjs',import.meta.url);
const available=fs.existsSync(entry);
test('local studio provides a real loopback creation service',()=>assert.ok(available,'Local creation service has not been implemented'));
test('owned studio shutdown finishes with an idle browser preconnection and preserves other servers',async()=>{
 const {startStudio}=await import(entry.href);
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'website68-stop-')),app=await startStudio(root);
 const other=http.createServer((_req,res)=>res.end('unrelated'));
 await new Promise(r=>other.listen(0,'127.0.0.1',r));
 const socket=net.connect(new URL(app.url).port,'127.0.0.1');socket.on('error',()=>{});
 await new Promise((resolve,reject)=>{socket.once('connect',resolve);socket.once('error',reject);});
 // A browser can preconnect without sending an HTTP request. It still belongs to this server.
 let timer,stopped;
 try{
  stopped=app.stop();
  await Promise.race([stopped,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('Owned preconnection prevented shutdown receipt')),2500);})]);
  assert.equal(JSON.parse(fs.readFileSync(app.record+'.stopped.json','utf8')).state,'STOPPED');
  assert.equal(await (await fetch(`http://127.0.0.1:${other.address().port}`)).text(),'unrelated');
 }finally{clearTimeout(timer);socket.destroy();await stopped;await new Promise(r=>other.close(r));}
});
test('launcher refuses linked ancestors before creating any directory', {skip:process.platform!=='win32'},()=>{
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'website42-launch-'));
 const real=path.join(temp,'real'),linked=path.join(temp,'linked');fs.mkdirSync(real);fs.symlinkSync(real,linked,'junction');
 const launcher=fileURLToPath(new URL('../fixtures/website-project/studio/start.ps1',import.meta.url));
 const result=spawnSync('pwsh',['-NoProfile','-File',launcher,'-Projects',path.join(linked,'new-project')],{cwd:temp,encoding:'utf8',timeout:15000});
 assert.notEqual(result.status,0);assert.match(result.stderr,/Caminho ligado não permitido/);assert.deepEqual(fs.readdirSync(real),[],'rejected path must not receive a directory or logs');
 const forbidden=fileURLToPath(new URL('../fixtures/website-project/studio/not-a-project',import.meta.url));
 const refused=spawnSync('pwsh',['-NoProfile','-File',launcher,'-Projects',forbidden],{cwd:temp,encoding:'utf8',timeout:15000});
 assert.notEqual(refused.status,0);assert.match(refused.stderr,/fora do checkout/);assert.equal(fs.existsSync(forbidden),false);
});
test('launcher returns promptly outside the checkout and owns a stoppable session',{skip:process.platform!=='win32'},async()=>{
 const parent=fs.mkdtempSync(path.join(os.tmpdir(),'website42-start-')),root=path.join(parent,'projects');
 const launcher=fileURLToPath(new URL('../fixtures/website-project/studio/start.ps1',import.meta.url)),server=fileURLToPath(entry);
 const started=Date.now(),child=spawn('pwsh',['-NoProfile','-File',launcher,'-Projects',root],{cwd:parent,stdio:['ignore','pipe','pipe']});let stdout='',stderr='';child.stdout.on('data',b=>stdout+=b);child.stderr.on('data',b=>stderr+=b);
 // Measure actual launcher exit, not pipe EOF: Windows descendants can retain capture handles.
 const exited=new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',resolve);});
 let timer;
 try{const status=await Promise.race([exited,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('launcher did not exit within 15s')),15000);})]);assert.equal(status,0,stderr);const info=JSON.parse(stdout);assert.match(info.url,/^http:\/\/127\.0\.0\.1:\d+$/);assert.ok(Date.now()-started<15000);console.log('Launcher exited in '+(Date.now()-started)+'ms outside checkout');}
 finally{clearTimeout(timer);if(fs.existsSync(path.join(root,'sessions')))for(const record of fs.readdirSync(path.join(root,'sessions')).filter(n=>n.endsWith('.json')&&!n.endsWith('.stopped.json'))){const stopped=spawnSync(process.execPath,[server,'stop',path.join(root,'sessions',record)],{encoding:'utf8',timeout:10000});assert.equal(stopped.status,0,stopped.stderr);}}
});
test('opening the local entry twice resumes the same session and preserves saved projects',{skip:process.platform!=='win32'},async()=>{
 const parent=fs.mkdtempSync(path.join(os.tmpdir(),'website-use-entry-')),root=path.join(parent,'projects');
 const launcher=fileURLToPath(new URL('../fixtures/website-project/studio/start.ps1',import.meta.url)),server=fileURLToPath(entry);
 async function launch(folder=root){
  const child=spawn('pwsh',['-NoProfile','-File',launcher,'-Projects',folder],{cwd:parent,stdio:['ignore','pipe','pipe']});let stdout='',stderr='',timer;
  child.stdout.on('data',b=>stdout+=b);child.stderr.on('data',b=>stderr+=b);
  try{const status=await Promise.race([new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',resolve);}),new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('launcher did not return')),15000);})]);assert.equal(status,0,stderr);return JSON.parse(stdout);}finally{clearTimeout(timer);}
 }
 try{
  const first=await launch(),state=await (await fetch(first.url+'/api/state')).json();
  const saved=await fetch(first.url+'/api/save',{method:'POST',headers:{origin:first.url,'content-type':'application/json','x-studio-token':state.token},body:JSON.stringify({name:'saved-v1',recipe:state.recipe})});assert.equal(saved.status,201);
  const bytes=fs.readFileSync(path.join(root,'recipes/saved-v1.json'));
  const again=await launch();assert.equal(again.url,first.url,'double-clicking the entry must not start another server');assert.equal(again.record,first.record);assert.deepEqual(fs.readFileSync(path.join(root,'recipes/saved-v1.json')),bytes);
  const stopped=spawnSync(process.execPath,[server,'stop',first.record],{encoding:'utf8',timeout:10000});assert.equal(stopped.status,0,stopped.stderr);
  const [restarted,concurrent]=await Promise.all([launch(),launch(root+path.sep)]);assert.notEqual(restarted.record,first.record);assert.equal(concurrent.record,restarted.record,'equivalent folder spellings must share one launch lock');assert.deepEqual((await (await fetch(restarted.url+'/api/state')).json()).recipes,['saved-v1']);assert.deepEqual(fs.readFileSync(path.join(root,'recipes/saved-v1.json')),bytes);
 }finally{
  if(fs.existsSync(path.join(root,'sessions')))for(const record of fs.readdirSync(path.join(root,'sessions')).filter(n=>n.endsWith('.json')&&!n.endsWith('.stopped.json'))){const file=path.join(root,'sessions',record);if(!fs.existsSync(file+'.stopped.json')){const result=spawnSync(process.execPath,[server,'stop',file],{encoding:'utf8',timeout:10000});assert.equal(result.status,0,result.stderr);}}
 }
});
test('session resume rejects wrong identity, foreign URLs, unreadable records and multiple live sessions',async()=>{
 const {startStudio,findRunningStudio}=await import(entry.href);
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'website-use-resume-')),app=await startStudio(root),original=fs.readFileSync(app.record),info=JSON.parse(original);
 let other;
 try{
  assert.deepEqual(await findRunningStudio(root),{url:app.url,record:app.record});
  for(const patch of [{url:'https://example.invalid'},{root:root+'-other'},{script:'other-server.mjs'}]){
   fs.writeFileSync(app.record,JSON.stringify({...info,...patch}));await assert.rejects(findRunningStudio(root),/inválido|diferente/);fs.writeFileSync(app.record,original);
  }
  fs.writeFileSync(app.record,'{');await assert.rejects(findRunningStudio(root),/ilegível/);fs.writeFileSync(app.record,original);
  const fake=http.createServer((_req,res)=>{res.setHeader('Content-Type','application/json');res.end(JSON.stringify({root,sessionId:'wrong'}));});await new Promise(r=>fake.listen(0,'127.0.0.1',r));
  try{fs.writeFileSync(app.record,JSON.stringify({...info,url:`http://127.0.0.1:${fake.address().port}`}));await assert.rejects(findRunningStudio(root),/diferente/);}finally{fs.writeFileSync(app.record,original);await new Promise(r=>fake.close(r));}
  other=await startStudio(root);await assert.rejects(findRunningStudio(root),/várias sessões/);
 }finally{fs.writeFileSync(app.record,original);if(other)await other.stop();await app.stop();}
 assert.equal(await findRunningStudio(root),null);
});
if(available){
 const {startStudio}=await import(entry.href);
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'website42-'));
 const app=await startStudio(root);
 const get=route=>fetch(app.url+route);
 const boot=await (await get('/api/state')).json();
 const original=boot.recipe;
 const post=(route,body,headers={})=>fetch(app.url+route,{method:'POST',headers:{origin:app.url,'content-type':'application/json','x-studio-token':boot.token,...headers},body:JSON.stringify(body)});
 const hash=dir=>Object.fromEntries(fs.readdirSync(dir,{recursive:true}).filter(x=>fs.lstatSync(path.join(dir,x)).isFile()).sort().map(x=>[x,createHash('sha256').update(fs.readFileSync(path.join(dir,x))).digest('hex')]));
 test('field errors use existing recipe validation and do not create an output',async()=>{
   const recipe=structuredClone(original);recipe.content.headline='';
   const r=await post('/api/generate',{name:'invalid',recipe});assert.equal(r.status,422);const data=await r.json();assert.ok(data.errors['content.headline']);
   assert.equal(fs.existsSync(path.join(root,'revisions','invalid')),false);
 });
 test('saved recipes reopen and revisions preserve the exact first output',async()=>{
   let r=await post('/api/save',{name:'example-v1',recipe:original});assert.equal(r.status,201);
   assert.deepEqual((await (await get('/api/recipe?name=example-v1')).json()).recipe,original);
   r=await post('/api/generate',{name:'example-v1',recipe:original});assert.equal(r.status,201);assert.equal((await r.json()).files,14);
   const dir=path.join(root,'revisions','example-v1','site'),before=hash(dir);
   const changed=structuredClone(original);changed.content.headline='Ensaio local — revisão dois';
   r=await post('/api/generate',{name:'example-v2',recipe:changed});assert.equal(r.status,201);
   assert.deepEqual(hash(dir),before);
   r=await post('/api/generate',{name:'example-v1',recipe:changed});assert.equal(r.status,409);assert.deepEqual(hash(dir),before);
   r=await post('/api/save',{name:'example-v1',recipe:changed});assert.equal(r.status,409);
 });
 test('new drafts retain noindex, publication prohibition and exact verification',async()=>{
   const dir=path.join(root,'revisions','example-v1','site');
   assert.equal(JSON.parse(fs.readFileSync(path.join(dir,'manifest.json'))).publicationAllowed,false);
   assert.match(fs.readFileSync(path.join(dir,'index.html'),'utf8'),/noindex, nofollow, noarchive/);
   fs.appendFileSync(path.join(dir,'index.html'),'tamper');
   const r=await post('/api/preview',{name:'example-v1'});assert.equal(r.status,422);
 });
 test('foreign origins, missing CSRF token, non JSON and host confusion cannot write',async()=>{
   for(const headers of [{origin:'https://example.invalid'},{'x-studio-token':''},{'content-type':'text/plain'}]){
     const r=await post('/api/save',{name:'foreign',recipe:original},headers);assert.equal(r.status,403);
   }
   assert.equal((await fetch(app.url+'/api/state',{headers:{origin:'https://example.invalid'}})).status,403);
   const status=await new Promise(resolve=>{http.get(app.url+'/api/state',{headers:{host:'evil.invalid'}},r=>{r.resume();resolve(r.statusCode);});});assert.equal(status,403);
   assert.equal(fs.existsSync(path.join(root,'recipes','foreign.json')),false);
 });
 test('no paths, assets or unapproved provenance can be supplied by a browser',async()=>{
   for(const name of ['../escape','C:/escape','a\\b','NUL','x.json','%2e%2e','a/b','Foo'])assert.equal((await post('/api/save',{name,recipe:original})).status,422);
   for(const mutate of [c=>c.assets.root='C:/',c=>c.assets.hero='src/img/other.webp',c=>c.sources[0].path='package.json',c=>c.extra='ignored']){
     const c=structuredClone(original);mutate(c);assert.equal((await post('/api/save',{name:'unapproved',recipe:c})).status,422);
   }
   assert.equal((await get('/api/recipe?name=../escape')).status,422);
   assert.equal((await get('/..%2fCLAUDE.md')).status,404);
 });
 test('a linked revision directory is refused before materialization',async()=>{
   const elsewhere=fs.mkdtempSync(path.join(os.tmpdir(),'website42-other-'));
   fs.symlinkSync(elsewhere,path.join(root,'revisions','linked'),process.platform==='win32'?'junction':'dir');
   assert.equal((await post('/api/preview',{name:'linked'})).status,422);
   assert.deepEqual(fs.readdirSync(elsewhere),[]);
 });
 test('UTF-8 split across HTTP chunks is preserved, malformed UTF-8 is refused',async()=>{
   const recipe=structuredClone(original);recipe.content.headline='Criação em português';
   const bytes=Buffer.from(JSON.stringify({name:'utf-v1',recipe}));const split=bytes.indexOf(Buffer.from('ç'))+1;
   const result=await new Promise((resolve,reject)=>{
     const request=http.request(app.url+'/api/save',{method:'POST',headers:{origin:app.url,'content-type':'application/json','x-studio-token':boot.token}},response=>{let data='';response.on('data',b=>data+=b);response.on('end',()=>resolve({status:response.statusCode,body:data}));});
     request.on('error',reject);request.write(bytes.subarray(0,split));setTimeout(()=>request.end(bytes.subarray(split)),25);
   });
   assert.equal(result.status,201);
   assert.deepEqual((await (await get('/api/recipe?name=utf-v1')).json()).recipe,recipe);
   const invalid=Buffer.concat([Buffer.from('{"name":"utf-invalid","recipe":"'),Buffer.from([0xff]),Buffer.from('"}')]);
   const r=await fetch(app.url+'/api/save',{method:'POST',headers:{origin:app.url,'content-type':'application/json','x-studio-token':boot.token},body:invalid});assert.equal(r.status,422);
 });
 test('shutdown waits for a genuinely opening preview and closes that owned server',async()=>{
   const otherRoot=fs.mkdtempSync(path.join(os.tmpdir(),'website42-race-')),other=await startStudio(otherRoot);
   const auth=await (await fetch(other.url+'/api/state')).json();
   const call=(route,data)=>fetch(other.url+route,{method:'POST',headers:{origin:other.url,'content-type':'application/json','x-studio-token':auth.token},body:JSON.stringify(data)});
   await call('/api/generate',{name:'race-v1',recipe:auth.recipe});
   const originalListen=http.Server.prototype.listen;let notifyOpening;const owned=[];
   const opening=new Promise(resolve=>notifyOpening=resolve);
   // Delay only the real listen callback to make the overlap deterministic.
   http.Server.prototype.listen=function(...args){owned.push(this);const callback=args.pop();return originalListen.call(this,...args,()=>{notifyOpening();setTimeout(callback,70);});};
   let preview;
   try{
     const pending=call('/api/preview',{name:'race-v1'});await opening;
     const stopping=call('/api/stop',{});preview=await (await pending).json();await stopping;await other.closed;
     const receipt=JSON.parse(fs.readFileSync(other.record+'.stopped.json'));
     assert.ok(receipt.previews.includes(preview.id),'opening preview must be included in the shutdown receipt');
     await assert.rejects(fetch(preview.urls.home));
   }finally{http.Server.prototype.listen=originalListen;for(const server of owned){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}await other.stop();}
 });
 test('only owned previews close and a shutdown receipt is written',async()=>{
   const r=await post('/api/preview',{name:'example-v2'});assert.equal(r.status,200);const preview=await r.json();
   assert.equal((await fetch(preview.urls.home)).status,200);assert.equal((await fetch(preview.urls.contact)).status,200);
   assert.equal((await fetch(preview.urls.home,{headers:{origin:'https://example.invalid'}})).status,403);
   assert.equal((await post('/api/stop-preview',{id:'unknown'})).status,404);
   assert.equal((await post('/api/stop-preview',{id:preview.id})).status,200);
   await assert.rejects(fetch(preview.urls.home));
   const opened=await (await post('/api/preview',{name:'example-v2'})).json();
   const response=await post('/api/stop',{});assert.equal(response.status,200);
   await app.closed;
   const receipt=JSON.parse(fs.readFileSync(app.record+'.stopped.json','utf8'));assert.equal(receipt.state,'STOPPED');assert.ok(receipt.previews.includes(opened.id));
   await assert.rejects(fetch(app.url));
 });
 test.after(async()=>{await app.stop();console.log('Preserved test evidence: '+root);});
}
