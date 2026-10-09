import { hasLongJourney, type HomePlace } from './teamTravel';
export type Team = {
  id: string;
  name: string;
  maxCapacity: number;
  homeLocationQuery?: string;
  homePlace?: HomePlace;
};

export type MatchMode = 1 | 2 | 3 | 4;

export type DateEntry = {
  id: string;
  value: string;
};

export type Availability = Record<string, Record<string, boolean>>; // teamId -> dateId -> isAvailable
export type HomeAvailability = Record<string, Record<string, boolean>>; // teamId -> dateId -> isHomePossible

export type Match = {
  teamA: string;
  teamB: string;
};

export type ScheduleDay = {
  matches: Match[];
  hostId: string;
};

export type Schedule = Record<string, ScheduleDay>; // dateId -> day info

export type ValidationReport = {
  matchesPerDay: number[];
  deviation: number;
  maxMatchesPerTeamPerDay: number;
  homeGameDistribution: Record<string, number>;
  hardConstraintsSatisfied: boolean;
  softConstraintDeviations: string[];
};

export type SeasonInput = {
  teams: Team[]; seasonDates: DateEntry[]; availability: Availability;
  homeAvailability: HomeAvailability; matchMode: MatchMode;
  maxMatchesPerDay: number; maxMatchesPerTeamPerDay: number;
  maxTripleDaysPerTeam: number; allTeamsOnFinalDay: boolean;
  finalDayCandidate?: DateEntry; ignoredLateDates: number;
};
export type SearchProgress = { iterations: number; attempts: number; elapsedMs: number; bestDays: number | null };
export type SolverResult = { error: string | null; schedule: Schedule | null; report: ValidationReport | null; searchStopped: boolean };
export type SearchOptions = { durationMs: number; seed?: number };
const formatDate = (dateStr: string) => {
  try {
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return dateStr;
    return date.toLocaleDateString('de-DE', { weekday: 'long', month: 'short', day: 'numeric' });
  } catch (e) {
    return dateStr;
  }
};

const generatePairings = (teams: Team[], mode: MatchMode): Match[] => {
  const pairings: Match[] = [];
  for (let i = 0; i < teams.length; i++) {
    for (let j = i + 1; j < teams.length; j++) {
      for (let m = 0; m < mode; m++) {
        pairings.push({ teamA: teams[i].id, teamB: teams[j].id });
      }
    }
  }
  return pairings;
};


export function solveSeason(input: SeasonInput, options: SearchOptions, onProgress: (progress: SearchProgress) => void = () => {}): SolverResult {
  const { teams, seasonDates, availability, homeAvailability, matchMode, maxMatchesPerDay, maxMatchesPerTeamPerDay, maxTripleDaysPerTeam, allTeamsOnFinalDay, finalDayCandidate, ignoredLateDates } = input;
  const result: SolverResult = { error: null, schedule: null, report: null, searchStopped: false };
  const setError = (error: string) => { result.error = error; };
  const setSchedule = (schedule: Schedule) => { result.schedule = schedule; };
  const setReport = (report: ValidationReport) => { result.report = report; };
  function search() {
      if (allTeamsOnFinalDay && !finalDayCandidate) {
        setError('Kein gemeinsamer Saisonabschluss möglich: Es gibt keinen ausgewählten Termin, an dem alle Teams verfügbar sind.');  return;
      }
      const missingPlaces = teams.filter(t => !t.homePlace);
      if (missingPlaces.length) {
        setError(`Bitte zuerst den Heimspielort für ${missingPlaces.map(t => t.name).join(', ')} eingeben und einen gefundenen Ort auswählen. Erst dann kann die 100-km-Regel geprüft werden.`);  return;
      }
      if (maxMatchesPerDay < 2 && !(allTeamsOnFinalDay && teams.length === 2 && matchMode === 1)) {
        setError('Reguläre Spieltage benötigen mindestens zwei Spiele. Erhöhe „Max. Spiele pro Tag“ auf mindestens 2.');  return;
      }
      const dates = seasonDates;
      if (!dates.length || dates.some(d => !/^\d{4}-\d{2}-\d{2}$/.test(d.value)) || new Set(dates.map(d => d.value)).size !== dates.length) {
        setError('Bitte mindestens einen Spieltag auswählen. Termine müssen gültig und eindeutig sein.');  return;
      }
      const finalDateId = dates[dates.length - 1].id;
      if (allTeamsOnFinalDay && teams.length % 2 !== 0) {
        setError('Gemeinsamer Saisonabschluss mit genau einem Spiel pro Team erfordert eine gerade Anzahl an Teams.');  return;
      }
      if (allTeamsOnFinalDay) {
        const finalLabel = formatDate(dates[dates.length - 1].value);
        const requiredMatches = teams.length / 2;
        if (maxMatchesPerDay < requiredMatches) {
          setError(`Saisonabschluss am ${finalLabel}: ${teams.length} Teams benötigen ${requiredMatches} Spiele. „Max. Spiele pro Tag“ ist auf ${maxMatchesPerDay} eingestellt. Erhöhe das Limit auf mindestens ${requiredMatches}.`);  return;
        }
        const hosts = teams.filter(t => homeAvailability[t.id]?.[finalDateId]);
        if (!hosts.length) {
          setError(`Saisonabschluss am ${finalLabel}: Kein Team hat an diesem Termin „Heimspiel möglich“ (H) aktiviert.`);  return;
        }
        if (!hosts.some(t => t.maxCapacity >= teams.length)) {
          setError(`Saisonabschluss am ${finalLabel}: Ein Gastgeber muss ${teams.length} Teams aufnehmen können. Die größte eingetragene Gastgeberkapazität an diesem Termin beträgt ${Math.max(...hosts.map(t => t.maxCapacity))}.`);  return;
        }
      }
      const allMatches = generatePairings(teams, matchMode);
      const totalMatches = allMatches.length;

      if (totalMatches > dates.length * maxMatchesPerDay) {
        setError(`Unmöglich: Die Gesamtanzahl der Spiele (${totalMatches}) übersteigt die maximale Kapazität von ${dates.length * maxMatchesPerDay} (${dates.length} Tage * ${maxMatchesPerDay} Spiele/Tag). Füge mehr Daten hinzu oder reduziere den Spielmodus.`);
        
        return;
      }

      const distantByHost = new Map(teams.map(host => [host.id, new Set(teams.filter(t => hasLongJourney(t.homePlace!, host.homePlace!)).map(t => t.id))]));
      const isDistant = (teamId: string, hostId: string) => distantByHost.get(hostId)!.has(teamId);

      let bestSchedule: Schedule | null = null;
      let bestScore = Infinity;
      let bestDayCount = Infinity;
      let iterations = 0;
      const MAX_ITERATIONS = 10000000;

      const getScore = (currentSchedule: Schedule) => {
        const counts = dates.map(d => currentSchedule[d.id]?.matches.length || 0).filter(count => count > 0);
        const avg = counts.reduce((a, b) => a + b, 0) / Math.max(1, counts.length);
        const variance = counts.reduce((a, b) => a + Math.pow(b - avg, 2), 0) / Math.max(1, counts.length);
        
        // Secondary preferences; day count is compared separately and has priority.
        let penalty = variance * 10 + counts.filter(count => count === 2).length * 500;

        const teamDays: Record<string, Set<string>> = {};
        const homeGameCounts: Record<string, number> = {};

        dates.forEach(d => {
          const day = currentSchedule[d.id];
          if (!day) return;
          const dayMatches = day.matches;
          const teamCounts: Record<string, number> = {};
          
          dayMatches.forEach(m => {
            teamCounts[m.teamA] = (teamCounts[m.teamA] || 0) + 1;
            teamCounts[m.teamB] = (teamCounts[m.teamB] || 0) + 1;
            
            if (!teamDays[m.teamA]) teamDays[m.teamA] = new Set();
            if (!teamDays[m.teamB]) teamDays[m.teamB] = new Set();
            teamDays[m.teamA].add(d.id);
            teamDays[m.teamB].add(d.id);
          });

          if (day.hostId) {
            homeGameCounts[day.hostId] = (homeGameCounts[day.hostId] || 0) + 1;
          }

          Object.values(teamCounts).forEach(c => {
            if (c === 1 && !(allTeamsOnFinalDay && d.id === finalDateId)) penalty += 250;
            if (c > maxMatchesPerTeamPerDay) penalty += 10000; // Hard constraint penalty
          });
        });

        // Minimize total days per team
        Object.values(teamDays).forEach(days => {
          penalty += days.size * 500;
        });

        // Balance home games
        const homeCounts = teams.map(t => homeGameCounts[t.id] || 0);
        const homeAvg = homeCounts.reduce((a, b) => a + b, 0) / teams.length;
        const homeVariance = homeCounts.reduce((a, b) => a + Math.pow(b - homeAvg, 2), 0) / teams.length;
        penalty += homeVariance * 1000;

        return penalty;
      };

      const startedAt = performance.now();
      const durationMs = Math.max(100, Math.min(120000, options.durationMs));
      let attemptStartedAt = startedAt;
      let attemptStartIteration = 0;
      let attempts = 0;
      let lastProgressAt = 0;
      let searchStopped = false;
      let attemptStopped = false;
      let firstSolutionAt: number | null = null;
      let seed = (options.seed ?? Date.now()) >>> 0;
      const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
      const shuffled = (matches: Match[]) => {
        const copy = [...matches];
        for (let i = copy.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [copy[i], copy[j]] = [copy[j], copy[i]]; }
        return copy;
      };
      const searchLimitReached = () => {
        const now = performance.now();
        if (now - lastProgressAt > 200) {
          onProgress({ iterations, attempts, elapsedMs: now - startedAt, bestDays: Number.isFinite(bestDayCount) ? bestDayCount : null });
          lastProgressAt = now;
        }
        if (iterations > MAX_ITERATIONS || now - startedAt > durationMs) { searchStopped = true; return true; }
        if (firstSolutionAt !== null && now - firstSolutionAt > 1500) return true;
        if (now - attemptStartedAt > 1000 || iterations - attemptStartIteration > 20000) { attemptStopped = true; return true; }
        return false;
      };
      const placements = (match: Match, current: Schedule) => dates.flatMap(date => {
        const day = current[date.id] || { matches: [], hostId: '' };
        if (day.matches.length >= maxMatchesPerDay || !availability[match.teamA]?.[date.id] || !availability[match.teamB]?.[date.id]) return [];
        if (day.matches.some(m => m.teamA === match.teamA && m.teamB === match.teamB)) return [];
        const count = (id: string) => day.matches.filter(m => m.teamA === id || m.teamB === id).length;
        for (const id of [match.teamA, match.teamB]) {
          const c = count(id);
          if (c >= maxMatchesPerTeamPerDay || (allTeamsOnFinalDay && date.id === finalDateId && c >= 1)) return [];
          const tripleDays = Object.entries(current).filter(([d, entry]) => d !== date.id && entry.matches.filter(m => m.teamA === id || m.teamB === id).length === 3).length;
          if (c === 2 && tripleDays >= maxTripleDaysPerTeam) return [];
        }
        const matches = [...day.matches, match];
        const participants = new Set(matches.flatMap(m => [m.teamA, m.teamB]));
        // Partial days may reserve a host who will join with a later match.
        // Requiring the host in the first pairing would reject valid schedules.
        const hosts = teams.filter(t => availability[t.id]?.[date.id] && homeAvailability[t.id]?.[date.id] && t.maxCapacity >= participants.size + (participants.has(t.id) ? 0 : 1));
        if (!hosts.length) return [];
        const countInMatches = (id: string) => matches.filter(m => m.teamA === id || m.teamB === id).length;
        const isFinale = allTeamsOnFinalDay && date.id === finalDateId;
        const slotsLeft = maxMatchesPerDay - matches.length;
        // Prefer a participating host now; another host can be introduced later.
        // Only evaluate provisional hosts when no participant can host this prefix.
        const participatingHosts = hosts.filter(host => participants.has(host.id));
        const candidateHosts = participatingHosts.length ? participatingHosts : hosts;
        const viableHosts = candidateHosts.filter(host => {
          if (slotsLeft === 0 && !participants.has(host.id)) return false;
          if (isFinale) return true;
          const distantSingles = teams.filter(t => participants.has(t.id) && isDistant(t.id, host.id) && countInMatches(t.id) < 2);
          // An incomplete day can still switch to a host added by a later match.
          return slotsLeft > 0 || distantSingles.length === 0;
        });
        const deficit = (host: Team) => teams.filter(t => participants.has(t.id) && isDistant(t.id, host.id) && countInMatches(t.id) < 2).length;
        viableHosts.sort((a, b) => deficit(a) - deficit(b) || Number(!participants.has(a.id)) - Number(!participants.has(b.id)) || Object.entries(current).filter(([d, entry]) => d !== date.id && entry.hostId === a.id).length - Object.entries(current).filter(([d, entry]) => d !== date.id && entry.hostId === b.id).length);
        // Host choice is recomputed whenever a match is added. The least deficit
        // host preserves feasibility; remaining host preferences only affect score.
        return viableHosts.length ? [{ dateId: date.id, matches, hostId: viableHosts[0].id }] : [];
      });
      const backtrack = (remaining: Match[], current: Schedule) => {
        iterations++;
        if (searchLimitReached()) return;
        if (!remaining.length) {
          if (allTeamsOnFinalDay && teams.some(t => (current[finalDateId]?.matches || []).filter(m => m.teamA === t.id || m.teamB === t.id).length !== 1)) return;
          for (const [dateId, day] of Object.entries(current)) {
            if (!day.matches.some(m => m.teamA === day.hostId || m.teamB === day.hostId)) return;
            if (allTeamsOnFinalDay && dateId === finalDateId) continue;
            if (day.matches.length < 2) return;
            const host = teams.find(t => t.id === day.hostId)!;
            for (const t of teams) {
              const count = day.matches.filter(m => m.teamA === t.id || m.teamB === t.id).length;
              if (count === 1 && isDistant(t.id, host.id)) return;
            }
          }
          const score = getScore(current);
          const dayCount = Object.keys(current).length;
          if (dayCount < bestDayCount || (dayCount === bestDayCount && score < bestScore)) {
            bestDayCount = dayCount;
            bestScore = score; bestSchedule = JSON.parse(JSON.stringify(current));
            if (firstSolutionAt === null) firstSolutionAt = performance.now();
          }
          return;
        }
        if (Object.keys(current).length > bestDayCount) return;
        let requiredExtraMatches = 0;
        for (const [dateId, day] of Object.entries(current)) {
          if (allTeamsOnFinalDay && dateId === finalDateId) continue;
          const count = (id: string) => day.matches.filter(m => m.teamA === id || m.teamB === id).length;
          const participants = teams.filter(t => count(t.id) > 0);
          const canReceive = (id?: string) => remaining.some(m => {
            if (id && m.teamA !== id && m.teamB !== id) return false;
            if (!availability[m.teamA]?.[dateId] || !availability[m.teamB]?.[dateId]) return false;
            if (day.matches.some(existing => existing.teamA === m.teamA && existing.teamB === m.teamB)) return false;
            return [m.teamA, m.teamB].every(teamId => {
              const c = count(teamId);
              if (c >= maxMatchesPerTeamPerDay) return false;
              const triples = Object.entries(current).filter(([d, entry]) => d !== dateId && entry.matches.filter(game => game.teamA === teamId || game.teamB === teamId).length === 3).length;
              return c !== 2 || triples < maxTripleDaysPerTeam;
            });
          });
          const slots = maxMatchesPerDay - day.matches.length;
          let minimumExtra = Infinity;
          // A later match may introduce a different host, so consider those too.
          for (const host of teams.filter(t => homeAvailability[t.id]?.[dateId] && availability[t.id]?.[dateId] && t.maxCapacity >= participants.length && (count(t.id) > 0 || canReceive(t.id)))) {
            const singles = participants.filter(t => count(t.id) === 1 && isDistant(t.id, host.id));
            if (singles.some(t => !canReceive(t.id))) continue;
            const needed = Math.max(day.matches.length < 2 ? 1 : 0, Math.ceil(singles.length / 2), count(host.id) ? 0 : 1);
            if (needed <= slots && (!needed || canReceive())) minimumExtra = Math.min(minimumExtra, needed);
          }
          if (!Number.isFinite(minimumExtra)) return;
          requiredExtraMatches += minimumExtra;
        }
        if (requiredExtraMatches > remaining.length) return;
        // An uncovered finale team must still have an opponent whose final game is also unassigned.
        if (allTeamsOnFinalDay) {
          const finalParticipants = new Set((current[finalDateId]?.matches || []).flatMap(m => [m.teamA, m.teamB]));
          for (const t of teams) {
            if (!finalParticipants.has(t.id) && !remaining.some(m => (m.teamA === t.id || m.teamB === t.id) && !finalParticipants.has(m.teamA) && !finalParticipants.has(m.teamB))) return;
          }
        }
        // Schedule the pairing with the fewest remaining eligible days first.
        let chosenIndex = -1;
        let chosenOptions: ReturnType<typeof placements> = [];
        let leastSlack = Infinity;
        const seen = new Set<string>();
        for (let i = 0; i < remaining.length; i++) {
          const match = remaining[i];
          const key = `${match.teamA}/${match.teamB}`;
          if (seen.has(key)) continue;
          seen.add(key);
          const copies = remaining.filter(m => m.teamA === match.teamA && m.teamB === match.teamB).length;
          const options = placements(match, current);
          const eligibleDates = new Set(options.map(option => option.dateId)).size;
          if (eligibleDates < copies) return;
          const slack = eligibleDates - copies;
          if (slack < leastSlack) { leastSlack = slack; chosenIndex = i; chosenOptions = options; }
        }
        if (chosenIndex < 0) return;
        const nextRemaining = remaining.filter((_, index) => index !== chosenIndex);
        const optionOrder = new Map(chosenOptions.map(option => [option.dateId, attempts === 1 ? 0 : random()]));
        chosenOptions.sort((a, b) => {
          // Cover the finale early, then consolidate games on already used days.
          const finalA = allTeamsOnFinalDay && a.dateId === finalDateId ? -1 : 0;
          const finalB = allTeamsOnFinalDay && b.dateId === finalDateId ? -1 : 0;
          return finalA - finalB || b.matches.length - a.matches.length || (optionOrder.get(a.dateId)! - optionOrder.get(b.dateId)!);
        });
        for (const option of chosenOptions) {
          if (searchLimitReached()) return;
          backtrack(nextRemaining, { ...current, [option.dateId]: { matches: option.matches, hostId: option.hostId } });
        }
      };
      do {
        attempts++;
        attemptStopped = false;
        attemptStartedAt = performance.now();
        attemptStartIteration = iterations;
        backtrack(attempts === 1 ? allMatches : shuffled(allMatches), {});
        // A fully explored attempt already covers all possibilities.
        if (!attemptStopped) break;
      } while (!searchStopped && performance.now() - startedAt < durationMs && (firstSolutionAt === null || performance.now() - firstSolutionAt < 1500));
      searchStopped = searchStopped || performance.now() - startedAt >= durationMs;
      result.searchStopped = searchStopped;
      onProgress({ iterations, attempts, elapsedMs: performance.now() - startedAt, bestDays: Number.isFinite(bestDayCount) ? bestDayCount : null });

      if (bestSchedule) {
        setSchedule(bestSchedule);
        const counts = dates.map(d => bestSchedule![d.id]?.matches.length || 0).filter(count => count > 0);
        const avg = counts.reduce((a, b) => a + b, 0) / Math.max(1, counts.length);
        const dev = counts.reduce((a, b) => a + Math.abs(b - avg), 0);
        
        let maxTeamMatches = 0;
        const homeGameDistribution: Record<string, number> = {};
        dates.forEach(d => {
          const day = bestSchedule![d.id];
          if (!day) return;
          const teamCounts: Record<string, number> = {};
          day.matches.forEach(m => {
            teamCounts[m.teamA] = (teamCounts[m.teamA] || 0) + 1;
            teamCounts[m.teamB] = (teamCounts[m.teamB] || 0) + 1;
          });
          Object.values(teamCounts).forEach(c => {
            if (c > maxTeamMatches) maxTeamMatches = c;
          });
          if (day.hostId) {
            homeGameDistribution[day.hostId] = (homeGameDistribution[day.hostId] || 0) + 1;
          }
        });

        const softDevs: string[] = [];
        if (allTeamsOnFinalDay) softDevs.push(`Gemeinsamer Saisonabschluss am ${formatDate(dates[dates.length - 1].value)}: Jedes Team spielt genau einmal. ${ignoredLateDates} spätere ausgewählte Termine werden ignoriert.`);
        teams.forEach(t => {
          const tripleCount = dates.filter(d => (bestSchedule![d.id]?.matches || []).filter(m => m.teamA === t.id || m.teamB === t.id).length === 3).length;
          softDevs.push(`${t.name}: ${tripleCount} von maximal ${maxTripleDaysPerTeam} Drei-Spiele-Tagen.`);
        });
        if (dev > 0) softDevs.push(`Der gefundene Plan verteilt die Spiele nicht exakt gleichmäßig.`);
        if (maxTeamMatches >= 3) softDevs.push(`Einige Teams spielen ${maxTeamMatches} Spiele an einem einzigen Tag.`);
        if (searchStopped) softDevs.push(`Der Suchraum war zu groß. Es wird die beste innerhalb der Sicherheitslimits gefundene Lösung angezeigt.`);
        softDevs.push(`Optimierung: Zuerst möglichst wenige Spieltage, danach bevorzugt mindestens drei Spiele je Spieltag und wenige Anreisetage pro Team. Eine globale Bestlösung wird nicht garantiert.`);
        softDevs.push(`Reguläre Spieltage: mindestens zwei Spiele; der Gastgeber spielt mit. Teams mit mehr als 100 km Luftlinie zum Gastgeber spielen mindestens zweimal. Der gemeinsame Saisonabschluss ist von diesen Mindestzahlen ausgenommen.`);
        softDevs.push(`Optimierung: Die Suche bevorzugt eine gleichmäßige Verteilung der Heimspieltage.`);

        setReport({
          matchesPerDay: counts,
          deviation: Number(dev.toFixed(2)),
          maxMatchesPerTeamPerDay: maxTeamMatches,
          homeGameDistribution,
          hardConstraintsSatisfied: true,
          softConstraintDeviations: softDevs
        });
      } else {
        setError(searchStopped ? "Suchlimit erreicht: Noch kein gültiger Plan gefunden. Versuche „Gründlich suchen“ oder exportiere die Eingaben zur Prüfung. Das beweist nicht, dass die Planung unmöglich ist." : "Kein gültiger Spielplan für diese Bedingungen. Prüfe Verfügbarkeit, Saisonabschluss und die erlaubten Drei-Spiele-Tage.");
      }

  }
  search();
  return result;
}
