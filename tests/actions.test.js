import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createProject,addAction,moveAction,actionLink,complete,validateBackup} from '../model.js';
import {postitGroups,finishPostitAction} from '../postit-model.js';

test('Une action en amont peut être insérée puis déplacée sans perdre ses pièces, notes ou dépendances',()=>{
 const p=createProject({name:'Test'});const prep=addAction(p,{title:'Recherche préalable',beforeId:'tour'});
 prep.note='Contrainte du site';prep.files=['doc-test'];const original=structuredClone(p.tasks);
 assert.equal(p.tasks[0].id,prep.id);assert.equal(moveAction(p,prep.id,-1),false);
 moveAction(p,prep.id,1);assert.equal(p.tasks[1],prep);moveAction(p,prep.id,-1);
 assert.deepEqual(p.tasks,original);assert.deepEqual(p.tasks.find(t=>t.id==='contact').deps,['tour']);
 assert.equal(postitGroups([p])[0].tasks[0].id,prep.id);
});
test('Les doublons ont des identifiants et des validations indépendants, y compris les RDV',()=>{
 const p=createProject({name:'Test'});
 const first=addAction(p,{kind:'appointment',title:'Rendez-vous'});const second=addAction(p,{kind:'appointment',title:'Rendez-vous'});
 assert.notEqual(first.id,second.id);assert.throws(()=>complete(p,first.id),/date/);
 finishPostitAction(p,first.id,'2026-10-10');assert.equal(first.status,'done');assert.equal(second.status,'todo');assert.equal(second.date,'');
 const tour=addAction(p,{kind:'tour',title:'Demande de tour supplémentaire'});complete(p,tour.id);assert.equal(p.tasks.find(t=>t.id==='tour').status,'todo');
});
test('Les liens métier concernent aussi les doublons et les anciens ajouts personnalisés',()=>{
 const p=createProject({name:'Test'});const vehicle=addAction(p,{kind:'vehicule',title:'Voiture pour la contre-visite'});const gima=addAction(p,{kind:'gima',title:'GIMA complémentaire'});
 assert.equal(actionLink(vehicle).url,'https://apv.grandlyon.fr/');assert.equal(actionLink(gima).url,'https://gima.grandlyon.fr/gimaweb/');
 assert.equal(actionLink({id:'old',title:'Réservation voiture'}).url,'https://apv.grandlyon.fr/');assert.equal(actionLink({id:'old',title:'Faire GIMA'}).url,'https://gima.grandlyon.fr/gimaweb/');assert.equal(actionLink({id:'custom',title:'Recherche'}),null);
});
test('L’ordre et les nouveaux types restent compatibles avec les sauvegardes existantes',()=>{
 const p=createProject({name:'Test'});addAction(p,{kind:'vehicule',title:'Réserver une voiture',beforeId:'tour'});
 const saved=JSON.parse(JSON.stringify({version:1,projects:[p],files:[]}));validateBackup(saved);assert.equal(saved.projects[0].tasks[0].kind,'vehicule');
 assert.throws(()=>addAction(p,{title:'Test',beforeId:'missing'}));
 p.tasks[0].kind='unknown';assert.throws(()=>validateBackup({version:1,projects:[p],files:[]}),/Type/);
});
