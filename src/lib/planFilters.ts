import { seasonInput, type SavedPlan } from './seasonProject';
import { teamDayCounts } from './seasonSpacing';
import { hostSingleDays, seasonTravel } from './seasonTravel';

export type PlanFilters = { maxTeamDays?: number; maxKm?: number; kmScope: string; hostsTwoGames: boolean };
export const emptyPlanFilters: PlanFilters = { kmScope:'total',hostsTwoGames:false };
export function matchesPlanFilters(plan: SavedPlan, filters: PlanFilters): boolean {
  const {teams}=plan.draft;
  if(filters.maxTeamDays!==undefined&&Object.values(teamDayCounts(plan.schedule,teams)).some(n=>n>filters.maxTeamDays!))return false;
  if(filters.hostsTwoGames) {
    const input=seasonInput(plan.draft);
    if(hostSingleDays(plan.schedule,input.allTeamsOnFinalDay?input.finalDayCandidate?.id:undefined)>0)return false;
  }
  if(filters.maxKm!==undefined) {
    const travel=seasonTravel(plan.schedule,teams,plan.draft);
    if(filters.kmScope==='total')return travel.unknownTrips===0&&travel.totalKm<=filters.maxKm;
    if(filters.kmScope==='each')return Object.values(travel.byTeam).every(row=>row.unknownTrips===0&&row.km<=filters.maxKm!);
    const row=travel.byTeam[filters.kmScope.slice(5)];
    return !!row&&row.unknownTrips===0&&row.km<=filters.maxKm;
  }
  return true;
}
