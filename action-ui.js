import {actionTemplates,actionLink,finished,available} from './model.js';
const escape=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

export function portalLink(task,compact=false) {
  const link=actionLink(task);
  if(!link)return '';
  const label=compact?(link.label==='Ouvrir GIMA'?'GIMA':'Véhicule'):link.label;
  return `<a class="portal-link" href="${link.url}" target="_blank" rel="noopener noreferrer" aria-label="${escape(link.label)} — ${escape(task.title)}">${escape(label)} ↗</a>`;
}

export function timelineTask(project,task,index) {
  const status=task.status==='skipped'?'Non applicable':task.status==='done'?'Terminé':available(project,task)?task.status==='waiting'?'En attente':'Disponible':'À venir';
  return `<li class="${finished(task)?'done':''}"><span class="step-dot">${finished(task)?'✓':'·'}</span><button class="timeline-task" data-task="${task.id}" data-project="${project.id}"><strong>${escape(task.title)}</strong><small>${status}</small></button><div class="task-tools">${portalLink(task,true)}<div class="move-controls"><button data-move="-1" data-move-id="${task.id}" data-project="${project.id}" aria-label="Monter : ${escape(task.title)}" title="Monter l’action" ${index===0?'disabled':''}>↑</button><button data-move="1" data-move-id="${task.id}" data-project="${project.id}" aria-label="Descendre : ${escape(task.title)}" title="Descendre l’action" ${index===project.tasks.length-1?'disabled':''}>↓</button></div></div></li>`;
}

export function addActionForm(project) {
  return `<form id="add-form" data-pid="${project.id}"><label>Type d’action<select name="kind" id="action-kind" autofocus><option value="custom">Action personnalisée</option>${actionTemplates.map(t=>`<option value="${t.kind}">${escape(t.title)}</option>`).join('')}</select></label><label>Nom de l’action<input name="title" required maxlength="180" placeholder="Ex. Rechercher le bon lot de marché"></label><label><span id="action-date-label">Échéance (facultatif)</span><input name="date" type="date"></label><label>Position dans le déroulé<select name="beforeId"><option value="">À la fin du déroulé</option>${project.tasks.map(t=>`<option value="${t.id}">Avant : ${escape(t.title)}</option>`).join('')}</select></label><p class="hint">Tu peux ajouter plusieurs fois la même action. Chaque ajout est indépendant et disponible tout de suite.</p><button class="primary full">Ajouter l’action</button></form>`;
}
