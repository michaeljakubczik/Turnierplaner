import test from 'node:test';
import assert from 'node:assert/strict';
import {fetchRoadDistances,journeyKm,roadPlacesKey} from './teamTravel';
test('road kilometres use directional routes and invalidate after changing home places',async()=>{
  const teams=[{id:'a',homePlace:{label:'A',latitude:52,longitude:10}},{id:'b',homePlace:{label:'B',latitude:52.5,longitude:10}}];
  const original=globalThis.fetch;let url='';globalThis.fetch=async (request:any)=>{url=String(request);return new Response(JSON.stringify({code:'Ok',distances:[[0,120000],[130000,0]]}));};
  try {const roadDistances=await fetchRoadDistances(teams,new AbortController().signal);assert.ok(url.includes('annotations=distance'));const input={teams,distanceMode:'road' as const,roadDistances};assert.equal(journeyKm(teams[0],teams[1],input),120);assert.equal(journeyKm(teams[1],teams[0],input),130);assert.equal(roadDistances.placesKey,roadPlacesKey(teams));teams[1].homePlace.latitude=53;assert.equal(journeyKm(teams[0],teams[1],input),null);} finally{globalThis.fetch=original;}
});
test('routing errors do not silently substitute air distances',async()=>{
 const original=globalThis.fetch;globalThis.fetch=async()=>new Response(JSON.stringify({code:'Ok',distances:[[0,null],[null,0]]}));
 try {await assert.rejects(fetchRoadDistances([{id:'a',homePlace:{label:'A',latitude:52,longitude:10}},{id:'b',homePlace:{label:'B',latitude:53,longitude:10}}],new AbortController().signal),/vollständigen/);} finally{globalThis.fetch=original;}
});
