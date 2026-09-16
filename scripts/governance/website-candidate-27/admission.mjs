// Versioned proposal: exact measurement source, never a release/merge decision.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
export const hash=b=>createHash('sha256').update(b).digest('hex');
const pinned=JSON.parse(fs.readFileSync(new URL('./contract.json',import.meta.url)));
assert.equal(hash(JSON.stringify(pinned)),'aa25746798e09a851e451f4b9a45c97fb30956082d3301ca46e979228939d4f4','CONTRACT_PIN_MISMATCH');
export const contract=()=>structuredClone(pinned);
export const git=(repo,...args)=>execFileSync('git',['-c','core.quotePath=true','-C',repo,...args],{encoding:null,maxBuffer:128*1024*1024,windowsHide:true});
const text=b=>new TextDecoder('utf-8',{fatal:true}).decode(b);
export function blob(repo,sha,entry){
  assert.match(sha??'',/^[0-9a-f]{40}$/,'AUTHORITY_SHA');
  const tuple=git(repo,'ls-tree','-z',sha,'--',entry.file);
  assert.deepEqual(tuple,Buffer.from(`100644 blob ${entry.blob}\t${entry.file}\0`),'CANONICAL_REGULAR_BLOB');
  const bytes=git(repo,'cat-file','blob',entry.blob);
  assert.equal(bytes.length,entry.bytes,'BLOB_SIZE');assert.equal(hash(bytes),entry.sha256,'BLOB_DIGEST');return bytes;
}
export function validateChanges(entries){assert.deepEqual(entries,pinned.candidateChanges,'closed candidate paths, modes and blobs differ');}
export function verifyCandidate(repo,{base,head}={}){
  assert.equal(base,pinned.base,'candidate base mismatch');assert.equal(head,pinned.candidate,'candidate SHA mismatch');
  assert.equal(text(git(repo,'rev-parse',`${head}^{tree}`)).trim(),pinned.candidateTree,'candidate tree mismatch');
  assert.equal(text(git(repo,'rev-parse',`${head}^`)).trim(),base,'candidate parent mismatch');
  // NUL-delimited raw diff includes modes, types and both identities. No rename inference.
  const fields=git(repo,'diff','--raw','--full-index','--no-abbrev','--no-renames','-z',base,head).toString('ascii').split('\0');
  const raw=git(repo,'diff','--raw','--full-index','--no-abbrev','--no-renames','-z',base,head);
  assert.deepEqual(Buffer.from(fields.join('\0'),'ascii'),raw,'non-ASCII candidate path');
  assert.equal(fields.pop(),'');assert.equal(fields.length,pinned.candidateChanges.length*2,'closed candidate cardinality');
  const entries=[];
  for(let i=0;i<fields.length;i+=2){
    const m=/^:(100644|000000) 100644 ([0-9a-f]{40}) ([0-9a-f]{40}) ([AM])$/.exec(fields[i]);assert.ok(m,'candidate mode/type/status mismatch');
    const e=pinned.candidateChanges.find(e=>e.file===fields[i+1]);assert.ok(e,'candidate path outside closed set');assert.equal(m[3],e.blob,'candidate blob mismatch');
    blob(repo,head,e);entries.push(e);
  }
  validateChanges(entries);
  for(const e of pinned.authorities)blob(repo,e.source,e);
  return {status:'MEASUREMENT_SOURCE_ADMITTED',count:entries.length,base,head,tree:pinned.candidateTree,ready:false,productionAuthorized:false};
}
