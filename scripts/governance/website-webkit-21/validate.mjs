// Offline validator. No browser, Docker, network, Git mutation or workflow event.
import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import {spawnSync} from 'node:child_process';import {fileURLToPath} from 'node:url';
const here=path.dirname(fileURLToPath(import.meta.url)),repo=path.resolve(here,'../../..');
const tests=['projector.test.mjs','conductor.test.mjs','runner.test.mjs','invariants.test.mjs','recovery.test.mjs'];
const mode=process.argv[2]||'LF';if(!['LF','CRLF'].includes(mode))throw Error('LF or CRLF only');
// Only use own temporary directory for mechanical EOL copies and synthetic proof files.
let dir=here;
if(mode==='CRLF'){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'webkit-offline-crlf-'));dir=path.join(root,'scripts/governance/website-webkit-21');fs.mkdirSync(dir,{recursive:true});
 fs.cpSync(here,dir,{recursive:true});
 const convert=d=>{for(const e of fs.readdirSync(d,{withFileTypes:true})){const p=path.join(d,e.name);if(e.isDirectory())convert(p);else if(e.name.endsWith('.mjs'))fs.writeFileSync(p,fs.readFileSync(p,'utf8').replace(/\r\n|\r|\n/g,'\r\n'));}};convert(dir);
 // Source authority stays explicit: the real repository supplies immutable blobs, not this temporary tree.
 fs.mkdirSync(path.join(root,'.github/workflows'),{recursive:true});fs.copyFileSync(path.join(repo,'.github/workflows/website-webkit-diagnostic-21.yml'),path.join(root,'.github/workflows/website-webkit-diagnostic-21.yml'));
}
const p=spawnSync(process.execPath,['--test','--test-reporter=tap',...tests.map(t=>path.join(dir,t))],{cwd:repo,encoding:'utf8',windowsHide:true,timeout:120000,maxBuffer:8*1024*1024,env:{...process.env,GIT_NO_LAZY_FETCH:'1',GIT_CONFIG_COUNT:'1',GIT_CONFIG_KEY_0:'safe.directory',GIT_CONFIG_VALUE_0:repo.replaceAll('\\','/'),WEBSITE21_CANONICAL_REPO:repo}});
process.stdout.write(p.stdout||'');process.stderr.write(p.stderr||'');
if(p.error||p.signal){console.error('OFFLINE_VALIDATION_INCONCLUSIVE');process.exitCode=1;}else process.exitCode=p.status??1;
