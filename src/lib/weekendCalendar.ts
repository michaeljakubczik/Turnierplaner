import type { DateEntry } from './seasonSolver';
// A blank Saturday precedes a month-opening Sunday; a blank Sunday follows its last Saturday.
export function weekendSlots(days: DateEntry[]): (DateEntry | null)[] {
  const slots: (DateEntry | null)[] = [];
  if (days.length && new Date(days[0].value).getUTCDay() === 0) slots.push(null);
  slots.push(...days);
  if (slots.length % 2) slots.push(null);
  return slots;
}
