// One responsive-WebKit child only. Importing this module has no operational effects.
import fs from 'node:fs';import assert from 'node:assert/strict';import path from 'node:path';
import {execFileSync,spawnSync} from 'node:child_process';import {createRequire} from 'node:module';import {createHash} from 'node:crypto';import {fileURLToPath} from 'node:url';
const source='563f3c13665347b2a8578110e519ebaf13f356e8',tree='ad5f79ab358e7de04d3de52c45f697f7134dc573';
const codes=new Set(['SOURCE_INVALID','MARKER_INVALID','CHILD_FAILED','REPORT_INVALID','REPORT_INCOMPLETE','COLLECTION_FAILED']);
const requireThat=(ok,code)=>{if(!ok)throw Error(code);};
export const selectedTask=()=>({name:'responsive-webkit',args:['/package/linux-responsive.mjs'],cwd:'/candidate',timeout:900000,engine:'webkit',report:'/outputs/results/responsive-webkit.json'});
export function runWebKit(io){
 const report={head:source,code:'SOURCE_INVALID',exitCode:1,stage:'INSPECT',results:[]};let reserved=false;
 try{
  const f=io.inspect();requireThat(f.platform==='linux'&&f.arch==='x64'&&f.browser==='webkit'&&f.head===source&&f.tree===tree&&f.clean===true&&f.sourceFilesValid===true&&f.playwright==='1.62.0'&&f.cache==='/ms-playwright'&&JSON.stringify(f.revisions)===JSON.stringify([['chromium','1234'],['firefox','1538'],['webkit','2336']]),'SOURCE_INVALID');
  report.stage='RESERVE';try{io.reserve();reserved=true;}catch{throw Error('MARKER_INVALID');}
  report.stage='RESPONSIVE_WEBKIT';
  const p=io.execute(selectedTask());
  report.results.push({name:'responsive-webkit',status:Number.isInteger(p?.status)?p.status:null,signal:['SIGTERM','SIGKILL','SIGINT'].includes(p?.signal)?p.signal:p?.signal?'UNKNOWN':null,error:p?.error?(p.error.code==='ETIMEDOUT'?'PROCESS_TIMEOUT':'UNKNOWN'):null});
  requireThat(p?.status===0&&!p.error&&!p.signal,'CHILD_FAILED');
  report.stage='REPORT';let r,isolation;
  try{r=JSON.parse(io.readReport());isolation=JSON.parse(io.readIsolation());}catch{throw Error('REPORT_INVALID');}
  requireThat(r?.browser?.engine==='webkit'&&r.browser.version==='26.5'&&r.execution?.complete===true&&Array.isArray(r.execution.infrastructureErrors)&&r.execution.infrastructureErrors.length===0&&r.observations?.length===84&&r.menuResults?.length===41&&r.execution.actions?.length===184&&r.execution.actions.every(a=>a?.status==='COMPLETED')&&r.execution.semanticTests?.length===4&&r.execution.semanticTests.every(t=>t?.status==='PASS'),'REPORT_INCOMPLETE');
  requireThat(isolation?.head===source&&isolation.engine==='webkit'&&isolation.measuredVersion==='26.5'&&Array.isArray(isolation.attempts)&&isolation.attempts.length===0&&Array.isArray(isolation.violations)&&isolation.violations.length===0,'REPORT_INCOMPLETE');
  report.code='WEBKIT_DIAGNOSTIC_COMPLETE_NOT_ACCEPTANCE';report.exitCode=0;
 }catch(e){report.code=codes.has(e.message)?e.message:'CHILD_FAILED';report.exitCode=1;}
 finally{if(reserved)try{io.save(report);}catch{report.code='COLLECTION_FAILED';report.exitCode=1;}}
 return report;
}
function nativeIO(){
 const root='/candidate',out='/outputs/results',git=args=>execFileSync('git',['-C',root,...args],{encoding:'utf8'}).trim();
 const require=createRequire(root+'/package.json'),hash=b=>createHash('sha256').update(b).digest('hex');
 const pins=JSON.parse(fs.readFileSync('/package/source-package.json'));
 return {
  inspect(){return {platform:process.platform,arch:process.arch,browser:process.env.F2_01_BROWSER,head:git(['rev-parse','HEAD']),tree:git(['rev-parse','HEAD^{tree}']),clean:git(['status','--porcelain'])==='',sourceFilesValid:pins.sourceHead===source&&pins.sourceTree===tree&&pins.sourceFiles.every(f=>git(['ls-tree',source,'--',f.file])===`${f.mode} blob ${f.blob}\t${f.file}`&&hash(fs.readFileSync(path.join(root,f.file)))===f.sha256),playwright:require('playwright/package.json').version,cache:process.env.PLAYWRIGHT_BROWSERS_PATH,revisions:JSON.parse(fs.readFileSync(root+'/node_modules/playwright-core/browsers.json')).browsers.filter(b=>['chromium','firefox','webkit'].includes(b.name)).map(b=>[b.name,b.revision])};},
  reserve(){fs.mkdirSync(out,{recursive:false});},
  execute(t){const p=spawnSync(process.execPath,t.args,{cwd:t.cwd,encoding:'utf8',timeout:t.timeout,maxBuffer:32*1024*1024,env:{PATH:'/usr/local/bin:/usr/bin:/bin',HOME:'/tmp',TMPDIR:'/tmp',LANG:'C.UTF-8',PLAYWRIGHT_BROWSERS_PATH:'/ms-playwright',PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD:'1',F2_01_BROWSER:t.engine,F2_01_REPORT_PATH:t.report}});fs.writeFileSync(out+'/responsive-webkit.log',(p.stdout||'')+(p.stderr||''));return p;},
  readReport:()=>fs.readFileSync(out+'/responsive-webkit.json','utf8'),readIsolation:()=>fs.readFileSync(out+'/responsive-webkit.json.isolation.json','utf8'),
  save:r=>fs.writeFileSync(out+'/summary.json',JSON.stringify(r,null,2)+'\n')
 };
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{assert.equal(process.platform,'linux');const report=runWebKit(nativeIO());console.log(report.code);process.exitCode=report.exitCode;}
 catch{console.error('WEBKIT_DRIVER_REJECTED');process.exitCode=1;}
}
