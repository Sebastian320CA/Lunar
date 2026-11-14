/** Iconos SVG propios (viewBox 0 0 24 24). No dependen de que la fuente tenga los simbolos Unicode. */
const PATHS = {
  menu: 'M3 6h18M3 12h18M3 18h18',
  play: 'M7 4l13 8-13 8z',
  pause: 'M7 4h3v16H7zM14 4h3v16h-3z',
  prev: 'M6 5v14M19 5l-10 7 10 7z',
  next: 'M18 5v14M5 5l10 7-10 7z',
  sun: 'M12 7a5 5 0 1 0 .01 0zM12 1v3M12 20v3M1 12h3M20 12h3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1',
  moon: 'M20 14.5A8.5 8.5 0 1 1 9.5 4a7 7 0 0 0 10.5 10.5z',
  close: 'M5 5l14 14M19 5L5 19',
  left: 'M15 5l-7 7 7 7',
  right: 'M9 5l7 7-7 7',
  up: 'M5 15l7-7 7 7',
  down: 'M5 9l7 7 7-7',
  rotate: 'M20 12a8 8 0 1 1-2.3-5.7M20 4v5h-5',
  drop: 'M12 3v13M6 11l6 6 6-6M5 21h14',
  fire: 'M12 2l3 7h6l-5 4 2 8-6-4-6 4 2-8-5-4h6z',
} as const;

export type IconName = keyof typeof PATHS;

const FILLED = new Set<IconName>(['play', 'pause', 'prev', 'next', 'fire']);

export function icon(name: IconName): SVGSVGElement {
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', '18');
  svg.setAttribute('height', '18');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  const path = document.createElementNS(NS, 'path');
  path.setAttribute('d', PATHS[name]);
  if (FILLED.has(name)) {
    path.setAttribute('fill', 'currentColor');
  } else {
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke', 'currentColor');
    path.setAttribute('stroke-width', '2');
    path.setAttribute('stroke-linecap', 'round');
    path.setAttribute('stroke-linejoin', 'round');
  }
  svg.append(path);
  return svg;
}

/** Reemplaza el contenido de un boton por un icono. */
export function setIcon(el: HTMLElement, name: IconName): void {
  el.replaceChildren(icon(name));
}
