import assert from 'node:assert/strict';
import test from 'node:test';
import { solveSeason, type SeasonInput, type SolverResult, type SearchProgress } from './seasonSolver';
import { balanceHosts } from './balanceHosts';
import { hasLongJourney } from './teamTravel';

function fixture(n: number, days: number, mode: 1 | 2 = 1, finale = false, far = false): SeasonInput {
  const teams = Array.from({ length: n }, (_, i) => ({ id: `t${i}`, name: `Team ${i}`, maxCapacity: n,
    homePlace: { label: `Ort ${i}`, latitude: far && i >= n / 2 ? 53.55 : 52.4, longitude: 10.1 } }));
  const seasonDates = Array.from({ length: days }, (_, i) => ({ id: `d${i}`, value: new Date(Date.UTC(2027, 2, 1 + i)).toISOString().slice(0, 10) }));
  const availability = Object.fromEntries(teams.map(t => [t.id, Object.fromEntries(seasonDates.map(d => [d.id, true]))]));
  return { teams, seasonDates, availability, homeAvailability: structuredClone(availability), matchMode: mode,
    maxMatchesPerDay: 6, maxMatchesPerTeamPerDay: 3, maxTripleDaysPerTeam: 1,
    allTeamsOnFinalDay: finale, finalDayCandidate: finale ? seasonDates.at(-1) : undefined, ignoredLateDates: 0 };
}

function validate(input: SeasonInput, result: SolverResult) {
  assert.ok(result.schedule, result.error || 'Plan fehlt');
  const pairCounts = new Map<string, number>();
  for (const [dateId, day] of Object.entries(result.schedule)) {
    const host = input.teams.find(t => t.id === day.hostId)!;
    assert.ok(input.homeAvailability[host.id][dateId]);
    assert.ok(day.matches.some(m => m.teamA === host.id || m.teamB === host.id));
    const participants = new Set(day.matches.flatMap(m => [m.teamA, m.teamB]));
    assert.ok(participants.size <= host.maxCapacity);
    assert.ok(day.matches.length <= input.maxMatchesPerDay);
    const finale = input.allTeamsOnFinalDay && dateId === input.finalDayCandidate!.id;
    if (!finale) assert.ok(day.matches.length >= 2);
    const seen = new Set<string>();
    for (const m of day.matches) {
      assert.ok(input.availability[m.teamA][dateId] && input.availability[m.teamB][dateId]);
      const pair = [m.teamA, m.teamB].sort().join('/');
      assert.ok(!seen.has(pair)); seen.add(pair);
      pairCounts.set(pair, (pairCounts.get(pair) || 0) + 1);
    }
    for (const t of input.teams) {
      const count = day.matches.filter(m => m.teamA === t.id || m.teamB === t.id).length;
      assert.ok(count <= input.maxMatchesPerTeamPerDay);
      if (finale) assert.equal(count, 1);
      else if (count && hasLongJourney(t.homePlace!, host.homePlace!)) assert.ok(count >= 2);
    }
  }
  assert.equal(pairCounts.size, input.teams.length * (input.teams.length - 1) / 2);
  for (const count of pairCounts.values()) assert.equal(count, input.matchMode);
  for (const t of input.teams) {
    const triples = Object.values(result.schedule).filter(d => d.matches.filter(m => m.teamA === t.id || m.teamB === t.id).length === 3).length;
    assert.ok(triples <= input.maxTripleDaysPerTeam);
  }
  if (input.allTeamsOnFinalDay) assert.ok(result.schedule[input.finalDayCandidate!.id]);
}

test('45 games can use fewer than 50 available dates, with and without finale', () => {
  for (const finale of [false, true]) {
    const input = fixture(10, 50, 1, finale);
    const result = solveSeason(input, { durationMs: 3000, seed: 1 });
    validate(input, result);
    assert.ok(Object.keys(result.schedule!).length >= 8 && Object.keys(result.schedule!).length < 50);
  }
});

test('host can join after the first scheduled pairing', () => {
  const input = fixture(3, 2, 2);
  input.maxMatchesPerDay = 3;
  input.maxMatchesPerTeamPerDay = 2;
  input.homeAvailability.t0 = {}; input.homeAvailability.t1 = {};
  const result = solveSeason(input, { durationMs: 3000, seed: 1 });
  validate(input, result);
  assert.ok(Object.values(result.schedule!).every(day => day.hostId === 't2'));
});

test('long journeys require two games except on the one-game finale', () => {
  const input = fixture(6, 12, 2, true, true);
  validate(input, solveSeason(input, { durationMs: 3000, seed: 1 }));
});

test('missing locations and insufficient finale capacity produce precise errors', () => {
  const input = fixture(6, 12, 2, true);
  input.teams[0].homePlace = undefined;
  assert.match(solveSeason(input, { durationMs: 3000 }).error!, /Heimspielort/);
  input.teams[0].homePlace = input.teams[1].homePlace;
  input.maxMatchesPerDay = 2;
  assert.match(solveSeason(input, { durationMs: 3000 }).error!, /benötigen 3 Spiele/);
});

test('bounded difficult search tries different orders and reports progress', () => {
  const input = fixture(6, 50);
  input.maxMatchesPerDay = 2;
  input.maxMatchesPerTeamPerDay = 1;
  input.teams.forEach(t => { t.maxCapacity = 2; });
  const progress: SearchProgress[] = [];
  const result = solveSeason(input, { durationMs: 2300, seed: 12 }, p => progress.push(p));
  assert.equal(result.schedule, null);
  assert.equal(result.searchStopped, true);
  assert.ok(progress.at(-1)!.attempts >= 2);
  assert.ok(progress.at(-1)!.elapsedMs < 3000);
  assert.match(result.error!, /Suchlimit/);
});

 test('alternative plans are unique and each preserves every match and travel rule', () => {
  const input = fixture(4, 8, 2);
  const result = solveSeason(input, { durationMs: 3000, seed: 42 });
  assert.ok(result.alternatives.length > 1 && result.alternatives.length <= 12);
  const signatures = result.alternatives.map(plan => JSON.stringify(Object.entries(plan.schedule).sort(([a], [b]) => a.localeCompare(b)).map(([id, day]) => [id, day.hostId, day.matches.map(m => [m.teamA, m.teamB].sort().join('/')).sort()])));
  assert.equal(new Set(signatures).size, signatures.length);
  for (const plan of result.alternatives) validate(input, { ...result, ...plan });
});

test('whole-season host assignment gives four eligible teams one day each', () => {
  const input = fixture(4, 4);
  const schedule = Object.fromEntries(input.seasonDates.map(d => [d.id, { hostId: 't0', matches: [{ teamA: 't0', teamB: 't1' }, { teamA: 't2', teamB: 't3' }] }]));
  const balanced = balanceHosts(schedule, input)!;
  assert.ok(balanced);
  for (const team of input.teams) assert.equal(Object.values(balanced).filter(day => day.hostId === team.id).length, 1);
});

test('unavoidable zero-versus-four home distribution gives an actionable conflict', () => {
  const input = fixture(6, 50);
  input.maxMatchesPerDay = 2;
  input.homeAvailability = Object.fromEntries(input.teams.map(t => [t.id, t.id === 't0' ? input.availability.t0 : {}]));
  const result = solveSeason(input, { durationMs: 3000 });
  assert.equal(result.schedule, null);
  assert.match(result.error!, /Keine zulässige Heimspielverteilung/);
});
