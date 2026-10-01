import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {startStudio} from '../fixtures/website-project/studio/server.mjs';
const hash=b=>createHash('sha256').update(b).digest('hex');
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
