import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyProject, mergePlans, seasonInput, planRank, type SeasonDraft } from './seasonProject';
import { solveSeason } from './seasonSolver';
import { aiPlanningPrompt, aiPlanBundle, aiInput, aiExportStem, hardPlanningRules, rankCriteria } from './seasonAiExport';
import { travelPairKey, travelPairPlacesKey, roadPlacesKey } from './teamTravel';
const draft=():SeasonDraft=>({teams:['a','b','c'].map(id=>({id,name:id,maxCapacity:3,homePlace:{label:'Arpke',latitude:52.4,longitude:10.1}})),dates:[{id:'d',value:'2027-06-05'}],availability:{a:{d:true},b:{d:true},c:{d:true}},homeAvailability:{a:{d:true},b:{d:true},c:{d:true}},matchMode:1,maxMatchesPerDay:3,maxMatchesPerTeamPerDay:2,maxTripleDaysPerTeam:0});
test('AI archive exports every plan with exact IDs, favorites, scores and historical input references',()=>{
 const d=draft(),p=emptyProject(d),r=solveSeason(seasonInput(d),{durationMs:100,seed:4});assert.ok(r.alternatives.length);
 p.plans=mergePlans([],r.alternatives,d);p.plans[0].favorite=true;
 const changed={...d,maxDaysPerTeam:2};p.plans=mergePlans(p.plans,r.alternatives,changed);
 const before=structuredClone(p),exported=JSON.parse(JSON.stringify(aiPlanBundle(p,'U13 · 2027')));
 assert.equal(exported.plans.length,p.plans.length);assert.equal(exported.inputSets.length,2);
 assert.equal(exported.currentSettingsPlanCount,r.alternatives.length);
 for(const [i,plan] of p.plans.entries()) {
  const e=exported.plans[i];assert.equal(e.id,plan.id);assert.equal(e.favorite,plan.favorite);assert.deepEqual(e.schedule,plan.schedule);
  assert.equal(e.matchesCurrentSettings,plan.draft.maxDaysPerTeam===undefined);
  assert.deepEqual(e.rankVector,planRank(plan,plan.draft.teams,seasonInput(plan.draft).seasonDates,seasonInput(plan.draft)));
  assert.deepEqual(exported.inputSets.find((s:any)=>s.id===e.inputSetId).rawSettings,plan.draft);
 }
 assert.deepEqual(p,before);assert.deepEqual(exported.rules.softLexicographic,rankCriteria);
});
test('AI input retains final cutoff, strict one-game and three-game exceptions, availability and manual distances',()=>{
 const d=draft();d.teams.push({...d.teams[0],id:'x',name:'x'});d.allTeamsOnFinalDay=true;d.maxTripleDaysPerTeam=2;d.maxDaysPerTeam=7;
 d.dates.push({id:'late',value:'2027-06-12'});d.availability.x={d:true};d.homeAvailability.x={d:true};
 const [a,b]=d.teams;d.manualDistances={[travelPairKey(a,b)]:{km:101,placesKey:travelPairPlacesKey(a,b)}};
 const v=aiInput(d);assert.equal(v.effective.finalDayCandidate?.id,'d');assert.deepEqual(v.effective.ignoredLateDates,[d.dates[1]]);
 assert.equal(v.effective.effectiveDailyTeamLimit,3);assert.equal(v.effective.maxDaysPerTeam,7);assert.equal(v.distances[0].oneWayKm,101);assert.equal(v.distances[0].source,'manual');
 assert.deepEqual(v.calendar[0].availableTeamIds,['a','b','c','x']);assert.equal(aiInput({...d,maxMatchesPerTeamPerDay:1}).effective.effectiveDailyTeamLimit,1);
 const p=emptyProject(d);p.holidayRegions=['NI'];const prompt=aiPlanningPrompt(p,'U13');
 assert.ok(prompt.includes(JSON.stringify({seasonName:'U13',holidayRegions:p.holidayRegions,...v},null,2)));
 for(const rule of [...hardPlanningRules,...rankCriteria])assert.ok(prompt.includes(rule));
 assert.ok(prompt.includes('matchesCurrentSettings=true'));assert.ok(prompt.includes('genau ein Spiel je Team'));
});
test('AI distances preserve unknown values and asymmetric legacy routes',()=>{
 const d=draft();delete d.teams[1].homePlace;assert.equal(aiInput(d).distances[0].oneWayKm,null);assert.equal(aiInput(d).distances[0].source,'unknown');
 const road=draft();road.distanceMode='road';road.roadDistances={placesKey:roadPlacesKey(road.teams),km:{a:{b:120},b:{a:130}}};
 const e=aiInput(road).distances[0];assert.equal(e.oneWayKm,120);assert.equal(e.reverseOneWayKm,130);assert.equal(e.source,'road');
 assert.equal(aiPlanBundle(emptyProject(d),'Test').planCount,0);
 assert.equal(aiExportStem('U13 · Frühling / 2027'),'U13-Fruhling-2027');
});
