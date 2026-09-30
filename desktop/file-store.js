import {open,readFile,writeFile,rename,copyFile,mkdir,unlink} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import {validateBackup} from '../model.js';

const revision=p=>Number.isSafeInteger(p?._revision)?p._revision:0;
export async function atomicJSON(path,value){
  const temp=path+'.'+randomUUID()+'.tmp';let handle;
  try{handle=await open(temp,'wx');await handle.writeFile(JSON.stringify(value),'utf8');await handle.sync();await handle.close();handle=null;await rename(temp,path);}
  catch(error){await handle?.close().catch(()=>{});await unlink(temp).catch(()=>{});throw error;}
}
async function readJSON(path){return JSON.parse(await readFile(path,'utf8'));}
export class FileStore{
  constructor(folder){this.folder=resolve(folder);this.file=join(this.folder,'suivis-chantier.json');this.previous=join(this.folder,'suivis-chantier.precedent.json');this.lock=join(this.folder,'.suivis-chantier.lock');this.queue=Promise.resolve();this.state=null;this.ownsLock=false;this.recovered=false;}
  async initialize({existing=false}={}){
    if(existing){try{await readFile(this.file);}catch(error){if(error.code==='ENOENT'){try{await readFile(this.previous);}catch{throw new Error('Le dossier configuré ou ses fichiers ne sont plus disponibles : '+this.folder+'. Rebranche le disque ou remets le dossier à son emplacement.');}}}}
    await mkdir(this.folder,{recursive:true});
    try{await this.acquireLock();
      let missing=false;
      try{this.state=validateBackup(await readJSON(this.file));}
      catch(error){
        missing=error.code==='ENOENT';
        try{this.state=validateBackup(await readJSON(this.previous));this.recovered=true;
          if(!missing)await copyFile(this.file,this.file+'.corrompu-'+Date.now());
          await atomicJSON(this.file,this.state);
        }catch(recoveryError){
          if(missing&&recoveryError.code==='ENOENT'&&!existing){this.state={version:1,exported:new Date().toISOString(),projects:[],files:[],view:{view:'today',selected:null}};await atomicJSON(this.file,this.state);}
          else throw new Error('Impossible de lire les chantiers dans ce dossier. Les fichiers existants sont conservés. Choisis leur sauvegarde JSON pour les récupérer. '+error.message);
        }
      }
      return this.info();
    }catch(error){await this.releaseLock();throw error;}
  }
  async acquireLock(){
    try{await writeFile(this.lock,JSON.stringify({pid:process.pid}),{flag:'wx'});this.ownsLock=true;}
    catch(error){
      if(error.code!=='EEXIST')throw error;
      let owner;try{owner=JSON.parse(await readFile(this.lock,'utf8'));}catch{throw new Error('Le dossier est verrouillé. Ferme les autres copies de Suivis chantier.');}
      if(Number.isSafeInteger(owner.pid)){try{process.kill(owner.pid,0);throw new Error('Ce dossier est déjà ouvert dans une autre copie de Suivis chantier.');}catch(check){if(check.code!=='ESRCH')throw check;}}
      else throw new Error('Verrou de dossier invalide. Les données sont conservées.');
      await unlink(this.lock);await writeFile(this.lock,JSON.stringify({pid:process.pid}),{flag:'wx'});this.ownsLock=true;
    }
  }
  run(fn){const next=this.queue.then(fn);this.queue=next.catch(()=>{});return next;}
  info(){return {folder:this.folder,file:this.file,savedAt:this.state?.exported||'',recovered:this.recovered,view:this.state?.view||{view:'today',selected:null}};}
  async snapshot(){await this.queue;return structuredClone(this.state);}
  async list(name){if(!['projects','files'].includes(name))throw new Error('Type de données inconnu.');return (await this.snapshot())[name];}
  async commit(next){
    validateBackup(next);next.exported=new Date().toISOString();
    // A failed primary write leaves the in-memory state and the previous readable file intact.
    await atomicJSON(this.previous,this.state);await atomicJSON(this.file,next);this.state=next;return this.info();
  }
  async write(projects,files=[],replace=false){return this.run(async()=>{
    const next=structuredClone(this.state);
    if(replace){next.projects=projects.map(p=>({...p,_revision:Math.max(revision(p),revision(this.state.projects.find(x=>x.id===p.id)))+1}));next.files=files;}
    else{
      for(const p of projects){const index=next.projects.findIndex(x=>x.id===p.id);const current=next.projects[index];
        if(revision(current)!==revision(p))throw new Error('Ce chantier vient de changer dans une autre fenêtre. Réessaie pour conserver ces changements.');
        const updated={...p,_revision:revision(p)+1};if(index<0)next.projects.push(updated);else next.projects[index]=updated;
      }
      for(const f of files){const index=next.files.findIndex(x=>x.id===f.id);if(index<0)next.files.push(f);else next.files[index]=f;}
    }
    return this.commit(next);
  });}
  async setView(view){return this.run(async()=>{
    if(!['today','projects','detail'].includes(view?.view))throw new Error('Vue invalide.');
    if(JSON.stringify(this.state.view)===JSON.stringify(view))return this.info();
    const next={...this.state,view};
    // Navigation is durable too, but must not replace the last backup of the actual chantier edit.
    await atomicJSON(this.file,next);this.state=next;return this.info();
  });}
  async releaseLock(){if(this.ownsLock){this.ownsLock=false;await unlink(this.lock).catch(()=>{});}}
  async close(){await this.queue;await this.releaseLock();}
}
