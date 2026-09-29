const request = req => new Promise((resolve,reject)=>{req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});
export async function openStore() {
  const req=indexedDB.open('suivis-chantier-v1',1);
  req.onupgradeneeded=()=>{req.result.createObjectStore('projects',{keyPath:'id'});req.result.createObjectStore('files',{keyPath:'id'});};
  return request(req);
}
export async function all(db,store) {return request(db.transaction(store).objectStore(store).getAll());}
export async function get(db,store,id) {return request(db.transaction(store).objectStore(store).get(id));}
export function write(db,projects,files=[],replace=false) {
  return new Promise((resolve,reject)=>{
    const tx=db.transaction(['projects','files'],'readwrite');
    tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error||new Error('Enregistrement interrompu'));tx.onerror=()=>reject(tx.error);
    if(replace){tx.objectStore('projects').clear();tx.objectStore('files').clear();}
    projects.forEach(p=>tx.objectStore('projects').put(p));files.forEach(f=>tx.objectStore('files').put(f));
  });
}
