import { draftKey, planRank, seasonInput, type SeasonDraft, type SeasonProject } from './seasonProject';
import { teamDailyLimit } from './seasonLimits';
import { teamDayCounts } from './seasonSpacing';
import { seasonTravel } from './seasonTravel';
import { journeyKm, manualKm } from './teamTravel';

export const hardPlanningRules = [
  'Jedes Teampaar spielt genau matchMode-mal gegeneinander. Keine Spiele eines Teams gegen sich selbst.',
  'Nur ausgewählte Termine und verfügbare Teams verwenden. Nicht jeder ausgewählte Termin muss genutzt werden.',
  'Je verwendetem Termin genau ein verfügbarer Gastgeber mit Heimspielmöglichkeit und ausreichender Kapazität für alle anwesenden Teams. Der Gastgeber spielt mindestens einmal mit.',
  'An regulären Spieltagen insgesamt mindestens zwei Spiele und höchstens maxMatchesPerDay Spiele.',
  'Bei Team-Tageslimit 1 höchstens ein Spiel. Bei Tageslimit 2 oder 3 normalerweise höchstens zwei Spiele; drei Spiele sind höchstens maxTripleDaysPerTeam-mal pro Team und Saison erlaubt. Das Gesamt-Tageslimit gilt zusätzlich.',
  'maxDaysPerTeam, falls gesetzt, begrenzt die Zahl unterschiedlicher Spieltage für jedes Team einschließlich Saisonabschluss. Mehrere Spiele am gleichen Datum zählen einmal. maxSeasonDays ist nur eine ältere globale Begrenzung, falls im archivierten Eingabesatz vorhanden.',
  'Gäste mit einfacher Anreise über 100 km haben mindestens zwei Spiele an einem regulären Termin. Genau 100 km zählt nicht als weite Anreise. Manuelle Wegstrecke hat Vorrang, ansonsten Luftlinie zwischen den Koordinaten. Fehlende Entfernungen nicht als 0 km werten; für neue Suchen müssen die Heimspielorte aller Teams mit Koordinaten feststehen, außer bei einer Saison mit genau zwei Teams, Spielmodus 1 und ausschließlich gemeinsamem Abschluss.',
  'Ein Teampaar spielt höchstens einmal am selben Tag, außer allowRepeatPairPerDay ist aktiviert.',
  'Wenn allTeamsOnFinalDay aktiv ist: am letzten gemeinsam verfügbaren ausgewählten Termin genau ein Spiel je Team. Gerade Teamzahl, verfügbare Heimspielmöglichkeit, Kapazität für alle Teams und mindestens Teamzahl/2 Spiele als Tageskapazität sind erforderlich. Alle späteren Termine entfallen. Dieser Abschluss ist von den regulären Mindestzahlen und der Zwei-Spiele-Regel für weite Anreisen ausgenommen.'
];
export const rankCriteria = [
  'Spannweite der Heimspieltagzahlen (Maximum minus Minimum) minimieren; fehlende Heimspielmöglichkeiten führen nicht zum Ausschluss.',
  'Gesamtzahl verwendeter Ligaspieltage minimieren.',
  'Fehlende Besuche eines Teams bei einem anderen Gastgeber minimieren; möglichst jedes Team mindestens einmal bei jedem anderen Team.',
  'Reguläre Heimspieltage mit nur einem Spiel für den Gastgeber minimieren; möglichst zwei, gemeinsamer Abschluss ausgenommen.',
  'Auswärtsspieltage mit unbekannter Entfernung minimieren.',
  'Gesamte Hin- und Rückfahrt aller Teams über die Saison minimieren. Eine Fahrt je Team und Spieltag, unabhängig von der Anzahl der Spiele.',
  'Zeitliche Häufung in der Saison minimieren, sowohl für die Liga als auch für jedes Team. Aufeinanderfolgende Wochenenden bleiben erlaubt.',
  'Spiele mit unterschiedlichen Tages-Spielnummern der Gegner minimieren: erstes gegen erstes, zweites gegen zweites, drittes gegen drittes.',
  'Summe der quadrierten Unterschiede dieser Tages-Spielnummern minimieren.',
  'Auslastungswert minimieren: Teamtage mit einem Spiel × 250 + Summe Teamspieltage × 500 + Ligatage mit genau zwei Spielen × 500 + Varianz der Spiele je Ligatag × 10. Damit möglichst drei oder mehr Spiele je Ligatag und möglichst wenige einzelne Teamspiele.'
];
export function aiInput(draft: SeasonDraft) {
  const input = seasonInput(draft);
  return {
    rawSettings: draft,
    effective: {
      matchMode: draft.matchMode, maxMatchesPerDay: draft.maxMatchesPerDay,
      maxMatchesPerTeamPerDay: draft.maxMatchesPerTeamPerDay,
      maxTripleDaysPerTeam: input.maxTripleDaysPerTeam,
      effectiveDailyTeamLimit: teamDailyLimit({...input,maxTripleDaysPerTeam:input.maxTripleDaysPerTeam!}),
      maxDaysPerTeam: draft.maxDaysPerTeam ?? null,
      allowRepeatPairPerDay: draft.allowRepeatPairPerDay ?? false,
      allTeamsOnFinalDay: input.allTeamsOnFinalDay,
      finalDayCandidate: input.finalDayCandidate ?? null,
      usableDates: input.seasonDates,
      ignoredLateDates: draft.dates.filter(d=>!input.seasonDates.some(u=>u.id===d.id)),
      requiredGamesPerTeam: (draft.teams.length-1)*draft.matchMode,
      requiredGamesTotal: draft.teams.length*(draft.teams.length-1)/2*draft.matchMode,
    },
    calendar: [...draft.dates].sort((a,b)=>a.value.localeCompare(b.value)).map(date=>({...date,
      availableTeamIds:draft.teams.filter(t=>draft.availability[t.id]?.[date.id]).map(t=>t.id),
      hostTeamIds:draft.teams.filter(t=>draft.homeAvailability[t.id]?.[date.id]&&draft.availability[t.id]?.[date.id]).map(t=>t.id)
    })),
    distances: draft.teams.flatMap((a,i)=>draft.teams.slice(i+1).map(b=>({teamA:a.id,teamB:b.id,
      oneWayKm:journeyKm(a,b,draft),reverseOneWayKm:journeyKm(b,a,draft),source:journeyKm(a,b,draft)===null?'unknown':manualKm(a,b,draft)!==null?'manual':draft.distanceMode==='road'?'road':'air'
    })))
  };
}
export function aiPlanBundle(project: SeasonProject, seasonName: string) {
  const inputs=[project.draft], indices=new Map([[draftKey(project.draft),0]]);
  const plans=project.plans.map(plan=>{
    const key=draftKey(plan.draft);
    if(!indices.has(key)){indices.set(key,inputs.length);inputs.push(plan.draft);}
    const index=indices.get(key)!;
    const input=seasonInput(plan.draft), travel=seasonTravel(plan.schedule,plan.draft.teams,plan.draft), days=teamDayCounts(plan.schedule,plan.draft.teams);
    return {id:plan.id,inputSetId:`input-${index}`,matchesCurrentSettings:index===0,favorite:plan.favorite,createdAt:plan.createdAt,
      rankVector:planRank(plan,plan.draft.teams,input.seasonDates,input),
      totalGameDays:Object.keys(plan.schedule).length,totalRoundTripKm:travel.totalKm,unknownTrips:travel.unknownTrips,
      teams:plan.draft.teams.map(t=>({id:t.id,name:t.name,gameDays:days[t.id],homeDays:Object.values(plan.schedule).filter(d=>d.hostId===t.id).length,...travel.byTeam[t.id]})),
      days:Object.entries(plan.schedule).map(([dateId,day])=>({dateId,date:plan.draft.dates.find(d=>d.id===dateId)?.value,hostId:day.hostId,matches:day.matches})).sort((a,b)=>(a.date??'').localeCompare(b.date??'')),
      schedule:plan.schedule,validationReport:plan.report
    };
  });
  return {format:'matchmaster-ai-plans',version:1,seasonName,exportedAt:new Date().toISOString(),currentInputSetId:'input-0',
    scope:'Alle vollständig gespeicherten Spielpläne dieser Saison, unabhängig von Ansicht, Filtern und Favoriten. Nur gezählte Suchsignaturen ohne gespeicherten vollständigen Plan können nicht exportiert werden.',
    planCount:plans.length,currentSettingsPlanCount:plans.filter(p=>p.matchesCurrentSettings).length,
    rules:{hard:hardPlanningRules,softLexicographic:rankCriteria,ranking:'Lexikografisch: erster unterschiedlicher Wert gewinnt, jeweils kleiner ist besser. Bei identischem Vektor entscheidet die kanonische Spielplansignatur als technischer Gleichstandsauflöser.'},
    inputSets:inputs.map((d,i)=>({id:`input-${i}`,...aiInput(d)})),plans};
}
export function aiPlanningPrompt(project: SeasonProject, seasonName: string): string {
  return `Du bist ein Spielplan-Optimierer für eine Inline-Skaterhockey-Saison. Saisonname: ${JSON.stringify(seasonName)}.

AUFTRAG
Erstelle einen gültigen Saisonspielplan anhand der folgenden Eingaben. Falls ich zusätzlich eine Datei „*-spielplaene-ki.json“ mitliefere, prüfe und vergleiche alle darin gespeicherten Pläne und empfehle die besten drei zu meinen AKTUELLEN Einstellungen. Nutze nur Einträge mit matchesCurrentSettings=true aus input-0 als direkt passende Kandidaten. Andere Eingabesätze sind historische Pläne, keine gültigen Alternativen zur aktuellen Konfiguration; sie dürfen als Anregung für eine ausdrücklich gekennzeichnete Neuplanung dienen.

HARTE BEDINGUNGEN
${hardPlanningRules.map((r,i)=>`${i+1}. ${r}`).join('\n')}

WEICHE KRITERIEN IN VERBINDLICHER PRIORITÄTSREIHENFOLGE
Die Ziele sind lexikografisch, keine frei gewichtete Gesamtnote. Beim ersten unterschiedlichen rankVector-Wert ist der kleinere Wert besser. Weiche Abweichungen sind keine Ausschlussgründe.
${rankCriteria.map((r,i)=>`${i+1}. ${r}`).join('\n')}

DATENINTERPRETATION
Team- und Termin-IDs sind verbindlich. Fehlende oder false-Verfügbarkeit bedeutet nicht verfügbar; fehlende oder false-Heimspielmöglichkeit bedeutet kein Gastgeber. rawSettings enthält sämtliche eingegebenen Planungsdaten einschließlich Orte, Koordinaten, manueller Entfernungen und Verfügbarkeiten. effective enthält die tatsächlich wirksamen Grenzen und den gemeinsamen Abschluss. Die Paar-Entfernungen sind einfache Anreisen in km; null bedeutet unbekannt. Hin- und Rückfahrt ist bei Luftlinie/manuellen symmetrischen Distanzen zweimal die einfache Strecke. Bei älteren Straßenkilometer-Eingabesätzen kann reverseOneWayKm abweichen; Hin- und Rückfahrt dann addieren statt verdoppeln. Die gespeicherten Prüfberichte sind historische Berichte, keine Ersatzprüfung. Spielreihenfolge innerhalb eines Tages ist für die Tages-Spielnummern relevant. Favoriten sind eine persönliche Markierung, kein zusätzliches hartes Kriterium. Ferienfarben sind eine Kalenderhilfe und sperren keine Termine zusätzlich zur eingetragenen Verfügbarkeit.

AKTUELLE EINGABEN (JSON)
${JSON.stringify({seasonName,holidayRegions:project.holidayRegions,...aiInput(project.draft)},null,2)}

ERWARTETE ANTWORT
1. Bei mitgelieferten Plänen: Empfehlung mit exakten Plan-IDs, Vergleich der drei besten passenden Kandidaten und Begründung anhand der ersten unterschiedlichen Priorität. Wenn keine passenden Kandidaten vorliegen, sage das ausdrücklich.
2. Bei einer neuen Suche: vollständiger Spielplan als JSON {schedule:{TERMIN_ID:{hostId:TEAM_ID,matches:[{teamA:TEAM_ID,teamB:TEAM_ID}]}}} und lesbare Tabelle nach Datum, Gastgeber und Spielreihenfolge.
3. Prüfe jede harte Bedingung ausdrücklich, die Paarungsanzahlen, Spiele und Spieltage je Team, Drei-Spiele-Tage, Heimspielverteilung, Gastgeberbesuche und gesamte Hin- und Rückfahrt. Fehlende Entfernungen separat nennen.
4. Erfinde keine Termine, Verfügbarkeiten, Koordinaten oder Kapazitäten. Führe für große Datenmengen, wenn möglich, eine programmatische vollständige Prüfung durch. Eine KI-Aussage allein ist keine garantierte Validierung. Behaupte ohne Beweis keine globale Bestlösung oder Unmöglichkeit; bei fehlender Lösung unterscheide nachgewiesene Engstellen von einem erfolglosen Suchlauf und nenne konkrete Verbesserungsvorschläge.
`;
}
export const aiExportStem = (seasonName: string) => seasonName.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-zA-Z0-9_-]+/g,'-').replace(/^-+|-+$/g,'').slice(0,80)||'saison';
