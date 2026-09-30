import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';

test('Installer une nouvelle version recharge les fichiers sans reprendre une ancienne réponse HTTP en cache',async()=>{
  const handlers={};let requests,install;
  const context={URL,Request,self:{location:{href:'https://example.test/suivis-chantier/sw.js'},addEventListener:(name,fn)=>{handlers[name]=fn;}},caches:{open:async()=>({addAll:async entries=>{requests=entries;}})}};
  runInNewContext(await readFile(new URL('../sw.js',import.meta.url),'utf8'),context);
  handlers.install({waitUntil:promise=>{install=promise;}});await install;
  assert.ok(requests.some(r=>r.url.endsWith('/backup.js')));
  assert.ok(requests.every(r=>r.cache==='reload'));
});
