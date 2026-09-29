import {actionable,closed,today,complete,reopen} from './model.js';

export function finishPostitAction(project,id,appointment) {
  const task=project.tasks.find(t=>t.id===id);
  if(!task)throw new Error('Cette action n’est plus disponible.');
  const before={status:task.status,waitingFor:task.waitingFor,date:task.date};
  if(appointment)task.date=appointment;
  complete(project,id);
  return {before,title:task.title};
}

export function undoPostitAction(project,id,before) {
  reopen(project,id); // Refuse to undo if a dependent action has already been completed.
  Object.assign(project.tasks.find(t=>t.id===id),before);
}

export function postitGroups(projects,day=today()) {
  const rank=t=>t.status==='waiting'?(t.date&&t.date<=day?0:2):1;
  return projects.filter(p=>!closed(p)).map(p=>({
    id:p.id,name:p.name,site:p.site,
    tasks:actionable(p).slice().sort((a,b)=>rank(a)-rank(b)||(a.date||'9999').localeCompare(b.date||'9999')),
  })).filter(p=>p.tasks.length).sort((a,b)=>Math.min(...a.tasks.map(rank))-Math.min(...b.tasks.map(rank))||a.name.localeCompare(b.name,'fr'));
}
