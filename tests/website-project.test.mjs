import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {generate,verify,readRecipe,sha256} from '../fixtures/website-project/project.mjs';
import {serve} from '../fixtures/website-project/preview.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const recipe=path.join(root,'fixtures/website-project/branct.json');
const {config,dir}=readRecipe(recipe);
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'website38-'));
const dest=name=>path.join(temp,name);
const copy=()=>structuredClone(config);
const hashTree=folder=>Object.fromEntries(fs.readdirSync(folder,{recursive:true}).filter(f=>fs.statSync(path.join(folder,f)).isFile()).sort().map(f=>[f,sha256(fs.readFileSync(path.join(folder,f)))]));
test('generate and verify real BRANCT recipe with only 14 self-contained files',()=>{
  generate(config,dir,dest('first')); assert.equal(verify(config,dir,dest('first')).state,'PASS');
  assert.equal(Object.keys(hashTree(dest('first'))).length,14);
  const html=fs.readFileSync(dest('first/index.html'),'utf8');
  assert.match(html,/noindex, nofollow, noarchive/);assert.match(html,/https:\/\/branct.com\/index.html/);
  assert.match(html,/Rascunho local/);assert.doesNotMatch(html,/<form|fetch\(|iframe|src="https?:/);
  assert.doesNotMatch(fs.readFileSync(dest('first/sitemap.xml'),'utf8'),/<loc>/);
});
test('two destinations isolated, independent routes and content by configuration',()=>{
  const before=hashTree(dest('first')), c=copy(); c.id='branct-second';c.content.headline='Ficha técnica';c.routes={home:'inicio.html',contact:'conversa.html'};
  generate(c,dir,dest('second'));assert.equal(verify(c,dir,dest('second')).state,'PASS');
  assert.deepEqual(hashTree(dest('first')),before);
  const html=fs.readFileSync(dest('second/inicio.html'),'utf8');assert.match(html,/href="conversa.html"/);assert.match(html,/href="inicio.html#abordagem"/);
  assert.ok(!fs.existsSync(dest('second/index.html')));
});
test('safe updates refuse existing destination and create new revisions',()=>{
  const before=hashTree(dest('first'));const c=copy();c.content.headline='Nova revisão';
  assert.throws(()=>generate(c,dir,dest('first')),/destino já existe/);assert.deepEqual(hashTree(dest('first')),before);
  generate(c,dir,dest('third'));assert.equal(verify(c,dir,dest('third')).state,'PASS');
});
test('verification rebuilds real output instead of trusting modified manifest',()=>{
  generate(config,dir,dest('tamper'));const file=dest('tamper/index.html');fs.appendFileSync(file,'tamper');
  const mf=dest('tamper/manifest.json'), m=JSON.parse(fs.readFileSync(mf));m.files.find(f=>f.path==='index.html').sha256=sha256(fs.readFileSync(file));fs.writeFileSync(mf,JSON.stringify(m));
  assert.throws(()=>verify(config,dir,dest('tamper')),/bytes diferentes/);
});
test('missing and extra generated files refused',()=>{
  generate(config,dir,dest('extra'));fs.writeFileSync(dest('extra/extra.txt'),'extra');assert.throws(()=>verify(config,dir,dest('extra')),/extras/);
  generate(config,dir,dest('missing'));fs.unlinkSync(dest('missing/robots.txt'));assert.throws(()=>verify(config,dir,dest('missing')),/ausentes/);
});
const invalid=[
  ['missing content',c=>delete c.content.headline,/content.headline/],
  ['empty content',c=>c.content.description=' ',/content.description/],
  ['unknown keys',c=>c.production=true,/desconhecido/],
  ['production mode',c=>c.kind='production',/publicação não suportada/],
  ['language unavailable',c=>c.locale='en-GB',/pt-PT/],
  ['origin path',c=>c.origin='https://branct.com/live',/origin/],
  ['origin credentials',c=>c.origin='https://user@branct.com',/origin/],
  ['origin scheme',c=>c.origin='javascript:alert(1)',/origin/],
  ['invalid id type',c=>c.id=['valid-id'],/id:/],
  ['missing asset',c=>c.assets.hero='src/img/missing.webp',/inexistente/],
  ['asset traversal',c=>c.assets.hero='../img/a.webp',/travessia/],
  ['non-image file',c=>c.assets.hero='index.html',/imagem/],
  ['missing asset description',c=>delete c.assets.heroAlt,/heroAlt/],
  ['same routes',c=>c.routes.contact='index.html',/diferentes/],
  ['unsafe route',c=>c.routes.contact='../contact.html',/routes/],
  ['invalid color',c=>c.palette.ink='red',/hexadecimal/],
  ['contrast',c=>c.palette.ink='#FFFFFF',/contraste/],
  ['external font',c=>c.fonts.body='remote',/fonts/],
  ['missing provenance',c=>c.sources=[],/sources/],
  ['empty steps',c=>c.content.steps=[],/steps/],
  ['control characters',c=>c.content.headline='text\u0000',/content.headline/]
];
for(const [name,mutate,message] of invalid)test(`refuse ${name} before writing output`,()=>{
  const c=copy();mutate(c);const output=dest('bad-'+invalid.findIndex(x=>x[0]===name));
  assert.throws(()=>generate(c,dir,output),message);assert.ok(!fs.existsSync(output));
});
test('text is escaped in HTML and JSON-LD',()=>{
  const c=copy();c.content.headline='<script>alert("x")</script>';generate(c,dir,dest('escaped'));
  const html=fs.readFileSync(dest('escaped/index.html'),'utf8');assert.match(html,/&lt;script&gt;/);assert.doesNotMatch(html,/<script>alert/);
  const schema=JSON.parse(html.match(/<script type="application\/ld\+json">(.*?)<\/script>/s)[1]);assert.match(schema.name,/<script>/);
});
test('assets can come from a small external bundle without copying application',()=>{
  const bundle=dest('bundle');fs.mkdirSync(bundle);fs.copyFileSync(path.join(root,config.assets.logo),path.join(bundle,'logo.svg'));fs.copyFileSync(path.join(root,config.assets.hero),path.join(bundle,'hero.webp'));fs.writeFileSync(path.join(bundle,'source.txt'),'Existing approved identity and illustration.');
  const c=copy();c.assets={...c.assets,root:'bundle',logo:'logo.svg',hero:'hero.webp'};c.sources=[{path:'source.txt',note:'External local approved asset bundle'}];
  generate(c,temp,dest('bundle-output'));assert.equal(verify(c,temp,dest('bundle-output')).state,'PASS');
});
test('reject active SVG before any output',()=>{
  const folder=dest('svg-input');fs.mkdirSync(folder);fs.writeFileSync(path.join(folder,'unsafe.svg'),'<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
  const c=copy();c.assets.root=folder;c.assets.logo='unsafe.svg';assert.throws(()=>generate(c,dir,dest('unsafe-svg')),/SVG/);assert.ok(!fs.existsSync(dest('unsafe-svg')));
});
test('reject output traversal and linked parent',()=>{
  assert.throws(()=>generate(config,dir,temp+'/x/../escaped'),/travessia/);
  const linked=dest('linked');fs.symlinkSync(dest('first'),linked,process.platform==='win32'?'junction':'dir');
  assert.throws(()=>generate(config,dir,path.join(linked,'output')),/ligado/);
});
test('CLI create verifies and refuses overwrite with a clear message',()=>{
  const script=path.join(root,'fixtures/website-project/project.mjs');
  const first=spawnSync(process.execPath,[script,'create',recipe,dest('cli')],{encoding:'utf8'});assert.equal(first.status,0,first.stderr);assert.equal(JSON.parse(first.stdout).state,'PASS');
  const again=spawnSync(process.execPath,[script,'create',recipe,dest('cli')],{encoding:'utf8'});assert.equal(again.status,1);assert.match(again.stderr,/destino já existe/);
});
test('loopback preview serves generated routes and blocks non-manifest paths',async()=>{
  const {server,info}=await serve(recipe,dest('first'),dest('server-record.json'));
  try{
    assert.equal(info.host,'127.0.0.1');assert.equal(info.pid,process.pid);
    const response=await fetch(info.url);assert.equal(response.status,200);assert.match(response.headers.get('x-robots-tag'),/noindex/);
    assert.equal((await fetch(`http://127.0.0.1:${info.port}/manifest.json`)).status,404);
    assert.equal((await fetch(info.url,{method:'POST'})).status,405);
    assert.equal((await fetch(`http://127.0.0.1:${info.port}/%2e%2e/CLAUDE.md`)).status,404);
  }finally{await new Promise(resolve=>server.close(resolve));}
});
test.after(()=>{console.log('Test evidence directory: '+temp);});
