import type { PanelTab } from './index.js';

// Registro de pestanas del panel (Requirements 3.7, 3.8, 16.4).
// - Es el unico codigo de ejecucion de Contracts; el unico efecto al cargar el modulo es crear el registro vacio.
// - El registro conserva el orden de registro (orden de insercion del Map).

const registry = new Map<string, PanelTab>();

/**
 * Registra una pestana del panel.
 * - Si ya existe una pestana con el mismo `id`, lanza un `Error` cuyo mensaje incluye el `id`
 *   duplicado y el registro existente se conserva sin cambios (no se reemplaza ni se reordena).
 */
export function registerPanelTab(tab: PanelTab): void {
  if (registry.has(tab.id)) {
    throw new Error(`Pestana duplicada: el id "${tab.id}" ya esta registrado`);
  }
  registry.set(tab.id, tab);
}

/**
 * Devuelve las pestanas registradas en orden de registro.
 * - Devuelve una copia nueva en cada llamada: modificarla no altera el registro.
 * - Sin pestanas registradas devuelve un arreglo vacio.
 */
export function getPanelTabs(): readonly PanelTab[] {
  return Object.freeze([...registry.values()]);
}
