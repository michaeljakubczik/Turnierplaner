export type Region = 'HB' | 'HH' | 'NI';
export const regionNames: Record<Region, string> = { HB: 'Bremen', HH: 'Hamburg', NI: 'Niedersachsen' };
export type CalendarPeriod = { name: string; start: string; end: string; kind: 'vacation' | 'holiday' };
// Official first and last vacation days. Checked 2026-10-09.
// NI: https://www.mk.niedersachsen.de/download/98088/Ferienuebersicht_Schuljahr_2024_25_-_2029_30_fuer_Sehbehinderte_.pdf
// HB: https://www.bildung.bremen.de/ferientermine-3404
// HH: https://www.hamburg.de/resource/blob/134372/5bc131bdd36a604f67b361d21f7df37e/ferienordnung-hamburg-2024-2030-data.pdf
const northern: Record<number, string[]> = {
  2026: ['03-23/04-07', '07-02/08-12', '10-12/10-24'],
  2027: ['03-22/04-03', '07-08/08-18', '10-16/10-30'],
  2028: ['04-10/04-22', '07-20/08-30', '10-23/11-04'],
  2029: ['03-19/04-03', '07-19/08-29', '10-22/11-02'],
};
const hamburg: Record<number, string[]> = {
  2026: ['03-02/03-13', '07-09/08-19', '10-19/10-30'],
  2027: ['03-01/03-12', '07-01/08-11', '10-11/10-22'],
  2028: ['03-06/03-17', '07-03/08-11', '10-02/10-13'],
  2029: ['03-05/03-16', '07-02/08-10', '10-01/10-12'],
};
export const hasVacationData = (year: number) => !!northern[year];
const iso = (date: Date) => date.toISOString().slice(0, 10);
const shift = (value: string, days: number) => { const d = new Date(value + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + days); return iso(d); };
export function calendarPeriods(year: number, region: Region): CalendarPeriod[] {
  const ranges = [...((region === 'HH' ? hamburg : northern)[year] || [])];
  if (region === 'HB' && year === 2027) ranges[2] = '10-18/10-30';
  const periods: CalendarPeriod[] = ranges.map((range, i) => {
    const [start, end] = range.split('/');
    return { name: [region === 'HH' ? 'Frühjahrsferien' : 'Osterferien', 'Sommerferien', 'Herbstferien'][i], start: `${year}-${start}`, end: `${year}-${end}`, kind: 'vacation' };
  });
  // Gregorian Easter (Meeus/Jones/Butcher).
  const a = year % 19, b = Math.floor(year / 100), c = year % 100, d = Math.floor(b / 4), e = b % 4;
  const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31), day = (h + l - 7 * m + 114) % 31 + 1;
  const easter = iso(new Date(Date.UTC(year, month - 1, day)));
  const holidays = [['Neujahr', `${year}-01-01`], ['Karfreitag', shift(easter, -2)], ['Ostermontag', shift(easter, 1)], ['Tag der Arbeit', `${year}-05-01`], ['Christi Himmelfahrt', shift(easter, 39)], ['Pfingstmontag', shift(easter, 50)], ['Tag der Deutschen Einheit', `${year}-10-03`], ['Reformationstag', `${year}-10-31`], ['1. Weihnachtstag', `${year}-12-25`], ['2. Weihnachtstag', `${year}-12-26`]];
  return [...periods, ...holidays.map(([name, date]) => ({ name, start: date, end: date, kind: 'holiday' as const }))];
}
export function periodMarks(value: string, periods: CalendarPeriod[]) {
  return periods.flatMap(period => {
    if (period.kind === 'holiday') return value === period.start ? [{ ...period, boundary: 'Feiertag' }] : [];
    const startDay = new Date(period.start + 'T00:00:00Z').getUTCDay();
    const endDay = new Date(period.end + 'T00:00:00Z').getUTCDay();
    const firstSaturday = shift(period.start, -((startDay + 1) % 7));
    const lastSaturday = shift(period.end, endDay === 0 ? -1 : (6 - endDay + 7) % 7);
    const startWeekend = value === firstSaturday || value === shift(firstSaturday, 1);
    const endWeekend = value === lastSaturday || value === shift(lastSaturday, 1);
    if (value < period.start || value > period.end) {
      if (!startWeekend && !endWeekend) return [];
    }
    return [{ ...period, boundary: startWeekend ? 'Startwochenende' : endWeekend ? 'Endwochenende' : '' }];
  });
}
