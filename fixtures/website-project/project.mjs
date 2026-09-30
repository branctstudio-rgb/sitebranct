import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const sha256 = value => createHash('sha256').update(value).digest('hex');
const fail = message => { throw new Error(message); };
function exact(value, keys, at) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${at}: objeto obrigatório`);
  for (const key of keys) if (!Object.hasOwn(value, key)) fail(`${at}.${key}: campo obrigatório ausente`);
  for (const key of Object.keys(value)) if (!keys.includes(key)) fail(`${at}.${key}: campo desconhecido`);
}
function text(value, at, max = 600) {
  if (typeof value !== 'string' || !value.trim() || value.length > max || /[\u0000-\u001f\u007f]/u.test(value)) fail(`${at}: texto não vazio até ${max} caracteres obrigatório`);
  return value;
}
function relative(value, at) {
  text(value, at, 240);
  if (!/^[a-zA-Z0-9_./-]+$/.test(value) || value.startsWith('/') || value.split('/').some(s => !s || s === '.' || s === '..')) fail(`${at}: caminho relativo sem travessia obrigatório`);
  return value;
}
export function noLinks(target) {
  let current = path.resolve(target);
  while (true) {
    const stat = fs.lstatSync(current);
    if (stat.isSymbolicLink()) fail(`Caminho ligado não permitido: ${current}`);
    const next = path.dirname(current);
    if (next === current) break;
    current = next;
  }
}
function asset(base, value, at) {
  relative(value, at);
  const file = path.resolve(base, value);
  if (!file.startsWith(path.resolve(base) + path.sep)) fail(`${at}: fora da raiz de assets`);
  if (!fs.existsSync(file)) fail(`${at}: ficheiro inexistente: ${value}`);
  noLinks(file);
  if (!fs.statSync(file).isFile() || fs.statSync(file).size > 5 * 1024 * 1024) fail(`${at}: ficheiro regular até 5 MB obrigatório`);
  return fs.readFileSync(file);
}
function image(base, value, at) {
  const bytes = asset(base, value, at), ext = path.extname(value).toLowerCase();
  const valid = ext === '.webp' ? bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP'
    : ext === '.png' ? bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))
    : ['.jpg', '.jpeg'].includes(ext) ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
    : false;
  if (!valid) fail(`${at}: imagem PNG, JPEG ou WebP válida obrigatória`);
  return bytes;
}
function logo(base, value) {
  if (path.extname(value).toLowerCase() !== '.svg') return image(base, value, 'assets.logo');
  const bytes = asset(base, value, 'assets.logo'), xml = bytes.toString('utf8');
  // Static SVG subset only: no scripts, styles, entities, links or embedded content.
  if (!/^\s*<svg\s/u.test(xml) || /<!|<\?|\bon\w+\s*=|(?:href|style)\s*=|url\s*\(|[&]/iu.test(xml)) fail('assets.logo: SVG ativo ou externo não permitido');
  const tags = [...xml.matchAll(/<\/?([a-zA-Z][\w:-]*)\b/gu)].map(m => m[1]);
  if (tags.some(tag => !['svg','g','path','rect','circle','ellipse','line','polyline','polygon','text','title','desc'].includes(tag))) fail('assets.logo: elemento SVG não permitido');
  return bytes;
}
function luminance(color) {
  const rgb = color.slice(1).match(/../g).map(n => parseInt(n, 16) / 255).map(n => n <= .04045 ? n / 12.92 : ((n + .055) / 1.055) ** 2.4);
  return rgb[0] * .2126 + rgb[1] * .7152 + rgb[2] * .0722;
}
export function contrast(a,b) { const x=luminance(a), y=luminance(b); return (Math.max(x,y)+.05)/(Math.min(x,y)+.05); }
export function validate(config) {
  exact(config, ['version','kind','id','name','origin','locale','palette','fonts','assets','routes','content','navigation','sources'], 'receita');
  if (![1,2].includes(config.version) || config.kind !== 'local-draft') fail('version/kind: apenas version=1/2 e kind=local-draft; publicação não suportada');
  if (typeof config.id !== 'string' || !/^[a-z][a-z0-9-]{1,35}$/.test(config.id)) fail('id: usar 2–36 letras minúsculas, números ou hífen');
  text(config.name, 'name', 48);
  if (config.locale !== 'pt-PT') fail('locale: este contrato suporta pt-PT; não traduz conteúdo automaticamente');
  if (typeof config.origin !== 'string' || !/^https:\/\/[a-z0-9]+(?:[.-][a-z0-9]+)*\.[a-z]{2,}$/u.test(config.origin)) fail('origin: origem HTTPS sem porta, caminho, query ou credenciais obrigatória');
  exact(config.palette, ['bg','surface','ink','accent'], 'palette');
  for (const [k,v] of Object.entries(config.palette)) if (typeof v !== 'string' || !/^#[a-fA-F0-9]{6}$/u.test(v)) fail(`palette.${k}: cor hexadecimal de seis dígitos obrigatória`);
  for (const [a,b] of [['ink','bg'],['ink','surface'],['accent','bg'],['accent','surface']]) if (contrast(config.palette[a],config.palette[b]) < 4.5) fail(`palette: contraste ${a}/${b} abaixo de 4.5:1`);
  exact(config.fonts, ['body','display'], 'fonts');
  for (const v of Object.values(config.fonts)) if (!['manrope','bricolage'].includes(v)) fail('fonts: escolher manrope ou bricolage locais');
  exact(config.assets, ['root','logo','hero','heroAlt','heroCaption',...(config.version===2?['heroDecorative']:[])], 'assets');
  text(config.assets.root, 'assets.root', 1024); relative(config.assets.logo, 'assets.logo'); relative(config.assets.hero, 'assets.hero');
  if(config.version===2&&typeof config.assets.heroDecorative!=='boolean')fail('assets.heroDecorative: escolha informativa ou decorativa.');
  if(config.version===2&&config.assets.heroDecorative){if(config.assets.heroAlt!=='')fail('assets.heroAlt: imagem decorativa requer alt vazio.');}
  else text(config.assets.heroAlt, 'assets.heroAlt');
  text(config.assets.heroCaption, 'assets.heroCaption');
  exact(config.routes, ['home','contact'], 'routes');
  for (const value of Object.values(config.routes)) if (typeof value !== 'string' || !/^[a-z][a-z0-9-]{0,40}\.html$/u.test(value)) fail('routes: nomes HTML distintos, planos e portáveis obrigatórios');
  if (config.routes.home === config.routes.contact) fail('routes: home e contact devem ser diferentes');
  exact(config.content, ['eyebrow','headline','description','approachTitle','steps','contactTitle','contactText'], 'content');
  for (const [k,v] of Object.entries(config.content)) if (k !== 'steps') text(v, `content.${k}`);
  if (!Array.isArray(config.content.steps) || config.content.steps.length < 1 || config.content.steps.length > 6) fail('content.steps: fornecer 1 a 6 textos');
  config.content.steps.forEach((v,i) => text(v, `content.steps[${i}]`, 160));
  exact(config.navigation, ['home','approach','contact','open','close'], 'navigation');
  for (const [k,v] of Object.entries(config.navigation)) text(v, `navigation.${k}`, 32);
  if (!Array.isArray(config.sources) || !config.sources.length) fail('sources: indicar as fontes existentes de identidade, conteúdo e assets');
  config.sources.forEach((source,i) => { exact(source,['path','note'],`sources[${i}]`); relative(source.path,`sources[${i}].path`); text(source.note,`sources[${i}].note`); });
  return structuredClone(config);
}
const escape = s => s.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
const notice = 'Rascunho local · Não publicado · Sem envio de dados';
function page(c, contact, logoPath, heroPath) {
  const e=escape, n=c.navigation, t=c.content, r=c.routes;
  const route=contact?r.contact:r.home, url=c.origin+'/'+route;
  const title=`${c.name} — ${contact?t.contactTitle:t.headline} | Rascunho local`, description=contact?t.contactText:t.description;
  const schema=JSON.stringify({'@context':'https://schema.org','@type':'WebPage',name:title,description,inLanguage:c.locale,url,about:{'@type':'Organization',name:c.name}}).replaceAll('<','\\u003c');
  const nav=`<a href="${r.home}"${!contact?' aria-current="page"':''}>${e(n.home)}</a><a href="${r.home}#abordagem">${e(n.approach)}</a><a href="${r.contact}"${contact?' aria-current="page"':''}>${e(n.contact)}</a>`;
  const body=contact?`<section class="contact-section"><p class="eyebrow">${e(n.contact)}</p><h1>${e(t.contactTitle)}</h1><p class="lead">${e(t.contactText)}</p><div class="contact-note"><span class="status-dot" aria-hidden="true"></span><p>Prévia de conteúdo. O contacto ainda não está ativo: sem formulário, recolha ou envio.</p></div><a class="button" href="${r.home}">Voltar a ${e(c.name)}</a><p class="about-entity">${e(t.description)}</p></section>`
    :`<section class="hero"><div class="hero-copy"><p class="eyebrow">${e(t.eyebrow)}</p><h1>${e(t.headline)}</h1><p class="lead">${e(t.description)}</p><a class="button" href="${r.contact}">${e(n.contact)} <span aria-hidden="true">↗</span></a></div><figure class="visual"><img src="${heroPath}" alt="${e(c.assets.heroAlt)}" width="940" height="940"><figcaption>${e(c.assets.heroCaption)}</figcaption></figure></section><section class="approach" id="abordagem"><div><p class="eyebrow">${e(n.approach)}</p><h2>${e(t.approachTitle)}</h2></div><ol>${t.steps.map((s,i)=>`<li><span aria-hidden="true">${String(i+1).padStart(2,'0')}</span><h3>${e(s)}</h3></li>`).join('')}</ol></section><section class="invitation"><h2>${e(t.contactTitle)}</h2><a class="button button-light" href="${r.contact}">${e(n.contact)} <span aria-hidden="true">↗</span></a></section>`;
  return `<!doctype html>
<html lang="${c.locale}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; font-src 'self'; connect-src 'none'; frame-src 'none'; worker-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'">
<title>${e(title)}</title><meta name="description" content="${e(description)}"><meta name="robots" content="noindex, nofollow, noarchive">
<link rel="canonical" href="${url}"><meta property="og:type" content="website"><meta property="og:locale" content="pt_PT"><meta property="og:url" content="${url}"><meta property="og:title" content="${e(title)}"><meta property="og:description" content="${e(description)}"><meta property="og:image" content="${c.origin}/${heroPath}"><meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${e(title)}"><meta name="twitter:description" content="${e(description)}"><meta name="twitter:image" content="${c.origin}/${heroPath}">
<link rel="icon" href="${logoPath}"><link rel="stylesheet" href="assets/site.css"><link rel="stylesheet" href="assets/project.css"><script defer src="assets/navigation.js"></script><script type="application/ld+json">${schema}</script></head>
<body><a class="skip-link" href="#main">Saltar para o conteúdo</a><div class="demo-banner">${notice}</div>
<header class="header"><a class="logo" href="${r.home}"><img src="${logoPath}" width="36" height="36" alt="">${e(c.name)}</a><nav class="desktop-nav" aria-label="Navegação principal">${nav}</nav><button type="button" class="mobile-toggle" aria-controls="drawer" aria-expanded="false" aria-label="${e(n.open)}">Menu <span aria-hidden="true">☰</span></button></header>
<div id="drawer" class="mobile-drawer" role="dialog" aria-modal="true" aria-label="${e(n.open)}" data-close-label="${e(n.close)}" aria-hidden="true" inert><nav aria-label="Navegação móvel">${nav}</nav></div><div class="drawer-overlay" aria-hidden="true"></div>
<main id="main" tabindex="-1">${body}</main><footer class="footer"><a class="logo" href="${r.home}">${e(c.name)}</a><p>${notice}. Conteúdo para revisão; este rascunho não recebe pedidos.</p><a href="${r.contact}">${e(n.contact)}</a></footer></body></html>\n`.replaceAll('<a ', '<a tabindex="0" ');
}
export function build(config, recipeDir) {
  const c=validate(config); if (/^(?:\\\\|\/\/)/u.test(c.assets.root)) fail('assets.root: raiz local obrigatória, UNC não permitido'); const base=path.resolve(recipeDir,c.assets.root), files=new Map();
  const add=(name,value)=>{
    // Canonical text EOL makes Git checkouts reproducible; binary assets remain exact.
    const bytes=Buffer.isBuffer(value)?value:Buffer.from(value);
    files.set(name,/\.(?:css|js|svg)$/u.test(name)?Buffer.from(bytes.toString('utf8').replace(/\r\n|\r/gu,'\n')):bytes);
  };
  const logoPath='assets/logo'+path.extname(c.assets.logo).toLowerCase(), heroPath='assets/hero'+path.extname(c.assets.hero).toLowerCase();
  add(logoPath,logo(base,c.assets.logo)); add(heroPath,image(base,c.assets.hero,'assets.hero'));
  for(const source of c.sources) asset(base,source.path,'sources.path');
  add(c.routes.home,page(c,false,logoPath,heroPath)); add(c.routes.contact,page(c,true,logoPath,heroPath));
  for(const file of ['site.css','navigation.js']) add('assets/'+file,fs.readFileSync(path.join(root,'fixtures/website-base',file)));
  for(const [family,stem] of [['manrope','manrope'],['bricolage','bricolage-grotesque']]) {
    for(const [suffix,out] of [['latin',''],['latin-ext','-ext']]) add(`assets/${family}${out}.woff2`,fs.readFileSync(path.join(root,`src/fonts/${stem}-${suffix}.woff2`)));
  }
  const extended=fs.readFileSync(path.join(root,'src/fonts/font-faces.css'),'utf8').replaceAll("'Bricolage Grotesque'",'bricolage').replaceAll("'Manrope'",'manrope').replaceAll('../fonts/bricolage-grotesque-latin-ext.woff2','bricolage-ext.woff2').replaceAll('../fonts/bricolage-grotesque-latin.woff2','bricolage.woff2').replaceAll('../fonts/manrope-latin-ext.woff2','manrope-ext.woff2').replaceAll('../fonts/manrope-latin.woff2','manrope.woff2');
  add('assets/project.css',extended+`\n:root{${Object.entries(c.palette).map(([k,v])=>`--${k}:${v};`).join('')}--font-body:'${c.fonts.body}';--font-display:'${c.fonts.display}';}\n.hero-copy,.header .logo{min-width:0}h1,h2,h3,p,.logo{overflow-wrap:anywhere}.header .logo{max-width:65%}.visual>img{object-fit:contain;background:var(--surface)}\n`);
  add('robots.txt','User-agent: *\nDisallow: /\n');
  // Empty by design: draft routes are never advertised for indexing.
  add('sitemap.xml','<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></urlset>\n');
  const manifest={schema:1,kind:'local-draft',indexable:false,publicationAllowed:false,configSha256:sha256(JSON.stringify(c)),sources:c.sources,files:[...files].map(([name,bytes])=>({path:name,bytes:bytes.length,sha256:sha256(bytes)}))};
  add('manifest.json',JSON.stringify(manifest,null,2)+'\n');
  return {config:c,files,manifest};
}
function newDestination(destination) {
  if(typeof destination!=='string'||!path.isAbsolute(destination)||/^(?:\\\\|\/\/)/u.test(destination)||destination.replaceAll('\\','/').split('/').some(s=>s==='.'||s==='..')) fail('destino: caminho absoluto local sem travessia obrigatório');
  const dest=path.resolve(destination);
  if(!/^[a-z][a-z0-9-]{0,60}$/u.test(path.basename(dest))) fail('destino: nome portátil minúsculo obrigatório');
  try { fs.lstatSync(dest); fail('destino já existe: escolha uma nova versão; nenhum ficheiro foi sobrescrito'); } catch(error) { if(error.code!=='ENOENT') throw error; }
  const parent=path.dirname(dest); if(!fs.existsSync(parent)||!fs.statSync(parent).isDirectory()) fail('destino: pasta-pai existente obrigatória'); noLinks(parent);
  return dest;
}
export function generate(config, recipeDir, destination) {
  const {files,manifest}=build(config,recipeDir), dest=newDestination(destination);
  fs.mkdirSync(dest); fs.mkdirSync(path.join(dest,'assets'));
  // Exclusive creation. An I/O failure deliberately leaves an invalid partial draft for inspection.
  for(const [name,bytes] of files) fs.writeFileSync(path.join(dest,name),bytes,{flag:'wx'});
  return manifest;
}
function listFiles(dir, prefix='') {
  return fs.readdirSync(dir,{withFileTypes:true}).flatMap(entry=>{
    const name=prefix+entry.name, target=path.join(dir,entry.name); noLinks(target);
    if(entry.isDirectory()) return listFiles(target,name+'/');
    if(!entry.isFile()) fail(`Saída inválida: ${name}`);
    return [name];
  });
}
export function verify(config, recipeDir, destination) {
  const {files,manifest}=build(config,recipeDir); noLinks(destination);
  const names=listFiles(destination).sort();
  if(JSON.stringify(names)!==JSON.stringify([...files.keys()].sort())) fail('verificação: ficheiros ausentes ou extras no destino');
  for(const [name,expected] of files) if(!fs.readFileSync(path.join(destination,name)).equals(expected)) fail(`verificação: bytes diferentes em ${name}`);
  return {state:'PASS',mode:'STATIC_REBUILD_COMPARISON',files:files.size,configSha256:manifest.configSha256,indexable:false,publicationAllowed:false};
}
export function readRecipe(file) {
  const absolute=path.resolve(file); noLinks(absolute);
  return {config:JSON.parse(fs.readFileSync(absolute,'utf8')),dir:path.dirname(absolute)};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  try {
    const [command,input,destination,...extra]=process.argv.slice(2);
    if(!['create','verify'].includes(command)||!input||!destination||extra.length) fail('Uso: node fixtures/website-project/project.mjs create|verify RECEITA_JSON DESTINO_ABSOLUTO');
    const {config,dir}=readRecipe(input);
    if(command==='create') generate(config,dir,destination);
    console.log(JSON.stringify({output:path.resolve(destination),...verify(config,dir,destination)},null,2));
  } catch(error) { console.error('Projeto recusado: '+error.message); process.exitCode=1; }
}
