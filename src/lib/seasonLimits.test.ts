import test from 'node:test';
import assert from 'node:assert/strict';
import { teamDailyLimit, teamGameCapacity } from './seasonLimits';
import { analyzeSeason } from './planningDiagnostics';

test('seven team days with two three-game exceptions allow 16 games, or 15 with the shared finale',()=>{
  const limits={maxMatchesPerTeamPerDay:2,maxTripleDaysPerTeam:2,maxMatchesPerDay:10};
  assert.equal(teamGameCapacity(limits,7),16);
  assert.equal(teamGameCapacity(limits,6,1),15);
  assert.equal(teamDailyLimit(limits),3);
  assert.equal(teamGameCapacity({...limits,maxTripleDaysPerTeam:0},6,1),13);
  assert.equal(teamGameCapacity({...limits,maxMatchesPerDay:2},6,1),13);
  assert.equal(teamGameCapacity({...limits,maxMatchesPerTeamPerDay:1},6,1),7);
  assert.equal(teamDailyLimit({...limits,maxMatchesPerTeamPerDay:1}),1);
  assert.equal(teamGameCapacity(limits,0,1),1);
  assert.equal(teamGameCapacity({...limits,maxTripleDaysPerTeam:100},6,1),19);
});

test('diagnostics do not mark the 15-game, seven-day exception configuration as impossible',()=>{
  const teams=Array.from({length:6},(_,i)=>({id:`t${i}`,name:`Team ${i}`,maxCapacity:6,homePlace:{label:'Testort',latitude:52.4,longitude:10.1}}));
  const seasonDates=Array.from({length:7},(_,i)=>({id:`d${i}`,value:`2027-06-${String(i+1).padStart(2,'0')}`}));
  const availability=Object.fromEntries(teams.map(t=>[t.id,Object.fromEntries(seasonDates.map(d=>[d.id,true]))]));
  const input={teams,seasonDates,availability,homeAvailability:availability,matchMode:3 as const,maxMatchesPerDay:10,maxMatchesPerTeamPerDay:2,maxTripleDaysPerTeam:2,maxDaysPerTeam:7,allTeamsOnFinalDay:true,finalDayCandidate:seasonDates.at(-1),ignoredLateDates:0};
  const tips=analyzeSeason(input);
  assert.ok(!tips.some(t=>t.proven&&/zu wenig Spielmöglichkeiten|Spieltaglimit|Gesamtkapazität/.test(t.title)));
  assert.match(tips.find(t=>t.title==='Spieltaglimit pro Team prüfen')!.detail,/höchstens 15/);
});
