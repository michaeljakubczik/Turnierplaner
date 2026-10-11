import type { Schedule, Team } from './seasonSolver';
import { journeyKm, manualKm, type TravelInput } from './teamTravel';

export function seasonTravel(schedule: Schedule, teams: Team[], input: TravelInput = {teams}) {
  const byTeam = Object.fromEntries(teams.map(team => [team.id, {
    km: 0, unknownTrips: 0, airTrips: 0, visits: {} as Record<string,number>, missingHosts: [] as string[]
  }]));
  for (const day of Object.values(schedule)) {
    const host = teams.find(t=>t.id===day.hostId);
    if (!host) continue;
    for (const team of teams) {
      if (team.id===host.id || !day.matches.some(m=>m.teamA===team.id||m.teamB===team.id)) continue;
      const row=byTeam[team.id];row.visits[host.id]=(row.visits[host.id]||0)+1;
      const outward=journeyKm(team,host,input), inward=journeyKm(host,team,input);
      if(outward===null||inward===null)row.unknownTrips++;
      else {row.km+=outward+inward;if(input.distanceMode!=='road'&&manualKm(team,host,input)===null)row.airTrips++;}
    }
  }
  for(const team of teams)byTeam[team.id].missingHosts=teams.filter(host=>host.id!==team.id&&!byTeam[team.id].visits[host.id]).map(host=>host.id);
  const rows=Object.values(byTeam);
  return {byTeam,totalKm:rows.reduce((sum,r)=>sum+r.km,0),missingVisits:rows.reduce((sum,r)=>sum+r.missingHosts.length,0),unknownTrips:rows.reduce((sum,r)=>sum+r.unknownTrips,0)};
}

// The shared finale deliberately has one game per host and is excluded.
export function hostSingleDays(schedule: Schedule, finalDateId?: string): number {
  return Object.entries(schedule).filter(([id,day])=>id!==finalDateId&&day.matches.filter(m=>m.teamA===day.hostId||m.teamB===day.hostId).length===1).length;
}
