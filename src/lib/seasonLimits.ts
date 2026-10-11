type TeamLimits = {
  maxMatchesPerTeamPerDay: number;
  maxTripleDaysPerTeam: number;
  maxMatchesPerDay: number;
};

// The three-game allowance is an exception to a regular two-game day.
// A one-game limit remains strict; the shared finale is handled separately.
export function teamDailyLimit(input: TeamLimits): number {
  return input.maxMatchesPerTeamPerDay >= 2 && input.maxTripleDaysPerTeam > 0
    ? 3 : Math.min(input.maxMatchesPerTeamPerDay, 2);
}

export function teamGameCapacity(input: TeamLimits, regularDays: number, finalDays = 0): number {
  const days = Math.max(0, regularDays);
  const base = Math.min(input.maxMatchesPerTeamPerDay, 2, input.maxMatchesPerDay);
  const extras = teamDailyLimit(input) >= 3 && input.maxMatchesPerDay >= 3
    ? Math.min(days, input.maxTripleDaysPerTeam) : 0;
  return days * base + extras + finalDays;
}
