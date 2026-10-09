import { solveSeason, type SeasonInput, type SearchOptions } from './seasonSolver';

self.onmessage = (event: MessageEvent<{ input: SeasonInput; options: SearchOptions }>) => {
  try {
    const result = solveSeason(event.data.input, event.data.options, progress => self.postMessage({ type: 'progress', progress }));
    self.postMessage({ type: 'result', result });
  } catch {
    self.postMessage({ type: 'result', result: { schedule: null, report: null, searchStopped: false, error: 'Bei der Planung ist ein Fehler aufgetreten. Exportiere bitte deine Eingaben zur Prüfung.' } });
  }
};
