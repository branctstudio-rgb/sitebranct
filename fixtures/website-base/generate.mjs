import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const sourceCommit='851c1723119b62193623fa24e67090afd18b39f1';
const digest=b=>createHash('sha256').update(b).digest('hex');
const textKeys=['name','mark','eyebrow','headline','description','imageAlt','imageCaption','approachTitle','contactTitle','contactText'];
function exact(value,keys){assert.ok(value&&typeof value==='object'&&!Array.isArray(value),'configuration object required');assert.deepEqual(Object.keys(value).sort(),[...keys].sort(),'configuration keys incomplete or unknown');}
function text(value){assert.equal(typeof value,'string','text required');assert.ok(value.trim()&&value.length<=600&&!/[\u0000-\u001f\u007f]/.test(value),'invalid text');assert.ok(!/branct|https?:\/\/|webhook|pixel id/i.test(value),'reference or operational identity forbidden');}
export function validate(config){
 exact(config,['version','id','synthetic','origin','locale','palette','fonts','heroAsset','steps','navigation',...textKeys]);
 assert.equal(config.version,1);assert.equal(config.synthetic,true,'synthetic-only generator');
 assert.match(config.id,/^[a-z][a-z0-9-]{1,35}$/);assert.equal(config.locale,'pt-PT');
 assert.match(config.origin,/^https:\/\/[a-z][a-z0-9-]*\.example\.invalid$/,'synthetic origin required');
 textKeys.forEach(k=>text(config[k]));assert.match(config.mark,/^[A-Z]{1,3}$/);
 exact(config.palette,['bg','surface','ink','accent']);Object.values(config.palette).forEach(v=>assert.match(v,/^#[0-9a-fA-F]{6}$/));
 exact(config.fonts,['body','display']);Object.values(config.fonts).forEach(v=>assert.ok(['manrope','bricolage'].includes(v),'known local font required'));
 assert.ok(['workspace','none'].includes(config.heroAsset),'unknown asset');
 assert.ok(Array.isArray(config.steps)&&config.steps.length===3,'three approach steps required');config.steps.forEach(text);
 exact(config.navigation,['home','approach','contact','open','close']);Object.values(config.navigation).forEach(text);
 return structuredClone(config);
}
const escape=s=>s.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
function source(file){return execFileSync('git',['-C',root,'show',`${sourceCommit}:${file}`],{maxBuffer:5*1024*1024,env:{...process.env,GIT_NO_LAZY_FETCH:'1',GIT_TERMINAL_PROMPT:'0'}});}
function drawer(){return fs.readFileSync(path.join(root,'fixtures/website-base/navigation.js'));}
function page(c,contact){
 const e=escape,n=c.navigation,url=c.origin+(contact?'/contacto.html':'/');
 const schema=JSON.stringify({'@context':'https://schema.org','@type':'Organization',name:c.name,description:c.description,url:c.origin+'/',logo:c.origin+'/assets/mark.svg'}).replaceAll('<','\\u003c');
 const nav=`<a href="index.html"${!contact?' aria-current="page"':''}>${e(n.home)}</a><a href="index.html#abordagem">${e(n.approach)}</a><a href="contacto.html"${contact?' aria-current="page"':''}>${e(n.contact)}</a>`;
 const visual=c.heroAsset==='workspace'?`<figure class="visual"><img src="assets/social.webp" alt="${e(c.imageAlt)}" width="940" height="940"><figcaption>${e(c.imageCaption)}</figcaption></figure>`:`<figure class="visual graphic" aria-label="Composição tipográfica demonstrativa"><div aria-hidden="true" class="graphic-mark">${e(c.mark)}</div><figcaption>${e(c.imageCaption)}</figcaption></figure>`;
 const body=contact?`<section class="contact-section"><p class="eyebrow">${e(n.contact)}</p><h1>${e(c.contactTitle)}</h1><p class="lead">${e(c.contactText)}</p><div class="contact-note"><span class="status-dot" aria-hidden="true"></span><p>Modo demonstrativo. Sem formulário, sem recolha, sem envio.</p></div><a class="button" href="index.html">Voltar à referência</a><p class="about-entity">${e(c.description)}</p></section>`:`<section class="hero"><div class="hero-copy"><p class="eyebrow">${e(c.eyebrow)}</p><h1>${e(c.headline)}</h1><p class="lead">${e(c.description)}</p><a class="button" href="contacto.html">${e(n.contact)} <span aria-hidden="true">↗</span></a></div>${visual}</section><section class="approach" id="abordagem"><div><p class="eyebrow">${e(n.approach)}</p><h2>${e(c.approachTitle)}</h2></div><ol>${c.steps.map((s,i)=>`<li><span aria-hidden="true">0${i+1}</span><h3>${e(s)}</h3></li>`).join('')}</ol></section><section class="invitation"><h2>${e(c.contactTitle)}</h2><a class="button button-light" href="contacto.html">${e(n.contact)} <span aria-hidden="true">↗</span></a></section>`;
 return `<!doctype html>
<html lang="${c.locale}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; font-src 'self'; connect-src 'none'; frame-src 'none'; worker-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'">
<title>${e(c.name)}${contact?' — Contacto demonstrativo':''} | Referência sintética</title><meta name="description" content="${e(contact?c.contactText:c.description)}"><meta name="robots" content="noindex, nofollow">
<link rel="canonical" href="${url}"><meta property="og:type" content="website"><meta property="og:url" content="${url}"><meta property="og:title" content="${e(c.name)}"><meta property="og:description" content="${e(c.description)}"><meta property="og:image" content="${c.origin}/assets/social.webp"><meta name="twitter:card" content="summary_large_image"><meta name="twitter:image" content="${c.origin}/assets/social.webp">
<link rel="icon" href="assets/mark.svg" type="image/svg+xml"><link rel="stylesheet" href="assets/site.css"><link rel="stylesheet" href="assets/project.css"><script defer src="assets/navigation.js"></script><script type="application/ld+json">${schema}</script></head>
<body><a class="skip-link" href="#main">Saltar para o conteúdo</a><div class="demo-banner">Referência sintética · Apenas local · Sem integrações</div>
<header class="header"><a class="logo" href="index.html"><img src="assets/mark.svg" width="36" height="36" alt="">${e(c.name)}</a><nav class="desktop-nav" aria-label="Navegação principal">${nav}</nav><button type="button" class="mobile-toggle" aria-controls="drawer" aria-expanded="false" aria-label="${e(n.open)}">Menu <span aria-hidden="true">☰</span></button></header>
<div id="drawer" class="mobile-drawer" role="dialog" aria-modal="true" aria-label="${e(n.open)}" data-close-label="${e(n.close)}" aria-hidden="true" inert><nav aria-label="Navegação móvel">${nav}</nav></div><div class="drawer-overlay" aria-hidden="true"></div>
<main id="main" tabindex="-1">${body}</main><footer class="footer"><a class="logo" href="index.html">${e(c.name)}</a><p>Identidade inteiramente sintética. Não representa uma empresa em atividade.</p><a href="contacto.html">${e(n.contact)}</a></footer></body></html>\n`.replaceAll('<a ','<a tabindex="0" ');
}
function outputPath(destination){
 assert.equal(typeof destination,'string','output path required');assert.ok(path.isAbsolute(destination),'absolute output path required');
 assert.ok(!destination.startsWith('\\\\')&&!destination.startsWith('//'),'UNC output path forbidden');
 const segments=destination.replaceAll('\\','/').split('/');assert.ok(!segments.some(s=>s==='.'||s==='..'),'unsafe path segment');
 const dest=path.resolve(destination);assert.match(path.basename(dest),/^[a-z][a-z0-9-]{0,60}$/,'portable output name required');
 assert.ok(!fs.existsSync(dest),'output already exists');
 const parent=path.dirname(dest);assert.ok(fs.existsSync(parent)&&fs.statSync(parent).isDirectory(),'existing parent required');
 let current=parent;
 while(true){assert.ok(!fs.lstatSync(current).isSymbolicLink(),'linked ancestor forbidden');const next=path.dirname(current);if(next===current)break;current=next;}
 assert.equal(fs.realpathSync(parent).toLowerCase(),path.resolve(parent).toLowerCase(),'parent path mismatch');
 return dest;
}
export function generate(input,destination){
 const c=validate(input),dest=outputPath(destination),files=new Map();
 const add=(name,content)=>files.set(name,Buffer.isBuffer(content)?content:Buffer.from(content));
 add('index.html',page(c,false));add('contacto.html',page(c,true));
 add('assets/site.css',fs.readFileSync(path.join(root,'fixtures/website-base/site.css')));
 add('assets/navigation.js',drawer());
 add('assets/project.css',`:root{${Object.entries(c.palette).map(([k,v])=>`--${k}:${v};`).join('')}--font-body:'${c.fonts.body}';--font-display:'${c.fonts.display}';}\n`);
 add('assets/mark.svg',`<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64"><rect width="64" height="64" rx="12" fill="${c.palette.ink}"/><text x="32" y="40" text-anchor="middle" font-family="sans-serif" font-size="24" fill="${c.palette.surface}">${c.mark}</text></svg>\n`);
 add('assets/social.webp',source('src/img/website-940.webp'));
 for(const [family,file]of [['manrope','manrope-latin.woff2'],['bricolage','bricolage-grotesque-latin.woff2']])add(`assets/${family}.woff2`,source('src/fonts/'+file));
 add('robots.txt','User-agent: *\nDisallow: /\n');
 add('sitemap.xml',`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>${c.origin}/</loc></url><url><loc>${c.origin}/contacto.html</loc></url></urlset>\n`);
 const manifest={schema:1,synthetic:true,sourceCommit,configSha256:digest(JSON.stringify(c)),files:[...files].map(([name,b])=>({path:name,bytes:b.length,sha256:digest(b)}))};
 // Parent is trusted local workspace; refuse existing output. No code executes from configuration.
 fs.mkdirSync(dest);fs.mkdirSync(path.join(dest,'assets'));
 for(const [name,b]of files){const target=path.resolve(dest,name);assert.ok(target.startsWith(dest+path.sep),'output escapes root');fs.writeFileSync(target,b,{flag:'wx'});}
 fs.writeFileSync(path.join(dest,'manifest.json'),JSON.stringify(manifest,null,2)+'\n',{flag:'wx'});
 return manifest;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 assert.equal(process.argv.length,4,'Usage: node fixtures/website-base/generate.mjs CONFIG_JSON ABSOLUTE_NEW_DESTINATION');
 const result=generate(JSON.parse(fs.readFileSync(process.argv[2],'utf8')),process.argv[3]);console.log(JSON.stringify({output:process.argv[3],files:result.files.length+1,configSha256:result.configSha256}));
}
