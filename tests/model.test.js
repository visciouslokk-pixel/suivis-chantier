import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createProject,actionable,complete,closed,reopen,validateBackup} from '../model.js';
test('Le site occupé bloque le RDV jusqu’à confirmation des disponibilités',()=>{
 const p=createProject({name:'Test',occupied:true});complete(p,'tour');complete(p,'contact');
 assert.deepEqual(actionable(p).map(t=>t.id),['occupants']);
 assert.throws(()=>complete(p,'rdv'));
 complete(p,'occupants');assert.equal(actionable(p)[0].id,'rdv');
 assert.throws(()=>complete(p,'rdv'),/date/);
});
test('Le véhicule reste disponible indépendamment du devis et empêche une clôture prématurée',()=>{
 const p=createProject({name:'Test'});complete(p,'tour');complete(p,'contact');p.tasks.find(t=>t.id==='rdv').date='2026-10-05';complete(p,'rdv');
 assert.deepEqual(actionable(p).map(t=>t.id),['vehicule','devis']);assert.equal(p.tasks.find(t=>t.id==='vehicule').date,'2026-10-05');
 for(const id of ['devis','bpu','gima','engagement','signature','envoi','travaux-rdv','travaux','service']){if(id==='travaux-rdv')p.tasks.find(t=>t.id===id).date='2026-10-20';complete(p,id);}
 assert.equal(closed(p),false);assert.deepEqual(actionable(p).map(t=>t.id),['vehicule']);complete(p,'vehicule');assert.equal(closed(p),true);
});
test('Une attente ne débloque pas la suite et la réouverture préserve les dépendances',()=>{
 const p=createProject({name:'Test'});p.tasks[0].status='waiting';assert.throws(()=>complete(p,'contact'));complete(p,'tour');complete(p,'contact');assert.throws(()=>reopen(p,'tour'));reopen(p,'contact');reopen(p,'tour');assert.equal(actionable(p)[0].id,'tour');
});
test('La restauration vérifie les références, cycles, et doublons avant toute écriture',()=>{
 const p=createProject({name:'Test'});assert.equal(validateBackup({version:1,projects:[p],files:[]}).projects.length,1);
 assert.throws(()=>validateBackup({version:1,projects:[p,p],files:[]}));
 p.tasks[0].files=['missing'];assert.throws(()=>validateBackup({version:1,projects:[p],files:[]}));p.tasks[0].files=[];
 p.tasks[0].deps=['contact'];assert.throws(()=>validateBackup({version:1,projects:[p],files:[]}),/circulaires/);
});
