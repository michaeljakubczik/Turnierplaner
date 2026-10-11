import { seasonSpacingPenalty } from './seasonSpacing';
import type { Availability, DateEntry, HomeAvailability, MatchMode, PlanAlternative, Schedule, SeasonInput, Team } from './seasonSolver';
import { journeyKm, type RoadDistances, type ManualDistances } from './teamTravel';
import { matchOrdinals } from './orderDayMatches';
export type SeasonDraft = {
  distanceMode?: 'air' | 'road'; roadDistances?: RoadDistances; manualDistances?: ManualDistances; seasonYear?: number; allowRepeatPairPerDay?: boolean; allTeamsOnFinalDay?: boolean; maxTripleDaysPerTeam?: number;
  teams: Team[]; dates: DateEntry[]; availability: Availability; homeAvailability: HomeAvailability;
  matchMode: MatchMode; maxMatchesPerDay: number; maxMatchesPerTeamPerDay: number;
};
export type SavedPlan = PlanAlternative & { id: string; draft: SeasonDraft; favorite: boolean; createdAt: string };
export type SeasonProject = { format: 'turnierplaner-project'; version: 1; draft: SeasonDraft; plans: SavedPlan[]; selectedId: string | null; seen: Record<string, string[]>; holidayRegions: string[] };
const stable = (value: unknown): string => Array.isArray(value) ? `[${value.map(stable).join(',')}]` : value && typeof value === 'object' ? `{${Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>`${JSON.stringify(k)}:${stable(v)}`).join(',')}}` : JSON.stringify(value) ?? 'null';
export const draftKey = (draft: SeasonDraft) => stable({ ...draft, allowUnevenHomeDays: undefined, teams: [...draft.teams].sort((a,b)=>a.id.localeCompare(b.id)), dates: [...draft.dates].sort((a,b)=>a.id.localeCompare(b.id)), seasonYear: draft.seasonYear ?? 2026, allTeamsOnFinalDay: draft.allTeamsOnFinalDay ?? false, maxTripleDaysPerTeam: draft.maxTripleDaysPerTeam ?? 1 });
export const scheduleSignature = (schedule: Schedule) => Object.entries(schedule).sort(([a],[b])=>a.localeCompare(b)).map(([id,day])=>`${id}:${day.hostId}:${day.matches.map(m=>[m.teamA,m.teamB].sort().join('/')).sort().join(',')}`).join('|');
export function planRank(plan: PlanAlternative, teams: Team[], dates: DateEntry[] = []): number[] {
  const days = Object.values(plan.schedule);
  const home = teams.map(t=>days.filter(d=>d.hostId===t.id).length);
  const ordinals = days.flatMap(d=>matchOrdinals(d.matches));
  const counts = days.map(d=>d.matches.length);
  const avg = counts.reduce((a,b)=>a+b,0)/Math.max(1,counts.length);
  const variance = counts.reduce((a,b)=>a+(b-avg)**2,0)/Math.max(1,counts.length);
  const appearances = teams.map(t=>days.map(d=>d.matches.filter(m=>m.teamA===t.id||m.teamB===t.id).length));
  return [Math.max(...home)-Math.min(...home), days.length, seasonSpacingPenalty(plan.schedule,teams,dates), ordinals.filter(x=>x.a!==x.b).length, ordinals.reduce((n,x)=>n+(x.a-x.b)**2,0), appearances.flat().filter(n=>n===1).length*250 + appearances.flat().filter(n=>n>0).length*500 + counts.filter(n=>n===2).length*500 + variance*10];
}
export function comparePlans(a: PlanAlternative, b: PlanAlternative, teams: Team[], dates: DateEntry[] = []) {
  const ar=planRank(a,teams,dates), br=planRank(b,teams,dates);
  return ar.map((v,i)=>v-br[i]).find(v=>v!==0) || scheduleSignature(a.schedule).localeCompare(scheduleSignature(b.schedule));
}
export function mergePlans(previous: SavedPlan[], incoming: PlanAlternative[], draft: SeasonDraft): SavedPlan[] {
  const key=draftKey(draft);
  const known=new Set(previous.filter(p=>draftKey(p.draft)===key).map(p=>scheduleSignature(p.schedule)));
  const additions=incoming.filter(p=>{const sig=scheduleSignature(p.schedule);if(known.has(sig))return false;known.add(sig);return true;}).map(p=>({...p,id:crypto.randomUUID(),draft:structuredClone(draft),favorite:false,createdAt:new Date().toISOString()}));
  return [...previous,...additions];
}
export function seasonInput(draft: SeasonDraft): SeasonInput {
  const dates=[...draft.dates].sort((a,b)=>a.value.localeCompare(b.value));
  const finalDayCandidate=draft.allTeamsOnFinalDay ? [...dates].reverse().find(d=>draft.teams.every(t=>draft.availability[t.id]?.[d.id])) : undefined;
  const seasonDates=finalDayCandidate ? dates.filter(d=>d.value<=finalDayCandidate.value) : dates;
  return {...draft,seasonDates,allTeamsOnFinalDay:draft.allTeamsOnFinalDay??false,maxTripleDaysPerTeam:draft.maxTripleDaysPerTeam??1,finalDayCandidate,ignoredLateDates:dates.length-seasonDates.length};
}
const obj=(x:unknown): x is Record<string,unknown> => !!x && typeof x==='object' && !Array.isArray(x);
const integer=(x:unknown,min:number,max:number)=>Number.isInteger(x)&&Number(x)>=min&&Number(x)<=max;
const text=(x:unknown): x is string =>typeof x==='string'&&x.length>0&&x.length<1000;
function validDraft(x: unknown): x is SeasonDraft {
  if(!obj(x)||!Array.isArray(x.teams)||x.teams.length<2||x.teams.length>100||!Array.isArray(x.dates)||x.dates.length>1000||!integer(x.matchMode,1,4)||!integer(x.maxMatchesPerDay,1,10)||!integer(x.maxMatchesPerTeamPerDay,1,3))return false;
  if (x.manualDistances !== undefined && (!obj(x.manualDistances) || !Object.values(x.manualDistances).every(v=>obj(v)&&typeof v.placesKey==='string'&&typeof v.km==='number'&&Number.isFinite(v.km)&&v.km>=0&&v.km<=50000))) return false;
  if (x.distanceMode !== undefined && !['air','road'].includes(String(x.distanceMode))) return false;
  if (x.roadDistances !== undefined && (!obj(x.roadDistances) || typeof x.roadDistances.placesKey !== 'string' || !obj(x.roadDistances.km) || !Object.values(x.roadDistances.km).every(row=>obj(row)&&Object.values(row).every(n=>typeof n==='number'&&Number.isFinite(n)&&n>=0)))) return false;
  if(x.seasonYear!==undefined&&!integer(x.seasonYear,1900,2200)||x.maxTripleDaysPerTeam!==undefined&&!integer(x.maxTripleDaysPerTeam,0,1000)||x.allTeamsOnFinalDay!==undefined&&typeof x.allTeamsOnFinalDay!=='boolean'||x.allowRepeatPairPerDay!==undefined&&typeof x.allowRepeatPairPerDay!=='boolean')return false;
  if(!x.teams.every(t=>obj(t)&&text(t.id)&&typeof t.name==='string'&&t.name.length<1000&&integer(t.maxCapacity,2,100)&&(t.homeLocationQuery===undefined||typeof t.homeLocationQuery==='string')&&(t.homePlace===undefined||obj(t.homePlace)&&text(t.homePlace.label)&&typeof t.homePlace.latitude==='number'&&Math.abs(t.homePlace.latitude)<=90&&typeof t.homePlace.longitude==='number'&&Math.abs(t.homePlace.longitude)<=180)))return false;
  if(!x.dates.every(d=>obj(d)&&text(d.id)&&typeof d.value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(d.value)&&!isNaN(Date.parse(d.value))&&new Date(d.value).toISOString().slice(0,10)===d.value))return false;
  const teams=new Set(x.teams.map(t=>t.id)), dates=new Set(x.dates.map(d=>d.id));
  if(teams.size!==x.teams.length||dates.size!==x.dates.length||new Set(x.dates.map(d=>d.value)).size!==dates.size)return false;
  return [x.availability,x.homeAvailability].every(map=>obj(map)&&Object.entries(map).every(([t,ds])=>teams.has(t)&&obj(ds)&&Object.entries(ds).every(([d,v])=>text(d)&&typeof v==='boolean')));
}
function validPlan(x: unknown): x is SavedPlan {
  if(!obj(x)||!text(x.id)||typeof x.favorite!=='boolean'||!text(x.createdAt)||!validDraft(x.draft)||!obj(x.schedule)||!obj(x.report))return false;
  const input=seasonInput(x.draft), pairs=new Map<string,number>(), home:Record<string,number>={}, triples:Record<string,number>={};
  const allowed=new Set(input.seasonDates.map(d=>d.id));
  for(const [date,day] of Object.entries(x.schedule)) {
    if(!allowed.has(date)||!obj(day)||!Array.isArray(day.matches)||!text(day.hostId)||day.matches.length>input.maxMatchesPerDay)return false;
    const host=input.teams.find(t=>t.id===day.hostId);if(!host||!input.homeAvailability[host.id]?.[date]||!input.availability[host.id]?.[date])return false;
    const final=input.allTeamsOnFinalDay&&date===input.finalDayCandidate?.id;
    if(!final&&!host.homePlace)return false;
    if(day.matches.length<(final?1:2))return false;
    const counts:Record<string,number>={},today=new Set<string>();
    for(const m of day.matches) {
      if(!obj(m)||!text(m.teamA)||!text(m.teamB)||m.teamA===m.teamB||!input.teams.some(t=>t.id===m.teamA)||!input.teams.some(t=>t.id===m.teamB)||!input.availability[m.teamA]?.[date]||!input.availability[m.teamB]?.[date])return false;
      const pair=JSON.stringify([m.teamA,m.teamB].sort());if(!input.allowRepeatPairPerDay&&today.has(pair))return false;today.add(pair);pairs.set(pair,(pairs.get(pair)||0)+1);
      counts[m.teamA]=(counts[m.teamA]||0)+1;counts[m.teamB]=(counts[m.teamB]||0)+1;
    }
    if(!counts[host.id]||Object.keys(counts).length>host.maxCapacity)return false;home[host.id]=(home[host.id]||0)+1;
    for(const t of input.teams) {
      const n=counts[t.id]||0;if(!final&&!t.homePlace||n>input.maxMatchesPerTeamPerDay||final&&n!==1||!final&&n>0&&(journeyKm(t,host,input) ?? Infinity) > 100&&n<2)return false;
      if(n===3)triples[t.id]=(triples[t.id]||0)+1;
    }
  }
  if(input.allTeamsOnFinalDay&&(!input.finalDayCandidate||!x.schedule[input.finalDayCandidate.id]))return false;
  if(Object.values(triples).some(n=>n>input.maxTripleDaysPerTeam)||pairs.size!==input.teams.length*(input.teams.length-1)/2||[...pairs.values()].some(n=>n!==input.matchMode))return false;
  const r=x.report;
  return Array.isArray(r.matchesPerDay)&&r.matchesPerDay.every(n=>integer(n,1,10))&&r.matchesPerDay.reduce<number>((a,b)=>a+Number(b),0)===Object.values(x.schedule).reduce<number>((n,d)=>n+(d as {matches:unknown[]}).matches.length,0)&&typeof r.deviation==='number'&&Number.isFinite(r.deviation)&&integer(r.maxMatchesPerTeamPerDay,1,3)&&obj(r.homeGameDistribution)&&Object.values(r.homeGameDistribution).every(n=>integer(n,0,1000))&&input.teams.every(t=>(r.homeGameDistribution as Record<string,number>)[t.id]===home[t.id]||((r.homeGameDistribution as Record<string,number>)[t.id]||0)===(home[t.id]||0))&&r.hardConstraintsSatisfied===true&&Array.isArray(r.softConstraintDeviations)&&r.softConstraintDeviations.every(s=>typeof s==='string');
}
export function parseProject(value: unknown): SeasonProject {
  if(!obj(value)||value.format!=='turnierplaner-project'||value.version!==1||!validDraft(value.draft)||!Array.isArray(value.plans)||value.plans.length>10000||!value.plans.every(validPlan)||new Set(value.plans.map(p=>p.id)).size!==value.plans.length||!(value.selectedId===null||typeof value.selectedId==='string'&&value.plans.some(p=>p.id===value.selectedId))||!obj(value.seen)||!Object.values(value.seen).every(x=>Array.isArray(x)&&x.every(v=>typeof v==='string'))||!Array.isArray(value.holidayRegions)||!value.holidayRegions.every(r=>['HB','HH','NI'].includes(r)))throw new Error('Ungültige oder nicht unterstützte Projektdatei. Eingaben und Spielpläne bleiben unverändert.');
  return value as SeasonProject;
}
export function emptyProject(draft: SeasonDraft): SeasonProject { return {format:'turnierplaner-project',version:1,draft,plans:[],selectedId:null,seen:{},holidayRegions:[]}; }
