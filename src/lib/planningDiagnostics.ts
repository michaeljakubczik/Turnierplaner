import type { SeasonInput } from './seasonSolver';
export type PlanningTip = { title: string; detail: string; proven: boolean };
const label = (value: string) => new Date(value + 'T12:00:00').toLocaleDateString('de-DE');
export function analyzeSeason(input: SeasonInput): PlanningTip[] {
  const { teams, seasonDates: dates, availability: av, homeAvailability: hv, matchMode: mode, maxMatchesPerDay: dayMax, maxMatchesPerTeamPerDay: teamMax, maxTripleDaysPerTeam: triples, allTeamsOnFinalDay: finale, finalDayCandidate: final } = input;
  const tips: PlanningTip[] = [];
  const add = (title: string, detail: string, proven = false) => tips.push({title, detail, proven});
  const sample = (ds: typeof dates) => ds.slice(0, 3).map(d => label(d.value)).join(', ');
  const required = (teams.length - 1) * mode;
  for (const team of teams) {
    if (!team.homePlace) add(`Heimspielort für ${team.name} bestätigen`, 'Einen gefundenen Ort auswählen, damit die automatische 100-km-Regel geprüft werden kann.', true);
    const available = dates.filter(d => av[team.id]?.[d.id]);
    const regular = available.filter(d => !finale || d.id !== final?.id).length;
    const capacity = regular * Math.min(teamMax, 2) + (teamMax >= 3 ? Math.min(regular, triples) : 0) + (finale && available.some(d => d.id === final?.id) ? 1 : 0);
    if (capacity < required) add(`${team.name}: zu wenig Spielmöglichkeiten`, `${required} Spiele benötigt, höchstens ${capacity} mit den eingetragenen Terminen und Team-Limits möglich. Bei ${team.name} zusätzliche Termine anfragen oder das Tageslimit bzw. erlaubte Drei-Spiele-Tage prüfen.`, true);
    const tightPartners = teams.filter(other => other.id !== team.id && dates.filter(d => av[team.id]?.[d.id] && av[other.id]?.[d.id]).length === mode);
    if (tightPartners.length) add(`${team.name}: kaum Terminspielraum`, `Mit ${tightPartners.slice(0, 3).map(t => t.name).join(', ')} gibt es jeweils genau ${mode} gemeinsame Termine. Alle werden für diese Paarungen benötigt; zusätzliche gemeinsame Termine würden die Suche entlasten. Bei ${team.name} gezielt nach Alternativen fragen.`);
    const isolated = available.filter(d => teams.filter(t => av[t.id]?.[d.id]).length < 3 && !(finale && d.id === final?.id));
    if (isolated.length) add(`${team.name}: abweichende Termine abgleichen`, `${sample(isolated)}${isolated.length > 3 ? ' und weitere Termine' : ''}: Weniger als drei Teams verfügbar; dort sind regulär keine zwei unterschiedlichen Spiele möglich. Gemeinsame Ersatztermine mit anderen Teams erfragen.`, true);
    if (!available.some(d => hv[team.id]?.[d.id] && team.maxCapacity >= 3)) add(`Heimspielmöglichkeiten von ${team.name} prüfen`, 'Kein regulärer Heimspieltag mit mindestens drei Teams eingetragen. Weitere H-Termine oder die tatsächliche Gastgeberkapazität prüfen; fehlende Gastgeber erschweren die gleichmäßige Verteilung.');
  }
  let pairIssues = 0;
  for (let i = 0; i < teams.length; i++) for (let j = i + 1; j < teams.length; j++) {
    const a = teams[i], b = teams[j];
    const common = dates.filter(d => av[a.id]?.[d.id] && av[b.id]?.[d.id]);
    if (common.length < mode && pairIssues++ < 3) {
      const alternatives = dates.filter(d => !!av[a.id]?.[d.id] !== !!av[b.id]?.[d.id]);
      add(`${a.name} / ${b.name}: gemeinsame Termine fehlen`, `${common.length} gemeinsame Termine für ${mode} Begegnungen. Pro Paar ist nur eine Begegnung je Tag erlaubt. Verfügbarkeit beider Teams abgleichen${alternatives.length ? `, etwa am ${sample(alternatives)}` : ', und gemeinsame Termine ergänzen'}. Ein höheres Spielelimit allein löst diese Engstelle nicht.`, true);
    }
  }
  const usable = dates.map(d => {
    const n = teams.filter(t => av[t.id]?.[d.id]).length;
    const hosts = teams.filter(t => av[t.id]?.[d.id] && hv[t.id]?.[d.id]);
    const capacity = Math.min(n, Math.max(0, ...hosts.map(t => t.maxCapacity)));
    const isFinal = finale && d.id === final?.id;
    const upper = isFinal ? (capacity >= teams.length ? teams.length / 2 : 0) : capacity >= 3 ? Math.min(dayMax, Math.floor(capacity * teamMax / 2), n * (n - 1) / 2) : 0;
    return { d, upper, potential: Math.min(Math.floor(capacity * teamMax / 2), n * (n - 1) / 2), isFinal };
  });
  const total = teams.length * required / 2;
  const upper = usable.reduce((sum, d) => sum + d.upper, 0);
  if (upper < total) add('Gesamtkapazität reicht nicht', `Selbst großzügig gerechnet höchstens ${upper} Spiele auf nutzbaren Terminen, benötigt werden ${total}. Zusätzliche gemeinsame Termine, Gastgeberkapazitäten und Spielelimits prüfen. Anreise- und Drei-Spiele-Regeln können die Kapazität weiter verringern.`, true);
  const expandable = usable.filter(d => !d.isFinal && d.potential > dayMax);
  if (expandable.length) add('Mehr Spiele an gut besetzten Tagen prüfen', `Am ${sample(expandable.map(x => x.d))} lassen Team-Verfügbarkeit und Gastgeberkapazität rechnerisch mehr als ${dayMax} Spiele zu. „Max. Spiele pro Tag“ erhöhen könnte helfen und Spieltage sparen. Die Einstellung gilt für alle Tage; Team- und Anreiseregeln gelten weiterhin.`);
  if (finale && !final) add('Gemeinsamen Abschlusstermin abstimmen', 'Es gibt keinen ausgewählten Termin mit allen Teams. Einen gemeinsamen Termin erfragen und V für jedes Team bestätigen.', true);
  if (finale && final) {
    if (teams.length % 2) add('Gerade Teamzahl für den Abschluss nötig', 'Genau ein Spiel pro Team am Abschluss erfordert eine gerade Teamzahl. Teamzahl anpassen oder den gemeinsamen Abschluss deaktivieren.', true);
    if (dayMax < teams.length / 2) add('Spielelimit für den Abschluss erhöhen', `${teams.length} Teams benötigen ${teams.length / 2} Spiele. Das Tageslimit beträgt ${dayMax}.`, true);
    if (!teams.some(t => av[t.id]?.[final.id] && hv[t.id]?.[final.id] && t.maxCapacity >= teams.length)) add('Gastgeber für den Abschluss bestätigen', `Am ${label(final.value)} H bei einem verfügbaren Team aktivieren, das tatsächlich alle ${teams.length} Teams aufnehmen kann.`, true);
    if (input.ignoredLateDates) add('Spätere Termine werden ausgeschlossen', `${input.ignoredLateDates} Termine nach dem gemeinsamen Abschluss zählen nicht zur Kapazität. Falls benötigt, einen späteren gemeinsamen Abschluss abstimmen.`);
  }
  if (teamMax < 2) add('Weite Anreisen benötigen zwei Spiele', 'Bei mehr als 100 km Luftlinie brauchen Gäste regulär mindestens zwei Spiele. Mit einem Spiel pro Team sind solche Anreisen ausgeschlossen. Das Team-Tageslimit prüfen.');
  // Put verifiable bottlenecks before suggestions; keep the complete list accessible.
  add('Suche fortsetzen und Eingaben prüfen', '„Gründlich suchen“ verwenden. Bei einem Suchlimit ist Unmöglichkeit nicht bewiesen. Bleibt die Suche erfolglos, Eingaben exportieren; damit lassen sich schwierige Kombinationen gezielt untersuchen.');
  return tips.sort((a, b) => Number(b.proven) - Number(a.proven));
}
