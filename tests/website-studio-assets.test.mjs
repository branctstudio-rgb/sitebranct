import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {startStudio} from '../fixtures/website-project/studio/server.mjs';
import {syntheticPNG} from './website-studio-fixtures.mjs';
const png=syntheticPNG();
const sha=b=>createHash('sha256').update(b).digest('hex');
test('explicit local import survives generation, relocation and reopening without changing v1',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'website43-'));let app=await startStudio(root);
 const auth=await (await fetch(app.url+'/api/state')).json();
 const post=(route,body)=>fetch(app.url+'/api/'+route,{method:'POST',headers:{origin:app.url,'content-type':'application/json','x-studio-token':auth.token},body:JSON.stringify(body)});
 try{
  assert.equal((await post('generate',{name:'old-v1',recipe:auth.recipe})).status,201);
  const old=fs.readFileSync(path.join(root,'revisions/old-v1/site/manifest.json'));
  const r=await post('import',{name:'synthetic.png',data:png.toString('base64')});assert.equal(r.status,201,await r.clone().text());
  const asset=await r.json();assert.equal(asset.sha256,sha(png));assert.equal(asset.bytes,png.length);
  assert.match(asset.path,/^imports\/[a-f0-9]{64}\.png$/);
  assert.deepEqual(fs.readFileSync(path.join(root,'library',asset.path)),png);
  const recipe=structuredClone(auth.recipe);recipe.version=2;recipe.assets.root='../library';recipe.assets.logo=asset.path;recipe.assets.hero=asset.path;recipe.assets.heroDecorative=false;recipe.fonts.body='bricolage';recipe.fonts.display='manrope';
  assert.equal((await post('save',{name:'import-v2',recipe})).status,201);
  assert.equal((await post('generate',{name:'import-v2',recipe})).status,201);
  assert.deepEqual(fs.readFileSync(path.join(root,'revisions/old-v1/site/manifest.json')),old);
  const manifest=JSON.parse(fs.readFileSync(path.join(root,'revisions/import-v2/site/manifest.json')));
  for(const name of ['assets/logo.png','assets/hero.png'])assert.equal(manifest.files.find(f=>f.path===name).sha256,sha(png));
  assert.match(fs.readFileSync(path.join(root,'revisions/import-v2/site/assets/project.css'),'utf8'),/--font-body:'bricolage'/);
  assert.equal((await post('generate',{name:'import-v2',recipe})).status,409);
  const bad=structuredClone(recipe);bad.assets.heroAlt='';assert.equal((await post('validate',{recipe:bad})).status,422);
  bad.assets.heroDecorative=true;assert.equal((await post('generate',{name:'decorative-v3',recipe:bad})).status,201);
  assert.match(fs.readFileSync(path.join(root,'revisions/decorative-v3/site/index.html'),'utf8'),/assets\/hero.png" alt=""/);
  for(const input of [{name:'../evil.png',data:png.toString('base64')},{name:'NUL.png',data:png.toString('base64')},{name:'image.svg',data:Buffer.from('<svg onload="alert(1)"/>').toString('base64')},{name:'image.png',data:Buffer.from('<html>not PNG</html>').toString('base64')},{name:'image.png',data:Buffer.concat([png,Buffer.from('trailing')]).toString('base64')},{name:'image.png',data:'%%%='},{name:'image.png',data:Buffer.alloc(2*1024*1024+1).toString('base64')},{name:'https://example.invalid/image.png',data:png.toString('base64')}]){
   assert.ok([413,422].includes((await post('import',input)).status));
  }
  const duplicate=await post('import',{name:'second.png',data:png.toString('base64')});assert.equal(duplicate.status,200);assert.deepEqual(fs.readFileSync(path.join(root,'library',asset.path)),png);
  await app.stop();
  const moved=fs.mkdtempSync(path.join(os.tmpdir(),'website43-moved-'));fs.cpSync(root,moved,{recursive:true});
  app=await startStudio(moved);const boot=await (await fetch(app.url+'/api/state')).json();
  const reopened=await (await fetch(app.url+'/api/recipe?name=import-v2')).json();assert.equal(reopened.recipe.assets.root,'../library');
  const preview=await fetch(app.url+'/api/preview',{method:'POST',headers:{origin:app.url,'content-type':'application/json','x-studio-token':boot.token},body:'{"name":"import-v2"}'});assert.equal(preview.status,200,await preview.clone().text());
  const links=(await preview.json()).urls;assert.equal((await fetch(links.home)).status,200);assert.equal((await fetch(links.contact)).status,200);
  fs.renameSync(path.join(moved,'library',asset.path),path.join(moved,'library',asset.path+'.missing'));
  const load=await fetch(app.url+'/api/recipe?name=import-v2');assert.equal(load.status,200,'missing asset must not prevent loading recipe to repair');
  const validate=await fetch(app.url+'/api/validate',{method:'POST',headers:{origin:app.url,'content-type':'application/json','x-studio-token':boot.token},body:JSON.stringify({recipe:reopened.recipe})});assert.equal(validate.status,422);assert.match(await validate.text(),/assets\.(logo|hero)/);
  console.log('Portable import evidence '+moved);
 }finally{await app.stop();}
});
test('import refuses malformed PNG, oversize dimensions and untrusted destinations without writing',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'website43-negative-')),app=await startStudio(root);try{
  const auth=await (await fetch(app.url+'/api/state')).json();
  const post=body=>fetch(app.url+'/api/import',{method:'POST',headers:{origin:app.url,'content-type':'application/json','x-studio-token':auth.token},body:JSON.stringify(body)});
  const corrupt=Buffer.from(png);corrupt[35]^=1;
  for(const [name,data] of [['bad-crc.png',corrupt],['wide.png',syntheticPNG(2049,1)],['truncated.png',png.subarray(0,-5)],['C:evil.png',png],['a\\evil.png',png],['CON.png',png],['active.png',Buffer.from('<svg><script>example</script></svg>')]])assert.equal((await post({name,data:data.toString('base64')})).status,422,name);
  assert.equal((await post({name:'plain.png',data:png.toString('base64'),path:'../elsewhere'})).status,422);
  assert.deepEqual(fs.readdirSync(path.join(root,'library/imports')),[]);assert.deepEqual(fs.readdirSync(path.join(root,'library/catalog')),[]);
 }finally{await app.stop();}
});
test('missing selected asset can be restored only by reimporting identical bytes, never by overwriting',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'website43-repair-')),app=await startStudio(root);try{
  const auth=await (await fetch(app.url+'/api/state')).json();const post=data=>fetch(app.url+'/api/import',{method:'POST',headers:{origin:app.url,'content-type':'application/json','x-studio-token':auth.token},body:JSON.stringify({name:'restore.png',data:data.toString('base64')})});
  const asset=await (await post(png)).json(),file=path.join(root,'library',asset.path),record=fs.readFileSync(path.join(root,'library/catalog',asset.sha256+'.json'));
  fs.renameSync(file,file+'.preserved');const repair=await post(png);assert.equal(repair.status,200);assert.deepEqual(fs.readFileSync(file),png);assert.deepEqual(fs.readFileSync(path.join(root,'library/catalog',asset.sha256+'.json')),record);
  fs.writeFileSync(file,'damaged');assert.equal((await post(png)).status,422);assert.equal(fs.readFileSync(file,'utf8'),'damaged');
 }finally{await app.stop();}
});
