export type Theme = 'light' | 'dark' | 'system';

const ATTR = 'data-theme';

/** Sets the theme on the root element. 'system' removes the attribute so prefers-color-scheme applies. */
export function setTheme(theme: Theme, root: HTMLElement = document.documentElement): void {
  if (theme === 'system') {
    root.removeAttribute(ATTR);
  } else {
    root.setAttribute(ATTR, theme);
  }
}

export function getTheme(root: HTMLElement = document.documentElement): Theme {
  const v = root.getAttribute(ATTR);
  return v === 'light' || v === 'dark' ? v : 'system';
}
