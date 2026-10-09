import React, { useState, useMemo, useEffect } from 'react';
import { 
  Plus, 
  Trash2, 
  Users, 
  Settings, 
  Play, 
  CheckCircle2, 
  AlertCircle,
  Trophy,
  BarChart3,
  Download,
  ArrowLeft,
  Clock,
  Layout,
  ChevronRight,
  Save,
  FileText,
  MapPin,
  Calendar,
  RotateCcw,
  RefreshCw
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import { usePersistentState } from '../hooks/usePersistentState';

// --- Types ---

type Team = {
  id: string;
  name: string;
  seed?: number;
};

type TournamentFormat = 'ROUND_ROBIN' | 'GROUPS_FINAL' | 'GROUPS_SEMI_FINAL' | 'FULL_KO' | 'AUTO';

type DurationMode = 'FIXED' | 'AUTO';

type Match = {
  id: string;
  teamAId: string;
  teamBId: string;
  scoreA?: number;
  scoreB?: number;
  winnerId?: string;
  isDraw?: boolean;
  group?: string;
  stage: 'GROUP' | 'SEMI' | 'FINAL' | 'THIRD_PLACE' | 'QUARTER' | 'KO';
  time?: string;
  field?: number;
  day?: number;
  placeholderA?: string; // e.g. "1st Group A"
  placeholderB?: string;
};

type Group = {
  name: string;
  teamIds: string[];
};

type StandingsEntry = {
  teamId: string;
  games: number;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDiff: number;
  points: number;
};

type TournamentDraft = {
  teams: Team[];
  durationMode: DurationMode;
  numDays: number;
  startTime: string;
  endTime: string;
  matchDuration: number;
  breakDuration: number;
  numFields: number;
  format: TournamentFormat;
  hasThirdPlace: boolean;
  awardCeremonyDuration: number;
  hasAwardCeremony: boolean;
  matches: Match[];
  groups: Group[];
  activeTab: 'SETUP' | 'SCHEDULE' | 'STANDINGS';
};

interface TournamentPlannerProps {
  onBack: () => void;
}

// --- Constants ---

const FIELDS_OPTIONS = [1, 2, 3, 4];
const FORMAT_OPTIONS: { value: TournamentFormat; label: string; desc: string }[] = [
  { value: 'AUTO', label: 'Automatisch', desc: 'Empfohlen: Wählt das beste Format basierend auf der Teamanzahl.' },
  { value: 'ROUND_ROBIN', label: 'Jeder gegen Jeden', desc: 'Alle Teams spielen in einer großen Gruppe gegeneinander.' },
  { value: 'GROUPS_FINAL', label: 'Gruppen + Finale', desc: 'Gruppenphase, gefolgt von einem Finale der Gruppensieger.' },
  { value: 'GROUPS_SEMI_FINAL', label: 'Gruppen + Halbfinale', desc: 'Gruppenphase, Halbfinale und Finale.' },
  { value: 'FULL_KO', label: 'K.o.-System', desc: 'Direktes Ausscheiden ab der ersten Runde.' },
];

const STAGE_LABELS: Record<string, string> = {
  'GROUP': 'Gruppe',
  'SEMI': 'Halbfinale',
  'FINAL': 'Finale',
  'THIRD_PLACE': 'Platz 3',
  'QUARTER': 'Viertelfinale',
  'KO': 'K.o.-Runde'
};

// --- Helper Functions ---

const generateTimeSlots = (start: string, matchLen: number, breakLen: number, count: number) => {
  const slots: string[] = [];
  let [hours, minutes] = start.split(':').map(Number);
  
  for (let i = 0; i < count; i++) {
    slots.push(`${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`);
    minutes += matchLen + breakLen;
    hours += Math.floor(minutes / 60);
    minutes %= 60;
  }
  return slots;
};

export default function TournamentPlanner({ onBack }: TournamentPlannerProps) {
  // --- State ---
  const initialDraft: TournamentDraft = {
    teams: [
      { id: 't1', name: 'Team A' },
      { id: 't2', name: 'Team B' },
      { id: 't3', name: 'Team C' },
      { id: 't4', name: 'Team D' },
    ],
    durationMode: 'FIXED',
    numDays: 1,
    startTime: '09:00',
    endTime: '17:00',
    matchDuration: 15,
    breakDuration: 5,
    numFields: 2,
    format: 'AUTO',
    hasThirdPlace: true,
    awardCeremonyDuration: 15,
    hasAwardCeremony: true,
    matches: [],
    groups: [],
    activeTab: 'SETUP'
  };

  const [draft, setDraft, resetDraft, isSaving] = usePersistentState<TournamentDraft>(
    'matchmaster_tournament_draft_v1',
    initialDraft
  );

  const handleReset = () => {
    resetDraft();
    setError(null);
  };

  const { 
    teams, 
    durationMode, 
    numDays, 
    startTime, 
    endTime, 
    matchDuration, 
    breakDuration, 
    numFields, 
    format, 
    hasThirdPlace, 
    awardCeremonyDuration, 
    hasAwardCeremony, 
    matches, 
    groups, 
    activeTab 
  } = draft;

  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // --- Actions ---

  const setTeams = (val: Team[] | ((p: Team[]) => Team[])) => setDraft(prev => ({ ...prev, teams: typeof val === 'function' ? val(prev.teams) : val }));
  const setDurationMode = (val: DurationMode | ((p: DurationMode) => DurationMode)) => setDraft(prev => ({ ...prev, durationMode: typeof val === 'function' ? val(prev.durationMode) : val }));
  const setNumDays = (val: number | ((p: number) => number)) => setDraft(prev => ({ ...prev, numDays: typeof val === 'function' ? val(prev.numDays) : val }));
  const setStartTime = (val: string | ((p: string) => string)) => setDraft(prev => ({ ...prev, startTime: typeof val === 'function' ? val(prev.startTime) : val }));
  const setEndTime = (val: string | ((p: string) => string)) => setDraft(prev => ({ ...prev, endTime: typeof val === 'function' ? val(prev.endTime) : val }));
  const setMatchDuration = (val: number | ((p: number) => number)) => setDraft(prev => ({ ...prev, matchDuration: typeof val === 'function' ? val(prev.matchDuration) : val }));
  const setBreakDuration = (val: number | ((p: number) => number)) => setDraft(prev => ({ ...prev, breakDuration: typeof val === 'function' ? val(prev.breakDuration) : val }));
  const setNumFields = (val: number | ((p: number) => number)) => setDraft(prev => ({ ...prev, numFields: typeof val === 'function' ? val(prev.numFields) : val }));
  const setFormat = (val: TournamentFormat | ((p: TournamentFormat) => TournamentFormat)) => setDraft(prev => ({ ...prev, format: typeof val === 'function' ? val(prev.format) : val }));
  const setHasThirdPlace = (val: boolean | ((p: boolean) => boolean)) => setDraft(prev => ({ ...prev, hasThirdPlace: typeof val === 'function' ? val(prev.hasThirdPlace) : val }));
  const setAwardCeremonyDuration = (val: number | ((p: number) => number)) => setDraft(prev => ({ ...prev, awardCeremonyDuration: typeof val === 'function' ? val(prev.awardCeremonyDuration) : val }));
  const setHasAwardCeremony = (val: boolean | ((p: boolean) => boolean)) => setDraft(prev => ({ ...prev, hasAwardCeremony: typeof val === 'function' ? val(prev.hasAwardCeremony) : val }));
  const setMatches = (val: Match[] | ((p: Match[]) => Match[])) => setDraft(prev => ({ ...prev, matches: typeof val === 'function' ? val(prev.matches) : val }));
  const setGroups = (val: Group[] | ((p: Group[]) => Group[])) => setDraft(prev => ({ ...prev, groups: typeof val === 'function' ? val(prev.groups) : val }));
  const setActiveTab = (val: ('SETUP' | 'SCHEDULE' | 'STANDINGS') | ((p: 'SETUP' | 'SCHEDULE' | 'STANDINGS') => 'SETUP' | 'SCHEDULE' | 'STANDINGS')) => setDraft(prev => ({ ...prev, activeTab: typeof val === 'function' ? val(prev.activeTab) : val }));

  const addTeam = () => {
    const newId = `t${Date.now()}`;
    const nextLetter = String.fromCharCode(65 + teams.length);
    setTeams([...teams, { id: newId, name: `Team ${nextLetter}` }]);
  };

  const removeTeam = (id: string) => {
    if (teams.length <= 3) return;
    setTeams(teams.filter(t => t.id !== id));
  };

  const updateTeamName = (id: string, name: string) => {
    setTeams(teams.map(t => t.id === id ? { ...t, name } : t));
  };

  const updateScore = (matchId: string, scoreA: number | undefined, scoreB: number | undefined) => {
    setMatches(prev => {
      const next = prev.map(m => {
        if (m.id !== matchId) return m;
        
        let winnerId: string | undefined = undefined;
        let isDraw = false;
        
        const sA = scoreA ?? 0;
        const sB = scoreB ?? 0;

        if (scoreA !== undefined && scoreB !== undefined) {
          if (sA > sB) winnerId = m.teamAId;
          else if (sB > sA) winnerId = m.teamBId;
          else isDraw = true;
        }

        return { ...m, scoreA, scoreB, winnerId, isDraw };
      });

      // Update KO placeholders if necessary
      return updateKoPlaceholders(next);
    });
  };

  const updateKoPlaceholders = (currentMatches: Match[]): Match[] => {
    // This is a simplified version. In a real app, we'd calculate standings and winners.
    // For now, we'll just handle direct winners of previous rounds if they are linked.
    return currentMatches;
  };

  // --- Standings Calculation ---

  const standings = useMemo(() => {
    const stats: Record<string, StandingsEntry> = {};
    teams.forEach(t => {
      stats[t.id] = { teamId: t.id, games: 0, wins: 0, draws: 0, losses: 0, goalsFor: 0, goalsAgainst: 0, goalDiff: 0, points: 0 };
    });

    matches.filter(m => m.stage === 'GROUP' && m.scoreA !== undefined && m.scoreB !== undefined).forEach(m => {
      const sA = stats[m.teamAId];
      const sB = stats[m.teamBId];
      if (!sA || !sB) return;

      sA.games++;
      sB.games++;
      sA.goalsFor += m.scoreA!;
      sA.goalsAgainst += m.scoreB!;
      sB.goalsFor += m.scoreB!;
      sB.goalsAgainst += m.scoreA!;
      sA.goalDiff = sA.goalsFor - sA.goalsAgainst;
      sB.goalDiff = sB.goalsFor - sB.goalsAgainst;

      if (m.scoreA! > m.scoreB!) {
        sA.wins++;
        sA.points += 3;
        sB.losses++;
      } else if (m.scoreB! > m.scoreA!) {
        sB.wins++;
        sB.points += 3;
        sA.losses++;
      } else {
        sA.draws++;
        sB.draws++;
        sA.points += 1;
        sB.points += 1;
      }
    });

    return Object.values(stats).sort((a, b) => {
      if (b.points !== a.points) return b.points - a.points;
      if (b.goalDiff !== a.goalDiff) return b.goalDiff - a.goalDiff;
      return b.goalsFor - a.goalsFor;
    });
  }, [matches, teams]);

  const groupStandings = useMemo(() => {
    return groups.map(g => ({
      ...g,
      standings: standings.filter(s => g.teamIds.includes(s.teamId))
    }));
  }, [standings, groups]);

  // --- Generation Logic ---

  const generateTournament = () => {
    setIsGenerating(true);
    setError(null);

    setTimeout(() => {
      try {
        // 1. Determine Format
        let activeFormat = format;
        if (format === 'AUTO') {
          if (teams.length <= 5) activeFormat = 'ROUND_ROBIN';
          else if (teams.length <= 10) activeFormat = 'GROUPS_FINAL';
          else activeFormat = 'GROUPS_SEMI_FINAL';
        }

        // 2. Generate Groups
        const newGroups: Group[] = [];
        if (activeFormat === 'ROUND_ROBIN') {
          newGroups.push({ name: 'Gruppe A', teamIds: teams.map(t => t.id) });
        } else {
          const numGroups = teams.length <= 8 ? 2 : 4;
          for (let i = 0; i < numGroups; i++) {
            newGroups.push({ name: `Gruppe ${String.fromCharCode(65 + i)}`, teamIds: [] });
          }
          // Distribute teams
          teams.forEach((t, i) => {
            newGroups[i % numGroups].teamIds.push(t.id);
          });
        }
        setGroups(newGroups);

        // 3. Generate Group Matches
        const groupMatches: Match[] = [];
        newGroups.forEach(g => {
          for (let i = 0; i < g.teamIds.length; i++) {
            for (let j = i + 1; j < g.teamIds.length; j++) {
              groupMatches.push({
                id: `m-g-${g.name}-${i}-${j}`,
                teamAId: g.teamIds[i],
                teamBId: g.teamIds[j],
                stage: 'GROUP',
                group: g.name
              });
            }
          }
        });

        // 4. Generate KO Matches (Placeholders)
        const koMatches: Match[] = [];
        if (activeFormat === 'GROUPS_FINAL') {
          koMatches.push({
            id: 'm-final',
            teamAId: '', teamBId: '',
            placeholderA: '1. Gruppe A', placeholderB: '1. Gruppe B',
            stage: 'FINAL'
          });
        } else if (activeFormat === 'GROUPS_SEMI_FINAL') {
          koMatches.push({ id: 'm-sf1', teamAId: '', teamBId: '', placeholderA: '1. Gruppe A', placeholderB: '2. Gruppe B', stage: 'SEMI' });
          koMatches.push({ id: 'm-sf2', teamAId: '', teamBId: '', placeholderA: '1. Gruppe B', placeholderB: '2. Gruppe A', stage: 'SEMI' });
          if (hasThirdPlace) koMatches.push({ id: 'm-3rd', teamAId: '', teamBId: '', placeholderA: 'Verlierer SF1', placeholderB: 'Verlierer SF2', stage: 'THIRD_PLACE' });
          koMatches.push({ id: 'm-final', teamAId: '', teamBId: '', placeholderA: 'Sieger SF1', placeholderB: 'Sieger SF2', stage: 'FINAL' });
        }

        const allMatches = [...groupMatches, ...koMatches].sort((a, b) => {
          const order = { 'GROUP': 0, 'QUARTER': 1, 'SEMI': 2, 'THIRD_PLACE': 3, 'FINAL': 4, 'KO': 5 };
          return order[a.stage] - order[b.stage];
        });
        
        // 5. Scheduling
        const scheduledMatches = scheduleMatches(allMatches);
        if (!scheduledMatches) {
          setError("Zeitplan konnte nicht erstellt werden. Erhöhe die Zeit oder füge mehr Felder hinzu.");
          setIsGenerating(false);
          return;
        }

        setMatches(scheduledMatches);
        setActiveTab('SCHEDULE');
      } catch (e) {
        setError("Ein Fehler ist bei der Generierung aufgetreten.");
      }
      setIsGenerating(false);
    }, 1000);
  };

  const scheduleMatches = (matchesToSchedule: Match[]): Match[] | null => {
    const result: Match[] = [];
    const remainingMatches = [...matchesToSchedule];
    
    const teamLastMatchEnd: Record<string, number> = {}; // teamId -> end timestamp in minutes
    const teamConsecutiveGames: Record<string, number> = {}; // teamId -> count of consecutive games
    const fieldLastMatchEnd: Record<number, number> = {}; // field -> end timestamp

    const timeToMin = (t: string) => {
      const [h, m] = t.split(':').map(Number);
      return h * 60 + m;
    };

    const minToTime = (m: number) => {
      const h = Math.floor(m / 60);
      const min = m % 60;
      return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
    };

    const startMin = timeToMin(startTime);
    const endMin = durationMode === 'AUTO' ? Infinity : timeToMin(endTime);
    const slotSize = matchDuration + breakDuration;

    let currentDay = 1;
    let currentTimestamp = startMin;

    while (remainingMatches.length > 0) {
      if (durationMode === 'FIXED' && currentTimestamp + matchDuration > endMin) {
        if (currentDay < numDays) {
          currentDay++;
          currentTimestamp = startMin;
          for (let f = 1; f <= numFields; f++) fieldLastMatchEnd[f] = 0;
          Object.keys(teamLastMatchEnd).forEach(k => {
            teamLastMatchEnd[k] = 0;
            teamConsecutiveGames[k] = 0;
          });
          continue;
        } else {
          return null;
        }
      }

      for (let f = 1; f <= numFields; f++) {
        if (remainingMatches.length === 0) break;

        // Pass 1: Try to find a match where both teams are rested (0 consecutive games)
        let matchIndex = remainingMatches.findIndex(m => {
          const checkTeamRested = (teamId: string) => {
            if (!teamId) return true;
            const lastEnd = teamLastMatchEnd[teamId] || 0;
            if (lastEnd === 0) return true;
            // Rested means they didn't play in the previous slot
            return (lastEnd + breakDuration + slotSize) <= currentTimestamp;
          };
          return checkTeamRested(m.teamAId) && checkTeamRested(m.teamBId);
        });

        // Pass 2: If not found, try to find a match where teams have < 2 consecutive games
        if (matchIndex === -1) {
          matchIndex = remainingMatches.findIndex(m => {
            const checkTeamAllowed = (teamId: string) => {
              if (!teamId) return true;
              const lastEnd = teamLastMatchEnd[teamId] || 0;
              const consecutive = teamConsecutiveGames[teamId] || 0;
              if (lastEnd === 0) return true;
              
              // Must have at least the basic break
              if (lastEnd + breakDuration > currentTimestamp) return false;
              
              // Strictly no 3rd game in a row
              const isConsecutive = Math.abs(currentTimestamp - lastEnd - breakDuration) < 2;
              if (isConsecutive && consecutive >= 2) return false;
              
              return true;
            };
            return checkTeamAllowed(m.teamAId) && checkTeamAllowed(m.teamBId);
          });
        }

        if (matchIndex !== -1) {
          const m = remainingMatches.splice(matchIndex, 1)[0];
          m.time = minToTime(currentTimestamp);
          m.field = f;
          m.day = currentDay;
          
          const end = currentTimestamp + matchDuration;
          fieldLastMatchEnd[f] = end;
          
          const updateTeam = (teamId: string) => {
            if (!teamId) return;
            const lastEnd = teamLastMatchEnd[teamId] || 0;
            const isConsecutive = lastEnd > 0 && Math.abs(currentTimestamp - lastEnd - breakDuration) < 2;
            
            if (isConsecutive) {
              teamConsecutiveGames[teamId] = (teamConsecutiveGames[teamId] || 0) + 1;
            } else {
              teamConsecutiveGames[teamId] = 1;
            }
            teamLastMatchEnd[teamId] = end;
          };

          updateTeam(m.teamAId);
          updateTeam(m.teamBId);
          result.push(m);
        }
      }

      currentTimestamp += slotSize;
      if (currentTimestamp > startMin + (24 * 60 * numDays)) return null;
    }

    return result;
  };

  // --- Exports ---

  const downloadExcel = () => {
    const wb = XLSX.utils.book_new();
    
    // Sheet 1: Schedule
    const scheduleData = matches.map(m => ({
      'Zeit': m.time,
      'Feld': m.field,
      'Team A': m.teamAId ? getTeamName(m.teamAId) : m.placeholderA,
      'Team B': m.teamBId ? getTeamName(m.teamBId) : m.placeholderB,
      'Tore A': m.scoreA ?? '',
      'Tore B': m.scoreB ?? '',
      'Sieger': m.winnerId ? getTeamName(m.winnerId) : (m.isDraw ? 'Unentschieden' : '')
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(scheduleData), "Spielplan");

    // Sheet 2: Standings
    const standingsData = standings.map((s, i) => ({
      'Platz': i + 1,
      'Team': getTeamName(s.teamId),
      'Spiele': s.games,
      'S': s.wins,
      'U': s.draws,
      'N': s.losses,
      'Tore': `${s.goalsFor}:${s.goalsAgainst}`,
      'Diff': s.goalDiff,
      'Punkte': s.points
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(standingsData), "Tabelle");

    // Sheet 3: Final Ranking
    const finalRankingData = standings.map((s, i) => ({
      'Rang': i + 1,
      'Team': getTeamName(s.teamId),
      'Punkte': s.points,
      'Tordifferenz': s.goalDiff
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(finalRankingData), "Endplatzierung");

    XLSX.writeFile(wb, "Turnierplan.xlsx");
  };

  const downloadPDF = () => {
    const doc = new jsPDF();
    doc.setFontSize(20);
    doc.text("Turnierplan", 14, 22);
    doc.setFontSize(11);
    doc.text(`Datum: ${new Date().toLocaleDateString()}`, 14, 30);

    // Schedule Table
    (doc as any).autoTable({
      startY: 40,
      head: [['Zeit', 'Feld', 'Team A', 'Team B', 'Ergebnis']],
      body: matches.map(m => [
        m.time, 
        m.field, 
        m.teamAId ? getTeamName(m.teamAId) : m.placeholderA, 
        m.teamBId ? getTeamName(m.teamBId) : m.placeholderB,
        m.scoreA !== undefined ? `${m.scoreA}:${m.scoreB}` : '-'
      ]),
    });

    // Standings Table
    doc.addPage();
    doc.text("Tabelle", 14, 22);
    (doc as any).autoTable({
      startY: 30,
      head: [['Platz', 'Team', 'Sp', 'S', 'U', 'N', 'Tore', 'Diff', 'Pkt']],
      body: standings.map((s, i) => [
        i + 1, 
        getTeamName(s.teamId), 
        s.games, s.wins, s.draws, s.losses, 
        `${s.goalsFor}:${s.goalsAgainst}`, 
        s.goalDiff, s.points
      ]),
    });

    doc.save("Turnierplan.pdf");
  };

  const getTeamName = (id: string) => teams.find(t => t.id === id)?.name || id;

  return (
    <div className="min-h-screen bg-[#1C1F2A] text-white font-sans selection:bg-blue-500 selection:text-white">
      <header className="bg-black/20 backdrop-blur-md border-b border-white/10 p-4 sm:p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between sticky top-0 z-50 gap-4">
        <div className="flex items-center gap-3 sm:gap-4 w-full sm:w-auto">
          <button onClick={onBack} className="p-2 hover:bg-white/10 rounded-full transition-colors">
            <ArrowLeft size={20} className="sm:w-6 sm:h-6" />
          </button>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight uppercase truncate"><i>Turnier</i> <span className="text-blue-500">Planer</span></h1>
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
          <div className="flex gap-2">
          {matches.length > 0 && (
            <>
              <button onClick={downloadExcel} className="flex items-center gap-2 px-3 sm:px-4 py-1.5 sm:py-2 text-[10px] sm:text-xs font-bold uppercase tracking-widest bg-white/10 border border-white/10 rounded-full hover:bg-white/20 transition-colors">
                <Download size={12} className="sm:w-3.5 sm:h-3.5" /> Excel
              </button>
              <button onClick={downloadPDF} className="flex items-center gap-2 px-3 sm:px-4 py-1.5 sm:py-2 text-[10px] sm:text-xs font-bold uppercase tracking-widest bg-white/10 border border-white/10 rounded-full hover:bg-white/20 transition-colors">
                <FileText size={12} className="sm:w-3.5 sm:h-3.5" /> PDF
              </button>
            </>
          )}
          </div>
        </div>
      </header>

      <nav className="bg-black/10 border-b border-white/10 px-4 sm:px-6 flex gap-4 sm:gap-8 overflow-x-auto custom-scrollbar no-scrollbar">
        {[
          { id: 'SETUP', label: 'Konfiguration', icon: Settings },
          { id: 'SCHEDULE', label: 'Spielplan', icon: Calendar },
          { id: 'STANDINGS', label: 'Tabelle', icon: BarChart3 },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`flex items-center gap-2 py-4 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${activeTab === tab.id ? 'border-blue-500 text-blue-500' : 'border-transparent text-gray-400 hover:text-gray-200'}`}
          >
            <tab.icon size={18} />
            {tab.label}
          </button>
        ))}
      </nav>

      <main className="p-4 sm:p-6 max-w-7xl mx-auto">
        <AnimatePresence mode="wait">
          {activeTab === 'SETUP' && (
            <motion.div key="setup" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="grid grid-cols-1 lg:grid-cols-12 gap-8">
              {/* Teams */}
              <div className="lg:col-span-4 space-y-6">
                <div className="glass-card p-6 rounded-2xl space-y-4">
                  <div className="flex items-center justify-between">
                    <h2 className="text-lg font-bold flex items-center gap-2"><Users size={20} className="text-blue-400" /> Teams</h2>
                    <button onClick={addTeam} className="p-2 bg-blue-500/10 text-blue-400 rounded-lg hover:bg-blue-500/20 transition-colors">
                      <Plus size={20} />
                    </button>
                  </div>
                  <div className="space-y-2">
                    {teams.map((team, i) => (
                      <div key={team.id} className="flex items-center gap-2 group">
                        <span className="text-[10px] font-mono opacity-30 w-4">{String.fromCharCode(65 + i)}</span>
                        <input
                          type="text"
                          value={team.name}
                          onChange={(e) => updateTeamName(team.id, e.target.value)}
                          className="flex-1 bg-white/5 border-transparent border-b border-white/10 py-2 px-3 text-sm focus:bg-white/10 focus:border-blue-500 outline-none transition-all rounded-t-lg"
                        />
                        <button onClick={() => removeTeam(team.id)} className="p-2 text-red-400 opacity-0 group-hover:opacity-100 hover:text-red-500 transition-all">
                          <Trash2 size={16} />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Settings */}
              <div className="lg:col-span-8 space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Format */}
                  <div className="glass-card p-6 rounded-2xl space-y-4">
                    <h2 className="text-lg font-bold flex items-center gap-2"><Layout size={20} className="text-blue-400" /> Turnierformat</h2>
                    <div className="space-y-2">
                      {FORMAT_OPTIONS.map(opt => (
                        <button
                          key={opt.value}
                          onClick={() => setFormat(opt.value)}
                          className={`w-full text-left p-3 rounded-xl border transition-all ${format === opt.value ? 'border-blue-500 bg-blue-500/10 ring-1 ring-blue-500' : 'border-white/5 hover:border-white/20'}`}
                        >
                          <div className="font-bold text-sm">{opt.label}</div>
                          <div className="text-[10px] text-gray-400">{opt.desc}</div>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Inputs */}
                  <div className="glass-card p-6 rounded-2xl space-y-6">
                    <h2 className="text-lg font-bold flex items-center gap-2"><Clock size={20} className="text-blue-400" /> Eingaben</h2>
                    
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <label className="text-[10px] uppercase font-bold text-gray-500">Dauer-Modus</label>
                        <div className="flex gap-2">
                          <button onClick={() => setDurationMode('FIXED')} className={`flex-1 py-2 rounded-lg border font-bold text-xs transition-all ${durationMode === 'FIXED' ? 'bg-blue-600 border-blue-600 text-white' : 'bg-white/5 border-white/10 text-gray-400'}`}>Festgelegt</button>
                          <button onClick={() => setDurationMode('AUTO')} className={`flex-1 py-2 rounded-lg border font-bold text-xs transition-all ${durationMode === 'AUTO' ? 'bg-blue-600 border-blue-600 text-white' : 'bg-white/5 border-white/10 text-gray-400'}`}>Automatisch</button>
                        </div>
                      </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <label className="text-[10px] uppercase font-bold text-gray-500">Startzeit</label>
                        <input type="time" value={startTime} onChange={e => setStartTime(e.target.value)} className="w-full p-2 bg-white/5 rounded-lg border border-white/10 text-sm [color-scheme:dark]" />
                      </div>
                      {durationMode === 'FIXED' && (
                        <>
                          <div className="space-y-1">
                            <label className="text-[10px] uppercase font-bold text-gray-500">Endzeit</label>
                            <input type="time" value={endTime} onChange={e => setEndTime(e.target.value)} className="w-full p-2 bg-white/5 rounded-lg border border-white/10 text-sm [color-scheme:dark]" />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[10px] uppercase font-bold text-gray-500">Anzahl Tage</label>
                            <input 
                              type="text" 
                              inputMode="numeric"
                              pattern="[0-9]*"
                              value={numDays || ''} 
                              onChange={e => {
                                const val = e.target.value.replace(/\D/g, '');
                                setNumDays(val === '' ? 0 : parseInt(val));
                              }} 
                              className="w-full p-2 bg-white/5 rounded-lg border border-white/10 text-sm outline-none focus:border-blue-500/50 transition-colors" 
                            />
                          </div>
                        </>
                      )}
                    </div>

                      <div className="space-y-2">
                        <label className="text-[10px] uppercase font-bold text-gray-500">Siegerehrung</label>
                        <div className="flex items-center gap-4">
                          <button 
                            onClick={() => setHasAwardCeremony(!hasAwardCeremony)}
                            className={`flex-1 py-2 rounded-lg border font-bold text-xs transition-all ${hasAwardCeremony ? 'bg-blue-600 border-blue-600 text-white' : 'bg-white/5 border-white/10 text-gray-400'}`}
                          >
                            {hasAwardCeremony ? 'Ja' : 'Nein'}
                          </button>
                          {hasAwardCeremony && (
                            <div className="flex-1 flex items-center gap-2">
                              <input 
                                type="text" 
                                inputMode="numeric"
                                pattern="[0-9]*"
                                value={awardCeremonyDuration || ''} 
                                onChange={e => {
                                  const val = e.target.value.replace(/\D/g, '');
                                  setAwardCeremonyDuration(val === '' ? 0 : parseInt(val));
                                }} 
                                className="w-full p-2 bg-white/5 rounded-lg border border-white/10 text-sm outline-none focus:border-blue-500/50 transition-colors" 
                              />
                              <span className="text-[10px] font-bold text-gray-500">MIN</span>
                            </div>
                          )}
                        </div>
                      </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-[10px] uppercase font-bold text-gray-500">Spieldauer (Min)</label>
                      <input 
                        type="text" 
                        inputMode="numeric"
                        pattern="[0-9]*"
                        value={matchDuration || ''} 
                        onChange={e => {
                          const val = e.target.value.replace(/\D/g, '');
                          setMatchDuration(val === '' ? 0 : parseInt(val));
                        }} 
                        className="w-full p-2 bg-white/5 rounded-lg border border-white/10 text-sm outline-none focus:border-blue-500/50 transition-colors" 
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] uppercase font-bold text-gray-500">Pause (Min)</label>
                      <input 
                        type="text" 
                        inputMode="numeric"
                        pattern="[0-9]*"
                        value={breakDuration || ''} 
                        onChange={e => {
                          const val = e.target.value.replace(/\D/g, '');
                          setBreakDuration(val === '' ? 0 : parseInt(val));
                        }} 
                        className="w-full p-2 bg-white/5 rounded-lg border border-white/10 text-sm outline-none focus:border-blue-500/50 transition-colors" 
                      />
                    </div>
                  </div>

                      <div className="space-y-2">
                        <label className="text-[10px] uppercase font-bold text-gray-500">Anzahl Spielfelder</label>
                        <div className="flex gap-2">
                          {FIELDS_OPTIONS.map(n => (
                            <button key={n} onClick={() => setNumFields(n)} className={`flex-1 py-2 rounded-lg border font-bold text-xs transition-all ${numFields === n ? 'bg-blue-600 border-blue-600 text-white' : 'bg-white/5 border-white/10 text-gray-400 hover:border-white/30'}`}>
                              {n}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {error && (
                  <div className="bg-red-500/10 border border-red-500/20 text-red-400 p-4 rounded-xl flex items-center gap-3 text-sm font-medium">
                    <AlertCircle size={18} /> {error}
                  </div>
                )}

                <button
                  onClick={generateTournament}
                  disabled={isGenerating}
                  className="w-full py-5 bg-blue-600 text-white rounded-2xl font-bold text-lg shadow-lg shadow-blue-600/20 hover:bg-blue-500 active:scale-95 transition-all flex items-center justify-center gap-3 disabled:opacity-50"
                >
                  {isGenerating ? <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Play size={24} fill="currentColor" />}
                  Turnierplan generieren
                </button>
              </div>
            </motion.div>
          )}

          {activeTab === 'SCHEDULE' && (
            <motion.div key="schedule" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-8">
              {matches.length === 0 ? (
                <div className="text-center py-20 glass-card rounded-3xl border-dashed border-white/10">
                  <Calendar size={48} className="mx-auto text-white/20 mb-4" />
                  <p className="text-gray-500">Noch kein Spielplan generiert. Gehe zu Setup.</p>
                </div>
              ) : (
                <div className="space-y-10">
                  {/* Group by Day */}
                  {[...new Set(matches.map(m => m.day))].sort().map(day => (
                    <div key={day} className="space-y-6">
                      <div className="flex items-center gap-4">
                        <h2 className="text-2xl font-bold">
                          {numDays === 1 ? 'Spielübersicht' : `Spielübersicht Tag ${day}`}
                        </h2>
                        <div className="h-px flex-1 bg-white/10" />
                      </div>
                      
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                        {matches.filter(m => m.day === day).map((match, i) => (
                          <div key={match.id} className="glass-card p-4 rounded-2xl hover:border-blue-500/50 transition-all group">
                            <div className="flex justify-between items-center mb-4">
                              <span className="text-[10px] font-bold bg-blue-500/20 text-blue-400 px-2 py-1 rounded border border-blue-500/30 uppercase tracking-widest">
                                {match.stage === 'GROUP' ? `Match ${i + 1}` : (STAGE_LABELS[match.stage] || match.stage)}
                              </span>
                              <div className="flex items-center gap-2 text-xs font-mono text-gray-400">
                                <Clock size={12} /> {match.time}
                                <MapPin size={12} className="ml-2" /> Feld {match.field}
                              </div>
                            </div>
                            
                            <div className="space-y-3">
                              <div className="flex items-center justify-between gap-4">
                                <div className="flex-1 text-sm font-bold truncate">{match.teamAId ? getTeamName(match.teamAId) : match.placeholderA}</div>
                                <input
                                  type="text"
                                  inputMode="numeric"
                                  pattern="[0-9]*"
                                  value={match.scoreA ?? ''}
                                  onChange={e => {
                                    const val = e.target.value.replace(/\D/g, '');
                                    updateScore(match.id, val === '' ? undefined : parseInt(val), match.scoreB);
                                  }}
                                  className="w-12 h-10 bg-white/5 border border-white/10 rounded-lg text-center font-bold focus:border-blue-500 outline-none transition-colors"
                                />
                              </div>
                              <div className="flex items-center justify-between gap-4">
                                <div className="flex-1 text-sm font-bold truncate">{match.teamBId ? getTeamName(match.teamBId) : match.placeholderB}</div>
                                <input
                                  type="text"
                                  inputMode="numeric"
                                  pattern="[0-9]*"
                                  value={match.scoreB ?? ''}
                                  onChange={e => {
                                    const val = e.target.value.replace(/\D/g, '');
                                    updateScore(match.id, match.scoreA, val === '' ? undefined : parseInt(val));
                                  }}
                                  className="w-12 h-10 bg-white/5 border border-white/10 rounded-lg text-center font-bold focus:border-blue-500 outline-none transition-colors"
                                />
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </motion.div>
          )}

          {activeTab === 'STANDINGS' && (
            <motion.div key="standings" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-8">
              {groupStandings.length === 0 ? (
                <div className="text-center py-20 glass-card rounded-3xl border-dashed border-white/10">
                  <BarChart3 size={48} className="mx-auto text-white/20 mb-4" />
                  <p className="text-gray-500">Noch keine Tabellen verfügbar.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                  {groupStandings.map(group => (
                    <div key={group.name} className="glass-card rounded-2xl overflow-hidden">
                      <div className="bg-white/5 p-4 border-b border-white/10 flex items-center justify-between">
                        <h3 className="font-bold text-blue-400">{group.name}</h3>
                        <div className="flex items-center gap-4 text-[9px] font-mono opacity-50">
                          <div className="flex items-center gap-1">
                            <span className="font-bold text-blue-400">Pkt:</span>
                            <span>S=3, U=1, N=0</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <span className="font-bold text-blue-400">Diff:</span>
                            <span>Eigene Tore minus Gegentore</span>
                          </div>
                        </div>
                      </div>
                      <div className="overflow-x-auto custom-scrollbar">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="text-[10px] uppercase font-bold text-gray-500 border-b border-white/5">
                              <th className="p-4 text-left">Platz</th>
                              <th className="p-4 text-left">Team</th>
                              <th className="p-4 text-center">Sp</th>
                              <th className="p-4 text-center">Tore</th>
                              <th className="p-4 text-center">Diff</th>
                              <th className="p-4 text-center">Pkt</th>
                            </tr>
                          </thead>
                          <tbody>
                            {group.standings.map((s, i) => (
                              <tr key={s.teamId} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                                <td className="p-4 font-mono text-gray-500">{i + 1}</td>
                                <td className="p-4 font-bold">{getTeamName(s.teamId)}</td>
                                <td className="p-4 text-center">{s.games}</td>
                                <td className="p-4 text-center font-mono text-xs">{s.goalsFor}:{s.goalsAgainst}</td>
                                <td className="p-4 text-center font-mono">{s.goalDiff > 0 ? `+${s.goalDiff}` : s.goalDiff}</td>
                                <td className="p-4 text-center"><span className="bg-blue-500/10 text-blue-400 px-2 py-1 rounded-lg font-bold border border-blue-500/20">{s.points}</span></td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}
