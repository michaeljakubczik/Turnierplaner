import test from 'node:test';
import assert from 'node:assert/strict';
import { solveSeason } from './seasonSolver';
import { comparePlans, draftKey, emptyProject, mergePlans, parseProject, scheduleSignature, seasonInput, type SeasonDraft } from './seasonProject';
function draft(): SeasonDraft {
  return {teams:['a','b','c'].map(id=>({id,name:id,maxCapacity:3,homePlace:{label:'Arpke',latitude:52.4,longitude:10.1}})),dates:[{id:'d1',value:'2027-06-05'},{id:'d2',value:'2027-06-12'}],availability:{a:{d1:true,d2:true},b:{d1:true,d2:true},c:{d1:true,d2:true}},homeAvailability:{a:{d1:true,d2:true},b:{d1:true,d2:true},c:{d1:true,d2:true}},matchMode:1,maxMatchesPerDay:3,maxMatchesPerTeamPerDay:2,maxTripleDaysPerTeam:0};
}
test('project round-trip preserves inputs, places, alternatives, favorites and selected plan',()=>{
  const d=draft(), result=solveSeason(seasonInput(d),{durationMs:100,seed:4});
  assert.ok(result.alternatives.length);
  const project=emptyProject(d);project.plans=mergePlans([],result.alternatives,d);
  project.plans[0].favorite=true;project.selectedId=project.plans[0].id;project.holidayRegions=['NI'];project.seen[draftKey(d)]=result.foundSignatures!;
  assert.deepEqual(parseProject(JSON.parse(JSON.stringify(project))),project);
  const before=structuredClone(project.plans);
  assert.deepEqual(mergePlans(project.plans,result.alternatives,d),before);
  d.teams[0].name='New name';assert.equal(project.plans[0].draft.teams[0].name,'a');
  assert.notEqual(draftKey(d),draftKey(project.plans[0].draft));
});
test('project rejects corrupt versions, unknown teams, illegal matches and invalid limits',()=>{
  const d=draft(),r=solveSeason(seasonInput(d),{durationMs:100});const p=emptyProject(d);p.plans=mergePlans([],r.alternatives,d);assert.ok(p.plans.length);
  for(const mutate of [(v:any)=>v.version=2,(v:any)=>v.draft.maxMatchesPerDay=100,(v:any)=>v.plans[0].schedule.d1={hostId:'unknown',matches:[]},(v:any)=>Object.values(v.plans[0].schedule).forEach((day:any)=>day.matches[0].teamA='unknown'),(v:any)=>v.selectedId='unknown']){
    const copy=structuredClone(p);mutate(copy);assert.throws(()=>parseProject(copy));
  }
});
test('rank favors home balance then fewer days then equal appearance numbers',()=>{
  const d=draft();const good:any={schedule:{d1:{hostId:'a',matches:[{teamA:'a',teamB:'b'},{teamA:'c',teamB:'d'},{teamA:'a',teamB:'c'},{teamA:'b',teamB:'d'}]}}};
  const bad=structuredClone(good);[bad.schedule.d1.matches[1],bad.schedule.d1.matches[2]]=[bad.schedule.d1.matches[2],bad.schedule.d1.matches[1]];
  assert.ok(comparePlans(good,bad,[...d.teams,{id:'d',name:'d',maxCapacity:4}])<0);
  assert.equal(scheduleSignature(good.schedule),scheduleSignature(bad.schedule));
});
test('continued search keeps prior plans and reports distinct signatures',()=>{
  const d=draft(),input=seasonInput(d);const first=solveSeason(input,{durationMs:100,seed:4});const known=first.alternatives.map(p=>scheduleSignature(p.schedule));
  const second=solveSeason(input,{durationMs:150,seed:9,continueSearch:true,knownSignatures:known});
  assert.ok(second.alternatives.every(p=>!known.includes(scheduleSignature(p.schedule))));
  assert.ok(second.foundSignatures!.length>=second.alternatives.length);
  const original=mergePlans([],first.alternatives,d);original[0].favorite=true;
  const merged=mergePlans(original,second.alternatives,d);assert.ok(merged.length>=original.length);assert.equal(merged.find(p=>p.id===original[0].id)?.favorite,true);
});

test('backup preserves manual pair distances and accepts formerly excluded host distributions',async()=>{
 const {travelPairKey,travelPairPlacesKey}=await import('./teamTravel');const d=draft();const [a,b]=d.teams;
 d.manualDistances={[travelPairKey(a,b)]:{placesKey:travelPairPlacesKey(a,b),km:99}};
 const p=emptyProject(d);assert.deepEqual(parseProject(JSON.parse(JSON.stringify(p))).draft.manualDistances,d.manualDistances);
 const invalid=structuredClone(p);invalid.draft.manualDistances![travelPairKey(a,b)].km=-1;assert.throws(()=>parseProject(invalid));
 d.matchMode=4;d.dates=Array.from({length:4},(_,i)=>({id:`d${i}`,value:`2027-06-${String(5+i).padStart(2,'0')}`}));
 d.availability=Object.fromEntries(d.teams.map(t=>[t.id,Object.fromEntries(d.dates.map(day=>[day.id,true]))]));
 d.homeAvailability=Object.fromEntries(d.teams.map(t=>[t.id,t.id===a.id?structuredClone(d.availability[a.id]):{}]));
 const r=solveSeason(seasonInput(d),{durationMs:300});assert.ok(r.schedule,r.error||'');const project=emptyProject(d);project.plans=mergePlans([],r.alternatives,d);assert.ok(parseProject(JSON.parse(JSON.stringify(project))).plans.length);
});
