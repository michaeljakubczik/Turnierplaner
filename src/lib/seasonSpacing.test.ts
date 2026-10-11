import test from 'node:test';
import assert from 'node:assert/strict';
import { seasonSpacingPenalty, teamDayCounts } from './seasonSpacing';
import { comparePlans } from './seasonProject';
import type { Schedule } from './seasonSolver';
const teams = ['a','b','c'].map(id=>({id,name:id,maxCapacity:3}));
const dates = ['2027-03-06','2027-05-01','2027-05-08','2027-05-15','2027-06-26','2027-10-16'].map((value,i)=>({id:`d${i}`,value}));
const plan = (ids: string[]): Schedule => Object.fromEntries(ids.map((id,i)=>[id,{hostId:teams[i%3].id,matches:[{teamA:'a',teamB:'b'},{teamA:'a',teamB:'c'},{teamA:'b',teamB:'c'}]}]));
test('well-spaced dates outrank clustered weekends with the same games and hosts',()=>{
 const spread=plan(['d0','d4','d5']),cluster=plan(['d1','d2','d3']);
 assert.ok(seasonSpacingPenalty(spread,teams,dates)<seasonSpacingPenalty(cluster,teams,dates));
 assert.ok(comparePlans({schedule:spread,report:null!},{schedule:cluster,report:null!},teams,dates)<0);
});
test('counts appearances as days rather than games, including a finale',()=>{
 const schedule:Schedule={d0:{hostId:'a',matches:[{teamA:'a',teamB:'b'},{teamA:'a',teamB:'c'}]},d5:{hostId:'b',matches:[{teamA:'a',teamB:'b'}]}};
 assert.deepEqual(teamDayCounts(schedule,teams),{a:2,b:2,c:1});
});
test('temporal scoring handles a single date and keeps clustered plans eligible',()=>{
 assert.equal(seasonSpacingPenalty(plan(['d0']),teams,[dates[0]]),0);
 assert.ok(Number.isFinite(seasonSpacingPenalty(plan(['d1','d2','d3']),teams,dates)));
});
test('team spacing matters even when the league uses the same dates',()=>{
 const base=plan(['d0','d1','d2','d3','d4','d5']);
 const spread=structuredClone(base),cluster=structuredClone(base);
 for(const [id,day] of Object.entries(spread))day.matches=id==='d0'||id==='d5'?[{teamA:'a',teamB:'b'}]:[{teamA:'b',teamB:'c'}];
 for(const [id,day] of Object.entries(cluster))day.matches=id==='d1'||id==='d2'?[{teamA:'a',teamB:'b'}]:[{teamA:'b',teamB:'c'}];
 assert.ok(seasonSpacingPenalty(spread,teams,dates)<seasonSpacingPenalty(cluster,teams,dates));
});
