const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('chantierDesktop',{
  open:()=>ipcRenderer.invoke('chantier:open'),
  list:name=>ipcRenderer.invoke('chantier:list',name),
  snapshot:()=>ipcRenderer.invoke('chantier:snapshot'),
  write:payload=>ipcRenderer.invoke('chantier:write',payload),
  setView:view=>ipcRenderer.invoke('chantier:view',view),
  status:()=>ipcRenderer.invoke('chantier:status'),
  chooseFolder:()=>ipcRenderer.invoke('chantier:folder'),
  showFolder:()=>ipcRenderer.invoke('chantier:show-folder'),
  openPostit:()=>ipcRenderer.invoke('chantier:postit'),
  openMain:()=>ipcRenderer.invoke('chantier:main'),
  onChanged:callback=>{const listener=(_,data)=>callback(data);ipcRenderer.on('chantier:changed',listener);return ()=>ipcRenderer.removeListener('chantier:changed',listener);}
});
