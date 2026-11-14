import { describe, expect, it } from 'vitest';
import { createTrivia, questionBank } from './engine';

describe('question bank', () => {
  it('has >= 30 questions with source and both languages', () => {
    expect(questionBank.length).toBeGreaterThanOrEqual(30);
    const ids = new Set(questionBank.map((q) => q.id));
    expect(ids.size).toBe(questionBank.length);
    for (const q of questionBank) {
      expect(q.source.length).toBeGreaterThan(5);
      for (const l of ['es', 'en'] as const) {
        expect(q.prompt[l].length).toBeGreaterThan(0);
        expect(q.explanation[l].length).toBeGreaterThan(0);
        expect(q.options[l].length).toBe(q.options.es.length);
      }
      expect(q.options.es.length).toBeGreaterThanOrEqual(2);
      expect(q.answer).toBeGreaterThanOrEqual(0);
      expect(q.answer).toBeLessThan(q.options.es.length);
      expect(q.i18nKeys.prompt).toBeTruthy();
    }
  });
});

describe('trivia engine', () => {
  it('never repeats a question and ends when exhausted', () => {
    const t = createTrivia(questionBank, 7);
    const seen = new Set<string>();
    for (let q = t.next(); q; q = t.next()) {
      expect(seen.has(q.id)).toBe(false);
      seen.add(q.id);
      t.answer(0);
    }
    expect(seen.size).toBe(questionBank.length);
    expect(t.state().phase).toBe('done');
  });

  it('follows question -> explanation -> next question flow', () => {
    const t = createTrivia(questionBank, 3);
    const q1 = t.next()!;
    expect(t.state().phase).toBe('question');
    expect(t.answer(q1.answer)?.correct).toBe(true);
    expect(t.state().phase).toBe('explanation');
    expect(t.answer(0)).toBeNull();
    const q2 = t.next()!;
    expect(q2.id).not.toBe(q1.id);
  });

  it('raises difficulty after correct answers and lowers it after a miss', () => {
    const t = createTrivia(questionBank, 11);
    let q = t.next()!;
    t.answer(q.answer);
    expect(t.state().level).toBe(2);
    q = t.next()!;
    expect(q.difficulty).toBe(2);
    t.answer(q.answer);
    expect(t.state().level).toBe(3);
    q = t.next()!;
    expect(q.difficulty).toBe(3);
    t.answer((q.answer + 1) % q.options.es.length);
    expect(t.state().level).toBe(2);
  });

  it('is deterministic for a seed', () => {
    const a = createTrivia(questionBank, 42).next()!.id;
    const b = createTrivia(questionBank, 42).next()!.id;
    expect(a).toBe(b);
  });
});
