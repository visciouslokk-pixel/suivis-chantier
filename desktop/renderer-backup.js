const bridge=window.chantierDesktop;
let info={folder:'',file:'',savedAt:'',view:null,recovered:false},warning='';const listeners=new Set();
function report(data){info=data;warning='';listeners.forEach(fn=>fn(backupStatus()));}
window.addEventListener('desktop-info',e=>report(e.detail));
bridge.onChanged(data=>{report(data);window.dispatchEvent(new Event('focus'));});
export const backupStatus=()=>({file:info.file?'saved':'off',name:info.file,savedAt:info.savedAt,recovered:info.recovered,missingFiles:0,warning});
export function onBackupStatus(fn){listeners.add(fn);return ()=>listeners.delete(fn);}
export async function refreshBackupStatus(){report(await bridge.status());}
export async function snapshot(){return bridge.snapshot();}
export const exportSnapshot=data=>data;
export function rememberView(view){bridge.setView(view).then(report).catch(error=>{warning=error.message;listeners.forEach(fn=>fn(backupStatus()));});}
export const readView=()=>info.view;
export async function resumeBackup(){await refreshBackupStatus();}
export const chooseBackupFile=resumeBackup;
export const reconnectBackupFile=resumeBackup;
await refreshBackupStatus().catch(()=>{});
