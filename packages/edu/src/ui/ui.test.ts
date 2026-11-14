// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { createTrivia, questionBank } from '../engine';
import { createClassSession } from '../classMode';
import { mountTriviaView } from './triviaView';
import { mountTeacherPanel } from './teacherPanel';
import { mountProjectorView } from './projectorView';
import { mountCalculatorMode } from './calculatorMode';

const key = (el: HTMLElement, k: string): void => {
  el.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }));
};

describe('edu UI', () => {
  it('keyboard answers a question and Enter moves to a different one', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const trivia = createTrivia(questionBank, 3);
    const view = mountTriviaView(host, { trivia, lang: 'en' });
    const first = trivia.state().current;
    expect(first).not.toBeNull();
    key(view.el, String((first?.answer ?? 0) + 1));
    expect(trivia.state().phase).toBe('explanation');
    expect(trivia.state().lastCorrect).toBe(true);
    expect(view.el.querySelector('.edu-feedback')?.textContent).toContain('Correct');
    key(view.el, 'Enter');
    expect(trivia.state().phase).toBe('question');
    expect(trivia.state().current?.id).not.toBe(first?.id);
    view.destroy();
  });

  it('renders data with textContent, not markup', () => {
    const host = document.createElement('div');
    const api = createClassSession({ name: '<img src=x onerror=alert(1)>', teams: ['<b>A</b>'] });
    mountProjectorView(host, api);
    mountTeacherPanel(host, api);
    expect(host.querySelector('img')).toBeNull();
    expect(host.querySelector('b')).toBeNull();
    expect(host.textContent).toContain('<b>A</b>');
  });

  it('teacher panel scores update the projector ranking', () => {
    const host = document.createElement('div');
    const api = createClassSession({ name: 'C', teams: ['A', 'B'] });
    const proj = mountProjectorView(host, api);
    const panel = mountTeacherPanel(host, api, { onChange: () => proj.refresh() });
    api.startRound();
    panel.el.querySelector<HTMLButtonElement>('button[data-team="team-2"]')?.click();
    expect(proj.el.querySelector('.edu-ranking li')?.textContent).toBe('B: 1');
  });

  it('teacher panel rejects invalid import', () => {
    const host = document.createElement('div');
    const api = createClassSession({ name: 'C' });
    const panel = mountTeacherPanel(host, api);
    panel.el.querySelector('textarea')!.value = '{bad';
    const btns = panel.el.querySelectorAll('button');
    btns[btns.length - 1]!.click();
    expect(panel.el.querySelector('[role=status]')?.textContent).not.toContain('Imported');
  });

  it('calculator mode renders text without canvas and plays by keyboard', () => {
    const host = document.createElement('div');
    const trivia = createTrivia(questionBank, 5);
    const calc = mountCalculatorMode(host, { trivia, lang: 'en' });
    expect(host.querySelector('canvas')).toBeNull();
    expect(host.querySelector('button')).toBeNull();
    expect(calc.screen()).toContain('1)');
    key(calc.el, '1');
    expect(trivia.state().phase).toBe('explanation');
    expect(calc.screen()).toContain('Enter');
  });
});
