import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyProject, mergePlans, seasonInput, draftKey, type SeasonDraft } from './seasonProject';
import { solveSeason } from './seasonSolver';
import { workspaceFromProject, parseWorkspace, updateSeasonProject, addSeason, clearPlanArchive, restorePlanArchive } from './seasonWorkspace';

const draft = (): SeasonDraft => ({teams:['a','b','c'].map(id=>({id,name:id,maxCapacity:3,homePlace:{label:'Arpke',latitude:52.4,longitude:10.1}})),dates:[{id:'d',value:'2027-06-05'}],availability:{a:{d:true},b:{d:true},c:{d:true}},homeAvailability:{a:{d:true},b:{d:true},c:{d:true}},matchMode:1,maxMatchesPerDay:3,maxMatchesPerTeamPerDay:2,maxTripleDaysPerTeam:0});
function project() {
  const d=draft(),p=emptyProject(d),r=solveSeason(seasonInput(d),{durationMs:100,seed:4});
  p.plans=mergePlans([],r.alternatives,d);assert.ok(p.plans.length);
  p.plans[0].favorite=true;p.selectedId=p.plans[0].id;p.seen[draftKey(d)]=r.foundSignatures!;p.holidayRegions=['NI'];
  return p;
}
test('legacy project migrates without losing plans, favorites, selected plan or inputs',()=>{
  const p=project(),w=parseWorkspace(JSON.parse(JSON.stringify(p)));
  assert.deepEqual(w.seasons[0].project,{...p,draft:{...p.draft,distanceMode:'air'}});
  assert.equal(w.activeSeasonId,w.seasons[0].id);
});
test('seasons preserve isolated inputs and archives across switches, export and reload',()=>{
  const original=workspaceFromProject(project(),'U16');
  const added=addSeason(original,'U18',{...draft(),dates:[],availability:{},homeAvailability:{}});
  assert.equal(added.seasons[1].project.plans.length,0);assert.deepEqual(added.seasons[1].project.seen,{});
  added.seasons[1].project.draft.teams[0].name='U18 A';
  assert.equal(original.seasons[0].project.draft.teams[0].name,'a');
  const edited=updateSeasonProject(added,added.activeSeasonId,p=>({...p,draft:{...p.draft,maxDaysPerTeam:6}}));
  assert.equal(edited.seasons[0].project.draft.maxDaysPerTeam,undefined);
  const switched={...edited,activeSeasonId:original.activeSeasonId};
  assert.deepEqual(parseWorkspace(JSON.parse(JSON.stringify(switched))),switched);
  // Late callbacks target the season that initiated them, even after switching.
  const late=updateSeasonProject(switched,added.activeSeasonId,p=>({...p,holidayRegions:['HH']}));
  assert.deepEqual(late.seasons[0].project.holidayRegions,['NI']);
  assert.deepEqual(late.seasons[1].project.holidayRegions,['HH']);
});
test('clearing and undoing plan memory retain draft changes and other seasons',()=>{
  let w=addSeason(workspaceFromProject(project(),'U16'),'U18',draft());
  const id=w.seasons[0].id,p=w.seasons[0].project;
  const archive={plans:p.plans,selectedId:p.selectedId,seen:p.seen};
  const other=w.seasons[1];
  w=updateSeasonProject(w,id,clearPlanArchive);
  assert.deepEqual(w.seasons[0].project.plans,[]);assert.deepEqual(w.seasons[0].project.seen,{});assert.equal(w.seasons[0].project.selectedId,null);
  assert.equal(w.seasons[0].project.draft,p.draft);assert.deepEqual(w.seasons[0].project.holidayRegions,['NI']);assert.equal(w.seasons[1],other);
  w=updateSeasonProject(w,id,p=>({...p,draft:{...p.draft,maxDaysPerTeam:9}}));
  w=updateSeasonProject(w,id,p=>restorePlanArchive(p,archive));
  assert.equal(w.seasons[0].project.draft.maxDaysPerTeam,9);assert.deepEqual(w.seasons[0].project.plans,archive.plans);assert.equal(w.seasons[1],other);
  assert.deepEqual(parseWorkspace(JSON.parse(JSON.stringify(w))),w);
});
test('corrupt multi-season backups are rejected as a whole',()=>{
  const w=addSeason(workspaceFromProject(emptyProject(draft())),'U18',draft());
  for (const mutate of [(v:any)=>v.version=2,(v:any)=>v.activeSeasonId='missing',(v:any)=>v.seasons[1].id=v.seasons[0].id,(v:any)=>v.seasons[1].name=' ',(v:any)=>v.seasons[1].project.draft.maxMatchesPerDay=-1]) {
    const copy=structuredClone(w);mutate(copy);assert.throws(()=>parseWorkspace(copy));
  }
  assert.throws(()=>addSeason(w,' ',draft()));
});
