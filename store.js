import {initializeBackup,saveAutomatic} from './backup.js';
const request = req => new Promise((resolve,reject)=>{req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});
const revision=p=>Number.isSafeInteger(p?._revision)?p._revision:0;
export async function openStore() {
  const req=indexedDB.open('suivis-chantier-v1',2);
  req.onupgradeneeded=()=>{for(const name of ['projects','files'])if(!req.result.objectStoreNames.contains(name))req.result.createObjectStore(name,{keyPath:'id'});if(!req.result.objectStoreNames.contains('settings'))req.result.createObjectStore('settings');};
  req.onblocked=()=>{globalThis.dispatchEvent?.(new CustomEvent('storage-blocked'));};
  const db=await request(req);
  db.onversionchange=()=>db.close();
  await initializeBackup(db);return db;
}
export async function all(db,store) {return request(db.transaction(store).objectStore(store).getAll());}
export async function get(db,store,id) {return request(db.transaction(store).objectStore(store).get(id));}
// Read and mutate in one transaction so a floating window never overwrites a newer task.
export function updateProject(db,id,mutate) {
  return new Promise((resolve,reject)=>{
    const tx=db.transaction('projects','readwrite');
    const store=tx.objectStore('projects');const req=store.get(id);let error;
    tx.oncomplete=()=>saveAutomatic(db).then(resolve);tx.onabort=()=>reject(error||tx.error||new Error('Enregistrement interrompu.'));tx.onerror=()=>{};
    req.onsuccess=()=>{try{if(!req.result)throw new Error('Ce chantier n’est plus disponible.');mutate(req.result);req.result._revision=revision(req.result)+1;store.put(req.result);}catch(e){error=e;tx.abort();}};
  });
}
export function write(db,projects,files=[],replace=false) {
  return new Promise((resolve,reject)=>{
    const tx=db.transaction(['projects','files'],'readwrite');let conflict;
    tx.oncomplete=()=>saveAutomatic(db).then(resolve);tx.onabort=()=>reject(conflict||tx.error||new Error('Enregistrement interrompu'));tx.onerror=()=>reject(tx.error);
    if(replace){tx.objectStore('projects').clear();tx.objectStore('files').clear();}
    projects.forEach(p=>{
      const store=tx.objectStore('projects');
      if(replace){store.put({...p,_revision:revision(p)+1});return;}
      const req=store.get(p.id);
      req.onsuccess=()=>{
        if(revision(req.result)!==revision(p)){
          conflict=new Error('Ce chantier vient de changer dans une autre fenêtre. Réessaie pour conserver ces changements.');tx.abort();return;
        }
        store.put({...p,_revision:revision(p)+1});
      };
    });
    files.forEach(f=>tx.objectStore('files').put(f));
  });
}
