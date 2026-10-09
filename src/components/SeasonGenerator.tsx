import React, { useState, useMemo, useEffect, useRef } from 'react';
import { 
  Plus, 
  Trash2, 
  Calendar as CalendarIcon, 
  Users, 
  Settings, 
  Play, 
  CheckCircle2, 
  AlertCircle,
  Info,
  Trophy,
  BarChart3,
  Download,
  ArrowLeft,
  RotateCcw,
  Save,
  RefreshCw
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import * as XLSX from 'xlsx';
import { calendarPeriods, periodMarks, hasVacationData, regionNames, type Region } from '../lib/seasonCalendar';
import { distanceKm, hasLongJourney, findHomePlaces, type HomePlace } from '../lib/teamTravel';
import { usePersistentState } from '../hooks/usePersistentState';

// --- Types ---

type Team = {
  id: string;
  name: string;
  maxCapacity: number;
  homeLocationQuery?: string;
  homePlace?: HomePlace;
};

type MatchMode = 1 | 2 | 3 | 4;

type DateEntry = {
  id: string;
  value: string;
};

type Availability = Record<string, Record<string, boolean>>; // teamId -> dateId -> isAvailable
type HomeAvailability = Record<string, Record<string, boolean>>; // teamId -> dateId -> isHomePossible

type Match = {
  teamA: string;
  teamB: string;
};

type ScheduleDay = {
  matches: Match[];
  hostId: string;
};

type Schedule = Record<string, ScheduleDay>; // dateId -> day info

type SeasonDraft = {
  seasonYear?: number;
  allTeamsOnFinalDay?: boolean;
  maxTripleDaysPerTeam?: number;
  teams: Team[];
  dates: DateEntry[];
  availability: Availability;
  homeAvailability: HomeAvailability;
  matchMode: MatchMode;
  maxMatchesPerDay: number;
  maxMatchesPerTeamPerDay: number;
};

type ValidationReport = {
  matchesPerDay: number[];
  deviation: number;
  maxMatchesPerTeamPerDay: number;
  homeGameDistribution: Record<string, number>;
  hardConstraintsSatisfied: boolean;
  softConstraintDeviations: string[];
};


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

interface SeasonGeneratorProps {
  onBack: () => void;
}

export default function SeasonGenerator({ onBack }: SeasonGeneratorProps) {
  const initialDraft: SeasonDraft = {
    teams: [
      { id: '1', name: 'Team A', maxCapacity: 4 },
      { id: '2', name: 'Team B', maxCapacity: 4 },
      { id: '3', name: 'Team C', maxCapacity: 4 },
    ],
    dates: [
      { id: 'd1', value: '2026-06-01' },
      { id: 'd2', value: '2026-06-02' }
    ],
    availability: {
      '1': { 'd1': false, 'd2': false },
      '2': { 'd1': false, 'd2': false },
      '3': { 'd1': false, 'd2': false },
    },
    homeAvailability: {
      '1': { 'd1': false, 'd2': false },
      '2': { 'd1': false, 'd2': false },
      '3': { 'd1': false, 'd2': false },
    },
    seasonYear: new Date().getFullYear(),
    allTeamsOnFinalDay: false,
    maxTripleDaysPerTeam: 1,
    matchMode: 2,
    maxMatchesPerDay: 3,
    maxMatchesPerTeamPerDay: 2
  };

  const [draft, setDraft, resetDraft, isSaving] = usePersistentState<SeasonDraft>(
    'matchmaster_season_draft_v2',
    initialDraft
  );

  const [placeChoices, setPlaceChoices] = useState<Record<string, HomePlace[]>>({});
  const [placeMessages, setPlaceMessages] = useState<Record<string, string>>({});
  const placeRequests = useRef<Record<string, AbortController>>({});
  useEffect(() => () => (Object.values(placeRequests.current) as AbortController[]).forEach(request => request.abort()), []);
  const updateHomeLocation = (id: string, query: string) => {
    placeRequests.current[id]?.abort();
    setPlaceChoices(prev => ({ ...prev, [id]: [] }));
    setPlaceMessages(prev => ({ ...prev, [id]: '' }));
    setDraft(prev => ({ ...prev, teams: prev.teams.map(t => t.id === id ? { ...t, homeLocationQuery: query, homePlace: undefined } : t) }));
  };
  const chooseHomePlace = (id: string, place: HomePlace) => {
    setDraft(prev => ({ ...prev, teams: prev.teams.map(t => t.id === id ? { ...t, homeLocationQuery: place.label, homePlace: place } : t) }));
    setPlaceChoices(prev => ({ ...prev, [id]: [] }));
    setPlaceMessages(prev => ({ ...prev, [id]: '' }));
  };
  const resolveHomeLocation = async (team: Team) => {
    const query = team.homeLocationQuery?.trim();
    if (!query || team.homePlace) return;
    placeRequests.current[team.id]?.abort();
    const request = new AbortController();
    placeRequests.current[team.id] = request;
    setPlaceMessages(prev => ({ ...prev, [team.id]: 'Ort wird gesucht …' }));
    try {
      const choices = await findHomePlaces(query, request.signal);
      if (request.signal.aborted) return;
      if (choices.length === 1) chooseHomePlace(team.id, choices[0]);
      else {
        setPlaceChoices(prev => ({ ...prev, [team.id]: choices }));
        setPlaceMessages(prev => ({ ...prev, [team.id]: choices.length ? 'Bitte den passenden Ort auswählen:' : 'Kein Ort gefunden. Bitte Ort mit Postleitzahl oder Adresse eingeben.' }));
      }
    } catch (error) {
      if (!request.signal.aborted) setPlaceMessages(prev => ({ ...prev, [team.id]: error instanceof Error ? error.message : 'Ortssuche fehlgeschlagen.' }));
    }
  };

  const handleReset = () => {
    (Object.values(placeRequests.current) as AbortController[]).forEach(request => request.abort());
    setPlaceChoices({}); setPlaceMessages({});
    resetDraft();
    setSchedule(null);
    setReport(null);
    setError(null);
  };

  const { teams, availability, homeAvailability, matchMode, maxMatchesPerDay } = draft;
  const dates = useMemo(() => [...draft.dates].sort((a, b) => a.value.localeCompare(b.value)), [draft.dates]);
  const maxMatchesPerTeamPerDay = Math.min(3, draft.maxMatchesPerTeamPerDay);
  const allTeamsOnFinalDay = draft.allTeamsOnFinalDay ?? false;
  const maxTripleDaysPerTeam = draft.maxTripleDaysPerTeam ?? 1;
  const finalDayCandidate = allTeamsOnFinalDay ? [...dates].reverse().find(date => teams.every(team => availability[team.id]?.[date.id])) : undefined;
  const seasonDates = allTeamsOnFinalDay && finalDayCandidate ? dates.filter(date => date.value <= finalDayCandidate.value) : dates;
  const ignoredLateDates = dates.length - seasonDates.length;

  const seasonYear = draft.seasonYear ?? (Number(dates[0]?.value.slice(0, 4)) || new Date().getFullYear());
  const [calendarTeamId, setCalendarTeamId] = useState('');
  const [holidayRegions, setHolidayRegions] = useState<Region[]>([]);
  const [availabilityUndo, setAvailabilityUndo] = useState<{ available: Availability; home: HomeAvailability; clearedAvailable: Availability; clearedHome: HomeAvailability } | null>(null);
  const hasAvailabilityEntries = Object.values(availability).some(days => Object.values(days).some(Boolean)) || Object.values(homeAvailability).some(days => Object.values(days).some(Boolean));
  const clearAvailability = () => {
    const clearedAvailable: Availability = {};
    const clearedHome: HomeAvailability = {};
    setAvailabilityUndo({ available: availability, home: homeAvailability, clearedAvailable, clearedHome });
    setDraft(prev => ({ ...prev, availability: clearedAvailable, homeAvailability: clearedHome }));
  };
  const undoClearAvailability = () => {
    if (!availabilityUndo) return;
    setDraft(prev => ({ ...prev, availability: availabilityUndo.available, homeAvailability: availabilityUndo.home }));
    setAvailabilityUndo(null);
  };
  useEffect(() => {
    if (availabilityUndo && (draft.availability !== availabilityUndo.clearedAvailable || draft.homeAvailability !== availabilityUndo.clearedHome)) setAvailabilityUndo(null);
  }, [draft.availability, draft.homeAvailability, availabilityUndo]);

  const holidayPeriods = useMemo(() => Object.fromEntries(holidayRegions.map(region => [region, calendarPeriods(seasonYear, region)])) as Partial<Record<Region, ReturnType<typeof calendarPeriods>>>, [seasonYear, holidayRegions]);
  const holidayColors: Record<Region, string> = { HB: '#fb923c', HH: '#c084fc', NI: '#facc15' };

  const activeTeamId = teams.some(t => t.id === calendarTeamId) ? calendarTeamId : teams[0]?.id;
  const weekends = useMemo(() => Array.from({ length: 8 }, (_, i) => {
    const month = i + 2;
    const days: DateEntry[] = [];
    for (let day = 1; day <= new Date(seasonYear, month + 1, 0).getDate(); day++) {
      const date = new Date(seasonYear, month, day);
      if (date.getDay() === 0 || date.getDay() === 6) {
        const value = `${seasonYear}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        days.push({ id: draft.dates.find(d => d.value === value)?.id ?? value, value });
      }
    }
    return { name: new Date(seasonYear, month, 1).toLocaleDateString('de-DE', { month: 'long' }), days };
  }), [seasonYear, draft.dates]);
  const selectCalendarDay = (date: DateEntry, kind: 'date' | 'available' | 'home') => {
    setDraft(prev => {
      const exists = prev.dates.some(d => d.id === date.id);
      if (kind === 'date') return { ...prev, dates: exists ? prev.dates.filter(d => d.id !== date.id) : [...prev.dates, date] };
      const key = kind === 'home' ? 'homeAvailability' : 'availability';
      return { ...prev, dates: exists ? prev.dates : [...prev.dates, date],
        [key]: { ...prev[key], [activeTeamId]: { ...prev[key][activeTeamId], [date.id]: !prev[key][activeTeamId]?.[date.id] } },
        ...(kind === 'home' && !prev.homeAvailability[activeTeamId]?.[date.id] ? { availability: { ...prev.availability, [activeTeamId]: { ...prev.availability[activeTeamId], [date.id]: true } } } : {}) };
    });
  };

  const [isGenerating, setIsGenerating] = useState(false);
  const [schedule, setSchedule] = useState<Schedule | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<ValidationReport | null>(null);

  useEffect(() => { setSchedule(null); setReport(null); setError(null); }, [draft]);

  const addTeam = () => {
    const newId = Math.random().toString(36).substr(2, 9);
    const newTeam = { id: newId, name: `Team ${String.fromCharCode(65 + teams.length)}`, maxCapacity: 4 };
    setDraft(prev => ({
      ...prev,
      teams: [...prev.teams, newTeam],
      availability: {
        ...prev.availability,
        [newId]: prev.dates.reduce((acc, date) => ({ ...acc, [date.id]: false }), {})
      },
      homeAvailability: {
        ...prev.homeAvailability,
        [newId]: prev.dates.reduce((acc, date) => ({ ...acc, [date.id]: false }), {})
      }
    }));
  };

  const removeTeam = (id: string) => {
    if (teams.length <= 2) return;
    placeRequests.current[id]?.abort();
    setDraft(prev => {
      const newTeams = prev.teams.filter(t => t.id !== id);
      const newAvail = { ...prev.availability };
      const newHomeAvail = { ...prev.homeAvailability };
      delete newAvail[id];
      delete newHomeAvail[id];
      return { ...prev, teams: newTeams, availability: newAvail, homeAvailability: newHomeAvail };
    });
  };

  const updateTeamName = (id: string, name: string) => {
    setDraft(prev => ({
      ...prev,
      teams: prev.teams.map(t => t.id === id ? { ...t, name } : t)
    }));
  };

  const updateTeamCapacity = (id: string, capacity: number) => {
    setDraft(prev => ({
      ...prev,
      teams: prev.teams.map(t => t.id === id ? { ...t, maxCapacity: capacity } : t)
    }));
  };

  const addDate = () => {
    const lastDateValue = dates.length > 0 ? new Date(dates[dates.length - 1].value) : new Date();
    lastDateValue.setDate(lastDateValue.getDate() + 1);
    const dateStr = lastDateValue.toISOString().split('T')[0];
    const newId = Math.random().toString(36).substr(2, 9);
    
    setDraft(prev => {
      const newDates = [...prev.dates, { id: newId, value: dateStr }];
      const newAvail = { ...prev.availability };
      const newHomeAvail = { ...prev.homeAvailability };
      prev.teams.forEach(t => {
        if (!newAvail[t.id]) newAvail[t.id] = {};
        newAvail[t.id][newId] = false;
        if (!newHomeAvail[t.id]) newHomeAvail[t.id] = {};
        newHomeAvail[t.id][newId] = false;
      });
      return { ...prev, dates: newDates, availability: newAvail, homeAvailability: newHomeAvail };
    });
  };

  const removeDate = (id: string) => {
    if (dates.length <= 1) return;
    setDraft(prev => {
      const newDates = prev.dates.filter(d => d.id !== id);
      const newAvail = { ...prev.availability };
      const newHomeAvail = { ...prev.homeAvailability };
      prev.teams.forEach(t => {
        if (newAvail[t.id]) {
          const teamAvail = { ...newAvail[t.id] };
          delete teamAvail[id];
          newAvail[t.id] = teamAvail;
        }
        if (newHomeAvail[t.id]) {
          const teamHomeAvail = { ...newHomeAvail[t.id] };
          delete teamHomeAvail[id];
          newHomeAvail[t.id] = teamHomeAvail;
        }
      });
      return { ...prev, dates: newDates, availability: newAvail, homeAvailability: newHomeAvail };
    });
  };

  const toggleAvailability = (teamId: string, dateId: string) => {
    setDraft(prev => ({
      ...prev,
      availability: {
        ...prev.availability,
        [teamId]: {
          ...prev.availability[teamId],
          [dateId]: !prev.availability[teamId]?.[dateId]
        }
      }
    }));
  };

  const toggleHomeAvailability = (teamId: string, dateId: string) => {
    setDraft(prev => ({
      ...prev,
      homeAvailability: {
        ...prev.homeAvailability,
        [teamId]: {
          ...prev.homeAvailability[teamId],
          [dateId]: !prev.homeAvailability[teamId]?.[dateId]
        }
      },
      ...(!prev.homeAvailability[teamId]?.[dateId] ? { availability: { ...prev.availability, [teamId]: { ...prev.availability[teamId], [dateId]: true } } } : {})
    }));
  };

  const setMatchMode = (mode: MatchMode) => {
    setDraft(prev => ({ ...prev, matchMode: mode }));
  };

  const setMaxMatchesPerDay = (val: number) => {
    setDraft(prev => ({ ...prev, maxMatchesPerDay: val }));
  };

  const setMaxMatchesPerTeamPerDay = (val: number) => {
    setDraft(prev => ({ ...prev, maxMatchesPerTeamPerDay: val }));
  };

  const solve = () => {
    setIsGenerating(true);
    setError(null);
    setSchedule(null);
    setReport(null);

    setTimeout(() => {
      if (allTeamsOnFinalDay && !finalDayCandidate) {
        setError('Kein gemeinsamer Saisonabschluss möglich: Es gibt keinen ausgewählten Termin, an dem alle Teams verfügbar sind.'); setIsGenerating(false); return;
      }
      const missingPlaces = teams.filter(t => !t.homePlace);
      if (missingPlaces.length) {
        setError(`Bitte zuerst den Heimspielort für ${missingPlaces.map(t => t.name).join(', ')} eingeben und einen gefundenen Ort auswählen. Erst dann kann die 100-km-Regel geprüft werden.`); setIsGenerating(false); return;
      }
      if (maxMatchesPerDay < 2 && !(allTeamsOnFinalDay && teams.length === 2 && matchMode === 1)) {
        setError('Reguläre Spieltage benötigen mindestens zwei Spiele. Erhöhe „Max. Spiele pro Tag“ auf mindestens 2.'); setIsGenerating(false); return;
      }
      const dates = seasonDates;
      if (!dates.length || dates.some(d => !/^\d{4}-\d{2}-\d{2}$/.test(d.value)) || new Set(dates.map(d => d.value)).size !== dates.length) {
        setError('Bitte mindestens einen Spieltag auswählen. Termine müssen gültig und eindeutig sein.'); setIsGenerating(false); return;
      }
      const finalDateId = dates[dates.length - 1].id;
      if (allTeamsOnFinalDay && teams.length % 2 !== 0) {
        setError('Gemeinsamer Saisonabschluss mit genau einem Spiel pro Team erfordert eine gerade Anzahl an Teams.'); setIsGenerating(false); return;
      }
      if (allTeamsOnFinalDay) {
        const finalLabel = formatDate(dates[dates.length - 1].value);
        const requiredMatches = teams.length / 2;
        if (maxMatchesPerDay < requiredMatches) {
          setError(`Saisonabschluss am ${finalLabel}: ${teams.length} Teams benötigen ${requiredMatches} Spiele. „Max. Spiele pro Tag“ ist auf ${maxMatchesPerDay} eingestellt. Erhöhe das Limit auf mindestens ${requiredMatches}.`); setIsGenerating(false); return;
        }
        const hosts = teams.filter(t => homeAvailability[t.id]?.[finalDateId]);
        if (!hosts.length) {
          setError(`Saisonabschluss am ${finalLabel}: Kein Team hat an diesem Termin „Heimspiel möglich“ (H) aktiviert.`); setIsGenerating(false); return;
        }
        if (!hosts.some(t => t.maxCapacity >= teams.length)) {
          setError(`Saisonabschluss am ${finalLabel}: Ein Gastgeber muss ${teams.length} Teams aufnehmen können. Die größte eingetragene Gastgeberkapazität an diesem Termin beträgt ${Math.max(...hosts.map(t => t.maxCapacity))}.`); setIsGenerating(false); return;
        }
      }
      const allMatches = generatePairings(teams, matchMode);
      const totalMatches = allMatches.length;

      if (totalMatches > dates.length * maxMatchesPerDay) {
        setError(`Unmöglich: Die Gesamtanzahl der Spiele (${totalMatches}) übersteigt die maximale Kapazität von ${dates.length * maxMatchesPerDay} (${dates.length} Tage * ${maxMatchesPerDay} Spiele/Tag). Füge mehr Daten hinzu oder reduziere den Spielmodus.`);
        setIsGenerating(false);
        return;
      }

      let bestSchedule: Schedule | null = null;
      let bestScore = Infinity;
      let bestDayCount = Infinity;
      let iterations = 0;
      const MAX_ITERATIONS = 200000;

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
      let searchStopped = false;
      let firstSolutionIteration: number | null = null;
      const searchLimitReached = () => {
        const stop = iterations > MAX_ITERATIONS || performance.now() - startedAt > 6000;
        if (stop) searchStopped = true;
        return stop || (firstSolutionIteration !== null && iterations - firstSolutionIteration > 3000);
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
        const hosts = teams.filter(t => participants.has(t.id) && homeAvailability[t.id]?.[date.id] && t.maxCapacity >= participants.size);
        if (!hosts.length) return [];
        const countInMatches = (id: string) => matches.filter(m => m.teamA === id || m.teamB === id).length;
        const isFinale = allTeamsOnFinalDay && date.id === finalDateId;
        const slotsLeft = maxMatchesPerDay - matches.length;
        const viableHosts = hosts.filter(host => {
          if (isFinale) return true;
          const distantSingles = teams.filter(t => participants.has(t.id) && hasLongJourney(t.homePlace!, host.homePlace!) && countInMatches(t.id) < 2);
          // An incomplete day can still switch to a host added by a later match.
          return slotsLeft > 0 || distantSingles.length === 0;
        });
        const deficit = (host: Team) => teams.filter(t => participants.has(t.id) && hasLongJourney(t.homePlace!, host.homePlace!) && countInMatches(t.id) < 2).length;
        viableHosts.sort((a, b) => deficit(a) - deficit(b) || Object.entries(current).filter(([d, entry]) => d !== date.id && entry.hostId === a.id).length - Object.entries(current).filter(([d, entry]) => d !== date.id && entry.hostId === b.id).length);
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
            if (allTeamsOnFinalDay && dateId === finalDateId) continue;
            if (day.matches.length < 2) return;
            const host = teams.find(t => t.id === day.hostId)!;
            for (const t of teams) {
              const count = day.matches.filter(m => m.teamA === t.id || m.teamB === t.id).length;
              if (count === 1 && hasLongJourney(t.homePlace!, host.homePlace!)) return;
            }
          }
          const score = getScore(current);
          const dayCount = Object.keys(current).length;
          if (dayCount < bestDayCount || (dayCount === bestDayCount && score < bestScore)) {
            bestDayCount = dayCount;
            bestScore = score; bestSchedule = JSON.parse(JSON.stringify(current));
            if (firstSolutionIteration === null) firstSolutionIteration = iterations;
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
            const singles = participants.filter(t => count(t.id) === 1 && hasLongJourney(t.homePlace!, host.homePlace!));
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
        chosenOptions.sort((a, b) => {
          // Cover the finale early, then consolidate games on already used days.
          const finalA = allTeamsOnFinalDay && a.dateId === finalDateId ? -1 : 0;
          const finalB = allTeamsOnFinalDay && b.dateId === finalDateId ? -1 : 0;
          return finalA - finalB || b.matches.length - a.matches.length;
        });
        for (const option of chosenOptions) {
          if (searchLimitReached()) return;
          backtrack(nextRemaining, { ...current, [option.dateId]: { matches: option.matches, hostId: option.hostId } });
        }
      };
      backtrack(allMatches, {});

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
        setError(searchStopped ? "Suchlimit erreicht: Noch kein gültiger Plan gefunden. Das beweist nicht, dass die Planung unmöglich ist." : "Kein gültiger Spielplan für diese Bedingungen. Prüfe Verfügbarkeit, Saisonabschluss und die erlaubten Drei-Spiele-Tage.");
      }
      setIsGenerating(false);
    }, 800);
  };

  const getTeamName = (id: string) => teams.find(t => t.id === id)?.name || id;

  const downloadExcel = () => {
    if (!schedule) return;

    const data = seasonDates.flatMap(dateEntry => {
      const day = schedule[dateEntry.id];
      if (!day) return [];
      return day.matches.map((match, index) => ({
        'Datum': dateEntry.value,
        'Wochentag': new Date(dateEntry.value).toLocaleDateString('de-DE', { weekday: 'long' }),
        'Austragungsort (Heim)': getTeamName(day.hostId),
        'Spiel #': index + 1,
        'Team A': getTeamName(match.teamA),
        'Team B': getTeamName(match.teamB)
      }));
    });

    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Spielplan");
    
    const max_width = data.reduce((w, r) => Math.max(w, r['Team A'].length, r['Team B'].length), 10);
    worksheet["!cols"] = [
      { wch: 12 }, { wch: 12 }, { wch: 8 }, { wch: max_width + 5 }, { wch: max_width + 5 },
    ];

    XLSX.writeFile(workbook, "Turnier_Spielplan.xlsx");
  };

  return (
    <div className="min-h-screen bg-[#1C1F2A] text-white font-sans selection:bg-blue-500 selection:text-white">
      <header className="border-b border-white/10 p-4 sm:p-6 lg:p-10 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-black/20 backdrop-blur-md sticky top-0 z-50">
        <div className="flex items-center gap-3 sm:gap-4 w-full sm:w-auto">
          <button onClick={onBack} className="p-2 hover:bg-white/10 rounded-full transition-colors">
            <ArrowLeft size={20} className="sm:w-6 sm:h-6" />
          </button>
          <div className="truncate">
            <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold tracking-tight uppercase truncate">
              <i>Saison</i> <span className="text-blue-500">Planer</span>
            </h1>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3 sm:gap-4 w-full sm:w-auto justify-end">
          <AnimatePresence>
            {isSaving && (
              <motion.div 
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0 }}
                className="flex items-center gap-2 text-[10px] sm:text-xs text-gray-400 font-mono uppercase tracking-widest"
              >
                <RefreshCw size={10} className="animate-spin sm:w-3 sm:h-3" />
                <span className="hidden xs:inline">Speichere Entwurf...</span>
                <span className="xs:hidden">Speichern...</span>
              </motion.div>
            )}
          </AnimatePresence>
          <button 
            onClick={handleReset}
            className="flex items-center gap-2 px-3 sm:px-4 py-1.5 sm:py-2 text-[10px] sm:text-xs font-bold uppercase tracking-widest bg-red-500/10 text-red-400 border border-red-500/20 rounded-full hover:bg-red-500/20 transition-all"
          >
            <RotateCcw size={12} className="sm:w-3.5 sm:h-3.5" /> <span className="hidden xs:inline">Zurücksetzen</span><span className="xs:hidden">Reset</span>
          </button>
        </div>
      </header>

      <main className="p-4 sm:p-6 lg:p-10 max-w-7xl mx-auto space-y-10">
        <fieldset disabled={isGenerating} className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Spielmodus */}
          <section className="space-y-6 glass-card p-6 rounded-3xl h-full">
            <div className="space-y-4">
              <div className="flex items-center gap-2 border-b border-white/10 pb-2">
                <Settings size={20} className="text-blue-400" />
                <h2 className="font-bold text-xl">Spielmodus</h2>
              </div>
              <div className="flex gap-2">
                {[1, 2, 3, 4].map((mode) => (
                  <button key={mode} onClick={() => setMatchMode(mode as MatchMode)} className={`flex-1 py-3 rounded-xl border transition-all font-bold text-xs uppercase tracking-widest ${matchMode === mode ? 'bg-blue-600 border-blue-600 text-white shadow-lg shadow-blue-600/20' : 'border-white/10 hover:bg-white/5 text-gray-400'}`}>
                    {mode}x
                  </button>
                ))}
              </div>
              <p className="text-xs text-gray-400">Reguläre Spieltage: mindestens zwei Spiele, bevorzugt drei oder mehr. Der Planer bevorzugt möglichst wenige Spieltage.</p>
              <p className="text-[10px] opacity-50 font-mono uppercase">Jedes Team spielt {matchMode}-mal gegen jedes andere Team.</p>
            </div>

              <div className="space-y-4">
                <div className="flex items-center gap-2 border-b border-white/10 pb-2">
                  <BarChart3 size={20} className="text-blue-400" />
                  <h2 className="font-bold text-xl">Max. Spiele pro Tag</h2>
                </div>
                <div className="flex items-center gap-4">
                  <input type="range" min="1" max="10" value={maxMatchesPerDay} onChange={(e) => setMaxMatchesPerDay(parseInt(e.target.value))} className="flex-1 accent-blue-500 cursor-pointer" />
                  <span className="font-mono font-bold text-lg w-8 text-center text-blue-400">{maxMatchesPerDay}</span>
                </div>
                <p className="text-[10px] opacity-50 font-mono uppercase">Maximale Anzahl an Spielen pro Turniertag.</p>
              </div>

              <div className="space-y-4">
                <div className="flex items-center gap-2 border-b border-white/10 pb-2">
                  <BarChart3 size={20} className="text-blue-400" />
                  <h2 className="font-bold text-xl">Max. Spiele pro Team/Tag</h2>
                </div>
                <div className="flex items-center gap-4">
                  <input type="range" min="1" max="3" value={maxMatchesPerTeamPerDay} onChange={(e) => setMaxMatchesPerTeamPerDay(parseInt(e.target.value))} className="flex-1 accent-blue-500 cursor-pointer" />
                  <span className="font-mono font-bold text-lg w-8 text-center text-blue-400">{maxMatchesPerTeamPerDay}</span>
                </div>
                <p className="text-[10px] opacity-50 font-mono uppercase">Maximale Anzahl an Spielen pro Team an einem Tag.</p>
              </div>
            <label className="flex gap-3 items-start text-sm"><input type="checkbox" checked={allTeamsOnFinalDay} onChange={e => setDraft(prev => ({ ...prev, allTeamsOnFinalDay: e.target.checked }))} /><span>Alle Teams am letzten Spieltag: genau ein Spiel pro Team<br /><span className="text-xs text-gray-400">Ausgeschaltet: Teilnahme am Saisonabschluss optional.</span></span></label>
            <label className="block text-sm">Max. Drei-Spiele-Tage pro Team und Saison
              <input aria-label="Maximale Drei-Spiele-Tage" type="number" min="0" max="100" value={maxTripleDaysPerTeam} onChange={e => setDraft(prev => ({ ...prev, maxTripleDaysPerTeam: Math.max(0, Math.min(100, Number(e.target.value) || 0)) }))} className="ml-3 w-16 bg-white/10 rounded p-2" />
              <span className="block text-xs text-gray-400 mt-2">0 = höchstens zwei Spiele pro Tag. Drei Spiele sind nur bei Tageslimit 3 erlaubt.</span>
            </label>
          </section>

          {/* Teams */}
          <section className="space-y-4 glass-card p-6 rounded-3xl h-full">
            <div className="flex items-center justify-between border-b border-white/10 pb-2">
              <div className="flex items-center gap-2">
                <Users size={20} className="text-blue-400" />
                <h2 className="font-bold text-xl">Teams</h2>
              </div>
              <button onClick={addTeam} className="text-xs font-bold uppercase tracking-widest hover:text-blue-400 flex items-center gap-1 transition-colors">
                <Plus size={14} /> Team hinzufügen
              </button>
            </div>
            <div className="space-y-3">
              <AnimatePresence initial={false}>
                {teams.map((team, index) => (
                  <motion.div key={team.id} initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }} className="space-y-2 group">
                    <div className="flex items-center gap-3">
                    <span className="font-mono text-[10px] opacity-40 w-6">{String.fromCharCode(65 + index)}</span>
                    <input aria-label={`Name Team ${index + 1}`} type="text" value={team.name} onChange={(e) => updateTeamName(team.id, e.target.value)} className="flex-1 bg-transparent border-b border-white/10 py-1 focus:border-blue-500 outline-none transition-colors" />
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] opacity-40 font-mono">MAX:</span>
                      <input 
                        type="number" 
                        min="2" 
                        max="10" 
                        value={team.maxCapacity} 
                        onChange={(e) => updateTeamCapacity(team.id, parseInt(e.target.value))} 
                        className="w-10 bg-white/5 border border-white/10 rounded text-center text-xs py-0.5 focus:border-blue-500 outline-none"
                      />
                    </div>
                    <button onClick={() => removeTeam(team.id)} className="opacity-0 group-hover:opacity-100 focus:opacity-100 text-red-400 hover:text-red-500 transition-all p-1 outline-none">
                      <Trash2 size={14} />
                    </button>
                    </div>
                    <label className="block text-xs text-gray-400">Heimspielort
                      <input aria-label={`Heimspielort ${team.name}`} type="text" placeholder="Ort, PLZ oder Hallenadresse" value={team.homeLocationQuery || ''} onChange={e => updateHomeLocation(team.id, e.target.value)} onBlur={() => resolveHomeLocation(team)} className="block mt-1 w-full bg-white/5 border border-white/10 rounded-lg p-2 text-white" />
                    </label>
                    {team.homePlace && <p className="text-xs text-emerald-400">✓ {team.homePlace.label}</p>}
                    {placeMessages[team.id] && <p role="status" className="text-xs text-amber-300">{placeMessages[team.id]}</p>}
                    {placeChoices[team.id]?.map(place => <button key={place.label} onClick={() => chooseHomePlace(team.id, place)} className="block w-full text-left text-xs bg-white/5 hover:bg-blue-500/20 rounded p-2">{place.label}</button>)}
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
            <p className="text-[10px] opacity-50 font-mono uppercase pt-2 border-t border-white/5">
              MAX = Maximale Anzahl an Teams bei Heimspielen (Hallenkapazität).
              <span className="block mt-2 normal-case font-sans">Ortssuche: Photon / © OpenStreetMap-Mitwirkende. Die Entfernungen werden lokal als Luftlinie berechnet. Über 100 km: mindestens zwei Spiele pro Gastteam; am gemeinsamen Saisonabschluss genau eines.</span>
            </p>
          </section>

          <section className="lg:col-span-2 glass-card p-4 rounded-3xl space-y-3">
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="font-bold text-xl">Team-Verfügbarkeit</h2>
              <label>Jahr <select aria-label="Saisonjahr" value={seasonYear} onChange={e => setDraft(prev => ({ ...prev, seasonYear: Number(e.target.value), dates: [], availability: {}, homeAvailability: {} }))} className="bg-[#1C1F2A] border border-white/20 rounded p-1 ml-2">{Array.from({ length: 12 }, (_, i) => new Date().getFullYear() - 1 + i).concat(seasonYear).filter((v, i, a) => a.indexOf(v) === i).sort().map(y => <option key={y}>{y}</option>)}</select></label>
              <label>Team <select aria-label="Kalenderteam" value={activeTeamId} onChange={e => setCalendarTeamId(e.target.value)} className="bg-[#1C1F2A] border border-white/20 rounded p-1 ml-2">{teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
              <span className="text-xs text-gray-400">{dates.length} mögliche Termine ausgewählt</span>

            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-2">
              {weekends.map(month => <div key={month.name} className="bg-black/20 rounded-xl p-2">
                <h3 className="font-bold text-sm mb-2">{month.name}</h3>
                <div className="grid grid-cols-2 gap-1">
                  {month.days.map(date => {
                    const selected = dates.some(d => d.id === date.id);
                    const marks = holidayRegions.flatMap(region => periodMarks(date.value, holidayPeriods[region] || []).map(mark => ({ ...mark, region })));
                    const isHoliday = marks.some(mark => mark.kind === 'holiday');
                    const isBoundary = marks.some(mark => mark.kind === 'vacation' && !!mark.boundary);
                    const backgrounds = [...new Set(marks.filter(mark => mark.kind === 'vacation').map(mark => holidayColors[mark.region] + (isBoundary ? '55' : '25')))];
                    const background = isHoliday ? '#ef444450' : backgrounds.length > 1 ? `linear-gradient(90deg, ${backgrounds.map((color, i) => `${color} ${i * 100 / backgrounds.length}%, ${color} ${(i + 1) * 100 / backgrounds.length}%`).join(', ')})` : backgrounds[0];
                    const description = marks.map(mark => `${regionNames[mark.region]}: ${mark.name}${mark.boundary ? ' · ' + mark.boundary : ''}`).join(' / ');
                    return <div key={date.id} title={description || undefined} className={`rounded p-1 border ${selected ? 'border-blue-400/60' : 'border-white/10'}`} style={{ background }}>
                    <button aria-label={`Spieltag ${date.value}`} aria-pressed={selected} onClick={() => selectCalendarDay(date, 'date')} className="text-[10px] w-full font-bold">{new Date(date.value).getUTCDay() === 6 ? 'Sa' : 'So'} {date.value.slice(8)}</button>
                    <div className="flex gap-1 mt-1"><button aria-label={`${getTeamName(activeTeamId)} verfügbar ${date.value}`} aria-pressed={selected && !!availability[activeTeamId]?.[date.id]} onClick={() => selectCalendarDay(date, 'available')} className={`flex-1 text-[10px] rounded ${selected && availability[activeTeamId]?.[date.id] ? 'bg-blue-600' : 'bg-white/10'}`}>V</button><button aria-label={`${getTeamName(activeTeamId)} Heimspiel ${date.value}`} aria-pressed={selected && !!homeAvailability[activeTeamId]?.[date.id]} onClick={() => selectCalendarDay(date, 'home')} className={`flex-1 text-[10px] rounded ${selected && homeAvailability[activeTeamId]?.[date.id] ? 'bg-emerald-600' : 'bg-white/10'}`}>H</button></div>
                  </div>; })}
                </div>
              </div>)}
            </div>
            <div className="flex flex-wrap gap-3 items-center">
              <button type="button" onClick={clearAvailability} disabled={!hasAvailabilityEntries} className="text-xs rounded-lg px-3 py-2 bg-red-500/15 text-red-300 border border-red-400/30 disabled:opacity-40">Alle Einträge löschen</button>
              {availabilityUndo && <button type="button" onClick={undoClearAvailability} className="text-xs rounded-lg px-3 py-2 bg-blue-500/20 text-blue-200 border border-blue-400/30">Rückgängig</button>}

            </div>
            {allTeamsOnFinalDay && finalDayCandidate && <p className="text-xs text-blue-200">Saisonabschluss: {formatDate(finalDayCandidate.value)} · {ignoredLateDates} spätere Termine werden bei der Planung ignoriert.</p>}
            {availabilityUndo && <p role="status" className="text-xs text-blue-200">Alle Verfügbarkeiten und Heimspiel-Auswahlen wurden gelöscht. Rückgängig ist bis zur nächsten Änderung dieser Einträge möglich.</p>}
            <p className="text-xs text-gray-400">Datum = möglichen Spieltermin auswählen. Nicht jeder ausgewählte Termin muss genutzt werden. V = Team verfügbar (blau). H = Heimspiel möglich (grün). Verfügbarkeit oder Heimspiel wählen aktiviert den Termin. Ein Jahreswechsel startet eine neue Terminauswahl.</p>
            <div className="flex flex-wrap gap-3 items-center text-xs">
              <span>Ferien & Feiertage einblenden:</span>
              {(['HB', 'HH', 'NI'] as Region[]).map(region => <label key={region} className="flex items-center gap-1" style={{ color: holidayColors[region] }}><input type="checkbox" checked={holidayRegions.includes(region)} onChange={e => setHolidayRegions(prev => e.target.checked ? [...prev, region] : prev.filter(r => r !== region))} />{regionNames[region]}</label>)}
            </div>
            {holidayRegions.length > 0 && <div className="text-xs text-gray-300 space-y-1">
              <p>Helle transparente Hintergründe = Ferien · stärkerer Farbton = Start-/Endwochenende · Rot = Feiertag. Randwochenenden schließen die direkt angrenzenden Wochenenden ein.</p>
              {!hasVacationData(seasonYear) && <p className="text-amber-300" role="status">Für {seasonYear} sind keine geprüften Ferientermine hinterlegt. Ferien verfügbar: 2026–2029. Feiertage werden weiterhin angezeigt.</p>}
              <details><summary>Termine und Quellen (auch Feiertage unter der Woche)</summary>
                {holidayRegions.map(region => <div key={region} className="mt-2"><strong style={{ color: holidayColors[region] }}>{regionNames[region]}</strong><div className="flex flex-wrap gap-x-4 gap-y-1">{(holidayPeriods[region] || []).filter(p => p.start.slice(5) >= '03-01' && p.start.slice(5) <= '10-31').map(p => <span key={p.name}>{p.name}: {p.start.slice(8)}.{p.start.slice(5,7)}.{p.kind === 'vacation' ? ` – ${p.end.slice(8)}.${p.end.slice(5,7)}.` : ''}</span>)}</div></div>)}
                <p className="mt-2">Ferienquellen: <a className="underline" href="https://www.bildung.bremen.de/ferientermine-3404" target="_blank" rel="noreferrer">Bremen</a> · <a className="underline" href="https://www.hamburg.de/resource/blob/134372/5bc131bdd36a604f67b361d21f7df37e/ferienordnung-hamburg-2024-2030-data.pdf" target="_blank" rel="noreferrer">Hamburg</a> · <a className="underline" href="https://www.mk.niedersachsen.de/download/98088/Ferienuebersicht_Schuljahr_2024_25_-_2029_30_fuer_Sehbehinderte_.pdf" target="_blank" rel="noreferrer">Niedersachsen</a>. Stand: 09.10.2026.</p>
              </details>
            </div>}
            {dates.some(d => !weekends.some(m => m.days.some(w => w.id === d.id))) && <details><summary className="text-xs">Weitere gespeicherte Termine</summary>{dates.filter(d => !weekends.some(m => m.days.some(w => w.id === d.id))).map(d => <div key={d.id} className="flex gap-3 text-xs py-1">{d.value}<button onClick={() => toggleAvailability(activeTeamId, d.id)}>V: {availability[activeTeamId]?.[d.id] ? 'Ja' : 'Nein'}</button><button onClick={() => toggleHomeAvailability(activeTeamId, d.id)}>H: {homeAvailability[activeTeamId]?.[d.id] ? 'Ja' : 'Nein'}</button><button onClick={() => removeDate(d.id)}>Entfernen</button></div>)}</details>}
          </section>
        </fieldset>

        {/* Create Button - Moved to bottom */}
        <div className="max-w-md mx-auto pt-6">
          <button onClick={solve} disabled={isGenerating} className="w-full group relative flex items-center justify-center gap-3 bg-blue-600 text-white px-8 py-5 rounded-2xl overflow-hidden transition-all hover:bg-blue-500 active:scale-95 disabled:opacity-50 shadow-xl shadow-blue-600/20">
            <AnimatePresence mode="wait">
              {isGenerating ? (
                <motion.div key="loading" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="flex items-center gap-2">
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span className="font-bold uppercase tracking-widest text-sm">Erstelle Spielplan...</span>
                </motion.div>
              ) : (
                <motion.div key="idle" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="flex items-center gap-2">
                  <Play size={20} fill="currentColor" />
                  <span className="font-bold uppercase tracking-widest text-sm">Spielplan jetzt erstellen</span>
                </motion.div>
              )}
            </AnimatePresence>
          </button>
        </div>

        {/* Results Section */}
        <div className="space-y-10">
          <section className="space-y-6">
            <AnimatePresence mode="wait">
              {error && (
                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} className="bg-red-500/10 border border-red-500/20 text-red-400 p-4 rounded-xl flex items-start gap-3">
                  <AlertCircle className="shrink-0 mt-0.5" size={18} />
                  <p className="text-sm font-medium">{error}</p>
                </motion.div>
              )}

              {schedule && report && (
                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-8">
                  <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
                    {[
                      { label: 'Spieltage', value: report.matchesPerDay.length },
                      { label: 'Paarungen', value: (teams.length * (teams.length - 1)) / 2 },
                      { label: 'Gesamtspiele', value: report.matchesPerDay.reduce((a, b) => a + b, 0) },
                      { label: 'Ø Spiele/Tag', value: (report.matchesPerDay.reduce((a, b) => a + b, 0) / report.matchesPerDay.length).toFixed(1) },
                      { label: 'Max Last/Team', value: report.maxMatchesPerTeamPerDay },
                      { label: 'Bedingungen', value: 'Gültig', color: 'text-emerald-400' }
                    ].map((stat, i) => (
                      <div key={i} className="glass-card p-4 rounded-xl space-y-1">
                        <p className="text-[10px] font-mono uppercase opacity-50">{stat.label}</p>
                        <p className={`text-2xl font-bold ${stat.color || 'text-white'}`}>{stat.value}</p>
                      </div>
                    ))}
                  </div>

                  <div className="space-y-4">
                    <div className="flex items-center justify-between border-b border-white/10 pb-2">
                      <div className="flex items-center gap-2">
                        <Trophy size={20} className="text-blue-400" />
                        <h2 className="font-bold text-xl">Erstellter Spielplan</h2>
                      </div>
                      <button onClick={downloadExcel} className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest bg-white/10 text-white px-4 py-2 rounded-full hover:bg-white/20 transition-all">
                        <Download size={14} /> Excel Export
                      </button>
                    </div>
                    <div className="space-y-6">
                      {seasonDates.filter(dateEntry => schedule[dateEntry.id]?.matches.length).map((dateEntry) => (
                        <div key={dateEntry.id} className="relative pl-8 border-l border-white/10 pb-2">
                          <div className="absolute left-[-5px] top-0 w-[9px] h-[9px] rounded-full bg-blue-500 shadow-[0_0_10px_rgba(59,130,246,0.5)]" />
                          <div className="flex items-center justify-between mb-3">
                            <div className="flex flex-col">
                              <h3 className="font-mono text-sm font-bold text-blue-400">{formatDate(dateEntry.value)}</h3>
                              <div className="flex items-center gap-1.5 mt-0.5">
                                <span className="text-[9px] font-mono uppercase opacity-40">Austragungsort:</span>
                                <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider">{getTeamName(schedule[dateEntry.id]?.hostId)}</span>
                              </div>
                            </div>
                            <span className="text-[10px] font-mono uppercase bg-blue-500/20 text-blue-400 px-2 py-0.5 rounded border border-blue-500/30">
                              {schedule[dateEntry.id]?.matches.length || 0} Spiele
                            </span>
                          </div>
                          <div className="flex flex-wrap gap-2 mb-3">
                            {teams.filter(t => schedule[dateEntry.id].matches.some(m => m.teamA === t.id || m.teamB === t.id)).map(t => {
                              const day = schedule[dateEntry.id];
                              const host = teams.find(h => h.id === day.hostId)!;
                              const km = distanceKm(t.homePlace!, host.homePlace!);
                              const count = day.matches.filter(m => m.teamA === t.id || m.teamB === t.id).length;
                              return <span key={t.id} className="text-xs text-gray-300 bg-white/5 rounded px-2 py-1">{t.name}: {count} {count === 1 ? 'Spiel' : 'Spiele'} · {t.id === host.id ? 'Gastgeber' : `${Math.round(km)} km Luftlinie${km > 100 ? ' (weite Anreise)' : ''}`}</span>;
                            })}
                          </div>
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                            {schedule[dateEntry.id]?.matches.map((match, i) => (
                              <div key={i} className="glass-card p-3 rounded-lg flex flex-col items-center justify-center text-center group hover:border-blue-500/50 transition-all">
                                <span className="text-[9px] font-mono opacity-30 mb-1">SPIEL {i + 1}</span>
                                <div className="flex items-center gap-2 w-full">
                                  <span className="flex-1 text-xs font-bold truncate">{getTeamName(match.teamA)}</span>
                                  <span className="text-[10px] italic opacity-40">vs</span>
                                  <span className="flex-1 text-xs font-bold truncate">{getTeamName(match.teamB)}</span>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="glass-card p-6 rounded-2xl space-y-4 bg-blue-500/5 border-blue-500/20">
                    <div className="flex items-center gap-2 border-b border-white/10 pb-2">
                      <BarChart3 size={18} className="text-blue-400" />
                      <h2 className="font-bold text-lg">Validierungs- & Balance-Bericht</h2>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="space-y-3">
                        <div className="flex justify-between items-center text-xs">
                          <span className="opacity-60 uppercase tracking-widest">Harte Bedingungen</span>
                          <span className="text-emerald-400 font-bold">ERFÜLLT</span>
                        </div>
                        <div className="flex justify-between items-center text-xs">
                          <span className="opacity-60 uppercase tracking-widest">Spiele pro Tag</span>
                          <span className="font-mono text-blue-400">[{report.matchesPerDay.join(', ')}]</span>
                        </div>
                        <div className="flex justify-between items-center text-xs">
                          <span className="opacity-60 uppercase tracking-widest">Abweichung vom Ideal</span>
                          <span className="font-mono text-blue-400">{report.deviation}</span>
                        </div>
                        <div className="flex justify-between items-center text-xs">
                          <span className="opacity-60 uppercase tracking-widest">Max. Spiele Team/Tag</span>
                          <span className="font-mono text-blue-400">{report.maxMatchesPerTeamPerDay}</span>
                        </div>
                        <div className="pt-2 border-t border-white/5">
                          <p className="text-[10px] opacity-40 uppercase tracking-widest mb-2">Heimspiele pro Team</p>
                          <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                            {teams.map(t => (
                              <div key={t.id} className="flex justify-between text-[10px] font-mono">
                                <span className="opacity-60 truncate mr-2">{t.name}</span>
                                <span className="text-emerald-400">{report.homeGameDistribution[t.id] || 0}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                      <div className="space-y-2">
                        <p className="text-[10px] opacity-40 uppercase tracking-widest mb-1">Hinweise zu weichen Bedingungen</p>
                        {report.softConstraintDeviations.map((dev, i) => (
                          <div key={i} className="flex items-start gap-2 text-[11px] leading-relaxed text-gray-400">
                            <Info size={12} className="shrink-0 mt-0.5 text-blue-400" />
                            <span>{dev}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}

              {!schedule && !error && !isGenerating && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="h-64 border-2 border-dashed border-white/10 rounded-3xl flex flex-col items-center justify-center text-center p-10 space-y-4">
                  <div className="w-12 h-12 bg-white/5 rounded-full flex items-center justify-center">
                    <Play size={24} className="opacity-20 ml-1" />
                  </div>
                  <div>
                    <p className="font-bold text-lg opacity-40">Bereit zum Erstellen</p>
                    <p className="text-xs opacity-30 uppercase tracking-widest mt-1">Konfiguriere Teams und Daten, dann klicke auf Erstellen.</p>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </section>
        </div>
      </main>

      <footer className="mt-20 border-t border-white/10 p-10 text-center">
        <p className="text-[10px] font-mono uppercase opacity-40 tracking-[0.2em]">
          Mit Präzision entwickelt &bull; AI Studio &bull; 2026
        </p>
      </footer>
    </div>
  );
}
