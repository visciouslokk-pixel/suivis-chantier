import {today} from './model.js';
import {openStore,all,updateProject} from './store.js';
import {postitGroups,finishPostitAction,undoPostitAction} from './postit-model.js';

const escape=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const displayDate=d=>d?new Date(d+'T12:00:00').toLocaleDateString('fr-FR',{day:'numeric',month:'short'}):'';
let floatingWindow;

export async function openPostit({simple=false,onOpen}={}) {
  if(floatingWindow&&!floatingWindow.closed){floatingWindow.focus();return 'existing';}
  if(!simple&&'documentPictureInPicture'in window){
    // requestWindow must be the first asynchronous operation: it requires the click's activation.
    const win=await window.documentPictureInPicture.requestWindow({width:390,height:540});
    floatingWindow=win;
    const doc=win.document;doc.documentElement.lang='fr';doc.title='Post-it — Suivis chantier';
    const style=doc.createElement('link');style.rel='stylesheet';style.href=new URL('./postit.css',import.meta.url).href;doc.head.append(style);
    await mountPostit(doc,{pinned:true,onOpen});
    return 'pinned';
  }else{
    floatingWindow=window.open(new URL('./postit.html',import.meta.url).href,'suivis-chantier-postit','popup,width=390,height=540,resizable=yes,scrollbars=yes');
    if(!floatingWindow)throw new Error('Autorise l’ouverture de la fenêtre Post-it dans ton navigateur, puis réessaie.');
    return 'simple';
  }
}

export async function mountPostit(doc,{pinned=false,onOpen}={}) {
  const win=doc.defaultView;
  doc.body.innerHTML=`<header><div><span class="postit-eyebrow">SUIVIS CHANTIER</span><h1>Mon Post-it</h1></div><span class="pin" aria-label="${pinned?'Toujours au premier plan':'Fenêtre classique'}">${pinned?'Épinglé':'Post-it'}</span></header><p class="intro">Une case cochée. Une étape de moins.</p><main id="postit-list" aria-label="Actions en cours">Chargement des chantiers…</main><div id="postit-feedback" role="status" aria-live="polite"></div><footer><button id="open-app">Ouvrir l’application</button><p>${pinned?'Garde Suivis chantier ouvert, même réduit.':'Fenêtre classique : elle peut passer derrière les autres. Pour l’épingler, ouvre le Post-it depuis l’application dans un navigateur compatible.'}</p></footer>`;
  let db;
  try{db=await openStore();}catch{doc.querySelector('#postit-list').textContent='Le stockage local est indisponible. Ouvre l’application dans ton navigateur habituel.';return;}
  const channel=typeof BroadcastChannel!=='undefined'?new BroadcastChannel('suivis-chantier-updates'):null;
  let lastSnapshot='',lastDay='',pending=false,dateEntry=null,undo=null,disposed=false,refreshNumber=0;
  const list=doc.querySelector('#postit-list');
  const feedback=doc.querySelector('#postit-feedback');
  function message(text,error=false){feedback.innerHTML=`<p class="${error?'error':'saved'}">${escape(text)}</p>${undo?'<button id="undo">Annuler la dernière coche</button>':''}`;}
  async function refresh(force=false){
    if(disposed)return;
    const requestNumber=++refreshNumber;
    const projects=await all(db,'projects');
    if(disposed||requestNumber!==refreshNumber)return;
    const snapshot=JSON.stringify(projects);const day=today();
    if(!force&&snapshot===lastSnapshot&&day===lastDay)return;
    // Keep an appointment date being typed when another window refreshes the list.
    const draft=doc.querySelector('#postit-date')?.value;
    if(dateEntry&&draft!==undefined)dateEntry.date=draft;
    const scroll=doc.scrollingElement.scrollTop;
    lastSnapshot=snapshot;lastDay=day;
    const groups=postitGroups(projects,day);
    list.innerHTML=groups.map(p=>`<section class="project"><h2>${escape(p.name)}</h2>${p.site?`<p class="site">${escape(p.site)}</p>`:''}<ul>${p.tasks.map(t=>{
      const waiting=t.status==='waiting';const overdue=t.date&&t.date<=day;
      const caption=waiting?`${overdue?'À relancer':'En attente'}${t.date?' · '+displayDate(t.date):''}${t.waitingFor?' — '+t.waitingFor:''}`:t.date?`Échéance : ${displayDate(t.date)}`:'';
      const choosing=dateEntry?.pid===p.id&&dateEntry?.tid===t.id;
      return `<li><label class="task"><input type="checkbox" data-pid="${escape(p.id)}" data-tid="${escape(t.id)}" aria-label="Terminer : ${escape(t.title)} — ${escape(p.name)}" ${pending?'disabled':''}><span><strong>${escape(t.title)}</strong>${caption?`<small class="${waiting&&overdue?'due':''}">${escape(caption)}</small>`:''}</span></label>${choosing?`<form id="date-form"><label for="postit-date">Date du rendez-vous</label><input id="postit-date" name="date" type="date" required value="${escape(dateEntry.date||'')}"><div><button type="submit">Valider le RDV</button><button type="button" id="cancel-date">Annuler</button></div></form>`:''}</li>`;
    }).join('')}</ul></section>`).join('')||'<div class="empty"><span>✓</span><h2>Rien en cours.</h2><p>Les prochaines actions de tes chantiers apparaîtront ici.</p></div>';
    doc.scrollingElement.scrollTop=scroll;
  }
  const refreshSafely=()=>refresh().catch(()=>message('Actualisation impossible. Réessaie en rouvrant le Post-it.',true));
  function disable(disabled){doc.querySelectorAll('input,button').forEach(el=>{el.disabled=disabled;});}
  async function finish(pid,tid,appointment){
    if(pending)return;pending=true;disable(true);
    try{
      let result;
      await updateProject(db,pid,p=>{
        result=finishPostitAction(p,tid,appointment);
      });
      undo={pid,tid,before:result.before};dateEntry=null;channel?.postMessage({type:'changed'});
      message(`Terminé : ${result.title}`);
    }catch(error){message(error.message||'Impossible d’enregistrer cette action.',true);}
    finally{pending=false;await refresh(true).catch(()=>{});disable(false);}
  }
  async function change(event){
    const input=event.target.closest('input[data-tid]');if(!input)return;
    input.checked=false;if(pending)return;
    const {pid,tid}=input.dataset;
    if(['rdv','travaux-rdv'].includes(tid)){
      const projects=await all(db,'projects');const task=projects.find(p=>p.id===pid)?.tasks.find(t=>t.id===tid);
      if(!task?.date){dateEntry={pid,tid,date:''};await refresh(true);doc.querySelector('#postit-date')?.focus();return;}
    }
    await finish(pid,tid);
  }
  async function click(event){
    const button=event.target.closest('button');if(!button||pending)return;
    if(button.id==='open-app'){
      if(onOpen)onOpen();else window.open(new URL('./',import.meta.url).href,'suivis-chantier-app');
    }
    if(button.id==='cancel-date'){dateEntry=null;await refresh(true);}
    if(button.id==='undo'&&undo){
      pending=true;disable(true);
      try{await updateProject(db,undo.pid,p=>undoPostitAction(p,undo.tid,undo.before));undo=null;channel?.postMessage({type:'changed'});message('Coche annulée. L’action a retrouvé son état précédent.');}
      catch(error){message(error.message||'Impossible d’annuler cette action.',true);}
      finally{pending=false;await refresh(true);disable(false);}
    }
  }
  async function submit(event){if(event.target.id!=='date-form')return;event.preventDefault();if(dateEntry)await finish(dateEntry.pid,dateEntry.tid,doc.querySelector('#postit-date').value);}
  doc.addEventListener('change',change);doc.addEventListener('click',click);doc.addEventListener('submit',submit);
  if(channel)channel.onmessage=refreshSafely;
  win.addEventListener('focus',refreshSafely);
  const timer=setInterval(refreshSafely,60000);
  win.addEventListener('pagehide',()=>{disposed=true;clearInterval(timer);channel?.close();db.close();doc.removeEventListener('change',change);doc.removeEventListener('click',click);doc.removeEventListener('submit',submit);},{once:true});
  await refreshSafely();
}

if(document.body.hasAttribute('data-postit'))mountPostit(document);
