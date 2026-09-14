// Future Linux measurement boundary. Imports the unmodified canonical test.
import fs from 'node:fs';import path from 'node:path';import http from 'node:http';
import assert from 'node:assert/strict';import {after} from 'node:test';
import {syncBuiltinESMExports,createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';import {execFileSync} from 'node:child_process';
const root='/candidate',engine=process.env.F2_01_BROWSER;
assert.equal(process.platform,'linux');assert.equal(engine,'webkit');
const require=createRequire(root+'/package.json'),pw=require('playwright');
assert.equal(require('playwright/package.json').version,'1.62.0');
const expected={chromium:'151.0.7922.34',firefox:'153.0',webkit:'26.5'};
const attempts=[],violations=[],origins=new Set();
const createServer=http.createServer;
http.createServer=function(...args){const s=createServer.apply(this,args);s.prependListener('request',(_q,r)=>{
 r.setHeader('Content-Security-Policy',"default-src 'self' data: blob:; connect-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; media-src 'self' blob:; frame-src 'none'; worker-src 'none'; object-src 'none'; form-action 'none'; base-uri 'self'");r.setHeader('X-DNS-Prefetch-Control','off');
 });s.on('listening',()=>{assert.equal(s.address().address,'127.0.0.1');origins.add(`http://127.0.0.1:${s.address().port}`);});return s;};syncBuiltinESMExports();
const launch=pw[engine].launch.bind(pw[engine]);let measuredVersion;
pw[engine].launch=async options=>{const browser=await launch(options);assert.equal(browser.version(),expected[engine]);measuredVersion=browser.version();const createPage=browser.newPage.bind(browser);
 browser.newPage=async options=>{const p=await createPage({...options,serviceWorkers:'block',permissions:[]});
  await p.context().route('**/*',r=>{if(!origins.has(new URL(r.request().url()).origin)){attempts.push({mechanism:r.request().resourceType(),url:r.request().url()});return r.abort('blockedbyclient');}return r.continue();});
  await p.context().routeWebSocket('**/*',s=>{attempts.push({mechanism:'WebSocket',url:s.url()});s.close();});
  p.on('console',m=>{if(/Content Security Policy|violates.*directive|Refused to/i.test(m.text()))violations.push(m.text());});return p;};return browser;};
after(()=>{fs.writeFileSync(process.env.F2_01_REPORT_PATH+'.isolation.json',JSON.stringify({head:execFileSync('git',['-C',root,'rev-parse','HEAD'],{encoding:'utf8'}).trim(),engine,measuredVersion,origins:[...origins],attempts,violations,networkNamespace:'none required by launcher'},null,2)+'\n');assert.equal(attempts.length,0);assert.equal(violations.length,0);});
await import(pathToFileURL(path.join(root,'tests/audit/f2-01-responsive.test.mjs')));
