/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useEffect } from 'react';
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
  Download
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import * as XLSX from 'xlsx';

// --- Types ---

type Team = {
  id: string;
  name: string;
};

type MatchMode = 1 | 2 | 3 | 4;

type DateEntry = {
  id: string;
  value: string;
};

type Availability = Record<string, Record<string, boolean>>; // teamId -> dateId -> isAvailable

type Match = {
  teamA: string;
  teamB: string;
};

type ScheduledMatch = {
  teamA: string;
  teamB: string;
  dateId: string;
};

type Schedule = Record<string, Match[]>; // dateId -> matches

type ValidationReport = {
  matchesPerDay: number[];
  deviation: number;
  maxMatchesPerTeamPerDay: number;
  hardConstraintsSatisfied: boolean;
  softConstraintDeviations: string[];
};

// --- Constants ---

const MIN_MATCHES_PER_DAY = 1;

// --- Helper Functions ---

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

// --- Main Component ---

export default function App() {
  console.log('AI Tournament Planner: App component mounting');
  
  useEffect(() => {
    console.log('AI Tournament Planner: App component mounted');
  }, []);

  const [teams, setTeams] = useState<Team[]>([
    { id: '1', name: 'Team Alpha' },
    { id: '2', name: 'Team Beta' },
    { id: '3', name: 'Team Gamma' },
  ]);
  const [dates, setDates] = useState<DateEntry[]>([
    { id: 'd1', value: '2026-06-01' },
    { id: 'd2', value: '2026-06-02' }
  ]);
  const [availability, setAvailability] = useState<Availability>({
    '1': { 'd1': false, 'd2': false },
    '2': { 'd1': false, 'd2': false },
    '3': { 'd1': false, 'd2': false },
  });
  const [matchMode, setMatchMode] = useState<MatchMode>(2);
  const [maxMatchesPerDay, setMaxMatchesPerDay] = useState(3);
  const [isGenerating, setIsGenerating] = useState(false);
  const [schedule, setSchedule] = useState<Schedule | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<ValidationReport | null>(null);

  // --- Actions ---

  const addTeam = () => {
    const newId = Math.random().toString(36).substr(2, 9);
    const newTeam = { id: newId, name: `Team ${String.fromCharCode(65 + teams.length)}` };
    setTeams([...teams, newTeam]);
    setAvailability(prev => ({
      ...prev,
      [newId]: dates.reduce((acc, date) => ({ ...acc, [date.id]: false }), {})
    }));
  };

  const removeTeam = (id: string) => {
    if (teams.length <= 2) return;
    setTeams(teams.filter(t => t.id !== id));
    const newAvail = { ...availability };
    delete newAvail[id];
    setAvailability(newAvail);
  };

  const updateTeamName = (id: string, name: string) => {
    setTeams(teams.map(t => t.id === id ? { ...t, name } : t));
  };

  const addDate = () => {
    const lastDateValue = dates.length > 0 ? new Date(dates[dates.length - 1].value) : new Date();
    lastDateValue.setDate(lastDateValue.getDate() + 1);
    const dateStr = lastDateValue.toISOString().split('T')[0];
    const newId = Math.random().toString(36).substr(2, 9);
    setDates([...dates, { id: newId, value: dateStr }]);
    setAvailability(prev => {
      const next = { ...prev };
      teams.forEach(t => {
        if (!next[t.id]) next[t.id] = {};
        next[t.id][newId] = false;
      });
      return next;
    });
  };

  const removeDate = (id: string) => {
    if (dates.length <= 1) return;
    setDates(dates.filter(d => d.id !== id));
    setAvailability(prev => {
      const next = { ...prev };
      teams.forEach(t => {
        if (next[t.id]) {
          const teamAvail = { ...next[t.id] };
          delete teamAvail[id];
          next[t.id] = teamAvail;
        }
      });
      return next;
    });
  };

  const toggleAvailability = (teamId: string, dateId: string) => {
    setAvailability(prev => ({
      ...prev,
      [teamId]: {
        ...prev[teamId],
        [dateId]: !prev[teamId]?.[dateId]
      }
    }));
  };

  // --- Scheduling Logic ---

  const solve = () => {
    setIsGenerating(true);
    setError(null);
    setSchedule(null);
    setReport(null);

    // Small delay to show loading state
    setTimeout(() => {
      const allMatches = generatePairings(teams, matchMode);
      const totalMatches = allMatches.length;

      if (totalMatches > dates.length * maxMatchesPerDay) {
        setError(`Unmöglich: Die Gesamtanzahl der Spiele (${totalMatches}) übersteigt die maximale Kapazität von ${dates.length * maxMatchesPerDay} (${dates.length} Tage * ${maxMatchesPerDay} Spiele/Tag). Füge mehr Daten hinzu oder reduziere den Spielmodus.`);
        setIsGenerating(false);
        return;
      }

      if (totalMatches < dates.length * MIN_MATCHES_PER_DAY) {
        setError(`Unmöglich: Die Gesamtanzahl der Spiele (${totalMatches}) ist geringer als das erforderliche Minimum von ${dates.length * MIN_MATCHES_PER_DAY} (${dates.length} Tage * ${MIN_MATCHES_PER_DAY} Spiel/Tag). Entferne einige Daten oder erhöhe den Spielmodus.`);
        setIsGenerating(false);
        return;
      }

      // Backtracking with pruning and safety limit
      let bestSchedule: Schedule | null = null;
      let bestScore = Infinity;
      let iterations = 0;
      const MAX_ITERATIONS = 100000; // Safety limit

      const getScore = (currentSchedule: Schedule) => {
        const counts = dates.map(d => currentSchedule[d.id]?.length || 0);
        const avg = counts.reduce((a, b) => a + b, 0) / counts.length;
        const variance = counts.reduce((a, b) => a + Math.pow(b - avg, 2), 0) / counts.length;
        
        let penalty = variance * 100;

        // Penalty for team playing many matches in a day
        dates.forEach(d => {
          const dayMatches = currentSchedule[d.id] || [];
          const teamCounts: Record<string, number> = {};
          const uniqueTeams = new Set<string>();
          
          dayMatches.forEach(m => {
            teamCounts[m.teamA] = (teamCounts[m.teamA] || 0) + 1;
            teamCounts[m.teamB] = (teamCounts[m.teamB] || 0) + 1;
            uniqueTeams.add(m.teamA);
            uniqueTeams.add(m.teamB);
          });

          // Penalty for unique teams on this day
          // Higher number of unique teams = higher penalty
          penalty += uniqueTeams.size * 200;

          Object.values(teamCounts).forEach(c => {
            if (c === 3) penalty += 500;
            if (c > 3) penalty += 5000;
          });
        });

        return penalty;
      };

      const backtrack = (matchIndex: number, currentSchedule: Schedule) => {
        iterations++;
        if (iterations > MAX_ITERATIONS) return;

        if (matchIndex === allMatches.length) {
          const allDaysHaveMatches = dates.every(d => (currentSchedule[d.id]?.length || 0) >= MIN_MATCHES_PER_DAY);
          if (!allDaysHaveMatches) return;

          const score = getScore(currentSchedule);
          if (score < bestScore) {
            bestScore = score;
            bestSchedule = JSON.parse(JSON.stringify(currentSchedule));
          }
          return;
        }

        const match = allMatches[matchIndex];
        
        // Sort dates by current load to find balanced solutions faster (Heuristic)
        const sortedDates = [...dates].sort((a, b) => 
          (currentSchedule[a.id]?.length || 0) - (currentSchedule[b.id]?.length || 0)
        );

        for (const dateEntry of sortedDates) {
          if (bestScore === 0) return; // Found perfect solution
          if (iterations > MAX_ITERATIONS) return;

          const dayMatches = currentSchedule[dateEntry.id] || [];
          
          if (dayMatches.length >= maxMatchesPerDay) continue;
          if (!availability[match.teamA]?.[dateEntry.id] || !availability[match.teamB]?.[dateEntry.id]) continue;
          
          const alreadyPaired = dayMatches.some(m => 
            (m.teamA === match.teamA && m.teamB === match.teamB) ||
            (m.teamA === match.teamB && m.teamB === match.teamA)
          );
          if (alreadyPaired) continue;

          const nextSchedule = { ...currentSchedule, [dateEntry.id]: [...dayMatches, match] };
          backtrack(matchIndex + 1, nextSchedule);
        }
      };

      backtrack(0, {});

      if (bestSchedule) {
        setSchedule(bestSchedule);
        
        // Generate Report
        const counts = dates.map(d => bestSchedule![d.id]?.length || 0);
        const avg = counts.reduce((a, b) => a + b, 0) / counts.length;
        const dev = counts.reduce((a, b) => a + Math.abs(b - avg), 0);
        
        let maxTeamMatches = 0;
        dates.forEach(d => {
          const teamCounts: Record<string, number> = {};
          (bestSchedule![d.id] || []).forEach(m => {
            teamCounts[m.teamA] = (teamCounts[m.teamA] || 0) + 1;
            teamCounts[m.teamB] = (teamCounts[m.teamB] || 0) + 1;
          });
          Object.values(teamCounts).forEach(c => {
            if (c > maxTeamMatches) maxTeamMatches = c;
          });
        });

        const softDevs: string[] = [];
        if (dev > 0) softDevs.push(`Perfekte Verteilung aufgrund von Verfügbarkeitseinschränkungen nicht möglich.`);
        if (maxTeamMatches >= 3) softDevs.push(`Einige Teams spielen ${maxTeamMatches} Spiele an einem einzigen Tag.`);
        if (iterations > MAX_ITERATIONS) softDevs.push(`Der Suchraum war zu groß. Es wird die beste innerhalb der Sicherheitslimits gefundene Lösung angezeigt.`);
        softDevs.push(`Optimierung: Die Anzahl der Teams pro Spieltag wurde minimiert.`);

        setReport({
          matchesPerDay: counts,
          deviation: Number(dev.toFixed(2)),
          maxMatchesPerTeamPerDay: maxTeamMatches,
          hardConstraintsSatisfied: true,
          softConstraintDeviations: softDevs
        });
      } else {
        setError("Kein gültiger Spielplan gefunden, der alle harten Bedingungen erfüllt. Versuche, mehr Daten hinzuzufügen oder die Team-Verfügbarkeit anzupassen.");
      }
      setIsGenerating(false);
    }, 800);
  };

  // --- Render Helpers ---

  const getTeamName = (id: string) => teams.find(t => t.id === id)?.name || id;

  const downloadExcel = () => {
    if (!schedule) return;

    const data = dates.flatMap(dateEntry => {
      const dayMatches = schedule[dateEntry.id] || [];
      return dayMatches.map((match, index) => ({
        'Datum': dateEntry.value,
        'Wochentag': new Date(dateEntry.value).toLocaleDateString('de-DE', { weekday: 'long' }),
        'Spiel #': index + 1,
        'Team A': getTeamName(match.teamA),
        'Team B': getTeamName(match.teamB)
      }));
    });

    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Spielplan");
    
    // Auto-size columns
    const max_width = data.reduce((w, r) => Math.max(w, r['Team A'].length, r['Team B'].length), 10);
    worksheet["!cols"] = [
      { wch: 12 }, // Datum
      { wch: 12 }, // Wochentag
      { wch: 8 },  // Spiel #
      { wch: max_width + 5 }, // Team A
      { wch: max_width + 5 }, // Team B
    ];

    XLSX.writeFile(workbook, "Turnier_Spielplan.xlsx");
  };

  return (
    <div className="min-h-screen bg-[#E4E3E0] text-[#141414] font-sans selection:bg-[#141414] selection:text-[#E4E3E0]">
      {/* Header */}
      <header className="border-b border-[#141414] p-6 lg:p-10 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-4xl lg:text-5xl font-serif italic tracking-tight uppercase">
            Turnier <span className="not-italic font-sans font-bold">Planer</span>
          </h1>
          <p className="text-sm opacity-60 mt-2 font-mono uppercase tracking-widest">KI-gestützte konfliktfreie Spielplanung</p>
        </div>
        <button 
          onClick={solve}
          disabled={isGenerating}
          className="group relative flex items-center gap-3 bg-[#141414] text-[#E4E3E0] px-8 py-4 rounded-full overflow-hidden transition-all hover:scale-105 active:scale-95 disabled:opacity-50 disabled:hover:scale-100"
        >
          <AnimatePresence mode="wait">
            {isGenerating ? (
              <motion.div 
                key="loading"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="flex items-center gap-2"
              >
                <div className="w-4 h-4 border-2 border-[#E4E3E0] border-t-transparent rounded-full animate-spin" />
                <span className="font-bold uppercase tracking-widest text-xs">Erstelle Spielplan...</span>
              </motion.div>
            ) : (
              <motion.div 
                key="idle"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="flex items-center gap-2"
              >
                <Play size={18} fill="currentColor" />
                <span className="font-bold uppercase tracking-widest text-xs">Spielplan erstellen</span>
              </motion.div>
            )}
          </AnimatePresence>
        </button>
      </header>

      <main className="p-6 lg:p-10 max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-10">
        
        {/* Left Column: Inputs */}
        <div className="lg:col-span-5 space-y-10">
          
          {/* Teams Section */}
          <section className="space-y-4">
            <div className="flex items-center justify-between border-b border-[#141414]/20 pb-2">
              <div className="flex items-center gap-2">
                <Users size={20} />
                <h2 className="font-serif italic text-xl">Teams</h2>
              </div>
              <button 
                onClick={addTeam}
                className="text-xs font-bold uppercase tracking-widest hover:underline flex items-center gap-1"
              >
                <Plus size={14} /> Team hinzufügen
              </button>
            </div>
            <div className="space-y-2">
              <AnimatePresence initial={false}>
                {teams.map((team, index) => (
                  <motion.div 
                    key={team.id}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 20 }}
                    className="flex items-center gap-3 group"
                  >
                    <span className="font-mono text-[10px] opacity-40 w-6">0{index + 1}</span>
                    <input 
                      type="text"
                      value={team.name}
                      onChange={(e) => updateTeamName(team.id, e.target.value)}
                      className="flex-1 bg-transparent border-b border-[#141414]/10 py-1 focus:border-[#141414] outline-none transition-colors"
                    />
                    <button 
                      onClick={() => removeTeam(team.id)}
                      tabIndex={-1}
                      className="opacity-0 group-hover:opacity-100 focus:opacity-100 text-red-600 transition-opacity p-1 outline-none"
                    >
                      <Trash2 size={14} />
                    </button>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          </section>

          {/* Dates Section */}
          <section className="space-y-4">
            <div className="flex items-center justify-between border-b border-[#141414]/20 pb-2">
              <div className="flex items-center gap-2">
                <CalendarIcon size={20} />
                <h2 className="font-serif italic text-xl">Turniertage</h2>
              </div>
              <button 
                onClick={addDate}
                className="text-xs font-bold uppercase tracking-widest hover:underline flex items-center gap-1"
              >
                <Plus size={14} /> Datum hinzufügen
              </button>
            </div>
            <div className="space-y-2">
              <AnimatePresence initial={false}>
                {dates.map((dateEntry, index) => (
                  <motion.div 
                    key={dateEntry.id}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 20 }}
                    className="flex items-center gap-3 group"
                  >
                    <span className="font-mono text-[10px] opacity-40 w-6">D{index + 1}</span>
                    <input 
                      type="date"
                      value={dateEntry.value}
                      onChange={(e) => {
                        const newDates = [...dates];
                        newDates[index] = { ...dateEntry, value: e.target.value };
                        setDates(newDates);
                      }}
                      className="flex-1 bg-transparent border-b border-[#141414]/10 py-1 focus:border-[#141414] outline-none transition-colors font-mono text-sm"
                    />
                    <button 
                      onClick={() => removeDate(dateEntry.id)}
                      tabIndex={-1}
                      className="opacity-0 group-hover:opacity-100 focus:opacity-100 text-red-600 transition-opacity p-1 outline-none"
                    >
                      <Trash2 size={14} />
                    </button>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          </section>

          {/* Settings Section */}
          <section className="space-y-6">
            <div className="space-y-4">
              <div className="flex items-center gap-2 border-b border-[#141414]/20 pb-2">
                <Settings size={20} />
                <h2 className="font-serif italic text-xl">Spielmodus</h2>
              </div>
              <div className="flex gap-4">
                {[1, 2, 3, 4].map((mode) => (
                  <button
                    key={mode}
                    onClick={() => setMatchMode(mode as MatchMode)}
                    className={`flex-1 py-3 rounded-lg border border-[#141414] transition-all font-bold text-xs uppercase tracking-widest ${
                      matchMode === mode 
                        ? 'bg-[#141414] text-[#E4E3E0]' 
                        : 'hover:bg-[#141414]/5'
                    }`}
                  >
                    {mode}x Paarung
                  </button>
                ))}
              </div>
              <p className="text-[10px] opacity-50 font-mono uppercase">Jedes Team spielt {matchMode}-mal gegen jedes andere Team.</p>
            </div>

            <div className="space-y-4">
              <div className="flex items-center gap-2 border-b border-[#141414]/20 pb-2">
                <BarChart3 size={20} />
                <h2 className="font-serif italic text-xl">Max. Spiele pro Tag</h2>
              </div>
              <div className="flex items-center gap-4">
                <input 
                  type="range" 
                  min="1" 
                  max="10" 
                  value={maxMatchesPerDay} 
                  onChange={(e) => setMaxMatchesPerDay(parseInt(e.target.value))}
                  className="flex-1 accent-[#141414] cursor-pointer"
                />
                <span className="font-mono font-bold text-lg w-8 text-center">{maxMatchesPerDay}</span>
              </div>
              <p className="text-[10px] opacity-50 font-mono uppercase">Maximale Anzahl an Spielen pro Turniertag.</p>
            </div>
          </section>

        </div>

        {/* Right Column: Availability & Results */}
        <div className="lg:col-span-7 space-y-10">
          
          {/* Availability Matrix */}
          <section className="space-y-4">
            <div className="flex items-center gap-2 border-b border-[#141414]/20 pb-2">
              <CheckCircle2 size={20} />
              <h2 className="font-serif italic text-xl">Team-Verfügbarkeit</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr>
                    <th className="p-3 text-left font-serif italic text-xs opacity-50 border-b border-[#141414]">Team</th>
                    {dates.map((dateEntry, i) => (
                      <th key={dateEntry.id} className="p-3 text-center font-mono text-[10px] opacity-50 border-b border-[#141414]">
                        D{i + 1}<br/>{dateEntry.value.split('-').slice(1).join('/')}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {teams.map((team) => (
                    <tr key={team.id} className="hover:bg-[#141414]/5 transition-colors">
                      <td className="p-3 text-sm font-medium border-b border-[#141414]/10">{team.name}</td>
                      {dates.map((dateEntry) => (
                        <td key={dateEntry.id} className="p-3 text-center border-b border-[#141414]/10">
                          <button
                            onClick={() => toggleAvailability(team.id, dateEntry.id)}
                            className={`w-6 h-6 rounded-md border border-[#141414] transition-all flex items-center justify-center ${
                              availability[team.id]?.[dateEntry.id] 
                                ? 'bg-[#141414] text-[#E4E3E0]' 
                                : 'bg-transparent text-transparent'
                            }`}
                          >
                            <CheckCircle2 size={14} />
                          </button>
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* Results Area */}
          <section className="space-y-6">
            <AnimatePresence mode="wait">
              {error && (
                <motion.div 
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  className="bg-red-100 border border-red-400 text-red-700 p-4 rounded-lg flex items-start gap-3"
                >
                  <AlertCircle className="shrink-0 mt-0.5" size={18} />
                  <p className="text-sm font-medium">{error}</p>
                </motion.div>
              )}

              {schedule && report && (
                <motion.div 
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="space-y-8"
                >
                  {/* Summary Cards */}
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                    <div className="bg-white p-4 border border-[#141414] rounded-xl space-y-1">
                      <p className="text-[10px] font-mono uppercase opacity-50">Paarungen</p>
                      <p className="text-2xl font-serif italic">{(teams.length * (teams.length - 1)) / 2}</p>
                    </div>
                    <div className="bg-white p-4 border border-[#141414] rounded-xl space-y-1">
                      <p className="text-[10px] font-mono uppercase opacity-50">Gesamtspiele</p>
                      <p className="text-2xl font-serif italic">{report.matchesPerDay.reduce((a, b) => a + b, 0)}</p>
                    </div>
                    <div className="bg-white p-4 border border-[#141414] rounded-xl space-y-1">
                      <p className="text-[10px] font-mono uppercase opacity-50">Ø Spiele/Tag</p>
                      <p className="text-2xl font-serif italic">{(report.matchesPerDay.reduce((a, b) => a + b, 0) / dates.length).toFixed(1)}</p>
                    </div>
                    <div className="bg-white p-4 border border-[#141414] rounded-xl space-y-1">
                      <p className="text-[10px] font-mono uppercase opacity-50">Max Last/Team</p>
                      <p className="text-2xl font-serif italic">{report.maxMatchesPerTeamPerDay}</p>
                    </div>
                    <div className="bg-white p-4 border border-[#141414] rounded-xl space-y-1">
                      <p className="text-[10px] font-mono uppercase opacity-50">Bedingungen</p>
                      <p className="text-2xl font-serif italic text-emerald-600">Gültig</p>
                    </div>
                  </div>

                  {/* Schedule List */}
                  <div className="space-y-4">
                    <div className="flex items-center justify-between border-b border-[#141414]/20 pb-2">
                      <div className="flex items-center gap-2">
                        <Trophy size={20} />
                        <h2 className="font-serif italic text-xl">Erstellter Spielplan</h2>
                      </div>
                      <button 
                        onClick={downloadExcel}
                        className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest bg-[#141414] text-[#E4E3E0] px-4 py-2 rounded-full hover:scale-105 transition-transform"
                      >
                        <Download size={14} /> Excel Export
                      </button>
                    </div>
                    <div className="space-y-6">
                      {dates.map((dateEntry) => (
                        <div key={dateEntry.id} className="relative pl-8 border-l border-[#141414]/20 pb-2">
                          <div className="absolute left-[-5px] top-0 w-[9px] h-[9px] rounded-full bg-[#141414]" />
                          <div className="flex items-center justify-between mb-3">
                            <h3 className="font-mono text-sm font-bold">{formatDate(dateEntry.value)}</h3>
                            <span className="text-[10px] font-mono uppercase bg-[#141414] text-[#E4E3E0] px-2 py-0.5 rounded">
                              {schedule[dateEntry.id]?.length || 0} Spiele
                            </span>
                          </div>
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                            {schedule[dateEntry.id]?.map((match, i) => (
                              <div key={i} className="bg-white p-3 border border-[#141414]/10 rounded-lg flex flex-col items-center justify-center text-center group hover:border-[#141414] transition-all">
                                <span className="text-[9px] font-mono opacity-30 mb-1">SPIEL {i + 1}</span>
                                <div className="flex items-center gap-2 w-full">
                                  <span className="flex-1 text-xs font-bold truncate">{getTeamName(match.teamA)}</span>
                                  <span className="text-[10px] italic opacity-40">vs</span>
                                  <span className="flex-1 text-xs font-bold truncate">{getTeamName(match.teamB)}</span>
                                </div>
                              </div>
                            ))}
                            {(!schedule[dateEntry.id] || schedule[dateEntry.id].length === 0) && (
                              <div className="col-span-full py-4 text-center border border-dashed border-[#141414]/20 rounded-lg opacity-40 italic text-sm">
                                Keine Spiele geplant
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Balance Report */}
                  <div className="bg-[#141414] text-[#E4E3E0] p-6 rounded-2xl space-y-4">
                    <div className="flex items-center gap-2 border-b border-[#E4E3E0]/20 pb-2">
                      <BarChart3 size={18} />
                      <h2 className="font-serif italic text-lg">Validierungs- & Balance-Bericht</h2>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="space-y-3">
                        <div className="flex justify-between items-center text-xs">
                          <span className="opacity-60 uppercase tracking-widest">Harte Bedingungen</span>
                          <span className="text-emerald-400 font-bold">ERFÜLLT</span>
                        </div>
                        <div className="flex justify-between items-center text-xs">
                          <span className="opacity-60 uppercase tracking-widest">Spiele pro Tag</span>
                          <span className="font-mono">[{report.matchesPerDay.join(', ')}]</span>
                        </div>
                        <div className="flex justify-between items-center text-xs">
                          <span className="opacity-60 uppercase tracking-widest">Abweichung vom Ideal</span>
                          <span className="font-mono">{report.deviation}</span>
                        </div>
                      </div>
                      <div className="space-y-2">
                        <p className="text-[10px] opacity-40 uppercase tracking-widest mb-1">Hinweise zu weichen Bedingungen</p>
                        {report.softConstraintDeviations.length > 0 ? (
                          report.softConstraintDeviations.map((dev, i) => (
                            <div key={i} className="flex items-start gap-2 text-[11px] leading-relaxed">
                              <Info size={12} className="shrink-0 mt-0.5 opacity-60" />
                              <span>{dev}</span>
                            </div>
                          ))
                        ) : (
                          <div className="flex items-start gap-2 text-[11px] text-emerald-400">
                            <CheckCircle2 size={12} className="shrink-0 mt-0.5" />
                            <span>Perfekt ausgeglichener Spielplan erreicht.</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}

              {!schedule && !error && !isGenerating && (
                <motion.div 
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="h-64 border-2 border-dashed border-[#141414]/10 rounded-3xl flex flex-col items-center justify-center text-center p-10 space-y-4"
                >
                  <div className="w-12 h-12 bg-[#141414]/5 rounded-full flex items-center justify-center">
                    <Play size={24} className="opacity-20 ml-1" />
                  </div>
                  <div>
                    <p className="font-serif italic text-lg opacity-40">Bereit zum Erstellen</p>
                    <p className="text-xs opacity-30 uppercase tracking-widest mt-1">Konfiguriere Teams und Daten, dann klicke auf Erstellen.</p>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </section>

        </div>
      </main>

      {/* Footer */}
      <footer className="mt-20 border-t border-[#141414] p-10 text-center">
        <p className="text-[10px] font-mono uppercase opacity-40 tracking-[0.2em]">
          Mit Präzision entwickelt &bull; AI Studio &bull; 2026
        </p>
      </footer>
    </div>
  );
}
