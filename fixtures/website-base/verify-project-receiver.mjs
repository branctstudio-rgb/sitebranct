// Static reconstruction proof only: no browsers, installs, archive or private receipt inputs.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {execFileSync,spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';

const [repository,head,destination,...extra]=process.argv.slice(2);
assert.equal(extra.length,0,'expected repository, exact head, new evidence directory');
assert.ok(path.isAbsolute(repository||'')&&path.isAbsolute(destination||''),'absolute paths required');
assert.match(head||'',/^[a-f0-9]{40}$/,'full Git head required');
const repo=path.resolve(repository),out=path.resolve(destination);
const relative=path.relative(repo,out);
assert.ok(relative==='..'||relative.startsWith('..'+path.sep)||path.isAbsolute(relative),'evidence must be outside checkout');
fs.mkdirSync(out); // No overwrite or cleanup of previous evidence.
const receipt={head,startedAt:new Date().toISOString(),platform:process.platform,node:process.version,
  executionContext:process.env.GITHUB_ACTIONS==='true'?'GITHUB_ACTIONS':'LOCAL',
  runId:process.env.GITHUB_ACTIONS==='true'?process.env.GITHUB_RUN_ID:null,
  state:'FAIL',mode:'GIT_ONLY_STATIC_REBUILD',browserEvidence:false,sources:[],commands:[]};
const env={...process.env,GIT_NO_LAZY_FETCH:'1'};
const git=(...args)=>execFileSync('git',['-C',repo,...args],{env,maxBuffer:8*1024*1024,stdio:['ignore','pipe','pipe']});
const digest=b=>createHash('sha256').update(b).digest('hex');
try {
  assert.equal(git('rev-parse','HEAD').toString('ascii').trim(),head,'head mismatch');
  assert.equal(git('cat-file','-t',head).toString('ascii').trim(),'commit');
  // Closed inputs of this BRANCT recipe, including its declared provenance and fonts.
  // Read directly from Git, never from dirty worktree files or tracked node_modules.
  const names=[
    'fixtures/website-project/project.mjs','fixtures/website-project/branct.json',
    'fixtures/website-base/site.css','fixtures/website-base/navigation.js',
    'CLAUDE.md','website-premium.html','src/i18n/pt.json','index.html','src/img/icon.svg','src/img/website-940.webp',
    'src/fonts/font-faces.css','src/fonts/manrope-latin.woff2','src/fonts/manrope-latin-ext.woff2',
    'src/fonts/bricolage-grotesque-latin.woff2','src/fonts/bricolage-grotesque-latin-ext.woff2'
  ];
  const inputs=names.map(name=>{
    const record=git('ls-tree','-z',head,'--',name);
    assert.ok(record.length,`missing Git input: ${name}`);
    const match=/^100644 blob ([a-f0-9]{40})\t([^\0]+)\0$/.exec(record.toString('ascii'));
    assert.ok(match&&match[2]===name,`regular Git blob required: ${name}`);
    const bytes=git('cat-file','blob',match[1]);
    receipt.sources.push({path:name,blob:match[1],bytes:bytes.length,sha256:digest(bytes)});
    return {name,bytes};
  });
  const receiver=path.join(out,'receiver'),draft=path.join(out,'draft');fs.mkdirSync(receiver);
  for(const {name,bytes} of inputs){const target=path.join(receiver,name);fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,bytes,{flag:'wx'});}
  assert.equal(fs.existsSync(path.join(receiver,'.git')),false);assert.equal(fs.existsSync(path.join(receiver,'node_modules')),false);
  for(const operation of ['create','verify']){
    const args=['fixtures/website-project/project.mjs',operation,'fixtures/website-project/branct.json',draft];
    const result=spawnSync(process.execPath,args,{cwd:receiver,encoding:'utf8',env,maxBuffer:1024*1024,timeout:30000});
    receipt.commands.push({operation,args,status:result.status,stdout:result.stdout,stderr:result.stderr,error:result.error?.message});
    assert.equal(result.status,0,`${operation} failed: ${result.error?.message||result.stderr}`);
    const proof=JSON.parse(result.stdout);assert.equal(proof.state,'PASS');assert.equal(proof.files,14);
    assert.equal(proof.indexable,false);assert.equal(proof.publicationAllowed,false);
  }
  receipt.outputs=fs.readdirSync(draft,{recursive:true}).filter(p=>fs.lstatSync(path.join(draft,p)).isFile()).map(p=>({path:p.replaceAll('\\','/'),sha256:digest(fs.readFileSync(path.join(draft,p)))})).sort((a,b)=>a.path.localeCompare(b.path));
  assert.equal(receipt.outputs.length,14);receipt.files=14;receipt.state='PASS';
} catch(error){receipt.error=error.message;process.exitCode=1;console.error(error.message);}
finally {
  receipt.finishedAt=new Date().toISOString();
  fs.writeFileSync(path.join(out,'receipt.json'),JSON.stringify(receipt,null,2)+'\n',{flag:'wx'});
  console.log(JSON.stringify({head,state:receipt.state,files:receipt.files||null,receipt:path.join(out,'receipt.json')}));
}
