import type { LunarSite } from '@lunar/contracts';

export interface SiteListHandle {
  /** Marca como seleccionado el sitio con ese id (null limpia la selección). */
  setSelected(id: string | null): void;
  destroy(): void;
}

/** Lista accesible de sitios: cada sitio es un botón (Enter/Espacio nativos). Usa solo textContent. */
export function mountSiteList(
  container: HTMLElement,
  sites: readonly LunarSite[],
  onSelect: (site: LunarSite) => void,
): SiteListHandle {
  const doc = container.ownerDocument;
  const ul = doc.createElement('ul');
  ul.className = 'site-list';
  const buttons = new Map<string, HTMLButtonElement>();

  for (const site of sites) {
    const li = doc.createElement('li');
    const btn = doc.createElement('button');
    btn.type = 'button';
    btn.dataset.siteId = site.id;
    btn.setAttribute('aria-pressed', 'false');
    btn.textContent = site.verified ? site.name : `${site.name} (sin verificar)`;
    btn.addEventListener('click', () => {
      setSelected(site.id);
      onSelect(site);
    });
    li.appendChild(btn);
    ul.appendChild(li);
    buttons.set(site.id, btn);
  }

  function setSelected(id: string | null): void {
    for (const [key, b] of buttons) b.setAttribute('aria-pressed', String(key === id));
  }

  container.appendChild(ul);
  return {
    setSelected,
    destroy: () => ul.remove(),
  };
}
