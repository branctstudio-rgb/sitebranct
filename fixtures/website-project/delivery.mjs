// This file is also copied as verify.mjs into the handoff. Node built-ins only.
// Checksums detect changes; they are not a signature or permission to publish.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
const hash=b=>createHash('sha256').update(b).digest('hex');
const fail=message=>{throw new Error(message);};
function noLinks(file){
 let current=path.resolve(file);
 while(true){if(fs.lstatSync(current).isSymbolicLink())fail('Caminho ligado recusado.');const parent=path.dirname(current);if(parent===current)break;current=parent;}
}
function files(root,prefix=''){
 noLinks(root);return fs.readdirSync(root,{withFileTypes:true}).flatMap(e=>{
  const name=prefix+e.name,file=path.join(root,e.name);noLinks(file);
  if(e.isDirectory())return files(file,name+'/');if(!e.isFile())fail('Tipo de ficheiro recusado.');return [name];
 });
}
const safe=name=>typeof name==='string'&&/^[a-zA-Z0-9_.\/-]+$/.test(name)&&name.split('/').every(s=>s&&s!=='.'&&s!=='..'&&!s.endsWith('.'));
export function verifyDelivery(directory){
 const root=path.resolve(directory);noLinks(root);
 const bytes=fs.readFileSync(path.join(root,'delivery.json')),m=JSON.parse(bytes.toString('utf8'));
 if(m.schema!==1||m.kind!=='static-review-delivery'||m.publicationAllowed!==false||m.indexable!==false||!Array.isArray(m.files)||m.files.length!==16)fail('Contrato de entrega inválido.');
 if(!/^[a-z][a-z0-9-]{1,35}$/.test(m.project)||!/^[a-z][a-z0-9-]{1,50}$/.test(m.version))fail('Identidade de entrega inválida.');
 const expected=m.files.map(f=>f.path);
 if(new Set(expected).size!==expected.length||expected.some(n=>!safe(n))||!expected.includes('verify.mjs')||!expected.includes('LEIA-ME.md')||expected.some(n=>!['verify.mjs','LEIA-ME.md'].includes(n)&&!n.startsWith('site/')))fail('Lista de ficheiros inválida.');
 if(JSON.stringify(files(root).sort())!==JSON.stringify([...expected,'delivery.json'].sort()))fail('Entrega: ficheiros ausentes ou extras.');
 for(const f of m.files){const b=fs.readFileSync(path.join(root,f.path));if(!Number.isSafeInteger(f.bytes)||b.length!==f.bytes||!(/^[a-f0-9]{64}$/.test(f.sha256))||hash(b)!==f.sha256)fail('Entrega: bytes/hash divergentes em '+f.path);}
 const site=JSON.parse(fs.readFileSync(path.join(root,'site/manifest.json'),'utf8'));
 if(site.publicationAllowed!==false||site.indexable!==false||site.kind!=='local-draft'||!Array.isArray(site.files))fail('Manifesto estático inválido.');
 if(JSON.stringify(['site/manifest.json',...site.files.map(f=>'site/'+f.path)].sort())!==JSON.stringify(expected.filter(p=>p.startsWith('site/')).sort()))fail('Manifestos de ficheiros divergentes.');
 for(const f of site.files){const bound=m.files.find(p=>p.path==='site/'+f.path);if(!bound||bound.sha256!==f.sha256||bound.bytes!==f.bytes)fail('Manifestos de hashes divergentes.');}
 if(!m.routes||Object.keys(m.routes).sort().join()!=='contact,home'||m.routes.home===m.routes.contact||Object.values(m.routes).some(r=>!safe(r)||!r.endsWith('.html')||r.includes('/')||!expected.includes('site/'+r)))fail('Rotas de entrega inválidas.');
 return {state:'PASS',project:m.project,name:m.version,routes:m.routes,destination:root,files:expected.length+1,manifestSha256:hash(bytes),publicationAllowed:false,indexable:false};
}
export async function serveDelivery(directory){
 const proof=verifyDelivery(directory),root=proof.destination;
 const types={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'application/javascript; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.woff2':'font/woff2','.txt':'text/plain; charset=utf-8','.xml':'application/xml'};
 const m=JSON.parse(fs.readFileSync(path.join(root,'delivery.json'),'utf8')),allowed=new Set(m.files.filter(f=>f.path.startsWith('site/')).map(f=>f.path.slice(5)));let origin;
 const server=http.createServer((req,res)=>{
  res.setHeader('X-Robots-Tag','noindex, nofollow, noarchive');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Cache-Control','no-store');
  if(req.headers.host!==new URL(origin).host||(req.headers.origin&&req.headers.origin!==origin)||req.headers['sec-fetch-site']==='cross-site'){res.writeHead(403).end();return;}
  if(!['GET','HEAD'].includes(req.method)){res.writeHead(405).end();return;}
  const raw=req.url.split('?')[0],name=raw==='/'?proof.routes.home:raw.slice(1);
  if(!raw.startsWith('/')||!safe(name)||!allowed.has(name)||name==='manifest.json'){res.writeHead(404).end();return;}
  try{verifyDelivery(root);const b=fs.readFileSync(path.join(root,'site',name));res.writeHead(200,{'Content-Type':types[path.extname(name)]||'application/octet-stream'});res.end(req.method==='HEAD'?undefined:b);}catch{res.writeHead(409).end('Entrega alterada ou inválida.');}
 });
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});origin=`http://127.0.0.1:${server.address().port}`;
 return {server,proof,urls:Object.fromEntries(Object.entries(proof.routes).map(([k,v])=>[k,origin+'/'+v]))};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{const [command,directory,...extra]=process.argv.slice(2);if(!['verify','serve'].includes(command)||!directory||extra.length)fail('Uso: node verify.mjs verify|serve PASTA_DA_ENTREGA');
  if(command==='verify')console.log(JSON.stringify(verifyDelivery(directory),null,2));
  else{const app=await serveDelivery(directory);console.log(JSON.stringify({state:'LOCAL_PREVIEW',...app.proof,urls:app.urls}));const stop=()=>{app.server.close();app.server.closeIdleConnections();};process.once('SIGINT',stop);process.once('SIGTERM',stop);}
 }catch(error){console.error(error.message);process.exitCode=1;}
}
