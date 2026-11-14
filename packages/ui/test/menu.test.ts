// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import type { I18nApi } from '@lunar/contracts';
import { createMenu } from '../src/menu/menu';

const i18n: I18nApi = { setLanguage: () => undefined, t: (k) => `T:${k}`, onChange: () => () => undefined };

function setup(disabled = false) {
  const onSelect = vi.fn();
  const container = document.createElement('div');
  document.body.appendChild(container);
  createMenu(container, [{ id: 'start', labelKey: 'menu.start', disabled, onSelect }], i18n);
  const btn = container.querySelector('button') as HTMLButtonElement;
  return { onSelect, btn };
}

describe('menu', () => {
  it('activates with Enter and Space', () => {
    const { onSelect, btn } = setup();
    btn.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    btn.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true }));
    expect(onSelect).toHaveBeenCalledTimes(2);
  });

  it('ignores clicks and keys when disabled', () => {
    const { onSelect, btn } = setup(true);
    btn.click();
    btn.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    expect(onSelect).not.toHaveBeenCalled();
    expect(btn.getAttribute('aria-disabled')).toBe('true');
  });

  it('sets ARIA labels from i18n', () => {
    const { btn } = setup();
    expect(btn.getAttribute('aria-label')).toBe('T:menu.start');
  });
});
