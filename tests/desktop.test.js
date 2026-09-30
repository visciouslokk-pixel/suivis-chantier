import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rm,readdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {FileStore,atomicJSON} from '../desktop/file-store.js';
import {createProject,complete,validateBackup} from '../model.js';

async function fixture(fn){const folder=await mkdtemp(join(tmpdir(),'suivis-chantier-test-'));try{await fn(folder);}finally{await rm(folder,{recursive:true,force:true});}}
test('Version portable : import ancien JSON, notes, documents et état conservés après fermeture réelle du stockage',()=>fixture(async folder=>{
  let db=new FileStore(folder);await db.initialize();const p=createProject({name:'Chantier importé',site:'Site A'});p.tasks[0].files=['mail'];p.tasks[0].note='Contenu de mail';complete(p,'tour');
  const legacy={version:1,projects:[p],files:[{id:'mail',name:'mail.eml',data:'data:text/plain;base64,TWVzc2FnZQ=='}]};validateBackup(legacy);await db.write(legacy.projects,legacy.files,true);await db.setView({view:'detail',selected:p.id});await db.close();
  db=new FileStore(folder);await db.initialize({existing:true});const reopened=await db.snapshot();assert.equal(reopened.projects[0].tasks[0].status,'done');assert.equal(reopened.projects[0].tasks[0].note,p.tasks[0].note);assert.deepEqual(reopened.files,legacy.files);assert.deepEqual(reopened.view,{view:'detail',selected:p.id});await db.close();
}));
test('Version portable : chaque modification écrit le fichier et conserve la version précédente',()=>fixture(async folder=>{
  const db=new FileStore(folder);await db.initialize();const p=createProject({name:'Avant'});await db.write([p]);const newer=(await db.list('projects'))[0];newer.name='Après';await db.write([newer]);
  assert.equal(JSON.parse(await readFile(db.file,'utf8')).projects[0].name,'Après');assert.equal(JSON.parse(await readFile(db.previous,'utf8')).projects[0].name,'Avant');await db.close();
}));
test('Version portable : une écriture en échec ne modifie pas le chantier en mémoire ni son fichier valide',()=>fixture(async folder=>{
  const db=new FileStore(folder);await db.initialize();const p=createProject({name:'À conserver'});await db.write([p]);const saved=await db.snapshot();const original=db.file;db.file=join(folder,'absent','chantiers.json');const update=(await db.list('projects'))[0];update.name='Écriture en échec';
  await assert.rejects(db.write([update]));assert.deepEqual(await db.snapshot(),saved);assert.equal(JSON.parse(await readFile(original,'utf8')).projects[0].name,'À conserver');await db.close();
}));
test('Version portable : le fichier corrompu est conservé et la copie précédente récupérée',()=>fixture(async folder=>{
  let db=new FileStore(folder);await db.initialize();const p=createProject({name:'Secours valide'});await db.write([p]);const update=(await db.list('projects'))[0];update.name='Plus récent';await db.write([update]);await db.close();await writeFile(db.file,'{ fichier interrompu');
  db=new FileStore(folder);await db.initialize({existing:true});assert.equal((await db.list('projects'))[0].name,p.name);assert.equal(db.info().recovered,true);assert.ok((await readdir(folder)).some(name=>name.includes('.corrompu-')));await db.close();
}));
test('Version portable : un dossier absent ne recrée pas silencieusement une base vide',()=>fixture(async folder=>{
  const db=new FileStore(join(folder,'dossier-disparu'));await assert.rejects(db.initialize({existing:true}),/plus disponibles/);assert.deepEqual(await readdir(folder),[]);
}));
test('Version portable : un import invalide ne remplace pas les chantiers présents',()=>fixture(async folder=>{
  const db=new FileStore(folder);await db.initialize();const p=createProject({name:'Chantier conservé'});await db.write([p]);const invalid=structuredClone(p);invalid.tasks[0].files=['document-absent'];await assert.rejects(db.write([invalid],[],true),/invalide/);assert.equal((await db.list('projects'))[0].id,p.id);await db.close();
}));
test('Version portable : une autre fenêtre ne peut pas écraser une révision plus récente',()=>fixture(async folder=>{
  const db=new FileStore(folder);await db.initialize();await db.write([createProject({name:'Plusieurs fenêtres'})]);const stale=(await db.list('projects'))[0];const recent=structuredClone(stale);recent.tasks[0].note='Note récente';await db.write([recent]);stale.tasks[0].note='Ancienne';await assert.rejects(db.write([stale]),/autre fenêtre/);assert.equal((await db.list('projects'))[0].tasks[0].note,'Note récente');await db.close();
}));
test('Version portable : deux copies ne peuvent pas ouvrir le même dossier simultanément',()=>fixture(async folder=>{
  const first=new FileStore(folder);await first.initialize();const second=new FileStore(folder);await assert.rejects(second.initialize(),/autre copie/);await first.close();await second.initialize({existing:true});await second.close();
}));
test('Version portable : les fichiers corrompus sans secours sont conservés et l’ouverture refusée',()=>fixture(async folder=>{
  const file=join(folder,'suivis-chantier.json');await writeFile(file,'données invalides');const db=new FileStore(folder);await assert.rejects(db.initialize(),/Impossible de lire/);assert.equal(await readFile(file,'utf8'),'données invalides');assert.equal((await readdir(folder)).includes('.suivis-chantier.lock'),false);
}));
test('Version portable : une écriture atomique remplace un JSON complet sans laisser de fichier temporaire',()=>fixture(async folder=>{
  const file=join(folder,'test.json');await atomicJSON(file,{avant:true});await atomicJSON(file,{après:true});assert.deepEqual(JSON.parse(await readFile(file,'utf8')),{après:true});assert.deepEqual(await readdir(folder),['test.json']);
}));
