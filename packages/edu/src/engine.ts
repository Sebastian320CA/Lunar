import raw from './questions.json';

export type Lang = 'es' | 'en';
export type Category = 'moon' | 'illumination' | 'communications' | 'sites';
export type Difficulty = 1 | 2 | 3;

export interface Question {
  id: string;
  category: Category;
  difficulty: Difficulty;
  prompt: Record<Lang, string>;
  options: Record<Lang, string[]>;
  /** Index into options (same index in both languages). */
  answer: number;
  explanation: Record<Lang, string>;
  source: string;
  i18nKeys: { prompt: string; explanation: string };
}

export const questionBank: readonly Question[] = raw as unknown as Question[];

export type Phase = 'question' | 'explanation' | 'done';

export interface TriviaState {
  phase: Phase;
  level: Difficulty;
  streak: number;
  score: number;
  answered: number;
  current: Question | null;
  lastCorrect: boolean | null;
}

export interface Trivia {
  state(): TriviaState;
  /** Starts the first question (or moves from explanation to a new, different question). */
  next(): Question | null;
  /** Answers the current question; moves to the explanation phase. */
  answer(optionIndex: number): { correct: boolean; explanation: Question['explanation']; source: string } | null;
}

/** Small deterministic PRNG (mulberry32). */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const clampLevel = (n: number): Difficulty => (n < 1 ? 1 : n > 3 ? 3 : (n as Difficulty));

/**
 * Trivia session. Flow: question -> explanation -> different question -> explanation.
 * No question repeats within a session. Difficulty adapts: a correct answer raises the
 * level by one (max 3), a wrong answer lowers it by one (min 1). The next question is
 * drawn from the unused ones closest to the current level.
 */
export function createTrivia(bank: readonly Question[] = questionBank, seed = 1): Trivia {
  const rnd = mulberry32(seed);
  const used = new Set<string>();
  const st: TriviaState = {
    phase: 'question',
    level: 1,
    streak: 0,
    score: 0,
    answered: 0,
    current: null,
    lastCorrect: null,
  };

  const pick = (): Question | null => {
    const pool = bank.filter((q) => !used.has(q.id));
    if (pool.length === 0) return null;
    const dist = Math.min(...pool.map((q) => Math.abs(q.difficulty - st.level)));
    const near = pool.filter((q) => Math.abs(q.difficulty - st.level) === dist);
    return near[Math.floor(rnd() * near.length)] ?? null;
  };

  return {
    state: () => ({ ...st }),
    next() {
      if (st.phase === 'question' && st.current) return st.current; // unanswered: keep it
      const q = pick();
      if (!q) {
        st.phase = 'done';
        st.current = null;
        return null;
      }
      used.add(q.id);
      st.current = q;
      st.phase = 'question';
      st.lastCorrect = null;
      return q;
    },
    answer(optionIndex) {
      if (st.phase !== 'question' || !st.current) return null;
      const q = st.current;
      const correct = optionIndex === q.answer;
      st.answered += 1;
      if (correct) {
        st.score += q.difficulty;
        st.streak += 1;
        st.level = clampLevel(st.level + 1);
      } else {
        st.streak = 0;
        st.level = clampLevel(st.level - 1);
      }
      st.lastCorrect = correct;
      st.phase = 'explanation';
      return { correct, explanation: q.explanation, source: q.source };
    },
  };
}
