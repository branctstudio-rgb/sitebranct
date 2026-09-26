import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import {fileURLToPath} from 'node:url';
import {readRecipe,verify,noLinks} from './project.mjs';

export async function serve(recipe,destination,record,port=0) {
  const {config,dir}=readRecipe(recipe);
  verify(config,dir,destination);
  if(!path.isAbsolute(record)||fs.existsSync(record)) throw new Error('Registro absoluto e novo obrigatório');
  noLinks(path.dirname(record));
  if(!Number.isInteger(port)||port<0||port>65535) throw new Error('Porta inválida');
  const manifest=JSON.parse(fs.readFileSync(path.join(destination,'manifest.json'),'utf8'));
  const allowed=new Set(manifest.files.map(f=>f.path));
  const types={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'application/javascript; charset=utf-8','.svg':'image/svg+xml','.webp':'image/webp','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.woff2':'font/woff2','.xml':'application/xml','.txt':'text/plain; charset=utf-8'};
  const server=http.createServer((req,res)=>{
    res.setHeader('X-Robots-Tag','noindex, nofollow, noarchive');
    res.setHeader('Cache-Control','no-store'); res.setHeader('X-Content-Type-Options','nosniff');
    if(!['GET','HEAD'].includes(req.method)){res.writeHead(405).end();return;}
    let route;
    try{route=decodeURIComponent(new URL(req.url,'http://127.0.0.1').pathname).slice(1)||config.routes.home;}catch{res.writeHead(400).end();return;}
    if(!allowed.has(route)){res.writeHead(404).end('Not found');return;}
    try{
      const file=path.join(destination,route);noLinks(file);
      const bytes=fs.readFileSync(file);
      res.writeHead(200,{'Content-Type':types[path.extname(route)]||'application/octet-stream'});
      res.end(req.method==='HEAD'?undefined:bytes);
    }catch{res.writeHead(500).end('Preview unavailable');}
  });
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve);});
  const info={mission:'WEBSITE38',pid:process.pid,startedAt:new Date().toISOString(),host:'127.0.0.1',port:server.address().port,url:`http://127.0.0.1:${server.address().port}/${config.routes.home}`,destination:path.resolve(destination),recipe:path.resolve(recipe),script:fileURLToPath(import.meta.url),record:path.resolve(record)};
  try{fs.writeFileSync(record,JSON.stringify(info,null,2)+'\n',{flag:'wx'});}catch(error){server.close();throw error;}
  return {server,info};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  try{
    const [recipe,destination,record,port='0',...extra]=process.argv.slice(2);
    if(!recipe||!destination||!record||extra.length) throw new Error('Uso: node fixtures/website-project/preview.mjs RECEITA DESTINO REGISTRO_NOVO [PORTA]');
    const {server,info}=await serve(recipe,destination,record,Number(port));
    console.log(JSON.stringify(info));
    const stop=()=>server.close(()=>{fs.writeFileSync(record+'.stopped.json',JSON.stringify({pid:process.pid,stoppedAt:new Date().toISOString(),method:'own-process-signal'})+'\n',{flag:'wx'});process.exit(0);});
    process.once('SIGINT',stop);process.once('SIGTERM',stop);
  }catch(error){console.error(error.message);process.exitCode=1;}
}
