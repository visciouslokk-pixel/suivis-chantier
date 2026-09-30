const bridge=window.chantierDesktop;
const toData=blob=>new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=()=>reject(r.error);r.readAsDataURL(blob);});
const decode=async f=>({...f,blob:await (await fetch(f.data)).blob()});
export async function openStore(){const info=await bridge.open();window.dispatchEvent(new CustomEvent('desktop-info',{detail:info}));return {close(){}};}
export async function all(db,name){const data=await bridge.list(name);return name==='files'?Promise.all(data.map(decode)):data;}
export async function get(db,name,id){return (await all(db,name)).find(x=>x.id===id);}
export async function write(db,projects,files=[],replace=false){
  const packed=await Promise.all(files.map(async f=>({id:f.id,name:f.name,data:f.data||await toData(f.blob)})));
  await bridge.write({projects,files:packed,replace});
}
export async function updateProject(db,id,mutate){const p=await get(db,'projects',id);if(!p)throw new Error('Ce chantier n’est plus disponible.');mutate(p);await write(db,[p]);}
