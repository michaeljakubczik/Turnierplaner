import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyPlanFilters,matchesPlanFilters } from './planFilters';
import type {SavedPlan,SeasonDraft} from './seasonProject';
import {travelPairKey,travelPairPlacesKey} from './teamTravel';
function fixture():SavedPlan {
 const teams=['a','b','c'].map(id=>({id,name:id,maxCapacity:3,homePlace:{label:id,latitude:52.4,longitude:10.1}}));
 const dates=[{id:'d1',value:'2027-06-05'},{id:'d2',value:'2027-06-12'}];
 const availability=Object.fromEntries(teams.map(t=>[t.id,{d1:true,d2:true}]));
 let km=0;const manualDistances=Object.fromEntries(teams.flatMap((a,i)=>teams.slice(i+1).map(b=>[travelPairKey(a,b),{placesKey:travelPairPlacesKey(a,b),km:km+=10}])));
 const draft:SeasonDraft={teams,dates,availability,homeAvailability:availability,manualDistances,matchMode:1,maxMatchesPerDay:3,maxMatchesPerTeamPerDay:2,maxTripleDaysPerTeam:0};
 return {id:'test',createdAt:'test',favorite:true,draft,report:null!,schedule:{d1:{hostId:'a',matches:[{teamA:'a',teamB:'b'},{teamA:'a',teamB:'c'}]},d2:{hostId:'b',matches:[{teamA:'b',teamB:'c'}]}}};
}
test('day filter counts unique team dates, not games, and never changes saved data',()=>{
 const plan=fixture(),before=structuredClone(plan);
 assert.ok(matchesPlanFilters(plan,emptyPlanFilters));
 assert.ok(matchesPlanFilters(plan,{...emptyPlanFilters,maxTeamDays:2}));
 assert.equal(matchesPlanFilters(plan,{...emptyPlanFilters,maxTeamDays:1}),false);
 assert.deepEqual(plan,before);
});
test('distance filter uses round trips and can target total, every team or a specific team',()=>{
 const plan=fixture(); // a:0, b:20, c:100, total:120
 assert.ok(matchesPlanFilters(plan,{...emptyPlanFilters,maxKm:120}));
 assert.equal(matchesPlanFilters(plan,{...emptyPlanFilters,maxKm:119}),false);
 assert.ok(matchesPlanFilters(plan,{...emptyPlanFilters,maxKm:20,kmScope:'team:b'}));
 assert.equal(matchesPlanFilters(plan,{...emptyPlanFilters,maxKm:20,kmScope:'team:c'}),false);
 assert.ok(matchesPlanFilters(plan,{...emptyPlanFilters,maxKm:100,kmScope:'each'}));
 assert.equal(matchesPlanFilters(plan,{...emptyPlanFilters,maxKm:99,kmScope:'each'}),false);
 assert.equal(matchesPlanFilters(plan,{...emptyPlanFilters,maxKm:1000,kmScope:'team:missing'}),false);
});
test('unknown distances do not pass a kilometre cap, but unfiltered plans stay accessible',()=>{
 const plan=fixture();delete plan.draft.manualDistances;delete plan.draft.teams[2].homePlace;
 assert.ok(matchesPlanFilters(plan,emptyPlanFilters));
 assert.equal(matchesPlanFilters(plan,{...emptyPlanFilters,maxKm:10000}),false);
 assert.ok(matchesPlanFilters(plan,{...emptyPlanFilters,maxKm:10000,kmScope:'team:a'}));
});
test('host filter keeps the one-game shared finale and excludes ordinary one-game hosts',()=>{
 const plan=fixture();assert.equal(matchesPlanFilters(plan,{...emptyPlanFilters,hostsTwoGames:true}),false);
 // A fourth team makes the one-game-per-team finale legal.
 plan.draft.teams.push({id:'d',name:'d',maxCapacity:4,homePlace:{label:'d',latitude:52.4,longitude:10.1}});
 plan.draft.availability.d={d1:true,d2:true};plan.draft.homeAvailability.d={d1:true,d2:true};
 plan.schedule.d2.matches.push({teamA:'a',teamB:'d'});
 plan.draft.allTeamsOnFinalDay=true;
 assert.ok(matchesPlanFilters(plan,{...emptyPlanFilters,hostsTwoGames:true}));
 assert.equal(matchesPlanFilters(plan,{...emptyPlanFilters,hostsTwoGames:true,maxTeamDays:1}),false);
 plan.draft.allTeamsOnFinalDay=false;
 assert.equal(matchesPlanFilters(plan,{...emptyPlanFilters,hostsTwoGames:true}),false);
});
