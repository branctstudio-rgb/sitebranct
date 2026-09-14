// Offline envelope generator only. No API, dispatch, repository or file mutation.
import fs from 'node:fs';import assert from 'node:assert/strict';
const pins=JSON.parse(fs.readFileSync(new URL('./source-package.json',import.meta.url)));
const [wrapper,id]=process.argv.slice(2);
assert.match(wrapper||'',/^[0-9a-f]{40}$/);assert.match(id||'',/^WEBSITE-WEBKIT-21-\d{8}-\d{2}$/);
console.log(JSON.stringify({status:'PROPOSTO_NAO_AUTORIZADO',workflow:'website-webkit-diagnostic-21.yml',ref:'main',inputs:{wrapper_sha:wrapper,authorization_id:id,authorization:`AUTHORIZE ${id} ${wrapper} ${pins.sourceHead} ${pins.packageDigest}`},application:pins.sourceHead,packageDigest:pins.packageDigest,tasks:['responsive-webkit'],maxAttempts:1},null,2));
