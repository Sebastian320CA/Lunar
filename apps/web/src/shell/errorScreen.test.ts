import { describe, expect, it, vi } from 'vitest';
import { showErrorScreen } from './errorScreen';

describe('errorScreen', () => {
  it('muestra el nombre del módulo y el mensaje, y reintenta', () => {
    const root = document.createElement('div');
    const onRetry = vi.fn();
    showErrorScreen(root, { module: 'terrain', error: new Error('<b>boom</b>'), onRetry });
    expect(root.textContent).toContain('terrain');
    expect(root.textContent).toContain('<b>boom</b>');
    expect(root.querySelector('b')).toBeNull();
    root.querySelector('button')!.click();
    expect(onRetry).toHaveBeenCalledOnce();
  });
});
