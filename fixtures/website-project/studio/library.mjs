// Local project library: no original filesystem paths or URLs come from the browser.
import fs from 'node:fs';
import path from 'node:path';
import {inflateSync} from 'node:zlib';
import {noLinks,sha256} from '../project.mjs';
export const limits={bytes:2*1024*1024,width:2048,height:2048,items:64,total:64*1024*1024};
const fail=message=>{throw new Error('import: '+message);};
const crc=bytes=>{let c=0xffffffff;for(const byte of bytes){c^=byte;for(let i=0;i<8;i++)c=(c>>>1)^((c&1)?0xedb88320:0);}return (c^0xffffffff)>>>0;};
export function inspectPNG(bytes){
 if(!Buffer.isBuffer(bytes)||bytes.length<45||bytes.length>limits.bytes||!bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))fail('PNG estático até 2 MiB obrigatório.');
 let offset=8,width,height,channels,ended=false,closedData=false;const data=[];
 while(offset<bytes.length){
  if(ended||offset+12>bytes.length)fail('PNG truncado ou com bytes extra.');
  const size=bytes.readUInt32BE(offset),type=bytes.toString('ascii',offset+4,offset+8),end=offset+12+size;
  if(end>bytes.length||crc(bytes.subarray(offset+4,end-4))!==bytes.readUInt32BE(end-4))fail('PNG com tamanho/CRC inválido.');
  const body=bytes.subarray(offset+8,end-4);
  if(type==='IHDR'){
   if(offset!==8||size!==13)fail('Cabeçalho PNG inválido.');
   width=body.readUInt32BE(0);height=body.readUInt32BE(4);channels={0:1,2:3,4:2,6:4}[body[9]];
   if(!width||!height||width>limits.width||height>limits.height||body[8]!==8||!channels||body[10]||body[11]||body[12])fail('PNG: até 2048×2048, 8 bits, sem paleta/interlace.');
  }else if(!width)fail('Cabeçalho PNG ausente.');
  else if(type==='IDAT'){if(closedData)fail('PNG com blocos fora de ordem.');data.push(body);}
  else if(type==='IEND'){if(size||!data.length)fail('Fim de PNG inválido.');ended=true;}
  else {if(!['sRGB','gAMA','cHRM','pHYs','tIME'].includes(type))fail('PNG contém metadata/animação não suportada. Exportar PNG simples.');if(data.length)closedData=true;}
  offset=end;
 }
 if(!ended)fail('PNG incompleto.');
 const stride=1+width*channels,total=stride*height;
 let decoded;try{decoded=inflateSync(Buffer.concat(data),{maxOutputLength:total});}catch{fail('Pixels PNG ilegíveis ou excedem os limites.');}
 if(decoded.length!==total)fail('Pixels PNG incompletos.');
 for(let i=0;i<height;i++)if(decoded[i*stride]>4)fail('Filtro PNG inválido.');
 return {width,height};
}
export function library(root,toolRoot,approved){
 const folder=path.join(root,'library');
 function location(name){
  if(!/^[a-zA-Z0-9_./-]+$/.test(name)||name.split('/').some(p=>!p||p==='.'||p==='..'))fail('Caminho interno inválido.');
  const target=path.resolve(folder,name);if(!target.startsWith(folder+path.sep))fail('Destino fora da biblioteca.');
  noLinks(path.dirname(target));if(fs.existsSync(target))noLinks(target);return target;
 }
 function directory(name){
  let current=folder;for(const part of name.split('/').filter(Boolean)){noLinks(current);current=path.join(current,part);if(!fs.existsSync(current))fs.mkdirSync(current);noLinks(current);if(!fs.statSync(current).isDirectory())fail('Diretório inválido.');}
 }
 noLinks(root);if(!fs.existsSync(folder))fs.mkdirSync(folder);noLinks(folder);if(!fs.statSync(folder).isDirectory())fail('Biblioteca inválida.');
 for(const name of approved){
  directory(path.posix.dirname(name)==='.'?'':path.posix.dirname(name));
  const target=location(name),source=path.join(toolRoot,name);noLinks(source);const bytes=fs.readFileSync(source);
  if(!fs.existsSync(target))fs.writeFileSync(target,bytes,{flag:'wx'});
  if(!fs.readFileSync(target).equals(bytes))fail('Fonte histórica da biblioteca divergiu: '+name);
 }
 directory('imports');directory('catalog');
 function record(id){
  if(!/^[a-f0-9]{64}$/.test(id))fail('Identidade de recurso inválida.');
  const r=JSON.parse(fs.readFileSync(location('catalog/'+id+'.json'),'utf8'));
  if(r.schema!==1||r.sha256!==id||r.path!=='imports/'+id+'.png'||!Number.isInteger(r.bytes)||r.bytes>limits.bytes||r.bytes<45||typeof r.name!=='string')fail('Registo de recurso inválido.');return r;
 }
 function read(name){
  const match=/^imports\/([a-f0-9]{64})\.png$/.exec(name);if(!match)fail('Recurso fora do catálogo.');const r=record(match[1]),file=location(name);
  if(!fs.existsSync(file))fail('Recurso ausente; selecione outro ou importe novamente o original.');
  const bytes=fs.readFileSync(file);if(bytes.length!==r.bytes||sha256(bytes)!==r.sha256)fail('Recurso alterado: digest divergente.');inspectPNG(bytes);return {record:r,bytes};
 }
 function list(){return fs.readdirSync(location('catalog')).filter(n=>/^[a-f0-9]{64}\.json$/.test(n)).sort().map(n=>{const r=record(n.slice(0,-5));let available=true;try{read(r.path);}catch{available=false;}return {...r,available};});}
 function add(name,data){
  if(typeof name!=='string'||!/^[a-zA-Z0-9][a-zA-Z0-9 _().-]{0,99}\.png$/i.test(name)||name.includes('..')||/^(con|prn|aux|nul|com[1-9]|lpt[1-9])\./i.test(name))fail('Escolha um nome PNG simples, sem caminhos ou nomes reservados.');
  if(typeof data!=='string'||data.length>Math.ceil(limits.bytes/3)*4||!data||!/^([A-Za-z0-9+/]{4})*([A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(data))fail('Dados/limite da importação inválidos.');
  const bytes=Buffer.from(data,'base64');if(bytes.toString('base64')!==data)fail('Base64 não canónico.');
  const dimensions=inspectPNG(bytes),id=sha256(bytes),target='imports/'+id+'.png',recordPath=location('catalog/'+id+'.json');
  if(fs.existsSync(recordPath)){
   const saved=record(id),file=location(target);
   if(saved.bytes!==bytes.length)fail('Registo divergente; não sobrescrever.');
   if(!fs.existsSync(file))fs.writeFileSync(file,bytes,{flag:'wx'});
   const existing=read(target);return {...existing.record,existing:true};
  }
  const items=list();if(items.length>=limits.items||items.reduce((n,r)=>n+r.bytes,0)+bytes.length>limits.total)fail('Limite da biblioteca: 64 recursos / 64 MiB.');
  const r={schema:1,path:target,sha256:id,bytes:bytes.length,name,...dimensions,source:'explicit-local-selection',publicationAllowed:false};
  fs.writeFileSync(location(target),bytes,{flag:'wx'});fs.writeFileSync(recordPath,JSON.stringify(r,null,2)+'\n',{flag:'wx'});return {...r,existing:false};
 }
 return {folder,list,read,record,add};
}
