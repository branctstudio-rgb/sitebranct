// Adapted boundary from the immutable package21, which is not modified.
// Executes only the materialized canonical test blob563, never candidate tests.
import fs from 'node:fs';import http from 'node:http';import assert from 'node:assert/strict';
import {after} from 'node:test';import {createRequire,syncBuiltinESMExports} from 'node:module';import {pathToFileURL} from 'node:url';
import {contract,hash} from './admission.mjs';
const c=contract(),root='/tmp/website27-candidate',engine=process.env.F2_01_BROWSER;
assert.equal(process.platform,'linux');assert.ok(c.engines.includes(engine));assert.equal(process.env.PLAYWRIGHT_BROWSERS_PATH,'/ms-playwright');
const test=c.authorities.find(x=>x.file==='tests/audit/f2-01-responsive.test.mjs');assert.equal(hash(fs.readFileSync(`${root}/${test.file}`)),test.sha256);
const require=createRequire(root+'/package.json'),pw=require('playwright');assert.equal(require('playwright/package.json').version,'1.62.0');
const expected={chromium:'151.0.7922.34',firefox:'153.0',webkit:'26.5'},attempts=[],violations=[],origins=new Set();
const createServer=http.createServer;
http.createServer=function(...args){const s=createServer.apply(this,args);s.prependListener('request',(_q,r)=>{
 r.setHeader('Content-Security-Policy',"default-src 'self' data: blob:; connect-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; media-src 'self' blob:; frame-src 'none'; worker-src 'none'; object-src 'none'; form-action 'none'; base-uri 'self'");r.setHeader('X-DNS-Prefetch-Control','off');
 });s.on('listening',()=>{assert.equal(s.address().address,'127.0.0.1');origins.add(`http://127.0.0.1:${s.address().port}`);});return s;};syncBuiltinESMExports();
const launch=pw[engine].launch.bind(pw[engine]);
pw[engine].launch=async options=>{const browser=await launch(options);assert.equal(browser.version(),expected[engine]);const createPage=browser.newPage.bind(browser);
 browser.newPage=async options=>{const p=await createPage({...options,serviceWorkers:'block',permissions:[]});
  await p.context().route('**/*',r=>{if(!origins.has(new URL(r.request().url()).origin)){attempts.push({mechanism:r.request().resourceType(),url:r.request().url()});return r.abort('blockedbyclient');}return r.continue();});
  await p.context().routeWebSocket('**/*',s=>{attempts.push({mechanism:'WebSocket',url:s.url()});s.close();});
  p.on('console',m=>{if(/Content Security Policy|violates.*directive|Refused to/i.test(m.text()))violations.push(m.text());});return p;};return browser;};
after(()=>{fs.writeFileSync(process.env.F2_01_REPORT_PATH+'.isolation.json',JSON.stringify({engine,attempts,violations,boundary:'NETWORK_NONE_REQUIRED'},null,2)+'\n');assert.equal(attempts.length,0);assert.equal(violations.length,0);});
await import(pathToFileURL(`${root}/${test.file}`));
