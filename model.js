export const steps = [
  ['tour', 'Faire la demande de tour', []],
  ['contact', 'Contacter l’entreprise', ['tour']],
  ['occupants', 'Vérifier la disponibilité des occupants', ['contact']],
  ['rdv', 'Confirmer le rendez-vous de visite', ['contact', 'occupants']],
  ['vehicule', 'Réserver le véhicule', ['rdv']],
  ['devis', 'Recevoir le devis', ['rdv']],
  ['bpu', 'Vérifier les lignes du devis avec le BPU', ['devis']],
  ['gima', 'Faire la GIMA', ['bpu']],
  ['engagement', 'Faire la demande d’engagement', ['gima']],
  ['signature', 'Faire signer le BDC', ['engagement']],
  ['envoi', 'Envoyer le BDC à l’entreprise', ['signature']],
  ['travaux-rdv', 'Fixer le rendez-vous travaux', ['envoi']],
  ['travaux', 'Confirmer la réalisation des travaux', ['travaux-rdv']],
  ['service', 'Faire le service fait', ['travaux']],
];
export const uid = () => crypto.randomUUID();
export const actionTemplates = [
  ...steps.map(([kind,title])=>({kind,title})),
  {kind:'appointment',title:'Prendre un rendez-vous supplémentaire'},
  {kind:'research',title:'Rechercher le bon lot de marché'},
  {kind:'technical',title:'Vérifier une contrainte technique'},
];
export function taskKind(task) {
  if(task.kind)return task.kind;
  if(steps.some(([id])=>id===task.id))return task.id;
  const title=task.title.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  const template=actionTemplates.find(t=>t.title===task.title);
  if(template)return template.kind;
  if(/reserv/.test(title)&&/voiture|vehicule/.test(title))return 'vehicule';
  if(/\bgima\b/.test(title))return 'gima';
  return 'custom';
}
export const requiresAppointmentDate=task=>['rdv','travaux-rdv','appointment'].includes(taskKind(task));
export function actionLink(task) {
  const kind=taskKind(task);
  if(kind==='vehicule')return {url:'https://apv.grandlyon.fr/',label:'Ouvrir la réservation de véhicule'};
  if(kind==='gima')return {url:'https://gima.grandlyon.fr/gimaweb/',label:'Ouvrir GIMA'};
  return null;
}
export function addAction(project,{kind='custom',title,date='',beforeId=''}) {
  if(!['custom',...actionTemplates.map(t=>t.kind)].includes(kind))throw new Error('Choisis un type d’action valide.');
  if(!title?.trim())throw new Error('Précise l’action.');
  const index=beforeId?project.tasks.findIndex(t=>t.id===beforeId):project.tasks.length;
  if(index<0)throw new Error('L’étape choisie n’est plus disponible.');
  const task={id:uid(),kind,title:title.trim(),date,deps:[],status:'todo',note:'',waitingFor:'',files:[]};
  project.tasks.splice(index,0,task);
  project.history.unshift({at:new Date().toISOString(),text:`Action ajoutée : ${task.title}`});
  return task;
}
export function moveAction(project,id,direction) {
  if(![-1,1].includes(direction))throw new Error('Déplacement invalide.');
  const index=project.tasks.findIndex(t=>t.id===id);
  if(index<0)throw new Error('Cette action n’est plus disponible.');
  const target=index+direction;
  if(target<0||target>=project.tasks.length)return false;
  [project.tasks[index],project.tasks[target]]=[project.tasks[target],project.tasks[index]];
  project.history.unshift({at:new Date().toISOString(),text:`Action déplacée : ${project.tasks[target].title}`});
  return true;
}
export function today() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }
export function createProject({name, site = '', company = '', occupied = false}) {
  return {id:uid(), name, site, company, occupied, created:new Date().toISOString(), tasks:steps.map(([id,title,deps])=>({id,title,deps,status:id==='occupants'&&!occupied?'skipped':'todo',date:'',waitingFor:'',note:'',files:[]})), history:[]};
}
export const finished = t => ['done','skipped'].includes(t.status);
export const available = (p,t) => !finished(t) && t.deps.every(id=>finished(p.tasks.find(x=>x.id===id)));
export const actionable = p => p.tasks.filter(t=>available(p,t));
export const closed = p => p.tasks.every(finished);
export function complete(p,id) {
  const task=p.tasks.find(t=>t.id===id);
  if(!task || !available(p,task)) throw new Error('Cette action dépend encore d’une étape non terminée.');
  if(requiresAppointmentDate(task)&&!task.date) throw new Error('Renseigne la date du rendez-vous avant de confirmer.');
  task.status='done'; task.waitingFor='';
  p.history.unshift({at:new Date().toISOString(),text:`Terminé : ${task.title}`});
  if(id==='rdv') p.tasks.find(t=>t.id==='vehicule').date=task.date;
}
export function reopen(p,id) {
  const target=p.tasks.find(t=>t.id===id);
  if (!target || target.status!=='done') throw new Error('Cette action ne peut pas être rouverte.');
  if(p.tasks.some(t=>t.deps.includes(id)&&t.status==='done')) throw new Error('Rouvre d’abord les étapes suivantes déjà terminées.');
  target.status='todo';
  p.history.unshift({at:new Date().toISOString(),text:`Réouvert : ${target.title}`});
}
export function validateBackup(data) {
  if(data?.version!==1 || !Array.isArray(data.projects)||!Array.isArray(data.files)) throw new Error('Sauvegarde non reconnue.');
  const ids=new Set(); const fileIds=new Set();
  const validId=id=>typeof id==='string'&&/^[a-zA-Z0-9_-]+$/.test(id);
  for(const f of data.files) {
    if(!validId(f.id)||fileIds.has(f.id)||typeof f.name!=='string'||typeof f.data!=='string'||!/^data:[^,]*;base64,/.test(f.data)) throw new Error('Pièce jointe invalide.');
    fileIds.add(f.id);
  }
  for(const p of data.projects) {
    if(!validId(p.id)||ids.has(p.id)||typeof p.name!=='string'||typeof p.site!=='string'||typeof p.company!=='string'||!Array.isArray(p.tasks)||!Array.isArray(p.history)) throw new Error('Chantier invalide.');
    ids.add(p.id);
    const taskIds=new Set(p.tasks.map(t=>t.id));
    if(taskIds.size!==p.tasks.length||![...taskIds].every(validId)||!steps.every(([id])=>taskIds.has(id))) throw new Error('Déroulé incomplet.');
    for(const t of p.tasks) {
      if(t.kind!==undefined&&!['custom',...actionTemplates.map(x=>x.kind)].includes(t.kind))throw new Error('Type d’action invalide.');
      if(typeof t.id!=='string'||typeof t.title!=='string'||!['todo','waiting','done','skipped'].includes(t.status)||!Array.isArray(t.deps)||!t.deps.every(id=>taskIds.has(id))||!Array.isArray(t.files)||!t.files.every(id=>fileIds.has(id))||typeof t.note!=='string'||typeof t.waitingFor!=='string'||typeof t.date!=='string'||(t.date&&!/^\d{4}-\d{2}-\d{2}$/.test(t.date))) throw new Error('Action invalide.');
      const seen=new Set(); const visit=id=>{if(seen.has(id))throw new Error('Dépendances circulaires.');seen.add(id);p.tasks.find(x=>x.id===id).deps.forEach(visit);seen.delete(id);}; visit(t.id);
    }
    if(!p.history.every(h=>typeof h.at==='string'&&typeof h.text==='string'))throw new Error('Historique invalide.');
  }
  return data;
}
