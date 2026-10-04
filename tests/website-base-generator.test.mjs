import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const moduleFile=path.join(root,'fixtures/website-base/generate.mjs');
const config=id=>JSON.parse(fs.readFileSync(path.join(root,`fixtures/website-base/${id}.json`)));
async function builder(){assert.ok(fs.existsSync(moduleFile),'missing executable adoption mechanism');return import(pathToFileURL(moduleFile));}
function folder(){return fs.mkdtempSync(path.join(os.tmpdir(),'website32-test-'));}
function tree(dir){return Object.fromEntries(fs.readdirSync(dir,{recursive:true}).filter(p=>fs.statSync(path.join(dir,p)).isFile()).sort().map(p=>[p,fs.readFileSync(path.join(dir,p)).toString('base64')]));}

test('two actual projects generate independently without operational identity',async()=>{
 const {generate}=await builder(),parent=folder();
 generate(config('cedro'),path.join(parent,'a'));generate(config('linha'),path.join(parent,'b'));
 const a=fs.readFileSync(path.join(parent,'a/index.html'),'utf8'),b=fs.readFileSync(path.join(parent,'b/index.html'),'utf8');
 assert.match(a,/<title>Ateliê Cedro/);assert.match(b,/<title>Estúdio Linha/);
 assert.match(a,/Espaço para pensar/);assert.match(b,/Dar direção/);
 assert.doesNotMatch(a,/Estúdio Linha/);assert.doesNotMatch(b,/Ateliê Cedro/);
 const before=tree(path.join(parent,'b')),changed=config('cedro');changed.name='Ateliê Semente';
 generate(changed,path.join(parent,'a-variant'));assert.deepEqual(tree(path.join(parent,'b')),before);
 for(const id of ['a','b'])for(const [name,encoded]of Object.entries(tree(path.join(parent,id))))if(/\.(html|js|css|json|xml|txt)$/.test(name)){
  const text=Buffer.from(encoded,'base64').toString();assert.doesNotMatch(text,/branct|fbq|webhook|supabase|localStorage|sessionStorage|sendBeacon|fetch\(/i,`${id}/${name}: operational leak`);
 }
});
test('generated metadata follows visible identity and social image exists',async()=>{
 const {generate}=await builder(),parent=folder();generate(config('cedro'),path.join(parent,'site'));
 for(const page of ['index.html','contacto.html']){
  const html=fs.readFileSync(path.join(parent,'site',page),'utf8');
  const schema=JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);
  assert.equal(schema.name,'Ateliê Cedro');assert.ok(html.includes(schema.description));
  assert.match(html,/noindex, nofollow/);assert.ok(fs.existsSync(path.join(parent,'site/assets/social.webp')));
  assert.ok(html.includes(`href="https://cedro.example.invalid/${page==='index.html'?'':page}"`));
 }
});
test('generation is reproducible and manifest matches bytes',async()=>{
 const {generate}=await builder(),p=folder();generate(config('linha'),path.join(p,'a'));generate(config('linha'),path.join(p,'b'));assert.deepEqual(tree(path.join(p,'a')),tree(path.join(p,'b')));
 const manifest=JSON.parse(fs.readFileSync(path.join(p,'a/manifest.json')));
 const {createHash}=await import('node:crypto');for(const f of manifest.files){const bytes=fs.readFileSync(path.join(p,'a',f.path));assert.equal(bytes.length,f.bytes);assert.equal(createHash('sha256').update(bytes).digest('hex'),f.sha256);}
});
for(const [label,mutate]of [
 ['missing name',c=>delete c.name],['unknown field',c=>c.endpoint='https://example.invalid/send'],
 ['non-synthetic',c=>c.synthetic=false],['real origin',c=>c.origin='https://example.com'],
 ['asset traversal',c=>c.heroAsset='../secret'],['CSS injection',c=>c.palette.bg='red; background:url(https://example.invalid)'],
 ['unknown font',c=>c.fonts.body='remote'],['empty navigation',c=>c.navigation.open=''],
 ['incomplete content',c=>c.steps=[]],['identity leak',c=>c.name='BRANCT copy']
])test(`invalid configuration cannot create any destination: ${label}`,async()=>{
 const {generate}=await builder(),p=folder(),c=config('cedro');mutate(c);
 assert.throws(()=>generate(c,path.join(p,'invalid')));assert.deepEqual(fs.readdirSync(p),[]);
});
test('existing output is never overwritten and siblings remain byte-identical',async()=>{
 const {generate}=await builder(),p=folder(),dest=path.join(p,'existing');fs.mkdirSync(dest);fs.writeFileSync(path.join(dest,'owned.txt'),'keep');
 const before=tree(p);assert.throws(()=>generate(config('cedro'),dest),/exist/i);assert.deepEqual(tree(p),before);
});
test('traversal and link ancestors cannot escape the declared parent',async()=>{
 const {generate}=await builder(),p=folder();
 assert.throws(()=>generate(config('cedro'),p+'/../escape'),/path/i);
 const target=path.join(p,'target');fs.mkdirSync(target);fs.symlinkSync(target,path.join(p,'link'),process.platform==='win32'?'junction':'dir');
 assert.throws(()=>generate(config('cedro'),path.join(p,'link','site')),/link/i);assert.deepEqual(fs.readdirSync(target),[]);
});
test('text is encoded rather than executed in HTML and JSON-LD',async()=>{
 const {generate}=await builder(),p=folder(),c=config('cedro');c.headline='Texto <script>alert(1)</script> & simples';
 c.name='Ateliê "Teste" & </script><script>alert(2)</script>';c.description='Descrição "editorial" & </script><b>texto</b>';
 generate(c,path.join(p,'site'));
 const html=fs.readFileSync(path.join(p,'site/index.html'),'utf8');assert.match(html,/&lt;script&gt;/);assert.doesNotMatch(html,/<script>alert/);
 const blocks=[...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];assert.equal(blocks.length,1);
 assert.doesNotMatch(blocks[0][1],/</);const schema=JSON.parse(blocks[0][1]);assert.equal(schema.name,c.name);assert.equal(schema.description,c.description);
 assert.ok(html.includes('&quot;Teste&quot; &amp; &lt;/script&gt;'));assert.ok(html.includes('Descrição &quot;editorial&quot; &amp; &lt;/script&gt;'));
});
