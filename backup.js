import {validateBackup} from './model.js';

export const RECOVERY_KEY='suivis-chantier-recovery-v1';
const listeners=new Set();
let status={file:'off',name:'',savedAt:'',warning:'',recovered:false,missingFiles:0};
export const backupStatus=()=>({...status});
export function onBackupStatus(fn){listeners.add(fn);return ()=>listeners.delete(fn);}
function report(change){status={...status,...change};listeners.forEach(fn=>fn(backupStatus()));}
const reqResult=req=>new Promise((resolve,reject)=>{req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});
function completed(tx){return new Promise((resolve,reject)=>{tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error||new Error('Stockage interrompu.'));tx.onerror=()=>{};});}
async function setting(db,key){return reqResult(db.transaction('settings').objectStore('settings').get(key));}
async function setSetting(db,key,value){const tx=db.transaction('settings','readwrite');const done=completed(tx);tx.objectStore('settings').put(value,key);await done;}
export async function snapshot(db){
  // Both stores are read in the same transaction: attachments and actions stay consistent.
  const tx=db.transaction(['projects','files']);
  const [projects,files]=await Promise.all([reqResult(tx.objectStore('projects').getAll()),reqResult(tx.objectStore('files').getAll())]);
  return {version:1,exported:new Date().toISOString(),projects,files};
}
const toData=blob=>new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=()=>reject(r.error);r.readAsDataURL(blob);});
export async function exportSnapshot(data){return {...data,files:await Promise.all(data.files.map(async f=>({id:f.id,name:f.name,data:await toData(f.blob)})))};}
export async function decodeBackup(data){
  validateBackup(data);
  return {...data,files:await Promise.all(data.files.map(async f=>({id:f.id,name:f.name,blob:await (await fetch(f.data)).blob()})))};
}
export function metadataSnapshot(data){return {...data,files:data.files.map(f=>({id:f.id,name:f.name,data:'data:application/octet-stream;base64,'}))};}
export function recoverMetadata(data,files){
  validateBackup(data);
  const projects=structuredClone(data.projects);const present=new Set(files.map(f=>f.id));let missingFiles=0;
  for(const p of projects)for(const t of p.tasks){
    const missing=t.files.filter(id=>!present.has(id));
    if(missing.length){
      missingFiles+=missing.length;
      t.note+="\nPièces jointes à récupérer depuis la sauvegarde complète : "+missing.map(id=>data.files.find(f=>f.id===id).name).join(', ');
      t.files=t.files.filter(id=>present.has(id));
    }
  }
  return {projects,files,missingFiles};
}
async function restoreSnapshot(db,data){
  const tx=db.transaction(['projects','files'],'readwrite');const done=completed(tx);
  data.projects.forEach(p=>tx.objectStore('projects').put(p));data.files.forEach(f=>tx.objectStore('files').put(f));await done;
}
// The same lock is shared by the app and Post-it, including separate browser windows.
let queue=Promise.resolve();
function exclusive(fn){
  const run=()=>globalThis.navigator?.locks? navigator.locks.request('suivis-chantier-backup',fn):fn();
  const next=queue.then(run,run);queue=next.catch(()=>{});return next;
}
export async function writeBackupFile(handle,data){
  const stream=await handle.createWritable();
  try{await stream.write(JSON.stringify(data));await stream.close();}
  catch(error){await stream.abort().catch(()=>{});throw error;}
}
async function saveUnlocked(db){
  const data=await snapshot(db);
  let warning='';
  try{await setSetting(db,'recovery',data);}catch{warning='La copie de secours interne n’a pas pu être mise à jour.';}
  try{localStorage.setItem(RECOVERY_KEY,JSON.stringify(metadataSnapshot(data)));}
  catch{warning='La copie de secours des chantiers est indisponible. Active le fichier de sauvegarde automatique.';}
  const handle=await setting(db,'backup-file');
  report({warning});
  if(!handle){report({file:'off',name:''});return;}
  if(await setting(db,'backup-needs-recovery')){report({file:'recovery',name:handle.name});return;}
  try{
    if(await handle.queryPermission({mode:'readwrite'})!=='granted'){report({file:'permission',name:handle.name});return;}
    report({file:'saving',name:handle.name});
    await writeBackupFile(handle,await exportSnapshot(data));
    const savedAt=data.exported;await setSetting(db,'backup-date',savedAt);await setSetting(db,'backup-error','');
    report({file:'saved',savedAt});
  }catch(error){const message=`Le fichier de sauvegarde n’a pas été actualisé : ${error.message}`;await setSetting(db,'backup-error',message).catch(()=>{});report({file:'error',name:handle.name,warning:message});}
}
export function saveAutomatic(db){return exclusive(()=>saveUnlocked(db)).catch(error=>report({warning:`Copie de secours indisponible : ${error.message}`}));}
export async function refreshBackupStatus(db){
  const handle=await setting(db,'backup-file');if(!handle)return;
  const savedAt=await setting(db,'backup-date');const needsRecovery=await setting(db,'backup-needs-recovery');const error=await setting(db,'backup-error');
  report({name:handle.name,savedAt:savedAt||'',warning:error||status.warning,file:needsRecovery?'recovery':await handle.queryPermission({mode:'readwrite'})!=='granted'?'permission':error?'error':'saved'});
}
export async function initializeBackup(db){
  return exclusive(async()=>{
    report({file:'off',name:'',savedAt:'',warning:'',recovered:false,missingFiles:0});
    const handle=await setting(db,'backup-file');const savedAt=await setting(db,'backup-date');
    if(handle)report({name:handle.name,savedAt:savedAt||'',file:await handle.queryPermission({mode:'readwrite'})==='granted'?'saved':'permission'});
    let data=await snapshot(db),diskChecked=false;
    if(!data.projects.length){
      // A complete disk backup is preferred; never overwrite it with an empty database at startup.
      if(handle&&await handle.queryPermission({mode:'read'})==='granted'){
        try{const disk=await decodeBackup(JSON.parse(await (await handle.getFile()).text()));diskChecked=true;if(disk.projects.length){await restoreSnapshot(db,disk);report({recovered:true});}}
        catch(error){report({warning:`Lecture de la sauvegarde impossible : ${error.message}`});}
      }
      data=await snapshot(db);
      if(!data.projects.length){
        const recovery=await setting(db,'recovery');
        if(recovery?.projects?.length){try{validateBackup(metadataSnapshot(recovery));await restoreSnapshot(db,recovery);report({recovered:true});}catch(error){report({warning:`La copie interne est illisible : ${error.message}`});}}
        if(!(await snapshot(db)).projects.length){
          try{
            const raw=localStorage.getItem(RECOVERY_KEY);
            if(raw){const restored=recoverMetadata(JSON.parse(raw),data.files);if(restored.projects.length){await restoreSnapshot(db,restored);report({recovered:true,missingFiles:restored.missingFiles});}}
          }catch(error){report({warning:`La copie de secours est illisible : ${error.message}`});}
        }
      }
    }
    data=await snapshot(db);
    if(handle&&((!data.projects.length&&!diskChecked)||status.missingFiles))await setSetting(db,'backup-needs-recovery',true);
    if(handle&&await setting(db,'backup-needs-recovery'))report({file:'recovery'});
    if(data.projects.length)await saveUnlocked(db);
    try{await navigator.storage?.persist?.();}catch{}
  });
}
const pickerOptions={id:'suivis-chantier-backup',types:[{description:'Sauvegarde Suivis chantier',accept:{'application/json':['.json']}}]};
export async function chooseBackupFile(db){
  // Call the picker before any await: browser user activation is required.
  const handle=await window.showSaveFilePicker({...pickerOptions,suggestedName:'suivis-chantier-auto.json'});
  return exclusive(async()=>{
    // Selecting an existing nonempty file must never silently destroy its contents.
    const file=await handle.getFile();
    if(file.size&&!confirm('Ce fichier existe déjà. Remplacer son contenu par les chantiers actuels ? Pour récupérer ses chantiers, utilise « Reconnecter une sauvegarde ».'))return false;
    if(await handle.requestPermission({mode:'readwrite'})!=='granted')throw new Error('Autorise l’écriture dans le fichier pour activer la sauvegarde automatique.');
    await setSetting(db,'backup-file',handle);await setSetting(db,'backup-needs-recovery',false);await saveUnlocked(db);return true;
  });
}
export async function reconnectBackupFile(db){
  const [handle]=await window.showOpenFilePicker(pickerOptions);
  const permission=await handle.requestPermission({mode:'readwrite'});
  const data=await decodeBackup(JSON.parse(await (await handle.getFile()).text()));
  const current=await snapshot(db);
  if(current.projects.length&&!confirm(`Restaurer les ${data.projects.length} chantier(s) du fichier ? Cela remplacera les chantiers actuels.`))return false;
  return exclusive(async()=>{
    const tx=db.transaction(['projects','files','settings'],'readwrite');const done=completed(tx);
    tx.objectStore('projects').clear();tx.objectStore('files').clear();
    data.projects.forEach(p=>tx.objectStore('projects').put({...p,_revision:(p._revision||0)+1}));data.files.forEach(f=>tx.objectStore('files').put(f));
    tx.objectStore('settings').put(handle,'backup-file');await done;
    await setSetting(db,'backup-needs-recovery',false);
    await saveUnlocked(db);report({recovered:true});
    if(permission!=='granted')report({file:'permission'});return true;
  });
}
export async function resumeBackup(db){
  const handle=await setting(db,'backup-file');if(!handle)return;
  if(await handle.requestPermission({mode:'readwrite'})!=='granted')throw new Error('L’autorisation d’écriture est nécessaire pour reprendre la sauvegarde.');
  await exclusive(async()=>{
    if(await setting(db,'backup-needs-recovery')){
      const disk=await decodeBackup(JSON.parse(await (await handle.getFile()).text()));
      const current=await snapshot(db);
      if(current.projects.length&&!confirm('Récupérer les chantiers et pièces jointes du fichier complet ? Cela remplacera les chantiers actuels.'))return;
      const tx=db.transaction(['projects','files'],'readwrite');const done=completed(tx);
      tx.objectStore('projects').clear();tx.objectStore('files').clear();
      disk.projects.forEach(p=>tx.objectStore('projects').put({...p,_revision:(p._revision||0)+1}));disk.files.forEach(f=>tx.objectStore('files').put(f));await done;
      await setSetting(db,'backup-needs-recovery',false);report({recovered:true,missingFiles:0});
    }
    await saveUnlocked(db);
  });
}
export function rememberView(state){try{localStorage.setItem('suivis-chantier-view',JSON.stringify(state));}catch{}}
export function readView(){try{return JSON.parse(localStorage.getItem('suivis-chantier-view')||'null');}catch{return null;}}
