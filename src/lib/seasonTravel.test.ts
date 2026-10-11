import test from 'node:test';
import assert from 'node:assert/strict';
import { seasonTravel } from './seasonTravel';
import { comparePlans } from './seasonProject';
import { balanceHosts } from './balanceHosts';
import { travelPairKey,travelPairPlacesKey } from './teamTravel';
import type { Schedule,Team,SeasonInput } from './seasonSolver';
const teams:Team[]=['a','b','c','d'].map(id=>({id,name:id,maxCapacity:4,homePlace:{label:id,latitude:52,longitude:10}}));
const pair=(a:string,b:string)=>({teamA:a,teamB:b});
const routes=(values:number[])=>{let index=0;return Object.fromEntries(teams.flatMap((a,i)=>teams.slice(i+1).map(b=>[travelPairKey(a,b),{placesKey:travelPairPlacesKey(a,b),km:values[index++]}])));};

test('season distance counts one round trip per away date, own hosting costs zero, missing visits stay visible',()=>{
 const schedule:Schedule={one:{hostId:'b',matches:[pair('a','b'),pair('a','c')]},two:{hostId:'a',matches:[pair('a','b'),pair('a','c')]}};
 const travel=seasonTravel(schedule,teams,{teams,manualDistances:routes([10,20,30,40,50,60])});
 assert.equal(travel.byTeam.a.km,20);assert.equal(travel.byTeam.b.km,20);assert.equal(travel.byTeam.c.km,120);assert.equal(travel.byTeam.d.km,0);
 assert.equal(travel.totalKm,160);assert.deepEqual(travel.byTeam.a.visits,{b:1});assert.deepEqual(travel.byTeam.a.missingHosts,['c','d']);assert.equal(travel.byTeam.a.airTrips,0);
 const repeated=seasonTravel({...schedule,three:schedule.one},teams,{teams,manualDistances:routes([10,20,30,40,50,60])});assert.equal(repeated.byTeam.a.km,40);assert.equal(repeated.byTeam.a.visits.b,2);
});

test('missing places cannot silently become zero-distance journeys; air estimates are counted',()=>{
 const schedule:Schedule={one:{hostId:'b',matches:[pair('a','b')]}};
 assert.equal(seasonTravel(schedule,teams).byTeam.a.airTrips,1);
 const noPlaces=teams.map(t=>({...t,homePlace:undefined}));assert.equal(seasonTravel(schedule,noPlaces).byTeam.a.unknownTrips,1);
});

test('ranking and host assignment favor shorter total routes with equally balanced homes',()=>{
 const matches=[pair('a','b'),pair('c','d'),pair('a','c'),pair('b','d')];
 const far:Schedule={one:{hostId:'a',matches},two:{hostId:'b',matches}};
 const near:Schedule={one:{hostId:'c',matches},two:{hostId:'d',matches}};
 const input={teams,manualDistances:routes([90,80,80,80,80,10])};
 assert.ok(comparePlans({schedule:near,report:null!},{schedule:far,report:null!},teams,[],input)<0);
 const seasonDates=[{id:'one',value:'2027-06-05'},{id:'two',value:'2027-06-12'}];
 const availability=Object.fromEntries(teams.map(t=>[t.id,{one:true,two:true}]));
 const full:SeasonInput={...input,seasonDates,availability,homeAvailability:availability,matchMode:1,maxMatchesPerDay:10,maxMatchesPerTeamPerDay:2,maxTripleDaysPerTeam:0,allTeamsOnFinalDay:false,ignoredLateDates:0};
 const balanced=balanceHosts(far,full)!;assert.ok(balanced);assert.equal(new Set(Object.values(balanced).map(d=>d.hostId)).size,2);
 assert.equal(seasonTravel(balanced,teams,input).totalKm,seasonTravel(near,teams,input).totalKm);
});

test('visits at every other host are soft and rank ahead of repeated visits with the same home counts',()=>{
 const matches=[pair('a','b'),pair('a','c'),pair('b','c')];
 const round:Schedule={one:{hostId:'a',matches},two:{hostId:'b',matches},three:{hostId:'c',matches}};
 const subset=teams.slice(0,3);assert.equal(seasonTravel(round,subset).missingVisits,0);
 const repeated:Schedule={one:{hostId:'a',matches:[pair('a','b')]},two:{hostId:'b',matches:[pair('a','b')]},three:{hostId:'c',matches:[pair('a','c')]}};
 assert.equal(seasonTravel(repeated,subset).missingVisits,3);
 assert.ok(comparePlans({schedule:round,report:null!},{schedule:repeated,report:null!},subset)<0);
 // A host without availability stays excluded, even when that leaves missing visits.
 const availability=Object.fromEntries(subset.map(t=>[t.id,{one:true,two:true,three:true}]));
 const input:SeasonInput={teams:subset,seasonDates:[],availability,homeAvailability:{...availability,c:{}},matchMode:1,maxMatchesPerDay:10,maxMatchesPerTeamPerDay:2,maxTripleDaysPerTeam:0,allTeamsOnFinalDay:false,ignoredLateDates:0};
 const result=balanceHosts(round,input);assert.ok(result);assert.ok(seasonTravel(result,subset).missingVisits>0);
});

test('a host with two games is preferred without making single-game hosting invalid',async()=>{
 const subset=teams.slice(0,3), matches=[pair('a','b'),pair('a','c')];
 const one={day:{hostId:'b',matches}},two={day:{hostId:'a',matches}};
 assert.ok(comparePlans({schedule:two,report:null!},{schedule:one,report:null!},subset)<0);
 const availability=Object.fromEntries(subset.map(t=>[t.id,{day:true}]));
 const input:SeasonInput={teams:subset,seasonDates:[{id:'day',value:'2027-06-05'}],availability,homeAvailability:availability,matchMode:1,maxMatchesPerDay:4,maxMatchesPerTeamPerDay:2,maxTripleDaysPerTeam:0,allTeamsOnFinalDay:false,ignoredLateDates:0};
 assert.equal(balanceHosts(one,input)!.day.hostId,'a');
 input.homeAvailability={a:{},b:{day:true},c:{}};
 assert.equal(balanceHosts(one,input)!.day.hostId,'b');
 const {hostSingleDays}=await import('./seasonTravel');
 assert.equal(hostSingleDays(one),1);assert.equal(hostSingleDays(one,'day'),0);
});
