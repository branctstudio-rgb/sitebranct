// Local, single-operator tool. Not a public service or an upload sandbox.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import {randomBytes,randomUUID,createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {readRecipe,build,generate,verify,noLinks} from '../project.mjs';
import {serve} from '../preview.mjs';

const here=path.dirname(fileURLToPath(import.meta.url));
const toolRoot=path.resolve(here,'../../..');
const sourceRecipe=path.join(here,'../branct.json');
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const fail=(message,status=422)=>{throw Object.assign(new Error(message),{status});};
const slug=name=>{
  if(typeof name!=='string'||!/^[a-z][a-z0-9-]{1,50}$/.test(name)||/^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(name))fail('versionName: use 2–51 letras minúsculas, números ou hífen.');
  return name;
};
const write=(file,value)=>fs.writeFileSync(file,JSON.stringify(value,null,2)+'\n',{flag:'wx'});
const close=server=>new Promise((resolve,reject)=>{
  server.close(error=>error&&error.code!=='ERR_SERVER_NOT_RUNNING'?reject(error):resolve());
  server.closeIdleConnections();
});

export async function startStudio(projectRoot){
  if(!path.isAbsolute(projectRoot||'')||/^(\\\\|\/\/)/.test(projectRoot))fail('Raiz de projetos absoluta e local obrigatória.');
  const root=path.resolve(projectRoot);
  noLinks(root);
  if(!fs.statSync(root).isDirectory())fail('A raiz tem de ser uma pasta.');
  const relative=path.relative(toolRoot,root);
  if(!relative||(!relative.startsWith('..'+path.sep)&&relative!=='..'&&!path.isAbsolute(relative)))fail('Projetos devem ficar fora do checkout.');
  // All descendant writes are derived from closed names, never from a browser path.
  const child=(...parts)=>{
    noLinks(root);
    const target=path.resolve(root,...parts);
    if(!target.startsWith(root+path.sep))fail('Destino fora da raiz.');
    noLinks(path.dirname(target));
    if(fs.existsSync(target))noLinks(target);
    return target;
  };
  for(const folder of ['recipes','revisions','sessions']){
    const target=child(folder);if(!fs.existsSync(target))fs.mkdirSync(target);
    if(!fs.statSync(target).isDirectory())fail('Pasta de projetos inválida.');
  }
  const loaded=readRecipe(sourceRecipe),preset=loaded.config;
  preset.assets.root=toolRoot.replaceAll('\\','/');
  const approvedInputs=[...new Set([preset.assets.logo,preset.assets.hero,...preset.sources.map(s=>s.path),
    'fixtures/website-base/site.css','fixtures/website-base/navigation.js',
    ...['manrope','bricolage-grotesque'].flatMap(f=>['latin','latin-ext'].map(s=>`src/fonts/${f}-${s}.woff2`))])];
  const pins=approvedInputs.map(name=>{const file=path.join(toolRoot,name);noLinks(file);return {file,sha256:digest(fs.readFileSync(file))};});
  function checkRecipe(recipe){
    for(const pin of pins){noLinks(pin.file);if(digest(fs.readFileSync(pin.file))!==pin.sha256)fail('assets: fonte aprovada mudou; reiniciar após revisão.');}
    if(recipe?.assets?.root!==preset.assets.root)fail('assets.root: a bancada usa apenas a raiz aprovada.');
    for(const kind of ['logo','hero'])if(recipe?.assets?.[kind]!==preset.assets[kind])fail(`assets.${kind}: escolha um recurso do catálogo aprovado.`);
    if(JSON.stringify(recipe.sources)!==JSON.stringify(preset.sources))fail('sources: a proveniência aprovada não pode ser substituída.');
    return build(recipe,loaded.dir).config; // Original complete contract, no replacement validator.
  }
  const revision=name=>child('revisions',slug(name));
  const readRevision=name=>{
    const dir=revision(name),recipeFile=child('revisions',name,'recipe.json');
    const recipe=checkRecipe(readRecipe(recipeFile).config),site=child('revisions',name,'site');
    verify(recipe,dir,site);
    return {recipe,recipeFile,dir,site};
  };
  const names=folder=>fs.readdirSync(child(folder),{withFileTypes:true}).filter(e=>!e.isSymbolicLink()&&(folder==='recipes'?e.isFile()&&e.name.endsWith('.json'):e.isDirectory())).map(e=>folder==='recipes'?e.name.slice(0,-5):e.name).filter(n=>/^[a-z][a-z0-9-]{1,50}$/.test(n)).sort();
  const token=randomBytes(32).toString('hex'),sessionId=randomUUID();
  const record=child('sessions',sessionId+'.json');
  const previews=new Map();let origin,stopping=false,stopPromise,resolveClosed,operations=Promise.resolve();
  const closed=new Promise(resolve=>resolveClosed=resolve);
  const send=(res,status,value)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(value));};
  const safeOrigin=(req,allowed)=>allowed.includes(req.headers.host)&&(!req.headers.origin||req.headers.origin===`http://${req.headers.host}`)&&!['cross-site'].includes(req.headers['sec-fetch-site']);
  async function stopPreview(id){
    const item=previews.get(id);if(!item)fail('Preview não pertence a esta sessão.',404);
    await close(item.server);
    write(item.record+'.stopped.json',{state:'STOPPED',id,sessionId,stoppedAt:new Date().toISOString(),method:'owned-server-handle'});
    previews.delete(id);return {state:'STOPPED',id};
  }
  async function stop(){
    if(stopPromise)return stopPromise;
    stopping=true;
    stopPromise=(async()=>{
      await operations;
      const ids=[...previews.keys()];
      for(const id of ids)await stopPreview(id);
      await close(server);
      const receipt={state:'STOPPED',sessionId,pid:process.pid,stoppedAt:new Date().toISOString(),previews:ids,method:'owned-server-handles-only'};
      write(record+'.stopped.json',receipt);resolveClosed(receipt);return receipt;
    })();
    return stopPromise;
  }
  const server=http.createServer(async(req,res)=>{
    res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');
    res.setHeader('X-Robots-Tag','noindex, nofollow, noarchive');res.setHeader('Referrer-Policy','no-referrer');
    res.setHeader('Content-Security-Policy',"default-src 'none'; script-src 'self'; style-src 'self'; font-src 'self'; img-src 'self'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'");
    let releaseOperation;
    try{
      if(!safeOrigin(req,[new URL(origin).host]))fail('Origem externa ou Host inválido.',403);
      // Serialize mutations, including preview startup and shutdown. No orphan listener.
      if(req.method==='POST'){
        const previous=operations;operations=new Promise(resolve=>releaseOperation=resolve);await previous;
      }
      if(stopping)fail('Bancada a encerrar.',409);
      if(!req.url.startsWith('/')||/[\\%]/.test(req.url.split('?')[0]))fail('Recurso indisponível.',404);
      const url=new URL(req.url,origin),route=url.pathname;
      if(req.method==='GET'){
        if(route==='/api/state')return send(res,200,{token,sessionId,recipe:preset,catalog:{logo:[preset.assets.logo],hero:[preset.assets.hero]},recipes:names('recipes'),revisions:names('revisions'),previews:[...previews.values()].map(p=>p.public),root});
        if(route==='/api/recipe'){
          const name=slug(url.searchParams.get('name'));
          const file=child('recipes',name+'.json');return send(res,200,{name,recipe:checkRecipe(readRecipe(file).config)});
        }
        if(route==='/api/revision'){
          const name=slug(url.searchParams.get('name'));return send(res,200,{name,recipe:readRevision(name).recipe});
        }
        const assets={'/':'index.html','/studio.js':'studio.js','/studio.css':'studio.css',
          '/manrope.woff2':'../../../src/fonts/manrope-latin.woff2','/bricolage.woff2':'../../../src/fonts/bricolage-grotesque-latin.woff2'};
        if(!Object.hasOwn(assets,route))fail('Recurso indisponível.',404);
        const type={'.html':'text/html; charset=utf-8','.js':'application/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.woff2':'font/woff2'};
        res.writeHead(200,{'Content-Type':type[path.extname(assets[route])]});return res.end(fs.readFileSync(path.resolve(here,assets[route])));
      }
      if(req.method!=='POST')fail('Método não permitido.',405);
      if(req.headers.origin!==origin||req.headers['x-studio-token']!==token||req.headers['content-type']!=='application/json')fail('Pedido não autorizado pela bancada.',403);
      const chunks=[];let bodyBytes=0;
      for await(const bytes of req){bodyBytes+=bytes.length;if(bodyBytes>65536)fail('Pedido demasiado grande.',413);chunks.push(bytes);}
      let input;try{input=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks)));}catch{fail('Pedido JSON/UTF-8 inválido.');}
      if(!input||typeof input!=='object'||Array.isArray(input))fail('Pedido inválido.');
      const keys={ '/api/validate':['recipe'],'/api/save':['name','recipe'],'/api/generate':['name','recipe'],'/api/preview':['name'],'/api/stop-preview':['id'],'/api/stop':[] }[route];
      if(!keys)fail('Operação indisponível.',404);
      if(Object.keys(input).sort().join()!==[...keys].sort().join())fail('Campos de operação inesperados.');
      if(route==='/api/validate'){checkRecipe(input.recipe);return send(res,200,{state:'PASS',message:'Receita válida. Ainda não foi gerada.'});}
      if(route==='/api/save'||route==='/api/generate'){
        const name=slug(input.name),recipe=checkRecipe(input.recipe);
        const target=route==='/api/save'?child('recipes',name+'.json'):revision(name);
        if(fs.existsSync(target))fail('versionName: esta versão já existe. Escolha um nome novo.',409);
        if(route==='/api/save'){write(target,recipe);return send(res,201,{state:'SAVED',name});}
        fs.mkdirSync(target);write(child('revisions',name,'recipe.json'),recipe);
        const site=child('revisions',name,'site');generate(recipe,target,site);
        const proof=verify(recipe,target,site);return send(res,201,{...proof,name});
      }
      if(route==='/api/preview'){
        const name=slug(input.name),rev=readRevision(name);
        const existing=[...previews.values()].find(item=>item.public.name===name);
        if(existing)return send(res,200,existing.public);
        const id=randomUUID(),previewRecord=child('sessions',id+'.preview.json');
        const running=await serve(rev.recipeFile,rev.site,previewRecord);
        const previewOrigin=`http://127.0.0.1:${running.info.port}`;
        const handler=running.server.listeners('request')[0];running.server.removeListener('request',handler);
        running.server.on('request',(request,response)=>{
          if(!safeOrigin(request,[new URL(previewOrigin).host])){response.writeHead(403).end('Origem externa recusada');return;}
          try{readRevision(name);handler(request,response);}catch{response.writeHead(409).end('Preview alterada ou inválida');}
        });
        const publicInfo={id,name,urls:Object.fromEntries(Object.entries(rev.recipe.routes).map(([key,value])=>[key,previewOrigin+'/'+value]))};
        previews.set(id,{server:running.server,record:previewRecord,public:publicInfo});return send(res,200,publicInfo);
      }
      if(route==='/api/stop-preview')return send(res,200,await stopPreview(input.id));
      if(route==='/api/stop'){stopping=true;send(res,200,{state:'STOPPING',receipt:record+'.stopped.json'});setImmediate(()=>stop().catch(error=>{console.error(error.message);process.exitCode=1;}));}
    }catch(error){
      const status=error.code==='EEXIST'?409:error.code==='ENOENT'?404:error.status||422;
      const message=error.code==='ENOENT'?'name: versão não encontrada.':error.message;
      const field=message.match(/^([a-z][\w.[\]]*):/i)?.[1]||'recipe';
      if(!res.headersSent)send(res,status,{state:'FAIL',message,errors:{[field]:message}});else res.destroy();
    }finally{releaseOperation?.();}
  });
  server.requestTimeout=10000;server.headersTimeout=10000;
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
  origin=`http://127.0.0.1:${server.address().port}`;
  try{write(record,{mission:'WEBSITE42',sessionId,url:origin,pid:process.pid,root,startedAt:new Date().toISOString(),script:fileURLToPath(import.meta.url)});}catch(error){await close(server);throw error;}
  return {url:origin,root,record,closed,stop};
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{
    const [command,root,...extra]=process.argv.slice(2);
    if(extra.length||!['start','stop'].includes(command)||!root)fail('Uso: node fixtures/website-project/studio/server.mjs start RAIZ_DE_PROJETOS | stop REGISTRO');
    if(command==='start'){
      const app=await startStudio(root);console.log(JSON.stringify({url:app.url,record:app.record}));
      process.once('SIGINT',()=>app.stop());process.once('SIGTERM',()=>app.stop());
    }else{
      noLinks(root);const info=JSON.parse(fs.readFileSync(root,'utf8'));
      if(info.mission!=='WEBSITE42'||info.script!==fileURLToPath(import.meta.url)||!/^http:\/\/127\.0\.0\.1:\d+$/.test(info.url)||path.resolve(root)!==path.join(info.root,'sessions',info.sessionId+'.json'))fail('Registo não pertence a esta bancada.');
      const response=await fetch(info.url+'/api/state',{signal:AbortSignal.timeout(5000)});
      const live=await response.json();
      if(!response.ok||live.sessionId!==info.sessionId||live.root!==info.root)fail('Identidade da bancada divergente.');
      const stopped=await fetch(info.url+'/api/stop',{method:'POST',headers:{origin:info.url,'content-type':'application/json','x-studio-token':live.token},body:'{}',signal:AbortSignal.timeout(5000)});
      if(!stopped.ok)fail('Encerramento recusado.');
      for(let i=0;i<50&&!fs.existsSync(root+'.stopped.json');i++)await new Promise(resolve=>setTimeout(resolve,100));
      if(!fs.existsSync(root+'.stopped.json'))fail('Recibo de encerramento ainda ausente. Não terminar outros processos.');
      console.log(fs.readFileSync(root+'.stopped.json','utf8'));
    }
  }catch(error){console.error(error.message);process.exitCode=1;}
}
