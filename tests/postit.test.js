import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createProject,complete,reopen} from '../model.js';
import {postitGroups,finishPostitAction,undoPostitAction} from '../postit-model.js';

test('Le Post-it ne montre que les actions disponibles des chantiers non terminés',()=>{
 const open=createProject({name:'Porte'});const done=createProject({name:'Clôturé'});done.tasks.forEach(t=>t.status='done');
 const groups=postitGroups([open,done]);assert.equal(groups.length,1);assert.deepEqual(groups[0].tasks.map(t=>t.id),['tour']);
 complete(open,'tour');assert.deepEqual(postitGroups([open])[0].tasks.map(t=>t.id),['contact']);
 reopen(open,'tour');assert.deepEqual(postitGroups([open])[0].tasks.map(t=>t.id),['tour']);
});
test('Le Post-it conserve véhicule et devis côte à côte et place la relance échue en premier',()=>{
 const p=createProject({name:'Z Chantier'});complete(p,'tour');complete(p,'contact');p.tasks.find(t=>t.id==='rdv').date='2026-10-05';complete(p,'rdv');
 const devis=p.tasks.find(t=>t.id==='devis');devis.status='waiting';devis.date='2026-09-29';devis.waitingFor='Entreprise';
 const second=createProject({name:'A Chantier'});
 const groups=postitGroups([second,p],'2026-09-29');assert.equal(groups[0].id,p.id);assert.deepEqual(groups[0].tasks.map(t=>t.id),['devis','vehicule']);
 const tomorrow=postitGroups([p],'2026-09-28');assert.deepEqual(tomorrow[0].tasks.map(t=>t.id),['vehicule','devis']);
});

test('Annuler une coche restaure aussi l’attente et sa date sans perdre les notes',()=>{
 const p=createProject({name:'Test'});const t=p.tasks[0];t.status='waiting';t.waitingFor='Entreprise';t.date='2026-10-01';
 const {before}=finishPostitAction(p,'tour');t.note='Note ajoutée dans l’application';
 undoPostitAction(p,'tour',before);assert.equal(t.status,'waiting');assert.equal(t.waitingFor,'Entreprise');assert.equal(t.date,'2026-10-01');assert.equal(t.note,'Note ajoutée dans l’application');
 finishPostitAction(p,'tour');complete(p,'contact');assert.throws(()=>undoPostitAction(p,'tour',before),/étapes suivantes/);
});
