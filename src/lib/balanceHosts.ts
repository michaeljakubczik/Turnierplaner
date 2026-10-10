import type { SeasonInput, Schedule } from './seasonSolver';
import { hasLongJourney } from './teamTravel';

// Assign whole match days to eligible hosts using min-cost matching.
// The first home day has priority, then each additional home day costs more.
export function balanceHosts(schedule: Schedule, input: SeasonInput, maxHomeDays = Object.keys(schedule).length): Schedule | null {
  const days = Object.entries(schedule);
  const n = input.teams.length;
  const source = 0, dayStart = 1, teamStart = dayStart + days.length, sink = teamStart + n;
  type Edge = { to: number; reverse: number; capacity: number; cost: number };
  const graph: Edge[][] = Array.from({ length: sink + 1 }, () => []);
  const addEdge = (from: number, to: number, cost: number) => {
    const forward = { to, reverse: graph[to].length, capacity: 1, cost };
    graph[from].push(forward);
    graph[to].push({ to: from, reverse: graph[from].length - 1, capacity: 0, cost: -cost });
    return forward;
  };
  const choices: { teamId: string; edge: Edge }[][] = [];
  days.forEach(([dateId, day], i) => {
    addEdge(source, dayStart + i, 0);
    const counts = new Map(input.teams.map(t => [t.id, day.matches.filter(m => m.teamA === t.id || m.teamB === t.id).length]));
    const participants = input.teams.filter(t => counts.get(t.id)! > 0);
    const finale = input.allTeamsOnFinalDay && dateId === input.finalDayCandidate?.id;
    choices[i] = [];
    input.teams.forEach((host, j) => {
      if (!counts.get(host.id) || !input.availability[host.id]?.[dateId] || !input.homeAvailability[host.id]?.[dateId] || host.maxCapacity < participants.length) return;
      if (!finale && participants.some(t => counts.get(t.id) === 1 && hasLongJourney(t.homePlace!, host.homePlace!))) return;
      choices[i].push({ teamId: host.id, edge: addEdge(dayStart + i, teamStart + j, 0) });
    });
  });
  for (let j = 0; j < n; j++) {
    for (let k = 0; k < Math.min(days.length, maxHomeDays); k++) addEdge(teamStart + j, sink, k === 0 ? -((days.length + 1) ** 3) : 2 * k + 1);
  }
  for (let flow = 0; flow < days.length; flow++) {
    const distance = Array(graph.length).fill(Infinity);
    const previous: { node: number; edge: number }[] = [];
    distance[source] = 0;
    for (let round = 0; round < graph.length - 1; round++) {
      let changed = false;
      graph.forEach((edges, node) => edges.forEach((edge, e) => {
        if (edge.capacity && distance[node] + edge.cost < distance[edge.to]) {
          distance[edge.to] = distance[node] + edge.cost;
          previous[edge.to] = { node, edge: e }; changed = true;
        }
      }));
      if (!changed) break;
    }
    if (!Number.isFinite(distance[sink])) return null;
    for (let node = sink; node !== source;) {
      const step = previous[node]; const edge = graph[step.node][step.edge];
      edge.capacity--; graph[node][edge.reverse].capacity++; node = step.node;
    }
  }
  return Object.fromEntries(days.map(([dateId, day], i) => [dateId, { ...day, hostId: choices[i].find(choice => choice.edge.capacity === 0)!.teamId }]));
}
