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
  if(['rdv','travaux-rdv'].includes(id)&&!task.date) throw new Error('Renseigne la date du rendez-vous avant de confirmer.');
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
      if(typeof t.id!=='string'||typeof t.title!=='string'||!['todo','waiting','done','skipped'].includes(t.status)||!Array.isArray(t.deps)||!t.deps.every(id=>taskIds.has(id))||!Array.isArray(t.files)||!t.files.every(id=>fileIds.has(id))||typeof t.note!=='string'||typeof t.waitingFor!=='string'||typeof t.date!=='string'||(t.date&&!/^\d{4}-\d{2}-\d{2}$/.test(t.date))) throw new Error('Action invalide.');
      const seen=new Set(); const visit=id=>{if(seen.has(id))throw new Error('Dépendances circulaires.');seen.add(id);p.tasks.find(x=>x.id===id).deps.forEach(visit);seen.delete(id);}; visit(t.id);
    }
    if(!p.history.every(h=>typeof h.at==='string'&&typeof h.text==='string'))throw new Error('Historique invalide.');
  }
  return data;
}
