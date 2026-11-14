import type { Result } from '@lunar/contracts';

/** An independent part of the class activity (maps to a lesson in the class package). */
export interface ClassPart {
  title: string;
  note?: string;
}

export interface ClassTeam {
  id: string;
  name: string;
  /** Round index -> points scored in that round. */
  roundScores: number[];
}

export interface ClassSession {
  name: string;
  description?: string;
  siteIds: string[];
  parts: ClassPart[];
  teams: ClassTeam[];
  /** Number of rounds started so far (current round = rounds - 1). */
  rounds: number;
}

export interface ClassSessionInit {
  name: string;
  description?: string;
  siteIds?: string[];
  parts?: ClassPart[];
  teams?: string[];
}

export interface ClassSessionApi {
  readonly session: ClassSession;
  addTeam(name: string): Result<string>;
  startRound(): number;
  addScore(teamId: string, points: number): Result<number>;
  totals(): Array<{ teamId: string; name: string; total: number }>;
  /** Teams ordered by total score (desc), ties by name. For the projector view. */
  ranking(): Array<{ teamId: string; name: string; total: number }>;
  /** Part by index, usable on its own (independent parts). */
  getPart(index: number): Result<ClassPart>;
}

/** Local, serverless class session: teams, rounds, scores and independent parts. */
export function createClassSession(init: ClassSessionInit): ClassSessionApi {
  const session: ClassSession = {
    name: init.name,
    siteIds: [...(init.siteIds ?? [])],
    parts: (init.parts ?? []).map((p) => ({ ...p })),
    teams: [],
    rounds: 0,
  };
  if (init.description !== undefined) session.description = init.description;

  const addTeam = (name: string): Result<string> => {
    const trimmed = name.trim();
    if (trimmed.length === 0) return { ok: false, error: 'team name is empty' };
    if (session.teams.some((t) => t.name === trimmed)) {
      return { ok: false, error: 'team name already exists' };
    }
    const id = `team-${session.teams.length + 1}`;
    session.teams.push({ id, name: trimmed, roundScores: [] });
    return { ok: true, value: id };
  };
  for (const t of init.teams ?? []) addTeam(t);

  const totals = (): Array<{ teamId: string; name: string; total: number }> =>
    session.teams.map((t) => ({
      teamId: t.id,
      name: t.name,
      total: t.roundScores.reduce((a, b) => a + (b ?? 0), 0),
    }));

  return {
    session,
    addTeam,
    startRound: () => {
      session.rounds += 1;
      return session.rounds - 1;
    },
    addScore: (teamId, points) => {
      if (session.rounds === 0) return { ok: false, error: 'no round started' };
      if (!Number.isFinite(points)) return { ok: false, error: 'invalid points' };
      const team = session.teams.find((t) => t.id === teamId);
      if (!team) return { ok: false, error: 'unknown team' };
      const r = session.rounds - 1;
      while (team.roundScores.length <= r) team.roundScores.push(0);
      team.roundScores[r] = (team.roundScores[r] ?? 0) + points;
      return { ok: true, value: team.roundScores[r] ?? 0 };
    },
    totals,
    ranking: () => totals().sort((a, b) => b.total - a.total || a.name.localeCompare(b.name)),
    getPart: (index) => {
      const part = session.parts[index];
      return part ? { ok: true, value: { ...part } } : { ok: false, error: 'part not found' };
    },
  };
}
