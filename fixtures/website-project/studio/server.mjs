// Local, single-operator tool. Not a public service or an upload sandbox.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import {randomBytes,randomUUID,createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {readRecipe,build,generate,verify,noLinks,validate} from '../project.mjs';
import {serve} from '../preview.mjs';
import {library,limits} from './library.mjs';
import {verifyDelivery,serveDelivery} from '../delivery.mjs';

const here=path.dirname(fileURLToPath(import.meta.url));
const toolRoot=path.resolve(here,'../../..');
const sourceRecipe=path.join(here,'../branct.json');
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const fail=(message,status=422)=>{throw Object.assign(new Error(message),{status});};
const slug=name=>{
  if(typeof name!=='string'||!/^[a-z][a-z0-9-]{1,50}$/.test(name)||/^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(name))fail('versionName: use 2–51 letras minúsculas, números ou hífen.');
  return name;
};
const projectSlug=id=>{
  if(typeof id!=='string'||!/^[a-z][a-z0-9-]{1,35}$/.test(id)||/^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(id))fail('projectId: use 2–36 letras minúsculas, números ou hífen.');
  return id;
};
const write=(file,value)=>fs.writeFileSync(file,JSON.stringify(value,null,2)+'\n',{flag:'wx'});
const close=server=>new Promise((resolve,reject)=>{
  server.close(error=>error&&error.code!=='ERR_SERVER_NOT_RUNNING'?reject(error):resolve());
  server.closeIdleConnections();
});

export function validateStudioRoot(projectRoot,{allowMissing=false}={}){
  if(!path.isAbsolute(projectRoot||'')||/^(\\\\|\/\/)/.test(projectRoot))fail('Raiz de projetos absoluta e local obrigatória.');
  const root=path.resolve(projectRoot);
  const existing=allowMissing&&!fs.existsSync(root)?path.dirname(root):root;
  noLinks(existing);
  if(!fs.statSync(existing).isDirectory())fail('A raiz ou pasta-pai tem de ser uma pasta.');
  const relative=path.relative(toolRoot,root);
  if(!relative||(!relative.startsWith('..'+path.sep)&&relative!=='..'&&!path.isAbsolute(relative)))fail('Projetos devem ficar fora do checkout.');
  return root;
}

// Resume only a recorded, live session on this exact local library. Never guess a PID.
export async function findRunningStudio(projectRoot){
  const root=validateStudioRoot(projectRoot,{allowMissing:true}),folder=path.join(root,'sessions');
  if(!fs.existsSync(folder))return null;
  noLinks(folder);const matches=[];
  for(const name of fs.readdirSync(folder).filter(n=>/^[a-f0-9-]{36}\.json$/.test(n))){
    const record=path.join(folder,name);noLinks(record);
    if(fs.existsSync(record+'.stopped.json')){noLinks(record+'.stopped.json');continue;}
    let info;try{info=JSON.parse(fs.readFileSync(record,'utf8'));}catch{fail('Registo de sessão ilegível. Preserve os ficheiros e verifique a pasta de sessões.');}
    if(info.mission!=='WEBSITE42'||info.root!==root||name!==info.sessionId+'.json'||!/^http:\/\/127\.0\.0\.1:\d+$/.test(info.url))fail('Registo de sessão inválido; não iniciar outra bancada nesta pasta.');
    let response;try{response=await fetch(info.url+'/api/state',{signal:AbortSignal.timeout(2000),redirect:'error'});}catch(error){if(error.cause?.code==='ECONNREFUSED')continue;fail('Não foi possível confirmar a sessão anterior. Não iniciar outra; verificar ou encerrar a sessão pelo seu registo.');}
    const live=await response.json();
    if(!response.ok||live.sessionId!==info.sessionId||live.root!==root||info.script!==fileURLToPath(import.meta.url))fail('Sessão ativa diferente. Encerre a bancada anterior pelo seu próprio registo antes de usar esta versão.');
    matches.push({url:info.url,record});
  }
  if(matches.length>1)fail('Existem várias sessões nesta pasta. Encerre-as pelos respetivos registos antes de continuar.');
  return matches[0]||null;
}

export async function startStudio(projectRoot){
  const root=validateStudioRoot(projectRoot);
  // All descendant writes are derived from closed names, never from a browser path.
  const childAt=root=>(...parts)=>{
    noLinks(root);
    const target=path.resolve(root,...parts);
    if(!target.startsWith(root+path.sep))fail('Destino fora da raiz.');
    noLinks(path.dirname(target));
    if(fs.existsSync(target))noLinks(target);
    return target;
  };
  const child=childAt(root);
  for(const folder of ['recipes','revisions','sessions','projects']){
    const target=child(folder);if(!fs.existsSync(target))fs.mkdirSync(target);
    if(!fs.statSync(target).isDirectory())fail('Pasta de projetos inválida.');
  }
  const loaded=readRecipe(sourceRecipe),preset=loaded.config;
  preset.assets.root=toolRoot.replaceAll('\\','/');
  const approvedInputs=[...new Set([preset.assets.logo,preset.assets.hero,...preset.sources.map(s=>s.path),
    'fixtures/website-base/site.css','fixtures/website-base/navigation.js',
    ...['manrope','bricolage-grotesque'].flatMap(f=>['latin','latin-ext'].map(s=>`src/fonts/${f}-${s}.woff2`))])];
  const pins=approvedInputs.map(name=>{const file=path.join(toolRoot,name);noLinks(file);return {file,sha256:digest(fs.readFileSync(file))};});
  function workspace(root,initial=preset,project={id:'legacy',name:'Legado 42/43'}){
  const child=childAt(root),resources=library(root,toolRoot,approvedInputs);
  function checkRecipe(recipe,{revision=false,allowMissing=false}={}){
    for(const pin of pins){noLinks(pin.file);if(digest(fs.readFileSync(pin.file))!==pin.sha256)fail('assets: fonte aprovada mudou; reiniciar após revisão.');}
    const portable=recipe?.version===2;
    if(recipe?.assets?.root!==(portable?(revision?'../../library':'../library'):preset.assets.root))fail('assets.root: a bancada usa apenas a raiz aprovada.');
    for(const kind of ['logo','hero'])if(recipe?.assets?.[kind]!==preset.assets[kind]){
      const match=portable&&/^imports\/([a-f0-9]{64})\.png$/.exec(recipe?.assets?.[kind]);
      if(!match)fail(`assets.${kind}: escolha um recurso do catálogo aprovado.`);
      try{if(allowMissing)resources.record(match[1]);else resources.read(recipe.assets[kind]);}catch(error){fail(`assets.${kind}: ${error.message}`);}
    }
    if(JSON.stringify(recipe.sources)!==JSON.stringify(preset.sources))fail('sources: a proveniência aprovada não pode ser substituída.');
    if(allowMissing)return validate(recipe);
    return build(recipe,portable?path.join(root,revision?'revisions/placeholder':'recipes'):loaded.dir).config;
  }
  const revision=name=>child('revisions',slug(name));
  const readRevision=name=>{
    const dir=revision(name),recipeFile=child('revisions',name,'recipe.json');
    const recipe=checkRecipe(readRecipe(recipeFile).config,{revision:true}),site=child('revisions',name,'site');
    verify(recipe,dir,site);
    return {recipe,recipeFile,dir,site};
  };
  const names=folder=>fs.readdirSync(child(folder),{withFileTypes:true}).filter(e=>!e.isSymbolicLink()&&(folder==='recipes'?e.isFile()&&e.name.endsWith('.json'):e.isDirectory())).map(e=>folder==='recipes'?e.name.slice(0,-5):e.name).filter(n=>/^[a-z][a-z0-9-]{1,50}$/.test(n)).sort();
  function prepareDelivery(name){
    const rev=readRevision(name); // Exact rebuild verification, not trust in an output manifest alone.
    const folder=child('deliveries');if(!fs.existsSync(folder))fs.mkdirSync(folder);
    const dest=child('deliveries',name);if(fs.existsSync(dest))fail('Entrega já existe; abra a entrega ou gere outra versão. Nada foi sobrescrito.',409);
    const built=build(rev.recipe,rev.dir),packed=new Map();
    for(const [file,expected] of built.files){const actual=fs.readFileSync(path.join(rev.site,file));if(!actual.equals(expected))fail('Saída mudou durante a cópia.');packed.set('site/'+file,actual);}
    packed.set('verify.mjs',fs.readFileSync(path.join(here,'../delivery.mjs')));
    packed.set('LEIA-ME.md',Buffer.from(`# Entrega estática para revisão — ${project.id} / ${name}\n\nRascunho local. publicationAllowed=false. noindex preservado. Não publicar sem autorização separada.\n\nEsta pasta é independente da bancada, da receita e da origem dos assets. Usa apenas Node já instalado para verificar/abrir localmente:\n\n\`\`\`sh\nnode verify.mjs verify .\nnode verify.mjs serve .\n\`\`\`\n\nO segundo comando imprime dois URLs loopback; Ctrl+C encerra só esse processo. Não instala nem descarrega nada.\n\nPara uma futura hospedagem autorizada: servir somente o conteúdo de site/ como ficheiros estáticos, mantendo os caminhos relativos, tipos MIME e fontes/assets. Não enviar esta pasta exterior, verify.mjs, receitas ou sessões. Não executar builds, formulários ou APIs. Manter noindex e o aviso de rascunho até decisão explícita; esta entrega NÃO é uma aprovação de publicação.\n\nConferir o SHA-256 de delivery.json com o recibo independente guardado pelo operador. O verificador confere lista exata e hashes; não é assinatura nem defesa contra substituição coordenada do verificador e manifesto. Alterar qualquer ficheiro exige nova versão e nova entrega.\n`));
    const manifest={schema:1,kind:'static-review-delivery',project:project.id,version:name,publicationAllowed:false,indexable:false,routes:rev.recipe.routes,files:[...packed].map(([file,bytes])=>({path:file,bytes:bytes.length,sha256:digest(bytes)}))};
    fs.mkdirSync(dest);fs.mkdirSync(path.join(dest,'site'));fs.mkdirSync(path.join(dest,'site/assets'));
    for(const [file,bytes] of packed)fs.writeFileSync(path.join(dest,file),bytes,{flag:'wx'});
    write(path.join(dest,'delivery.json'),manifest);return verifyDelivery(dest);
  }
  function checkDelivery(name){
    const report={state:'FAIL',project:project.id,name,checkedAt:new Date().toISOString(),manifestSha256:null,publicationAllowed:false,
      checks:[['integrity','Integridade e ficheiros'],['recipe','Receita e conteúdo contratado'],['pages','Páginas esperadas'],['navigation','Links e âncoras internas'],['resources','Imagens, estilos e fontes locais']].map(([id,label])=>({id,label,state:'NOT_CHECKED'})),issues:[],warnings:['Conferência estática, não aprovação visual ou de publicação. Resultado válido para os bytes observados nesta hora; abrir volta a conferir.']};
    const passed=(id,detail)=>Object.assign(report.checks.find(c=>c.id===id),{state:'PASS',detail});let current='integrity';
    try{
      const dest=child('deliveries',name),proof=verifyDelivery(dest);
      if(proof.project!==project.id||proof.name!==name)fail('Identidade de entrega divergente.');
      report.manifestSha256=proof.manifestSha256;passed('integrity','17 ficheiros; lista exata, tamanhos e SHA-256.');
      current='recipe';const rev=readRevision(name);verify(rev.recipe,rev.dir,path.join(dest,'site'));
      // Only the existing generator's exact bytes reach the reference checker.
      // This is not an HTML importer/parser or an execution environment.
      passed('recipe','Saída idêntica à reconstrução da receita guardada; requisitos existentes preservados.');
      const built=build(rev.recipe,rev.dir),docs=new Map(Object.values(proof.routes).map(route=>[route,built.files.get(route).toString('utf8')]));
      current='pages';passed('pages',[...docs.keys()].join(' · '));
      function reference(value,source,field){
        const url=new URL(value,'http://local.invalid/'+source),target=url.pathname.slice(1);
        if(url.origin!=='http://local.invalid'||!built.files.has(target))throw Object.assign(new Error('Referência local ausente ou externa: '+value),{file:'site/'+source,field});
        if(url.hash&&(!docs.has(target)||!docs.get(target).includes('id="'+decodeURIComponent(url.hash.slice(1))+'"')))throw Object.assign(new Error('Âncora interna ausente: '+value),{file:'site/'+source,field});
      }
      current='navigation';let links=0;
      for(const [route,html] of docs)for(const match of html.matchAll(/<a\b[^>]*\bhref="([^"]*)"/g)){reference(match[1],route,'routes.home');links++;}
      passed('navigation',links+' links e respetivas âncoras conferidos.');
      current='resources';let count=0;
      for(const [route,html] of docs)for(const match of html.matchAll(/<(img|script|link)\b[^>]*>/g)){
        if(/\brel="canonical"/.test(match[0]))continue;
        const value=match[0].match(/\b(?:src|href)="([^"]*)"/)?.[1];if(value){reference(value,route,'assets.hero');count++;}
      }
      for(const [file,bytes] of built.files)if(file.endsWith('.css'))for(const match of bytes.toString('utf8').matchAll(/url\(\s*["']?([^"')\s]+)["']?\s*\)/g)){reference(match[1],file,'fonts.body');count++;}
      passed('resources',count+' referências locais, incluindo imagens e fontes; nenhum pedido de rede executado.');report.state='PASS';
    }catch(error){
      report.checks.find(c=>c.id===current).state='FAIL';
      const file=error.file||(error.message.match(/bytes diferentes em (.+)$/)?.[1]?'site/'+error.message.match(/bytes diferentes em (.+)$/)[1]:'delivery.json');
      const field=error.field||(file.includes('/hero.')?'assets.hero':file.includes('/logo.')?'assets.logo':file.endsWith('.woff2')?'fonts.body':'versionName');
      report.issues.push({severity:'blocker',file,field,message:error.message,action:'Reabrir a receita desta versão e gerar uma nova versão/entrega. A anterior não será sobrescrita.'});
    }
    return report;
  }
  return {child,resources,checkRecipe,readRevision,revision,names,initial,project,prepareDelivery,checkDelivery};
  }
  const legacy=workspace(root),spaces=new Map([['legacy',legacy]]);
  function metadata(id){
    projectSlug(id);const file=child('projects',id,'project.json');const data=JSON.parse(fs.readFileSync(file,'utf8'));
    if(data.schema!==1||data.id!==id||typeof data.name!=='string'||!data.name.trim()||data.publicationAllowed!==false)fail('project: registo inválido.');
    return data;
  }
  function space(id){
    if(id==='legacy')return legacy;
    const meta=metadata(id);
    if(!spaces.has(id))spaces.set(id,workspace(child('projects',id),meta.initialRecipe,{id,name:meta.name}));
    const current=spaces.get(id);current.checkRecipe(current.initial,{allowMissing:true});return current;
  }
  const projects=()=>[{id:'legacy',name:'Legado 42/43'},...fs.readdirSync(child('projects'),{withFileTypes:true}).filter(e=>e.isDirectory()&&!e.isSymbolicLink()&&fs.existsSync(path.join(root,'projects',e.name,'project.json'))).map(e=>{const m=metadata(e.name);return {id:m.id,name:m.name};}).sort((a,b)=>a.id.localeCompare(b.id))];
  function createProject(input){
    const id=projectSlug(input.id);if(id==='legacy')fail('projectId: identificador reservado.',409);
    if(typeof input.name!=='string'||input.name!==input.name.trim()||!input.name||input.name.length>48||/[\x00-\x1f<>]/.test(input.name))fail('projectName: nome simples de 1–48 caracteres obrigatório.');
    const destination=child('projects',id);if(fs.existsSync(destination))fail('projectId: identificador já existe; nada foi sobrescrito.',409);
    let source=legacy,recipe=structuredClone(preset),provenance={kind:'approved-preset'};
    if(input.source!==null){
      const s=input.source;if(!s||typeof s!=='object'||Object.keys(s).sort().join()!=='kind,name,project'||!['initial','recipe','revision'].includes(s.kind))fail('project: origem fechada inválida.');
      source=space(s.project);
      if(s.kind==='initial'){if(s.name!==null)fail('project: origem inicial sem nome de revisão.');recipe=structuredClone(source.initial);}
      else if(s.kind==='recipe')recipe=source.checkRecipe(readRecipe(source.child('recipes',slug(s.name)+'.json')).config);
      else recipe=source.readRevision(slug(s.name)).recipe;
      provenance={...s,recipeSha256:digest(Buffer.from(JSON.stringify(recipe)))};
    }
    const imports=[...new Set([recipe.assets.logo,recipe.assets.hero].filter(p=>p.startsWith('imports/')))].map(p=>source.resources.read(p));
    recipe=structuredClone(recipe);recipe.version=2;recipe.id=id;recipe.name=input.name;recipe.assets.root='../library';recipe.assets.heroDecorative=Boolean(recipe.assets.heroDecorative);validate(recipe);
    fs.mkdirSync(destination);for(const folder of ['recipes','revisions'])fs.mkdirSync(path.join(destination,folder));
    const created=workspace(destination,recipe,{id,name:input.name});
    for(const item of imports){const copy=created.resources.add(item.record.name,item.bytes.toString('base64'));if(copy.sha256!==item.record.sha256)fail('project: digest da cópia divergiu.');}
    created.checkRecipe(recipe);write(path.join(destination,'project.json'),{schema:1,id,name:input.name,publicationAllowed:false,createdAt:new Date().toISOString(),source:provenance,resources:imports.map(i=>({path:i.record.path,sha256:i.record.sha256})),initialRecipe:recipe});
    spaces.set(id,created);return {state:'CREATED',project:created.project};
  }
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
    res.setHeader('Content-Security-Policy',"default-src 'none'; script-src 'self'; style-src 'self'; font-src 'self'; img-src 'self' blob:; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'");
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
      const projectId=req.method==='POST'?(req.headers['x-studio-project']||'legacy'):(url.searchParams.get('project')||'legacy');
      const selected=space(projectId),{resources,checkRecipe,readRevision,revision,names,child:projectChild}=selected;
      if(req.method==='GET'){
        if(route==='/api/state'){const imported=resources.list();return send(res,200,{token,sessionId,project:selected.project,projects:projects(),recipe:selected.initial,catalog:{logo:[preset.assets.logo,...imported.map(r=>r.path)],hero:[preset.assets.hero,...imported.map(r=>r.path)]},imported,limits,recipes:names('recipes'),revisions:names('revisions'),deliveries:fs.existsSync(projectChild('deliveries'))?names('deliveries'):[],previews:[...previews.values()].filter(p=>p.public.project===projectId).map(p=>p.public),root});}
        if(route==='/api/recipe'){
          const name=slug(url.searchParams.get('name'));
          const file=projectChild('recipes',name+'.json');return send(res,200,{name,recipe:checkRecipe(readRecipe(file).config,{allowMissing:true})});
        }
        if(route==='/api/revision'){
          const name=slug(url.searchParams.get('name')),recipe=checkRecipe(readRecipe(projectChild('revisions',name,'recipe.json')).config,{revision:true,allowMissing:true});if(recipe.version===2)recipe.assets.root='../library';return send(res,200,{name,recipe});
        }
        if(route==='/api/media'){
          const kind=url.searchParams.get('kind'),name=url.searchParams.get('path');if(!['logo','hero'].includes(kind))fail('Recurso indisponível.',404);
          let bytes,type;
          if(name===preset.assets[kind]){const file=path.join(toolRoot,name);noLinks(file);bytes=fs.readFileSync(file);if(digest(bytes)!==pins.find(p=>p.file===file).sha256)fail('Fonte aprovada alterada.');type=path.extname(name)==='.svg'?'image/svg+xml':'image/webp';}
          else {bytes=resources.read(name).bytes;type='image/png';}
          res.writeHead(200,{'Content-Type':type});return res.end(bytes);
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
      const maxBody=route==='/api/import'?Math.ceil(limits.bytes/3)*4+512:65536;
      if(Number(req.headers['content-length'])>maxBody)fail('Pedido demasiado grande.',413);
      for await(const bytes of req){bodyBytes+=bytes.length;if(bodyBytes>maxBody)fail('Pedido demasiado grande.',413);chunks.push(bytes);}
      let input;try{input=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks)));}catch{fail('Pedido JSON/UTF-8 inválido.');}
      if(!input||typeof input!=='object'||Array.isArray(input))fail('Pedido inválido.');
      const keys={ '/api/projects':['id','name','source'],'/api/import':['name','data'],'/api/validate':['recipe'],'/api/save':['name','recipe'],'/api/generate':['name','recipe'],'/api/preview':['name'],'/api/prepare-delivery':['name'],'/api/check-delivery':['name'],'/api/delivery-preview':['name'],'/api/stop-preview':['id'],'/api/stop':[] }[route];
      if(!keys)fail('Operação indisponível.',404);
      if(Object.keys(input).sort().join()!==[...keys].sort().join())fail('Campos de operação inesperados.');
      if(route==='/api/projects')return send(res,201,createProject(input));
      if(route==='/api/import'){const imported=resources.add(input.name,input.data);return send(res,imported.existing?200:201,imported);}
      if(route==='/api/prepare-delivery')return send(res,201,selected.prepareDelivery(slug(input.name)));
      if(route==='/api/check-delivery')return send(res,200,selected.checkDelivery(slug(input.name)));
      if(route==='/api/delivery-preview'){
        const check=selected.checkDelivery(slug(input.name));if(check.state!=='PASS')fail(check.issues[0].message);
        const name=slug(input.name),dest=projectChild('deliveries',name),proof=verifyDelivery(dest);
        if(proof.project!==projectId||proof.name!==name)fail('Identidade de entrega divergente.');
        const existing=[...previews.values()].find(p=>p.public.delivery&&p.public.name===name&&p.public.project===projectId);if(existing)return send(res,200,existing.public);
        const running=await serveDelivery(dest),id=randomUUID(),previewRecord=child('sessions',id+'.delivery.json');
        const publicInfo={...proof,id,delivery:true,urls:running.urls};
        try{write(previewRecord,{id,sessionId,name,project:projectId,kind:'delivery',startedAt:new Date().toISOString(),urls:running.urls});}catch(error){await close(running.server);throw error;}
        previews.set(id,{server:running.server,record:previewRecord,public:publicInfo});return send(res,200,publicInfo);
      }
      if(route==='/api/validate'){checkRecipe(input.recipe);return send(res,200,{state:'PASS',message:'Receita válida. Ainda não foi gerada.'});}
      if(route==='/api/save'||route==='/api/generate'){
        const name=slug(input.name),recipe=checkRecipe(input.recipe);
        const target=route==='/api/save'?projectChild('recipes',name+'.json'):revision(name);
        if(fs.existsSync(target))fail('versionName: esta versão já existe. Escolha um nome novo.',409);
        if(route==='/api/save'){write(target,recipe);return send(res,201,{state:'SAVED',name});}
        if(recipe.version===2)recipe.assets.root='../../library';
        fs.mkdirSync(target);write(projectChild('revisions',name,'recipe.json'),recipe);
        const site=projectChild('revisions',name,'site');generate(recipe,target,site);
        const proof=verify(recipe,target,site);return send(res,201,{...proof,name});
      }
      if(route==='/api/preview'){
        const name=slug(input.name),rev=readRevision(name);
        const existing=[...previews.values()].find(item=>!item.public.delivery&&item.public.name===name&&item.public.project===projectId);
        if(existing)return send(res,200,existing.public);
        const id=randomUUID(),previewRecord=child('sessions',id+'.preview.json');
        const running=await serve(rev.recipeFile,rev.site,previewRecord);
        const previewOrigin=`http://127.0.0.1:${running.info.port}`;
        const handler=running.server.listeners('request')[0];running.server.removeListener('request',handler);
        running.server.on('request',(request,response)=>{
          if(!safeOrigin(request,[new URL(previewOrigin).host])){response.writeHead(403).end('Origem externa recusada');return;}
          try{readRevision(name);handler(request,response);}catch{response.writeHead(409).end('Preview alterada ou inválida');}
        });
        const publicInfo={id,name,project:projectId,urls:Object.fromEntries(Object.entries(rev.recipe.routes).map(([key,value])=>[key,previewOrigin+'/'+value]))};
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
