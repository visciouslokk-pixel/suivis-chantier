import {test,beforeEach} from 'node:test';
import assert from 'node:assert/strict';
import {IDBFactory} from 'fake-indexeddb';
import {openStore,write,all,updateProject} from '../store.js';
import {createProject,complete} from '../model.js';
import {RECOVERY_KEY,backupStatus,writeBackupFile,rememberView,readView,metadataSnapshot,recoverMetadata,decodeBackup,resumeBackup,refreshBackupStatus} from '../backup.js';

const memory=new Map();
globalThis.localStorage={getItem:key=>memory.get(key)||null,setItem:(key,value)=>memory.set(key,value)};
globalThis.FileReader=class {readAsDataURL(blob){blob.arrayBuffer().then(bytes=>{this.result=`data:${blob.type||'application/octet-stream'};base64,${Buffer.from(bytes).toString('base64')}`;this.onload();},error=>{this.error=error;this.onerror();});}};
// Real file handles are structured-cloneable in browsers; preserve our test handle as such.
const clone=globalThis.structuredClone;
globalThis.structuredClone=value=>value?.testHandle?value:clone(value);
beforeEach(()=>{globalThis.indexedDB=new IDBFactory();memory.clear();});
async function rawWrite(db,names,fn){const tx=db.transaction(names,'readwrite');const done=new Promise((resolve,reject)=>{tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error);});fn(tx);await done;}
function diskHandle(contents=''){
  return {testHandle:true,name:'test-auto.json',contents,permission:'granted',writes:0,
    async queryPermission(){return this.permission;},async requestPermission(){this.permission='granted';return this.permission;},async getFile(){return new Blob([this.contents]);},
    async createWritable(){const self=this;let draft='';return {async write(data){draft=data;},async close(){self.contents=draft;self.writes++;},async abort(){}};}};
}
test('Les chantiers, notes, coches et pièces jointes reviennent après fermeture et réouverture',async()=>{
  let db=await openStore();const p=createProject({name:'Conservation'});p.tasks[0].note='À ne pas oublier';p.tasks[0].files=['mail'];
  await write(db,[p],[{id:'mail',name:'devis.eml',blob:new Blob(['Message Zimbra'])}]);
  await updateProject(db,p.id,p=>complete(p,'tour'));db.close();
  db=await openStore();const saved=(await all(db,'projects'))[0];
  assert.equal(saved.tasks[0].status,'done');assert.equal(saved.tasks[0].note,'À ne pas oublier');assert.equal(await (await all(db,'files'))[0].blob.text(),'Message Zimbra');
  assert.equal(saved._revision,2);db.close();
});
test('Perdre les magasins principaux restaure automatiquement la copie complète et les pièces jointes',async()=>{
  let db=await openStore();const p=createProject({name:'Récupération'});p.tasks[0].files=['pdf'];
  await write(db,[p],[{id:'pdf',name:'BDC.pdf',blob:new Blob(['Bon de commande'])}]);
  await rawWrite(db,['projects','files'],tx=>{tx.objectStore('projects').clear();tx.objectStore('files').clear();});db.close();
  db=await openStore();assert.equal((await all(db,'projects'))[0].name,p.name);assert.equal(await (await all(db,'files'))[0].blob.text(),'Bon de commande');assert.equal(backupStatus().recovered,true);db.close();
});
test('Perdre toute la base restaure les chantiers du second stockage avec les fichiers manquants signalés',async()=>{
  let db=await openStore();const p=createProject({name:'Secours'});p.tasks[0].files=['pdf'];
  await write(db,[p],[{id:'pdf',name:'BDC.pdf',blob:new Blob(['BDC'])}]);db.close();
  globalThis.indexedDB=new IDBFactory();db=await openStore();
  const recovered=(await all(db,'projects'))[0];assert.equal(recovered.name,'Secours');assert.deepEqual(recovered.tasks[0].files,[]);assert.match(recovered.tasks[0].note,/BDC.pdf/);assert.equal(backupStatus().missingFiles,1);db.close();
});
test('La migration de la base v1 conserve les données existantes',async()=>{
  const db=await new Promise((resolve,reject)=>{const r=indexedDB.open('suivis-chantier-v1',1);r.onupgradeneeded=()=>{r.result.createObjectStore('projects',{keyPath:'id'});r.result.createObjectStore('files',{keyPath:'id'});};r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
  const p=createProject({name:'Ancien chantier'});await rawWrite(db,['projects'],tx=>tx.objectStore('projects').put(p));db.close();
  const upgraded=await openStore();assert.equal(upgraded.version,2);assert.equal((await all(upgraded,'projects'))[0].name,p.name);assert.ok(memory.get(RECOVERY_KEY));upgraded.close();
});
test('Le fichier automatique suit aussi les mutations du Post-it et conserve les pièces jointes',async()=>{
  const db=await openStore();const handle=diskHandle();await rawWrite(db,['settings'],tx=>tx.objectStore('settings').put(handle,'backup-file'));
  const p=createProject({name:'Fichier auto'});p.tasks[0].files=['mail'];
  await write(db,[p],[{id:'mail',name:'mail.eml',blob:new Blob(['Mail'])}]);
  await updateProject(db,p.id,p=>complete(p,'tour'));
  const backup=await decodeBackup(JSON.parse(handle.contents));assert.equal(backup.projects[0].tasks[0].status,'done');assert.equal(await backup.files[0].blob.text(),'Mail');assert.equal(handle.writes,2);assert.equal(backupStatus().file,'saved');db.close();
});
test('Une base vide récupère le fichier sans le remplacer par une sauvegarde vide',async()=>{
  const db=await openStore();const p=createProject({name:'Sur le disque'});const handle=diskHandle(JSON.stringify({version:1,projects:[p],files:[]}));
  await rawWrite(db,['settings'],tx=>tx.objectStore('settings').put(handle,'backup-file'));db.close();
  const reopened=await openStore();assert.equal((await all(reopened,'projects'))[0].name,p.name);assert.equal(JSON.parse(handle.contents).projects[0].id,p.id);assert.equal(backupStatus().recovered,true);reopened.close();
});
test('Un refus de permission ne perd pas les changements et laisse le fichier existant intact',async()=>{
  const db=await openStore();const handle=diskHandle('copie précédente');handle.permission='prompt';await rawWrite(db,['settings'],tx=>tx.objectStore('settings').put(handle,'backup-file'));
  await write(db,[createProject({name:'Toujours enregistré'})]);assert.equal((await all(db,'projects')).length,1);assert.equal(handle.contents,'copie précédente');assert.equal(backupStatus().file,'permission');db.close();
});
test('Après une perte de données, renouveler la permission récupère le fichier avant toute écriture',async()=>{
  let db=await openStore();const p=createProject({name:'Récupérer avant écriture'});const handle=diskHandle(JSON.stringify({version:1,projects:[p],files:[]}));handle.permission='prompt';
  await rawWrite(db,['settings'],tx=>tx.objectStore('settings').put(handle,'backup-file'));db.close();db=await openStore();
  assert.equal(backupStatus().file,'recovery');assert.equal(handle.writes,0);
  await resumeBackup(db);assert.equal((await all(db,'projects'))[0].id,p.id);assert.equal(JSON.parse(handle.contents).projects[0].id,p.id);assert.equal(backupStatus().file,'saved');db.close();
});
test('Une copie interne corrompue ne bloque pas la récupération depuis le second stockage',async()=>{
  let db=await openStore();const p=createProject({name:'Copie indépendante'});await write(db,[p]);
  await rawWrite(db,['projects','settings'],tx=>{tx.objectStore('projects').clear();tx.objectStore('settings').put({version:1,projects:[{name:'corrompu'}],files:[]},'recovery');});db.close();db=await openStore();assert.equal((await all(db,'projects'))[0].id,p.id);db.close();
});
test('Une écriture interrompue annule le flux sans annoncer une sauvegarde réussie',async()=>{
  let aborted=false,closed=false;const handle={async createWritable(){return {async write(){throw new Error('Disque plein');},async close(){closed=true;},async abort(){aborted=true;}};}};
  await assert.rejects(writeBackupFile(handle,{version:1}),/Disque plein/);assert.equal(aborted,true);assert.equal(closed,false);
});
test('Une panne du fichier conserve les chantiers et le message d’échec reste visible après actualisation',async()=>{
  const db=await openStore();const handle=diskHandle();handle.createWritable=async()=>{throw new Error('Disque indisponible');};await rawWrite(db,['settings'],tx=>tx.objectStore('settings').put(handle,'backup-file'));
  await write(db,[createProject({name:'Conservé malgré la panne'})]);assert.equal((await all(db,'projects')).length,1);assert.equal(backupStatus().file,'error');await refreshBackupStatus(db);assert.equal(backupStatus().file,'error');assert.match(backupStatus().warning,/Disque indisponible/);db.close();
});
test('Un conflit entre fenêtres ne remplace ni le chantier récent ni sa copie de secours',async()=>{
  const db=await openStore();const p=createProject({name:'Conflit'});await write(db,[p]);const stale=(await all(db,'projects'))[0];
  await updateProject(db,p.id,p=>{p.tasks[0].note='Note récente';});stale.tasks[0].note='Ancienne note';
  await assert.rejects(write(db,[stale]),/autre fenêtre/);assert.equal(JSON.parse(memory.get(RECOVERY_KEY)).projects[0].tasks[0].note,'Note récente');db.close();
});
test('Une restauration explicitement vide ne ressuscite pas les anciens chantiers',async()=>{
  let db=await openStore();await write(db,[createProject({name:'Ancien'})]);await write(db,[],[],true);db.close();db=await openStore();assert.deepEqual(await all(db,'projects'),[]);db.close();
});
test('Le dernier chantier consulté est mémorisé et les copies invalides sont refusées',()=>{
  rememberView({view:'detail',selected:'abc'});assert.deepEqual(readView(),{view:'detail',selected:'abc'});
  const p=createProject({name:'Valide'});const metadata=metadataSnapshot({version:1,projects:[p],files:[]});assert.equal(recoverMetadata(metadata,[]).projects.length,1);
  metadata.projects[0].tasks[0].deps=['contact'];assert.throws(()=>recoverMetadata(metadata,[]),/circulaires/);
});
