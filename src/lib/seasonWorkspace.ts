import { emptyProject, migrateTeamDayLimit, parseProject, type SeasonDraft, type SeasonProject } from './seasonProject';

export const workspaceStorageKey = 'matchmaster_seasons_v1';
export type SeasonRecord = { id: string; name: string; project: SeasonProject };
export type SeasonWorkspace = { format: 'matchmaster-seasons'; version: 1; activeSeasonId: string; seasons: SeasonRecord[] };
export type PlanArchive = Pick<SeasonProject, 'plans' | 'selectedId' | 'seen'>;

const editableProject = (project: SeasonProject): SeasonProject => ({ ...project, draft: { ...migrateTeamDayLimit(project.draft), distanceMode: 'air' } });
export function workspaceFromProject(project: SeasonProject, name = 'Saison 1'): SeasonWorkspace {
  const id = crypto.randomUUID();
  return { format: 'matchmaster-seasons', version: 1, activeSeasonId: id, seasons: [{ id, name, project: editableProject(project) }] };
}
export function parseWorkspace(value: unknown): SeasonWorkspace {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Ungültige Saisondatei.');
  const v = value as Record<string, unknown>;
  if (v.format === 'turnierplaner-project') return workspaceFromProject(parseProject(value));
  if (v.format !== 'matchmaster-seasons' || v.version !== 1 || !Array.isArray(v.seasons) || !v.seasons.length || v.seasons.length > 200) throw new Error('Ungültige Saisondatei oder nicht unterstützte Version.');
  const seasons = v.seasons.map((entry: unknown): SeasonRecord => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) throw new Error('Ungültige Saison.');
    const s = entry as Record<string, unknown>;
    if (typeof s.id !== 'string' || !s.id || s.id.length > 1000 || typeof s.name !== 'string' || !s.name.trim() || s.name.length > 100) throw new Error('Ungültiger Saisonname oder Saison-ID.');
    return { id: s.id, name: s.name, project: editableProject(parseProject(s.project)) };
  });
  if (new Set(seasons.map(s => s.id)).size !== seasons.length || !seasons.some(s => s.id === v.activeSeasonId)) throw new Error('Doppelte Saison-ID oder aktive Saison nicht gefunden.');
  return { format: 'matchmaster-seasons', version: 1, activeSeasonId: v.activeSeasonId as string, seasons };
}
export function updateSeasonProject(workspace: SeasonWorkspace, id: string, update: SeasonProject | ((previous: SeasonProject) => SeasonProject)): SeasonWorkspace {
  return { ...workspace, seasons: workspace.seasons.map(s => s.id === id ? { ...s, project: typeof update === 'function' ? update(s.project) : update } : s) };
}
export function addSeason(workspace: SeasonWorkspace, name: string, draft: SeasonDraft): SeasonWorkspace {
  const trimmed = name.trim();
  if (!trimmed || trimmed.length > 100) throw new Error('Bitte einen Saisonnamen mit höchstens 100 Zeichen eingeben.');
  if (workspace.seasons.length >= 200) throw new Error('Maximal 200 Saisons möglich.');
  const id = crypto.randomUUID();
  return { ...workspace, activeSeasonId: id, seasons: [...workspace.seasons, { id, name: trimmed, project: editableProject(emptyProject(structuredClone(draft))) }] };
}
export function clearPlanArchive(project: SeasonProject): SeasonProject {
  return { ...project, plans: [], selectedId: null, seen: {} };
}
export function restorePlanArchive(project: SeasonProject, archive: PlanArchive): SeasonProject {
  return { ...project, plans: archive.plans, selectedId: archive.selectedId, seen: archive.seen };
}
