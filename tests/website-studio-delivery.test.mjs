import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {startStudio} from '../fixtures/website-project/studio/server.mjs';
const hash=b=>createHash('sha256').update(b).digest('hex');
test('delivery conference binds the complete checks to the exact saved project/version and manifest',async()=>{
 const {root,app,post}=await harness();try{
  await post('prepare-delivery',{name:'v1'});
  const response=await post('check-delivery',{name:'v1'});assert.equal(response.status,200,await response.clone().text());const report=await response.json();
  assert.equal(report.state,'PASS');assert.equal(report.project,'legacy');assert.equal(report.name,'v1');
  assert.deepEqual(report.checks.map(c=>c.id),['integrity','recipe','pages','navigation','resources']);assert.ok(report.checks.every(c=>c.state==='PASS'));
  assert.equal(report.manifestSha256,hash(fs.readFileSync(path.join(root,'deliveries/v1/delivery.json'))));assert.ok(Number.isFinite(Date.parse(report.checkedAt)));
  assert.deepEqual(report.issues,[]);assert.equal(report.publicationAllowed,false);
  assert.equal((await post('check-delivery',{name:'../v1'})).status,422);
  assert.equal((await post('check-delivery',{name:'v1',root:os.tmpdir()})).status,422);
 }finally{await app.stop();}
});
test('conference reports the missing image with correction field; regeneration preserves old revision and never reuses PASS',async()=>{
 const {root,app,post}=await harness();try{
  await post('prepare-delivery',{name:'v1'});assert.equal((await(await post('check-delivery',{name:'v1'})).json()).state,'PASS');
  const dest=path.join(root,'deliveries/v1'),manifest=JSON.parse(fs.readFileSync(path.join(dest,'delivery.json'))),hero=manifest.files.find(f=>f.path.startsWith('site/assets/hero.')).path;
  const revisionBefore=fs.readFileSync(path.join(root,'revisions/v1/site/manifest.json'));
  fs.unlinkSync(path.join(dest,hero));
  const report=await(await post('check-delivery',{name:'v1'})).json();assert.equal(report.state,'FAIL');assert.equal(report.issues[0].file,hero);assert.equal(report.issues[0].field,'assets.hero');assert.equal(report.issues[0].severity,'blocker');
  assert.notEqual((await post('delivery-preview',{name:'v1'})).status,200);
  const state=await(await fetch(app.url+'/api/state')).json();assert.equal((await post('generate',{name:'v2',recipe:state.recipe})).status,201);await post('prepare-delivery',{name:'v2'});
  assert.equal((await(await post('check-delivery',{name:'v2'})).json()).state,'PASS');assert.equal((await(await post('check-delivery',{name:'v1'})).json()).state,'FAIL');
  assert.deepEqual(fs.readFileSync(path.join(root,'revisions/v1/site/manifest.json')),revisionBefore);assert.equal(fs.existsSync(path.join(dest,hero)),false);
 }finally{await app.stop();}
});
test('conference rejects coordinated hash updates and does not execute delivery scripts or accept another version',async()=>{
 const {root,app,post}=await harness();try{
  await post('prepare-delivery',{name:'v1'});const dest=path.join(root,'deliveries/v1'),file=path.join(dest,'site/index.html');
  fs.writeFileSync(file,fs.readFileSync(file,'utf8').replace('id="abordagem"','id="broken"'));
  const site=JSON.parse(fs.readFileSync(path.join(dest,'site/manifest.json')));for(const row of site.files){const bytes=fs.readFileSync(path.join(dest,'site',row.path));row.bytes=bytes.length;row.sha256=hash(bytes);}fs.writeFileSync(path.join(dest,'site/manifest.json'),JSON.stringify(site));
  const m=JSON.parse(fs.readFileSync(path.join(dest,'delivery.json')));for(const row of m.files){const bytes=fs.readFileSync(path.join(dest,row.path));row.bytes=bytes.length;row.sha256=hash(bytes);}fs.writeFileSync(path.join(dest,'delivery.json'),JSON.stringify(m));
  let report=await(await post('check-delivery',{name:'v1'})).json();assert.equal(report.state,'FAIL');assert.match(report.issues[0].message,/bytes diferentes/);assert.equal(report.issues[0].file,'site/index.html');
  m.version='v2';fs.writeFileSync(path.join(dest,'delivery.json'),JSON.stringify(m));report=await(await post('check-delivery',{name:'v1'})).json();assert.equal(report.state,'FAIL');assert.match(report.issues[0].message,/Identidade/);
 }finally{await app.stop();}
});
async function harness(){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'website45-')),app=await startStudio(root);
 const state=await (await fetch(app.url+'/api/state')).json();
 const post=(route,input,project='legacy')=>fetch(app.url+'/api/'+route,{method:'POST',headers:{origin:app.url,'content-type':'application/json','x-studio-token':state.token,'x-studio-project':project},body:JSON.stringify(input)});
 assert.equal((await post('generate',{name:'v1',recipe:state.recipe})).status,201);
 return {root,app,post};
}
test('delivery copies only a verified static revision; is independently verifiable after relocation and shutdown',async()=>{
 const {root,app,post}=await harness();try{
  const source=path.join(root,'revisions/v1/site');const original=fs.readFileSync(path.join(source,'manifest.json'));
  const r=await post('prepare-delivery',{name:'v1'});assert.equal(r.status,201,await r.clone().text());const proof=await r.json();
  assert.equal(proof.publicationAllowed,false);assert.equal(proof.name,'v1');assert.equal(proof.project,'legacy');assert.equal(proof.files,17);
  const dest=path.join(root,'deliveries/v1');assert.equal(proof.destination,dest);assert.equal(hash(fs.readFileSync(path.join(dest,'delivery.json'))),proof.manifestSha256);
  assert.deepEqual(fs.readdirSync(dest).sort(),['LEIA-ME.md','delivery.json','site','verify.mjs']);
  assert.deepEqual(fs.readFileSync(path.join(dest,'site/manifest.json')),original);
  assert.ok(!fs.readFileSync(path.join(dest,'delivery.json'),'utf8').includes(root));
  assert.equal((await post('prepare-delivery',{name:'v1'})).status,409);
  const p=await post('delivery-preview',{name:'v1'});assert.equal(p.status,200);const links=await p.json();
  for(const url of Object.values(links.urls))assert.equal((await fetch(url)).status,200);
  const moved=path.join(fs.mkdtempSync(path.join(os.tmpdir(),'website45-receiver-')),'entrega');fs.cpSync(dest,moved,{recursive:true,errorOnExist:true,force:false});
  await app.stop();fs.renameSync(path.join(root,'revisions'),path.join(root,'revisions-preserved'));
  const check=spawnSync(process.execPath,[path.join(moved,'verify.mjs'),'verify',moved],{encoding:'utf8',cwd:os.tmpdir()});assert.equal(check.status,0,check.stderr);assert.equal(JSON.parse(check.stdout).files,17);
  const {serveDelivery}=await import('../fixtures/website-project/delivery.mjs');const running=await serveDelivery(moved);
  try{for(const url of Object.values(running.urls)){const response=await fetch(url);assert.equal(response.status,200);assert.match(await response.text(),/noindex/);}
   assert.equal((await fetch(new URL('/delivery.json',running.urls.home))).status,404);
  }finally{await new Promise(resolve=>running.server.close(resolve));}
  assert.deepEqual(fs.readFileSync(path.join(root,'revisions-preserved/v1/site/manifest.json')),original);
 }finally{await app.stop();}
});
test('delivery rejects tampered or extra revision output and unknown fields before writing a destination',async()=>{
 const {root,app,post}=await harness();try{
  for(const name of ['../escape','C:drive','con','Upper'])assert.equal((await post('prepare-delivery',{name})).status,422);
  assert.equal((await post('prepare-delivery',{name:'v1',destination:os.tmpdir()})).status,422);
  assert.equal((await post('prepare-delivery',{name:'missing'})).status,404);
  const home=path.join(root,'revisions/v1/site/index.html'),bytes=fs.readFileSync(home);fs.appendFileSync(home,'tampered');
  assert.equal((await post('prepare-delivery',{name:'v1'})).status,422);assert.equal(fs.existsSync(path.join(root,'deliveries/v1')),false);
  fs.writeFileSync(home,bytes);fs.writeFileSync(path.join(root,'revisions/v1/site/session.json'),'private test');
  assert.equal((await post('prepare-delivery',{name:'v1'})).status,422);assert.equal(fs.existsSync(path.join(root,'deliveries/v1')),false);
 }finally{await app.stop();}
});
test('delivery verifier and serving reject missing, modified, extra files and linked files without requiring recipes',async()=>{
 const {root,app,post}=await harness();try{
  assert.equal((await post('prepare-delivery',{name:'v1'})).status,201);
  const {verifyDelivery,serveDelivery}=await import('../fixtures/website-project/delivery.mjs'),dest=path.join(root,'deliveries/v1');
  const running=await serveDelivery(dest),file=path.join(dest,'site/index.html'),original=fs.readFileSync(file);
  try{fs.appendFileSync(file,'changed');assert.throws(()=>verifyDelivery(dest),/hash|bytes/);assert.equal((await fetch(running.urls.home)).status,409);
   fs.writeFileSync(file,original);fs.renameSync(file,file+'.saved');assert.throws(()=>verifyDelivery(dest),/files|ficheiros/);fs.renameSync(file+'.saved',file);
   fs.writeFileSync(path.join(dest,'private.txt'),'excluded');assert.throws(()=>verifyDelivery(dest),/files|ficheiros/);
  }finally{await new Promise(resolve=>running.server.close(resolve));}
  const linkRoot=fs.mkdtempSync(path.join(os.tmpdir(),'website45-link-'));fs.symlinkSync(dest,path.join(linkRoot,'linked'),'junction');assert.throws(()=>verifyDelivery(path.join(linkRoot,'linked')),/ligado|link/);
 }finally{await app.stop();}
});
test('same revision names produce separate deliveries in each project',async()=>{
 const {root,app,post}=await harness();try{
  for(const id of ['cedro45','linha45']){assert.equal((await post('projects',{id,name:id,source:null})).status,201);const s=await (await fetch(app.url+'/api/state?project='+id)).json();assert.equal((await post('generate',{name:'v1',recipe:s.recipe},id)).status,201);assert.equal((await post('prepare-delivery',{name:'v1'},id)).status,201);assert.ok(fs.readFileSync(path.join(root,'projects',id,'deliveries/v1/site/index.html'),'utf8').includes(id));}
  assert.equal(fs.existsSync(path.join(root,'deliveries/v1')),false);
 }finally{await app.stop();}
});
test('conference names missing page/font and refuses extra files or a linked manifest before reading it',async t=>{
 const {root,app,post}=await harness();try{
  await post('prepare-delivery',{name:'v1'});const dest=path.join(root,'deliveries/v1'),manifestFile=path.join(dest,'delivery.json'),bytes=fs.readFileSync(manifestFile),m=JSON.parse(bytes);
  for(const name of ['site/index.html',m.files.find(f=>f.path.endsWith('.woff2')).path]){
   const file=path.join(dest,name),saved=fs.readFileSync(file);fs.unlinkSync(file);
   const report=await(await post('check-delivery',{name:'v1'})).json();assert.equal(report.state,'FAIL');assert.equal(report.issues[0].file,name);
   if(name.endsWith('.woff2'))assert.equal(report.issues[0].field,'fonts.body');fs.writeFileSync(file,saved);
  }
  const extra=path.join(dest,'unexpected.txt');fs.writeFileSync(extra,'synthetic');const report=await(await post('check-delivery',{name:'v1'})).json();assert.equal(report.state,'FAIL');assert.equal(report.issues[0].file,'unexpected.txt');fs.unlinkSync(extra);
  const outside=path.join(root,'not-a-manifest.txt');fs.writeFileSync(outside,'NOT JSON — must not be read');fs.unlinkSync(manifestFile);
  try{fs.symlinkSync(outside,manifestFile,'file');}catch(error){if(error.code!=='EPERM')throw error;t.diagnostic('File symlink unavailable: using directory junction at manifest path to verify pre-read refusal.');fs.symlinkSync(root,manifestFile,'junction');}
  const {verifyDelivery}=await import('../fixtures/website-project/delivery.mjs');assert.throws(()=>verifyDelivery(dest),/Caminho ligado recusado/);
 }finally{await app.stop();}
});
