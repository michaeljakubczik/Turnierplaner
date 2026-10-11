import type { DateEntry, Schedule, Team } from './seasonSolver';

export const teamDayCounts = (schedule: Schedule, teams: Team[]) => Object.fromEntries(teams.map(t => [t.id,
  Object.values(schedule).filter(day => day.matches.some(m => m.teamA === t.id || m.teamB === t.id)).length
]));

// Compare actual calendar distances rather than month names or positions in the date list.
// The season window includes unused candidate dates, so a clustered plan cannot shrink its own window.
export function seasonSpacingPenalty(schedule: Schedule, teams: Team[], dates: DateEntry[]): number {
  const times = new Map(dates.map(d => [d.id, Date.parse(d.value)]));
  const window = [...times.values()].filter(Number.isFinite);
  if (window.length < 2) return 0;
  const start = Math.min(...window), span = Math.max(...window) - start;
  if (span <= 0) return 0;
  const entries = Object.entries(schedule);
  const score = (ids: string[]) => {
    const values = ids.map(id => times.get(id)).filter((v): v is number => v !== undefined && Number.isFinite(v)).sort((a,b)=>a-b);
    if (values.length < 2) return 0;
    return values.reduce((sum,value,i)=>sum+((value-start)/span-i/(values.length-1))**2,0)/values.length;
  };
  const league = score(entries.map(([id])=>id));
  const individual = teams.reduce((sum,t)=>sum+score(entries.filter(([,d])=>d.matches.some(m=>m.teamA===t.id||m.teamB===t.id)).map(([id])=>id)),0)/Math.max(1,teams.length);
  return Math.round((league+individual)*1_000_000);
}
