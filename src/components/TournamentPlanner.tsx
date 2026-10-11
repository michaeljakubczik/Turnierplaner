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
import autoTable from 'jspdf-autotable';
import { makeTournament, scheduleTournament, resolveBracket, standingsFor, type TournamentMatch as Match, type TournamentGroup as Group, type StandingsEntry, type TournamentConfig } from '../lib/tournamentEngine';
import { usePersistentState } from '../hooks/usePersistentState';

// --- Types ---

type Team = {
  id: string;
  name: string;
  seed?: number;
};

type TournamentFormat = 'ROUND_ROBIN' | 'GROUPS_FINAL' | 'GROUPS_SEMI_FINAL' | 'FULL_KO' | 'AUTO';

type DurationMode = 'FIXED' | 'AUTO';

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
  qualifiers?: Record<string,string[]>;
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
    qualifiers: {},
    activeTab: 'SETUP'
  };

  const [draft, setDraft, resetDraft, isSaving, , storageError] = usePersistentState<TournamentDraft>(
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

  const setTeams = (val: Team[] | ((p: Team[]) => Team[])) => setDraft(prev => ({ ...prev, teams: typeof val === 'function' ? val(prev.teams) : val, matches:[],groups:[],qualifiers:{},activeTab:'SETUP' }));
  const setDurationMode = (val: DurationMode | ((p: DurationMode) => DurationMode)) => setDraft(prev => ({ ...prev, matches:[], groups:[], qualifiers:{}, activeTab:'SETUP', durationMode: typeof val === 'function' ? val(prev.durationMode) : val }));
  const setNumDays = (val: number | ((p: number) => number)) => setDraft(prev => ({ ...prev, matches:[], groups:[], qualifiers:{}, activeTab:'SETUP', numDays: typeof val === 'function' ? val(prev.numDays) : val }));
  const setStartTime = (val: string | ((p: string) => string)) => setDraft(prev => ({ ...prev, matches:[], groups:[], qualifiers:{}, activeTab:'SETUP', startTime: typeof val === 'function' ? val(prev.startTime) : val }));
  const setEndTime = (val: string | ((p: string) => string)) => setDraft(prev => ({ ...prev, matches:[], groups:[], qualifiers:{}, activeTab:'SETUP', endTime: typeof val === 'function' ? val(prev.endTime) : val }));
  const setMatchDuration = (val: number | ((p: number) => number)) => setDraft(prev => ({ ...prev, matches:[], groups:[], qualifiers:{}, activeTab:'SETUP', matchDuration: typeof val === 'function' ? val(prev.matchDuration) : val }));
  const setBreakDuration = (val: number | ((p: number) => number)) => setDraft(prev => ({ ...prev, matches:[], groups:[], qualifiers:{}, activeTab:'SETUP', breakDuration: typeof val === 'function' ? val(prev.breakDuration) : val }));
  const setNumFields = (val: number | ((p: number) => number)) => setDraft(prev => ({ ...prev, matches:[], groups:[], qualifiers:{}, activeTab:'SETUP', numFields: typeof val === 'function' ? val(prev.numFields) : val }));
  const setFormat = (val: TournamentFormat | ((p: TournamentFormat) => TournamentFormat)) => setDraft(prev => ({ ...prev, matches:[], groups:[], qualifiers:{}, activeTab:'SETUP', format: typeof val === 'function' ? val(prev.format) : val }));
  const setHasThirdPlace = (val: boolean | ((p: boolean) => boolean)) => setDraft(prev => ({ ...prev, matches:[], groups:[], qualifiers:{}, activeTab:'SETUP', hasThirdPlace: typeof val === 'function' ? val(prev.hasThirdPlace) : val }));
  const setAwardCeremonyDuration = (val: number | ((p: number) => number)) => setDraft(prev => ({ ...prev, matches:[], groups:[], qualifiers:{}, activeTab:'SETUP', awardCeremonyDuration: typeof val === 'function' ? val(prev.awardCeremonyDuration) : val }));
  const setHasAwardCeremony = (val: boolean | ((p: boolean) => boolean)) => setDraft(prev => ({ ...prev, matches:[], groups:[], qualifiers:{}, activeTab:'SETUP', hasAwardCeremony: typeof val === 'function' ? val(prev.hasAwardCeremony) : val }));
  const setMatches = (val: Match[] | ((p: Match[]) => Match[])) => setDraft(prev => ({ ...prev, matches: typeof val === 'function' ? val(prev.matches) : val }));
  const setGroups = (val: Group[] | ((p: Group[]) => Group[])) => setDraft(prev => ({ ...prev, groups: typeof val === 'function' ? val(prev.groups) : val }));
  const setActiveTab = (val: ('SETUP' | 'SCHEDULE' | 'STANDINGS') | ((p: 'SETUP' | 'SCHEDULE' | 'STANDINGS') => 'SETUP' | 'SCHEDULE' | 'STANDINGS')) => setDraft(prev => ({ ...prev, activeTab: typeof val === 'function' ? val(prev.activeTab) : val }));

  const addTeam = () => {
    const newId = crypto.randomUUID();
    const nextLetter = String.fromCharCode(65 + teams.length);
    setTeams([...teams, { id: newId, name: `Team ${nextLetter}` }]);
  };

  const removeTeam = (id: string) => {
    if (teams.length <= 2) return;
    setTeams(teams.filter(t => t.id !== id));
  };

  const updateTeamName = (id: string, name: string) => {
    setDraft(prev=>({...prev,teams:prev.teams.map(t=>t.id===id?{...t,name}:t)}));
  };

  const updateScore = (matchId: string, scoreA: number | undefined, scoreB: number | undefined) => {
    setDraft(prev => {
      const editedGroup = prev.matches.find(m=>m.id===matchId)?.group;
      const qualifiers = editedGroup ? {...prev.qualifiers,[editedGroup]:[]} : prev.qualifiers;
      const updated=prev.matches.map(m=>m.id===matchId ? {...m,scoreA,scoreB,decidingWinnerId:undefined} : m);
      return {...prev,qualifiers,matches:resolveBracket(updated,prev.teams,prev.groups,qualifiers)};
    });
  };
  const decideWinner = (id:string,teamId:string) => setDraft(prev=>({...prev,matches:resolveBracket(prev.matches.map(m=>m.id===id?{...m,decidingWinnerId:teamId}:m),prev.teams,prev.groups,prev.qualifiers)}));
  const standings = useMemo(()=>standingsFor(teams,matches),[teams,matches]);
  const setQualifier = (group:Group, rank:number, teamId:string) => setDraft(prev=>{
    const order=[...(prev.qualifiers?.[group.name] || Array(group.teamIds.length).fill(''))];
    const previous=order[rank];const index=order.indexOf(teamId);if(index>=0)order[index]=previous;order[rank]=teamId;
    const qualifiers={...prev.qualifiers,[group.name]:order};
    return {...prev,qualifiers,matches:resolveBracket(prev.matches,prev.teams,prev.groups,qualifiers)};
  });

  const groupStandings = useMemo(() => {
    return groups.map(g => ({
      ...g,
      standings: standings.filter(s => g.teamIds.includes(s.teamId))
    }));
  }, [standings, groups]);

  // --- Generation Logic ---

  const generateTournament = () => {
    setIsGenerating(true); setError(null);
    setTimeout(()=>{
      try {
        const config: TournamentConfig={teams,durationMode,numDays,startTime,endTime,matchDuration,breakDuration,numFields,format,hasThirdPlace,hasAwardCeremony,awardCeremonyDuration};
        const generated=makeTournament(config);
        const scheduled=scheduleTournament(generated.matches,config);
        setDraft(prev=>({...prev,groups:generated.groups,matches:resolveBracket(scheduled,teams,generated.groups),qualifiers:{},activeTab:'SCHEDULE'}));
      } catch(e){setError(e instanceof Error?e.message:'Die Planung ist fehlgeschlagen.');}
      setIsGenerating(false);
    },20);
  };

  // --- Exports ---

  const downloadExcel = () => {
    const wb = XLSX.utils.book_new();
    
    // Sheet 1: Schedule
    const scheduleData = matches.map(m => ({
      'Tag': m.day,
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
    const standingsData = groupStandings.flatMap(group=>group.standings.map((s, i) => ({
      'Gruppe':group.name,
      'Platz': i + 1,
      'Team': getTeamName(s.teamId),
      'Spiele': s.games,
      'S': s.wins,
      'U': s.draws,
      'N': s.losses,
      'Tore': `${s.goalsFor}:${s.goalsAgainst}`,
      'Diff': s.goalDiff,
      'Punkte': s.points
    })));
    if(groups.length)XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(standingsData), "Gruppentabellen");

    const final=matches.find(m=>m.stage==='FINAL');
    const third=matches.find(m=>m.stage==='THIRD_PLACE');
    if(final?.winnerId){
      const finalRankingData=[{Rang:1,Team:getTeamName(final.winnerId)},{Rang:2,Team:getTeamName(final.winnerId===final.teamAId?final.teamBId:final.teamAId)}];
      if(third?.winnerId)finalRankingData.push({Rang:3,Team:getTeamName(third.winnerId)},{Rang:4,Team:getTeamName(third.winnerId===third.teamAId?third.teamBId:third.teamAId)});
      XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(finalRankingData),'Endplatzierung');
    }

    XLSX.writeFile(wb, "Turnierplan.xlsx");
  };

  const downloadPDF = () => {
    const doc = new jsPDF();
    doc.setFontSize(20);
    doc.text("Turnierplan", 14, 22);
    doc.setFontSize(11);
    doc.text(`Datum: ${new Date().toLocaleDateString()}`, 14, 30);

    // Schedule Table
    autoTable(doc, {
      startY: 40,
      head: [['Tag', 'Zeit', 'Feld', 'Team A', 'Team B', 'Ergebnis']],
      body: matches.map(m => [
        m.day, m.time, 
        m.field, 
        m.teamAId ? getTeamName(m.teamAId) : m.placeholderA, 
        m.teamBId ? getTeamName(m.teamBId) : m.placeholderB,
        m.scoreA !== undefined && m.scoreB !== undefined ? `${m.scoreA}:${m.scoreB}` : '-'
      ]),
    });

    if(groups.length){
      doc.addPage();doc.text('Gruppentabellen',14,22);
      autoTable(doc,{startY:30,head:[['Gruppe','Platz','Team','Sp','Tore','Diff','Pkt']],body:groupStandings.flatMap(group=>group.standings.map((s,i)=>[group.name,i+1,getTeamName(s.teamId),s.games,`${s.goalsFor}:${s.goalsAgainst}`,s.goalDiff,s.points]))});
    }
    const final=matches.find(m=>m.stage==='FINAL');
    if(final?.winnerId){doc.addPage();doc.text('Endplatzierung',14,22);const ranking=[[1,getTeamName(final.winnerId)],[2,getTeamName(final.winnerId===final.teamAId?final.teamBId:final.teamAId)]];const third=matches.find(m=>m.stage==='THIRD_PLACE');if(third?.winnerId)ranking.push([3,getTeamName(third.winnerId)],[4,getTeamName(third.winnerId===third.teamAId?third.teamBId:third.teamAId)]);autoTable(doc,{startY:30,head:[['Platz','Team']],body:ranking});}

    doc.save("Turnierplan.pdf");
  };

  const getTeamName = (id: string) => teams.find(t => t.id === id)?.name || id;

  return (
    <div className="min-h-screen bg-[#1C1F2A] text-white font-sans selection:bg-blue-500 selection:text-white">
      {storageError && <p role="alert" className="bg-amber-500/20 p-3 text-sm">{storageError}</p>}
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
              {matches.some(m=>m.stage!=='GROUP'&&!m.sourceA&&!m.sourceB) && <p className="text-amber-300 text-sm">Dieser Plan stammt aus der älteren K.-o.-Logik. Bitte im Setup neu generieren, bevor ihr das Turnier durchführt.</p>}
              {matches.length === 0 ? (
                <div className="text-center py-20 glass-card rounded-3xl border-dashed border-white/10">
                  <Calendar size={48} className="mx-auto text-white/20 mb-4" />
                  <p className="text-gray-500">Noch kein Spielplan generiert. Gehe zu Setup.</p>
                </div>
              ) : (
                <div className="space-y-10">
                  {hasAwardCeremony && <p className="text-sm text-gray-300">Siegerehrung: {awardCeremonyDuration} Minuten nach dem letzten Spiel (im Zeitplan reserviert).</p>}
                  {/* Group by Day */}
                  {[...new Set(matches.map(m => m.day))].sort((a,b)=>Number(a||0)-Number(b||0)).map(day => (
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
                                  aria-label={`Tore Team A ${match.id}`} disabled={!match.teamAId || !match.teamBId}
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
                                  aria-label={`Tore Team B ${match.id}`} disabled={!match.teamAId || !match.teamBId}
                                  value={match.scoreB ?? ''}
                                  onChange={e => {
                                    const val = e.target.value.replace(/\D/g, '');
                                    updateScore(match.id, match.scoreA, val === '' ? undefined : parseInt(val));
                                  }}
                                  className="w-12 h-10 bg-white/5 border border-white/10 rounded-lg text-center font-bold focus:border-blue-500 outline-none transition-colors"
                                />
                              </div>
                            </div>
                            {match.stage !== 'GROUP' && match.scoreA !== undefined && match.scoreB !== undefined && match.scoreA === match.scoreB && <label className="block mt-3 text-xs text-amber-300">Unentschieden: Sieger nach Entscheidung wählen<select aria-label={`Entscheidungssieger ${match.id}`} value={match.decidingWinnerId||''} onChange={e=>decideWinner(match.id,e.target.value)} className="block w-full bg-[#252938] rounded p-2 mt-1"><option value="">Bitte wählen</option><option value={match.teamAId}>{getTeamName(match.teamAId)}</option><option value={match.teamBId}>{getTeamName(match.teamBId)}</option></select></label>}
                            {match.winnerId && <p className="mt-2 text-xs text-emerald-400">Sieger: {getTeamName(match.winnerId)}</p>}
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
                      {matches.filter(m=>m.group===group.name).every(m=>m.scoreA!==undefined&&m.scoreB!==undefined) && group.standings.some((entry,i)=>i<2&&group.standings.some((other,j)=>i!==j&&entry.points===other.points&&entry.goalDiff===other.goalDiff&&entry.goalsFor===other.goalsFor)) && <div className="p-4 text-xs text-amber-300 space-y-2"><p>Gleichstand nach Punkten, Tordifferenz und Toren. Qualifikation nach eurem weiteren Entscheidungsverfahren bestätigen:</p>{group.standings.slice(0,2).map((entry,rank)=><label key={rank} className="block">Platz {rank+1}<select aria-label={`${group.name} Qualifikation Platz ${rank+1}`} className="ml-2 bg-[#252938] p-2 rounded" value={draft.qualifiers?.[group.name]?.[rank]||''} onChange={e=>setQualifier(group,rank,e.target.value)}><option value="">Bitte bestätigen</option>{group.standings.filter(t=>t.points===entry.points&&t.goalDiff===entry.goalDiff&&t.goalsFor===entry.goalsFor).map(t=><option key={t.teamId} value={t.teamId}>{getTeamName(t.teamId)}</option>)}</select></label>)}</div>}
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
