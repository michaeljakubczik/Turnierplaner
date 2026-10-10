import type { Match } from './seasonSolver';

export function matchOrdinals(matches: Match[]) {
  const counts: Record<string, number> = {};
  return matches.map(match => ({
    a: counts[match.teamA] = (counts[match.teamA] || 0) + 1,
    b: counts[match.teamB] = (counts[match.teamB] || 0) + 1,
  }));
}

// Exact subset search: previous appearances depend only on the subset, not its order.
export function orderDayMatches(matches: Match[]): Match[] {
  if (matches.length > 10) throw new Error('Spieltag überschreitet das unterstützte Limit von 10 Spielen.');
  const size = 1 << matches.length;
  const costs = new Float64Array(size).fill(Infinity);
  const previous = new Int16Array(size).fill(-1);
  costs[0] = 0;
  for (let mask = 0; mask < size; mask++) {
    const counts: Record<string, number> = {};
    matches.forEach((match, i) => {
      if (mask & (1 << i)) {
        counts[match.teamA] = (counts[match.teamA] || 0) + 1;
        counts[match.teamB] = (counts[match.teamB] || 0) + 1;
      }
    });
    matches.forEach((match, i) => {
      if (mask & (1 << i)) return;
      const gap = Math.abs((counts[match.teamA] || 0) - (counts[match.teamB] || 0));
      // First minimize unequal encounters, then the size of their discrepancy.
      const cost = costs[mask] + (gap ? 100 + gap * gap : 0);
      const next = mask | (1 << i);
      if (cost < costs[next]) { costs[next] = cost; previous[next] = i; }
    });
  }
  const ordered: Match[] = [];
  for (let mask = size - 1; mask; ) {
    const i = previous[mask];
    ordered.push(matches[i]); mask ^= 1 << i;
  }
  return ordered.reverse();
}
