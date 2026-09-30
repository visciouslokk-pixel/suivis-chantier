import {createProject,uid,today,finished,available,actionable,closed,complete,reopen,validateBackup,actionTemplates,addAction,moveAction,requiresAppointmentDate} from './model.js';
import {openStore,all,get,write} from './store.js';
import {openPostit} from './postit.js';
import {portalLink,timelineTask,addActionForm} from './action-ui.js';
import {backupStatus,onBackupStatus,chooseBackupFile,reconnectBackupFile,resumeBackup,rememberView,readView,snapshot,exportSnapshot,refreshBackupStatus} from './backup.js';
const updates=typeof BroadcastChannel!=='undefined'?new BroadcastChannel('suivis-chantier-updates'):null;

const $=s=>document.querySelector(s);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const date=d=>d?new Date(d+'T12:00:00').toLocaleDateString('fr-FR',{day:'numeric',month:'short',year:'numeric'}):'';
const icon=(name)=>({home:'▦',folder:'▱',plus:'+',arrow:'›',check:'✓',clock:'◷',file:'↗',back:'‹'}[name]||name);
let db,projects=[],view='today',selected=null,search='',installEvent,activeFilter='all',busy=false;
const dialog=$('#dialog');
let returnFocus;
function toast(text){if(dialog.open){let message=dialog.querySelector('.dialog-message');if(!message){message=document.createElement('p');message.className='dialog-message';message.setAttribute('role','status');dialog.append(message);}message.textContent=text;message.scrollIntoView({block:'nearest'});}$('#toast').textContent=text;$('#toast').classList.add('show');clearTimeout(toast.timer);toast.timer=setTimeout(()=>$('#toast').classList.remove('show'),5000);}
function modal(title,body){returnFocus=document.activeElement;dialog.innerHTML=`<div class="dialog-title"><h2>${title}</h2><button class="icon-button" data-close aria-label="Fermer">×</button></div>${body}`;dialog.showModal();}
dialog.addEventListener('close',()=>returnFocus?.focus());
function badge(t){return t.status==='waiting'?`<span class="badge amber">${t.date<=today()?'À relancer':'En attente'}</span>`:t.date&&t.date<today()?'<span class="badge red">Échéance dépassée</span>':'<span class="badge green">À faire</span>';}
function taskCard(p,t){return `<button class="task-card" data-task="${esc(t.id)}" data-project="${p.id}"><span class="task-mark">${icon(t.status==='waiting'?'clock':'check')}</span><span class="task-copy"><small>${esc(p.name)}${p.site?' · '+esc(p.site):''}</small><strong>${esc(t.title)}</strong><span>${t.status==='waiting'?esc(t.waitingFor):esc(p.company)||'Entreprise à préciser'}${t.date?' · '+(t.status==='waiting'?'Relance le ':'')+date(t.date):''}</span></span>${badge(t)}<span class="chevron">›</span></button>`;}
function projectCard(p){const next=actionable(p)[0];const count=p.tasks.filter(finished).length;return `<button class="project-card" data-open="${p.id}"><div class="project-top"><span class="project-icon">▱</span><span class="badge ${closed(p)?'green':''}">${closed(p)?'Terminé':'En cours'}</span></div><h3>${esc(p.name)}</h3><p>${esc(p.site)||'Site non précisé'}</p><div class="next-label">PROCHAINE ACTION</div><strong>${next?esc(next.title):'Toutes les actions sont terminées'}</strong><div class="progress" aria-label="${count} actions sur ${p.tasks.length} terminées"><i style="width:${count/p.tasks.length*100}%"></i></div><footer>${count} / ${p.tasks.length} actions <span>${esc(p.company)||'Entreprise à préciser'}</span></footer></button>`;}
function empty(title,text,action=true){return `<div class="empty"><span class="empty-icon">✓</span><h2>${title}</h2><p>${text}</p>${action?'<button class="primary" data-new>+ Créer mon premier chantier</button>':''}</div>`;}
function storageText(){const s=backupStatus();return s.file==='saved'?(s.savedAt?`Fichier auto · ${new Date(s.savedAt).toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'})}`:'Fichier automatique activé'):s.file==='saving'?'Sauvegarde du fichier en cours…':s.file==='recovery'?'Fichier complet à récupérer':s.file==='permission'?'Fichier auto : autorisation à renouveler':s.file==='error'?'Fichier auto : sauvegarde à reprendre':'Enregistrement automatique local';}
function backupNotice(){
 const s=backupStatus();
 if(s.file==='recovery')return '<span>Ton fichier est protégé. Autorise son accès pour récupérer la sauvegarde complète.</span><button data-resume-backup>Récupérer mes chantiers</button>';
 if(s.warning)return `<span>${esc(s.warning)}</span><button data-backup>Vérifier la sauvegarde</button>`;
 if(s.file==='permission'||s.file==='error')return '<span>Les chantiers sont enregistrés ici. La copie dans le fichier attend ton autorisation.</span><button data-resume-backup>Reprendre la sauvegarde</button>';
 if(s.file==='off')return `<span>Protège aussi tes chantiers avec un fichier mis à jour automatiquement.</span><button ${'showSaveFilePicker'in window?'data-auto-backup':'data-backup'}>Activer la sauvegarde auto</button>`;
 return '';
}
function updateStorageStatus(){
 const label=$('#storage-status');if(label)label.textContent=storageText();
 const notice=$('#backup-notice');if(notice){notice.innerHTML=backupNotice();notice.hidden=!notice.innerHTML;}
 const detail=$('#backup-detail');if(detail)detail.textContent=backupDescription();
}
function backupDescription(){const s=backupStatus();return s.name?`${s.name} — ${s.file==='saved'?(s.savedAt?'dernière copie : '+new Date(s.savedAt).toLocaleString('fr-FR'):'fichier automatique activé'):s.file==='saving'?'écriture en cours':s.file==='recovery'?'sauvegarde complète à récupérer':s.file==='permission'?'autorisation à renouveler':'copie à reprendre'}`:'Aucun fichier automatique configuré.';}
onBackupStatus(updateStorageStatus);
function render(){
 rememberView({view,selected});
 const workflowOpen=$('#workflow')?.dataset.project===selected&&$('#workflow').open;
 const open=projects.filter(p=>!closed(p));
 const tasks=open.flatMap(p=>actionable(p).map(t=>({p,t})));
 const waiting=tasks.filter(({t})=>t.status==='waiting');
 const due=waiting.filter(({t})=>t.date<=today());
 const upcoming=waiting.filter(({t})=>t.date>today());
 const ready=tasks.filter(({t})=>t.status!=='waiting').sort((a,b)=>(a.t.date||'9999').localeCompare(b.t.date||'9999'));
 let body='';
 if(view==='today'){
  body=`<div class="page-head"><div><div class="eyebrow">${new Date().toLocaleDateString('fr-FR',{weekday:'long',day:'numeric',month:'long'})}</div><h1>Une chose à la fois.</h1><p>Les prochaines actions de tes chantiers, au même endroit.</p></div><button class="primary" data-new>+ Nouveau chantier</button></div><div class="stats"><div><strong>${open.length}</strong><span>chantiers en cours</span></div><div><strong>${ready.length}</strong><span>actions disponibles</span></div><div><strong>${due.length}</strong><span>relances à faire</span></div></div>`;
  if(due.length)body+=`<section><div class="section-head"><h2>À relancer aujourd’hui <span>${due.length}</span></h2></div>${due.sort((a,b)=>a.t.date.localeCompare(b.t.date)).map(({p,t})=>taskCard(p,t)).join('')}</section>`;
  if(!projects.length)body+=empty('Ton premier chantier commence ici.','Donne-lui un nom. Ton déroulé BDC est déjà prêt.');
  else {
   body+=`<section><div class="section-head"><h2>Pour avancer aujourd’hui <span>${ready.length}</span></h2><span class="muted">${Math.min(3,ready.length)} actions mises en avant</span></div>${ready.length?ready.slice(0,3).map(({p,t})=>taskCard(p,t)).join(''):'<p class="muted">Aucune autre action disponible pour le moment.</p>'}${ready.length>3?`<details><summary>Voir les ${ready.length-3} autres actions disponibles</summary>${ready.slice(3).map(({p,t})=>taskCard(p,t)).join('')}</details>`:''}</section>`;
   if(upcoming.length)body+=`<section><div class="section-head"><h2>Ne pas perdre le fil <span>${upcoming.length}</span></h2><span class="muted">Réponses et relances</span></div>${upcoming.sort((a,b)=>a.t.date.localeCompare(b.t.date)).map(({p,t})=>taskCard(p,t)).join('')}</section>`;
  }
 }else if(view==='projects'){
  const list=projects.filter(p=>(activeFilter==='all'||(activeFilter==='closed'?closed(p):!closed(p)))&&`${p.name} ${p.site} ${p.company}`.toLowerCase().includes(search.toLowerCase()));
  body=`<div class="page-head"><div><div class="eyebrow">UNE VUE D’ENSEMBLE</div><h1>Mes chantiers</h1><p>Chaque chantier garde son rythme. Rien ne se perd.</p></div><button class="primary" data-new>+ Nouveau chantier</button></div><div class="list-tools"><div class="tabs">${[['all','Tous'],['open','En cours'],['closed','Terminés']].map(([key,label])=>`<button class="${activeFilter===key?'active':''}" data-filter="${key}">${label}</button>`).join('')}</div><input id="search" aria-label="Rechercher un chantier" placeholder="Rechercher un chantier…" value="${esc(search)}"></div><div class="project-grid">${list.map(projectCard).join('')}</div>${!list.length?empty('Aucun chantier ici.',search?'Essaie un autre terme de recherche.':'Crée un chantier pour retrouver son suivi ici.',!projects.length):''}`;
 }else{
  const p=projects.find(p=>p.id===selected);if(!p){view='projects';render();return;}
  const availableTasks=actionable(p);const done=p.tasks.filter(finished).length;
  body=`<button class="text-button" data-nav="projects">‹ Tous les chantiers</button><div class="page-head"><div><div class="eyebrow">MARCHÉ À BONS DE COMMANDE</div><h1>${esc(p.name)}</h1><p>${esc(p.site)||'Site à préciser'} <span class="sep">/</span> ${esc(p.company)||'Entreprise à préciser'}</p></div><button data-edit="${p.id}">Modifier les informations</button></div><div class="detail-layout"><div><section><div class="section-head"><h2>${closed(p)?'Chantier terminé':'Les actions en cours'}</h2><button class="text-button" data-add="${p.id}">+ Une action</button></div>${availableTasks.map(t=>taskCard(p,t)).join('')}${closed(p)?empty('Tout est terminé.','Le déroulé, les documents et l’historique restent disponibles.',false):''}</section><details id="workflow" data-project="${p.id}" class="panel" ${!availableTasks.length?'open':''}><summary>Le déroulé du chantier <span>${done} / ${p.tasks.length}</span></summary><p class="hint">Utilise ↑ et ↓ pour déplacer les actions. Les conditions des étapes liées restent conservées.</p><ol class="timeline">${p.tasks.map((t,i)=>timelineTask(p,t,i)).join('')}</ol></details><details class="panel"><summary>Historique <span>${p.history.length}</span></summary><ul class="history">${p.history.map(h=>`<li><small>${new Date(h.at).toLocaleString('fr-FR')}</small><div>${esc(h.text)}</div></li>`).join('')||'<li>Aucun événement pour le moment.</li>'}</ul></details></div><aside><div class="panel documents"><h2>Documents & mails</h2><p>Les pièces jointes de toutes les étapes du chantier.</p><div id="project-files">Chargement…</div><button class="full" data-document="${p.id}">+ Rattacher un document</button></div><div class="tip"><strong>Garde l’esprit libre.</strong><p>Une action mise en attente revient à sa date de relance. Les actions secondaires restent visibles jusqu’à leur réalisation.</p></div></aside></div>`;
 }
 $('#app').innerHTML=`<aside class="sidebar"><a class="brand" href="#" data-nav="today"><span class="brand-mark">s<span>c</span></span><span>suivis<br><b>chantier</b></span></a><div class="nav-label">MON ESPACE</div><nav><button class="${view==='today'?'current':''}" data-nav="today"><span>▦</span> À faire ${due.length?`<b>${due.length}</b>`:''}</button><button class="${view!=='today'?'current':''}" data-nav="projects"><span>▱</span> Mes chantiers <b>${open.length}</b></button></nav><div class="sidebar-bottom"><button data-postit title="Afficher les actions dans une petite fenêtre">▣ Post-it de bureau</button><button data-backup>↥ Sauvegarde & installation</button><div class="local-status"><span class="status-dot"></span> Sauvegarde automatique<small id="storage-status">${esc(storageText())}</small></div></div></aside><div class="workspace"><header class="topbar"><span>Mon carnet de chantier</span><div><span id="network">${navigator.onLine?'Disponible hors connexion':'Hors connexion'}</span><span class="avatar">MOI</span></div></header><main><div id="backup-notice" class="backup-notice" ${!backupNotice()?'hidden':''}>${backupNotice()}</div>${body}</main><footer class="page-footer">Suivis chantier <span>Une action après l’autre.</span></footer></div>`;
 if(workflowOpen&&$('#workflow'))$('#workflow').open=true;
 if(view==='detail')renderProjectFiles();
}
async function renderProjectFiles(){const p=projects.find(x=>x.id===selected);const target=$('#project-files');if(!target||!p)return;const files=await all(db,'files');target.innerHTML=p.tasks.flatMap(t=>t.files.map(id=>{const f=files.find(f=>f.id===id);return f?`<button class="file-row" data-file="${id}"><span>↧</span><span>${esc(f.name)}<small>${esc(t.title)}</small></span></button>`:'';})).join('')||'<div class="no-files">Aucune pièce jointe pour le moment.</div>';}
function newProject(){modal('Nouveau chantier',`<p>Le déroulé BDC est ajouté automatiquement.</p><form id="new-form"><label>Nom du chantier<input name="name" required maxlength="140" placeholder="Ex. Remplacement de la porte d’entrée" autofocus></label><label>Site / bâtiment<input name="site" maxlength="180" placeholder="Ex. Bâtiment A"></label><label>Entreprise <small>facultatif</small><input name="company" maxlength="140"></label><label class="checkbox"><input name="occupied" type="checkbox"> Le site est occupé</label><p class="hint">Si le site est occupé, une vérification des disponibilités sera ajoutée avant le rendez-vous.</p><button class="primary full">Créer le chantier</button></form>`);}
async function taskModal(pid,tid){const p=projects.find(p=>p.id===pid);const t=p.tasks.find(t=>t.id===tid);const files=await all(db,'files');const active=available(p,t);modal(esc(t.title),`<p>${esc(p.name)} · ${finished(t)?'Action terminée':active?'Action disponible':'En attente des étapes précédentes'}</p><form id="task-form" data-pid="${pid}" data-tid="${tid}">${portalLink(t)}<label>${requiresAppointmentDate(t)?'Date du rendez-vous':t.status==='waiting'?'Date de relance':'Échéance / date de relance'}<input type="date" name="date" value="${esc(t.date)}"></label><label>Notes / contenu d’un mail<textarea name="note" rows="4" placeholder="Décision, référence GIMA, numéro de BDC, contenu du mail Zimbra…">${esc(t.note)}</textarea></label><label>Retour attendu de<input name="waitingFor" value="${esc(t.waitingFor)}" placeholder="Ex. Entreprise — confirmation du rendez-vous"></label><label class="upload">+ Joindre un mail, PDF, bon de commande ou photo<input type="file" name="files" multiple><small>Mails enregistrés en .eml, .msg ou .txt · 20 Mo maximum par fichier</small></label><div>${t.files.map(id=>{const f=files.find(x=>x.id===id);return f?`<button type="button" class="file-row" data-file="${id}">↧ ${esc(f.name)}</button>`:'';}).join('')}</div><div class="form-actions"><button name="action" value="save">Enregistrer</button>${active?`<button name="action" value="wait">Mettre en attente</button><button class="primary" name="action" value="done">✓ Terminer</button>`:t.status==='done'?'<button name="action" value="reopen">Rouvrir l’action</button>':''}${t.status==='waiting'&&active?'<button name="action" value="resume">Reprendre</button>':''}</div><p class="hint">Les relances apparaissent dans l’application. Aucun mail n’est envoyé automatiquement.</p></form>`);}
function backupModal(){modal('Sauvegarde & installation',`<div class="settings-block"><h3>Sauvegarde automatique</h3><p>Chaque modification validée est enregistrée immédiatement, dans l’application et sa copie de secours. Tes chantiers reviennent à l’ouverture, avec le dernier chantier consulté.</p><p>Choisis une fois un fichier sur ton PC : il sera ensuite actualisé automatiquement, avec les mails et pièces jointes, même depuis le Post-it.</p><p id="backup-detail">${esc(backupDescription())}</p>${'showSaveFilePicker'in window?'<button class="primary" data-auto-backup>Choisir le fichier de sauvegarde auto</button><button data-reconnect-backup>Reconnecter une sauvegarde</button>':'<p>Ouvre l’application dans Edge ou Chrome pour activer la sauvegarde dans un fichier.</p>'}${backupStatus().name?'<button data-resume-backup>Autoriser / reprendre la sauvegarde</button>':''}<p class="hint">Le navigateur peut redemander l’autorisation d’accès au fichier. Si ses données sont effacées, reconnecte ce fichier pour retrouver tes chantiers. Aucune donnée de chantier n’est envoyée à GitHub.</p></div><div class="settings-block"><h3>Copie supplémentaire / ancien fichier</h3><button data-export>Exporter une sauvegarde complète</button><label class="upload">Restaurer une sauvegarde<input id="import-file" type="file" accept="application/json,.json"></label><p class="hint">La restauration remplace les données présentes après confirmation. Les copies restent sur ton PC, sans synchronisation entre appareils.</p></div><div class="settings-block"><h3>Installer sur mon PC</h3><p>Dans Edge ou Chrome, ouvre le menu du navigateur puis choisis l’installation de cette application. Elle s’ouvrira dans sa propre fenêtre.</p>${installEvent?'<button class="primary" data-install>Installer Suivis chantier</button>':''}<p class="hint">Après une première ouverture en ligne, l’application peut fonctionner sans connexion.</p></div><div class="settings-block"><h3>Mes mails Zimbra</h3><p>Enregistre le mail depuis Zimbra, puis joins son fichier à l’action concernée. Tu peux aussi copier son contenu dans les notes. Cette version ne se connecte pas directement à ta messagerie.</p></div>`);}
async function persist(p,files=[]){await write(db,[p],files);projects=await all(db,'projects');updates?.postMessage({type:'changed'});render();}
function download(blob,name){const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);}
document.addEventListener('click',async event=>{
 const b=event.target.closest('button,a');if(!b||busy)return;
 try{
 if(b.hasAttribute('data-close'))dialog.close();
 if(b.dataset.nav){event.preventDefault();view=b.dataset.nav;render();window.scrollTo(0,0);}
 if(b.hasAttribute('data-new'))newProject();
 if(b.dataset.open){selected=b.dataset.open;view='detail';render();window.scrollTo(0,0);}
 if(b.dataset.task)await taskModal(b.dataset.project,b.dataset.task);
 if(b.dataset.filter){activeFilter=b.dataset.filter;render();}
 if(b.dataset.move){
   const p=structuredClone(projects.find(p=>p.id===b.dataset.project));const scroll=window.scrollY;busy=true;
   if(moveAction(p,b.dataset.moveId,Number(b.dataset.move))){await persist(p);window.scrollTo(0,scroll);const controls=[...document.querySelectorAll('[data-move-id]')].filter(el=>el.dataset.moveId===b.dataset.moveId&&!el.disabled);(controls.find(el=>el.dataset.move===b.dataset.move)||controls[0])?.focus({preventScroll:true});toast('Action déplacée.');}
 }
 if(b.dataset.add)modal('Ajouter une action',addActionForm(projects.find(p=>p.id===b.dataset.add)));
 if(b.dataset.edit){const p=projects.find(x=>x.id===b.dataset.edit);modal('Informations du chantier',`<form id="edit-form" data-pid="${p.id}"><label>Nom<input name="name" required value="${esc(p.name)}" maxlength="140"></label><label>Site<input name="site" value="${esc(p.site)}" maxlength="180"></label><label>Entreprise<input name="company" value="${esc(p.company)}" maxlength="140"></label><button class="primary full">Enregistrer</button></form>`);}
 if(b.dataset.document){const p=projects.find(x=>x.id===b.dataset.document);modal('Rattacher un document',`<form id="document-form" data-pid="${p.id}"><label>À quelle action ?<select name="task">${p.tasks.map(t=>`<option value="${t.id}">${esc(t.title)}</option>`).join('')}</select></label><label class="upload">Choisir les documents<input type="file" name="files" multiple required></label><p class="hint">20 Mo maximum par fichier.</p><button class="primary full">Rattacher</button></form>`);}
 if(b.hasAttribute('data-postit')||b.hasAttribute('data-postit-simple')){
   const simple=b.hasAttribute('data-postit-simple');
   try{const mode=await openPostit({simple,onOpen:()=>{window.focus();if(dialog.open)dialog.close();view='today';render();}});if(simple&&dialog.open)dialog.close();toast(mode==='pinned'?'Post-it ouvert au premier plan.':mode==='simple'?'Post-it ouvert dans une fenêtre classique.':'Le Post-it est déjà ouvert.');}
   catch(error){modal('Ouvrir le Post-it',`<p>La fenêtre au premier plan n’a pas pu s’ouvrir.</p><p>${esc(error.message)}</p><button class="primary full" data-postit-simple>Ouvrir une fenêtre classique</button>`);}
 }
 if(b.hasAttribute('data-backup'))backupModal();
 if(b.hasAttribute('data-auto-backup')){busy=true;if(await chooseBackupFile(db)){toast(backupStatus().file==='saved'?'Sauvegarde automatique activée.':backupStatus().warning||'Le fichier attend une autorisation.');}}
 if(b.hasAttribute('data-reconnect-backup')){busy=true;if(await reconnectBackupFile(db)){projects=await all(db,'projects');updates?.postMessage({type:'changed'});view='projects';dialog.close();render();toast('Chantiers récupérés. Sauvegarde automatique reconnectée.');}}
 if(b.hasAttribute('data-resume-backup')){busy=true;await resumeBackup(db);projects=await all(db,'projects');updates?.postMessage({type:'changed'});render();toast(backupStatus().file==='saved'?'Chantiers disponibles. Sauvegarde automatique à jour.':backupStatus().warning||'Sauvegarde à autoriser.');}
 if(b.hasAttribute('data-install')&&installEvent){await installEvent.prompt();installEvent=null;}
 if(b.dataset.file){const f=await get(db,'files',b.dataset.file);if(!f)throw new Error('Fichier introuvable.');download(f.blob,f.name);}
 if(b.hasAttribute('data-export')){busy=true;toast('Préparation de la sauvegarde…');const data=await exportSnapshot(await snapshot(db));download(new Blob([JSON.stringify(data)],{type:'application/json'}),`suivis-chantier-${today()}.json`);toast('Sauvegarde téléchargée.');}
 }catch(e){if(e.name!=='AbortError')toast(e.message||'Une erreur est survenue.');}finally{busy=false;}
});
document.addEventListener('input',e=>{if(e.target.id==='search'){search=e.target.value;const cursor=e.target.selectionStart;render();$('#search').focus();$('#search').setSelectionRange(cursor,cursor);}});
async function filesFrom(form){const files=[...form.querySelector('[name="files"]').files];if(files.some(f=>f.size>20*1024*1024))throw new Error('Chaque fichier doit faire moins de 20 Mo.');return files.map(f=>({id:uid(),name:f.name,blob:f}));}
document.addEventListener('submit',async e=>{
 e.preventDefault();if(busy)return;const form=e.target;const data=new FormData(form);busy=true;const buttons=[...form.querySelectorAll('button')];buttons.forEach(b=>b.disabled=true);
 try{
 let p;
 if(form.id==='new-form'){if(!data.get('name').trim())throw new Error('Donne un nom au chantier.');p=createProject({name:data.get('name').trim(),site:data.get('site').trim(),company:data.get('company').trim(),occupied:data.has('occupied')});await persist(p);selected=p.id;view='detail';render();}
 else if(form.id==='edit-form'){p=structuredClone(projects.find(x=>x.id===form.dataset.pid));if(!data.get('name').trim())throw new Error('Donne un nom au chantier.');['name','site','company'].forEach(k=>p[k]=data.get(k).trim());await persist(p);}
 else if(form.id==='add-form'){p=structuredClone(projects.find(x=>x.id===form.dataset.pid));addAction(p,{kind:data.get('kind'),title:data.get('title'),date:data.get('date'),beforeId:data.get('beforeId')});await persist(p);if($('#workflow'))$('#workflow').open=true;}
 else if(form.id==='task-form'||form.id==='document-form'){
  p=structuredClone(projects.find(x=>x.id===form.dataset.pid));const t=p.tasks.find(t=>t.id===(form.dataset.tid||data.get('task')));const files=await filesFrom(form);
  if(form.id==='task-form'){
   t.date=data.get('date');t.note=data.get('note');t.waitingFor=data.get('waitingFor');
   const action=e.submitter?.value||'save';
   if(['wait','done','resume'].includes(action)&&!available(p,t))throw new Error('Cette action a changé dans une autre fenêtre. Ferme puis rouvre sa fiche.');
   if(action==='wait'){if(!t.date||!t.waitingFor.trim())throw new Error('Précise le retour attendu et la date de relance.');t.status='waiting';p.history.unshift({at:new Date().toISOString(),text:`En attente : ${t.title} — ${t.waitingFor}, relance le ${date(t.date)}`});}
   if(action==='done')complete(p,t.id);
   if(action==='reopen')reopen(p,t.id);
   if(action==='resume'){t.status='todo';t.waitingFor='';}
   if(t.status==='waiting'&&(!t.date||!t.waitingFor.trim()))throw new Error('Une attente doit conserver une date de relance et un destinataire.');
  }
  t.files.push(...files.map(f=>f.id));if(files.length)p.history.unshift({at:new Date().toISOString(),text:`${files.length} pièce(s) jointe(s) ajoutée(s) : ${t.title}`});await persist(p,files);
 }
 dialog.close();toast(backupStatus().file==='saved'?'Enregistré et sauvegardé automatiquement.':'Enregistré automatiquement dans l’application.');
 }catch(error){toast(error.message||'Impossible d’enregistrer. Vérifie l’espace disponible.');buttons.forEach(b=>b.disabled=false);}finally{busy=false;}
});
document.addEventListener('change',async e=>{
 if(e.target.id==='action-kind'){
   const form=e.target.form;const template=actionTemplates.find(t=>t.kind===e.target.value);form.elements.title.value=template?.title||'';
   $('#action-date-label').textContent=requiresAppointmentDate({kind:e.target.value,title:''})?'Date du rendez-vous (facultatif à l’ajout)':'Échéance (facultatif)';return;
 }
 if(e.target.id!=='import-file'||!e.target.files[0]||busy)return;
 try{
 const backup=validateBackup(JSON.parse(await e.target.files[0].text()));
 if(!confirm(`Restaurer ${backup.projects.length} chantier(s) ? Les données actuelles seront remplacées. Exporte-les d’abord si tu veux les conserver.`)){e.target.value='';return;}
 busy=true;const files=await Promise.all(backup.files.map(async f=>({id:f.id,name:f.name,blob:await (await fetch(f.data)).blob()})));
 await write(db,backup.projects,files,true);updates?.postMessage({type:'changed'});projects=await all(db,'projects');view='projects';dialog.close();render();toast('Sauvegarde restaurée.');
 }catch(error){toast(`Restauration impossible : ${error.message}`);}finally{busy=false;}
});
async function refreshFromOtherWindow(){
 if(!db)return;
 try{await refreshBackupStatus(db);const latest=await all(db,'projects');if(JSON.stringify(latest)!==JSON.stringify(projects)){projects=latest;render();}}
 catch{toast('Impossible d’actualiser les actions du Post-it.');}
}
if(updates)updates.onmessage=refreshFromOtherWindow;
window.addEventListener('focus',refreshFromOtherWindow);
window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();installEvent=e;});
for(const name of ['online','offline'])window.addEventListener(name,()=>{const el=$('#network');if(el)el.textContent=navigator.onLine?'Disponible hors connexion':'Hors connexion';});
window.addEventListener('storage-blocked',()=>toast('Ferme les autres fenêtres de Suivis chantier et le Post-it pour terminer la mise à jour du stockage.'));
try{db=await openStore();projects=await all(db,'projects');const previous=readView();if(previous&&['today','projects','detail'].includes(previous.view)){view=previous.view;selected=previous.selected;}if(!projects.length)view='today';else if(backupStatus().recovered)view='projects';render();if(backupStatus().recovered)toast(backupStatus().missingFiles?`Chantiers récupérés. ${backupStatus().missingFiles} pièce(s) jointe(s) à récupérer depuis le fichier complet.`:'Tes chantiers ont été récupérés automatiquement.');if('serviceWorker'in navigator)navigator.serviceWorker.register('./sw.js').catch(()=>toast('Le mode hors connexion n’a pas pu être activé.'));}catch(error){$('#app').innerHTML=`<div class="empty"><h1>Impossible d’ouvrir le stockage local</h1><p>${esc(error.message)}</p><p>Vérifie que le navigateur autorise le stockage pour cette application, puis recharge la page.</p></div>`;}
