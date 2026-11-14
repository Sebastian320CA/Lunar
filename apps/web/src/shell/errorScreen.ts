import './errorScreen.css';

export interface ModuleErrorOptions {
  /** Nombre del módulo que falló. */
  module: string;
  /** Error o mensaje legible. */
  error: unknown;
  /** Se invoca al pulsar «Reintentar». */
  onRetry: () => void;
}

function messageOf(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === 'string' && error) return error;
  return 'Error desconocido';
}

/** Crea la pantalla de error de un módulo. Solo usa textContent (sin innerHTML). */
export function createErrorScreen(options: ModuleErrorOptions): HTMLElement {
  const section = document.createElement('section');
  section.className = 'lunar-error-screen';
  section.setAttribute('role', 'alert');

  const title = document.createElement('h2');
  title.textContent = `No se pudo cargar el módulo: ${options.module}`;

  const message = document.createElement('p');
  message.className = 'lunar-error-message';
  message.textContent = messageOf(options.error);

  const retry = document.createElement('button');
  retry.type = 'button';
  retry.textContent = 'Reintentar';
  retry.addEventListener('click', () => options.onRetry());

  section.append(title, message, retry);
  return section;
}

/** Muestra la pantalla de error dentro de `container` y devuelve el elemento. */
export function showErrorScreen(container: HTMLElement, options: ModuleErrorOptions): HTMLElement {
  const el = createErrorScreen(options);
  container.replaceChildren(el);
  return el;
}
