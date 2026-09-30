const {app,BrowserWindow,dialog,ipcMain,protocol,session,shell,Menu}=require('electron');
const path=require('node:path');const fs=require('node:fs/promises');const {pathToFileURL}=require('node:url');
const PORTABLE=path.dirname(process.execPath);const CONFIG=path.join(PORTABLE,'suivis-chantier-dossier.json');
const ROOT=path.join(__dirname,'..','ui');const ORIGIN='chantier://app/';
app.setName('Suivis chantier');app.setPath('userData',path.join(PORTABLE,'profil-local'));
protocol.registerSchemesAsPrivileged([{scheme:'chantier',privileges:{standard:true,secure:true,supportFetchAPI:true,corsEnabled:true}}]);
let main,postit,store,FileStore,atomicJSON,opening,quitting=false;
if(!app.requestSingleInstanceLock())app.quit();
else{
app.on('second-instance',()=>{if(main){if(main.isMinimized())main.restore();main.show();main.focus();}else if(app.isReady())createMain();});
function trusted(event){const url=new URL(event.senderFrame.url);if(url.protocol!=='chantier:'||url.host!=='app')throw new Error('Fenêtre non autorisée.');}
function notify(){if(store)for(const win of BrowserWindow.getAllWindows())win.webContents.send('chantier:changed',store.info());}
function bind(name,fn){ipcMain.handle('chantier:'+name,async(event,...args)=>{trusted(event);try{return await fn(...args);}catch(error){throw new Error(error.message||'Impossible d’enregistrer sur disque.');}});}
async function openFolder(folder,existing=false){
  const candidate=new FileStore(folder);await candidate.initialize({existing});
  try{await atomicJSON(CONFIG,{version:1,folder:candidate.folder});}catch(error){await candidate.close();throw new Error('Le dossier de l’application doit être accessible en écriture pour mémoriser ton choix. Déplace toute la version portable dans tes Documents. '+error.message);}
  store=candidate;notify();return store.info();
}
async function selectFolder(){
  const result=await dialog.showOpenDialog(main,{title:'Choisis le dossier de sauvegarde automatique de tes chantiers',buttonLabel:'Utiliser ce dossier',properties:['openDirectory','createDirectory']});
  if(result.canceled)throw new Error('Choisis un dossier pour démarrer. Aucun chantier ne sera conservé dans le navigateur.');
  return openFolder(result.filePaths[0]);
}
async function ensureStore(){
  if(store)return store.info();if(opening)return opening;
  opening=(async()=>{let config;try{config=JSON.parse(await fs.readFile(CONFIG,'utf8'));}catch(error){if(error.code!=='ENOENT')throw new Error('La configuration de dossier est illisible. Le fichier '+CONFIG+' est conservé.');}
    if(config){if(config.version!==1||typeof config.folder!=='string'||!path.isAbsolute(config.folder))throw new Error('Configuration de dossier invalide.');return openFolder(config.folder,true);}
    return selectFolder();})();
  try{return await opening;}finally{opening=null;}
}
const webPreferences={preload:path.join(__dirname,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true};
const external=url=>{try{const u=new URL(url);return u.protocol==='https:'&&['apv.grandlyon.fr','gima.grandlyon.fr'].includes(u.hostname);}catch{return false;}};
function secureWindow(win){
  win.webContents.setWindowOpenHandler(({url})=>{if(external(url))shell.openExternal(url);return {action:'deny'};});
  win.webContents.on('will-navigate',(event,url)=>{if(!url.startsWith(ORIGIN)){event.preventDefault();if(external(url))shell.openExternal(url);}});
}
function createMain(){main=new BrowserWindow({width:1250,height:850,minWidth:800,minHeight:600,title:'Suivis chantier — Portable',icon:path.join(ROOT,'icons','icon-192.png'),show:true,webPreferences});secureWindow(main);main.on('closed',()=>{main=null;});main.webContents.on('did-fail-load',(_,code,message)=>dialog.showErrorBox('Ouverture impossible',message+' ('+code+')'));main.loadURL(ORIGIN+'index.html');}
function openPostit(){if(postit){postit.show();postit.focus();return 'existing';}postit=new BrowserWindow({width:405,height:590,minWidth:320,minHeight:350,title:'Post-it — Suivis chantier',alwaysOnTop:true,autoHideMenuBar:true,webPreferences});secureWindow(postit);postit.on('closed',()=>{postit=null;});postit.loadURL(ORIGIN+'postit.html');return 'pinned';}
app.whenReady().then(async()=>{
  ({FileStore,atomicJSON}=await import(pathToFileURL(path.join(__dirname,'file-store.js')).href));
  protocol.handle('chantier',async request=>{
    const url=new URL(request.url);const filename=decodeURIComponent(url.pathname.slice(1)||'index.html');
    const allowed=new Set(['index.html','style.css','app.js','action-ui.js','model.js','store.js','backup.js','postit.html','postit.js','postit-model.js','postit.css','icons/icon-192.png','icons/icon-512.png']);
    if(url.hostname!=='app'||request.method!=='GET'||!allowed.has(filename))return new Response('Introuvable',{status:404});
    const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.png':'image/png'};
    return new Response(await fs.readFile(path.join(ROOT,filename)),{headers:{'Content-Type':mime[path.extname(filename)],'Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self' data:; object-src 'none'; base-uri 'none'; form-action 'none'"}});
  });
  session.defaultSession.setPermissionRequestHandler((_,__,callback)=>callback(false));
  session.defaultSession.on('will-download',(_,item)=>{item.setSaveDialogOptions({title:'Enregistrer le document ou la sauvegarde',defaultPath:path.join(app.getPath('documents'),path.basename(item.getFilename()))});});
  bind('open',ensureStore);bind('status',async()=>store?store.info():{folder:'',file:'',savedAt:'',view:null});
  bind('folder',async()=>{if(store)throw new Error('Ton dossier est déjà configuré. Ferme l’application avant de modifier le fichier de configuration.');return ensureStore();});
  bind('list',async name=>{await ensureStore();return store.list(name);});bind('snapshot',async()=>{await ensureStore();return store.snapshot();});
  bind('write',async payload=>{await ensureStore();if(!payload||!Array.isArray(payload.projects)||!Array.isArray(payload.files)||typeof payload.replace!=='boolean')throw new Error('Enregistrement invalide.');const info=await store.write(payload.projects,payload.files,payload.replace);notify();return info;});
  bind('view',async view=>{if(!store)return;return store.setView(view);});
  bind('show-folder',async()=>{await ensureStore();const error=await shell.openPath(store.folder);if(error)throw new Error(error);});
  bind('postit',openPostit);bind('main',()=>{if(!main)createMain();main.show();main.focus();});
  Menu.setApplicationMenu(Menu.buildFromTemplate([{label:'Suivis chantier',submenu:[{label:'Ouvrir le Post-it',click:openPostit},{label:'Ouvrir le dossier des chantiers',click:async()=>{if(store)await shell.openPath(store.folder);}},{type:'separator'},{label:'Quitter',click:()=>app.quit()}]},{label:'Édition',submenu:[{role:'undo',label:'Annuler'},{role:'redo',label:'Rétablir'},{type:'separator'},{role:'cut',label:'Couper'},{role:'copy',label:'Copier'},{role:'paste',label:'Coller'},{role:'selectAll',label:'Tout sélectionner'}]},{label:'Affichage',submenu:[{role:'resetZoom',label:'Taille normale'},{role:'zoomIn',label:'Agrandir'},{role:'zoomOut',label:'Réduire'}]}]));
  createMain();
}).catch(error=>{dialog.showErrorBox('Suivis chantier',error.message);app.quit();});
app.on('window-all-closed',()=>app.quit());
app.on('before-quit',event=>{if(quitting)return;event.preventDefault();quitting=true;(async()=>{await store?.close();app.exit();})().catch(error=>{quitting=false;dialog.showErrorBox('Enregistrement interrompu',error.message);});});
}
