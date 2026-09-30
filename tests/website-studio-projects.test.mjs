import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {createHash} from 'node:crypto';
import {startStudio} from '../fixtures/website-project/studio/server.mjs';import {syntheticPNG} from './website-studio-fixtures.mjs';
const hash=b=>createHash('sha256').update(b).digest('hex');
async function harness(){const root=fs.mkdtempSync(path.join(os.tmpdir(),'website44-'));const app=await startStudio(root);const state=async project=>(await fetch(app.url+'/api/state?project='+project)).json();const token=(await state('legacy')).token;const post=(project,route,input)=>fetch(app.url+'/api/'+route,{method:'POST',headers:{origin:app.url,'content-type':'application/json','x-studio-token':token,'x-studio-project':project},body:JSON.stringify(input)});return {root,app,state,post};}
test('create and duplicate projects keep recipes, referenced bytes and revisions isolated',async()=>{
 const {root,app,state,post}=await harness();
 try{
  const legacy=await state('legacy');assert.equal((await post('legacy','generate',{name:'legacy-v1',recipe:legacy.recipe})).status,201);const before=fs.readFileSync(path.join(root,'revisions/legacy-v1/site/manifest.json'));
  const made=await post('legacy','projects',{id:'cedro-ficticio',name:'Cedro fictício',source:null});assert.equal(made.status,201,await made.clone().text());
  const a=await state('cedro-ficticio');assert.equal(a.project.id,'cedro-ficticio');assert.deepEqual(a.revisions,[]);
  const bytes=syntheticPNG(256,64);const imported=await (await post('cedro-ficticio','import',{name:'logo.png',data:bytes.toString('base64')})).json();
  await post('cedro-ficticio','import',{name:'unused.png',data:syntheticPNG(64,64,[99,88,77]).toString('base64')});
  const recipe=a.recipe;recipe.assets.logo=imported.path;recipe.content.headline='Cedro apenas';
  assert.equal((await post('cedro-ficticio','save',{name:'v1',recipe})).status,201);assert.equal((await post('cedro-ficticio','generate',{name:'v1',recipe})).status,201);
  assert.equal((await post('legacy','projects',{id:'linha-ficticia',name:'Linha fictícia',source:{project:'cedro-ficticio',kind:'revision',name:'v1'}})).status,201);
  const b=await state('linha-ficticia');assert.equal(b.recipe.content.headline,'Cedro apenas');assert.equal(b.imported.length,1);assert.equal(b.imported[0].sha256,hash(bytes));assert.deepEqual(b.revisions,[]);
  b.recipe.content.headline='Linha separada';assert.equal((await post('linha-ficticia','save',{name:'v1',recipe:b.recipe})).status,201);assert.equal((await post('linha-ficticia','generate',{name:'v1',recipe:b.recipe})).status,201);
  for(const [project,text] of [['cedro-ficticio','Cedro apenas'],['linha-ficticia','Linha separada']]){const preview=await (await post(project,'preview',{name:'v1'})).json();for(const url of Object.values(preview.urls)){const page=await fetch(url);assert.equal(page.status,200);}assert.ok(fs.readFileSync(path.join(root,'projects',project,'revisions/v1/site/index.html'),'utf8').includes(text));}
  const aFile=path.join(root,'projects/cedro-ficticio/library',imported.path),bFile=path.join(root,'projects/linha-ficticia/library',imported.path);fs.writeFileSync(aFile,'damaged local test resource');assert.deepEqual(fs.readFileSync(bFile),bytes);
  assert.equal((await post('linha-ficticia','preview',{name:'v1'})).status,200);assert.notEqual((await post('cedro-ficticio','preview',{name:'v1'})).status,200);assert.deepEqual(fs.readFileSync(path.join(root,'revisions/legacy-v1/site/manifest.json')),before);
 }finally{await app.stop();}
});
test('project creation rejects collision, paths and invalid sources before creating destination',async()=>{
 const {root,app,state,post}=await harness();try{
  assert.equal((await post('legacy','projects',{id:'alpha',name:'Alpha fictício',source:null})).status,201);
  const manifest=fs.readFileSync(path.join(root,'projects/alpha/project.json'));
  assert.equal((await post('legacy','projects',{id:'alpha',name:'Other',source:null})).status,409);
  for(const id of ['../escape','C:drive','UPPER','con','a/b','x\\y','.','with space'])assert.equal((await post('legacy','projects',{id,name:'Test',source:null})).status,422);
  assert.equal((await post('legacy','projects',{id:'missing-source',name:'Test',source:{project:'alpha',kind:'revision',name:'absent'}})).status,404);assert.equal(fs.existsSync(path.join(root,'projects/missing-source')),false);
  assert.deepEqual(fs.readFileSync(path.join(root,'projects/alpha/project.json')),manifest);assert.equal((await fetch(app.url+'/api/state?project=unknown')).status,404);
  const a=await state('alpha');assert.equal((await post('alpha','save',{name:'v1',recipe:a.recipe})).status,201);assert.equal((await post('alpha','save',{name:'v1',recipe:a.recipe})).status,409);
 }finally{await app.stop();}
});
test('two projects survive restart and copying the entire stopped library to a new local folder',async()=>{
 const {root,app,state,post}=await harness();let moved;
 try{for(const id of ['first-project','second-project']){assert.equal((await post('legacy','projects',{id,name:id,source:null})).status,201);const s=await state(id);assert.equal((await post(id,'save',{name:'v1',recipe:s.recipe})).status,201);assert.equal((await post(id,'generate',{name:'v1',recipe:s.recipe})).status,201);}await app.stop();
  const copy=fs.mkdtempSync(path.join(os.tmpdir(),'website44-moved-'));fs.cpSync(root,copy,{recursive:true,errorOnExist:true,force:false});moved=await startStudio(copy);
  for(const id of ['first-project','second-project']){const s=await (await fetch(moved.url+'/api/state?project='+id)).json();assert.equal(s.project.id,id);assert.deepEqual(s.recipes,['v1']);assert.deepEqual(s.revisions,['v1']);const response=await fetch(moved.url+'/api/preview',{method:'POST',headers:{origin:moved.url,'content-type':'application/json','x-studio-token':s.token,'x-studio-project':id},body:JSON.stringify({name:'v1'})});assert.equal(response.status,200);const links=await response.json();for(const url of Object.values(links.urls))assert.equal((await fetch(url)).status,200);}
 }finally{await app.stop();if(moved)await moved.stop();}
});
