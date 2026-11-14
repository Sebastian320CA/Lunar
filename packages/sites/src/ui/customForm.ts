import type { LunarSite } from '@lunar/contracts';
import { validateCustomSite } from '../customSite';

export interface CustomFormHandle {
  destroy(): void;
}

/** Formulario de coordenadas personalizadas. Los errores se muestran por campo con textContent. */
export function mountCustomForm(container: HTMLElement, onSubmit: (site: LunarSite) => void): CustomFormHandle {
  const doc = container.ownerDocument;
  const form = doc.createElement('form');
  form.noValidate = true;
  form.className = 'custom-site-form';

  const fields = [
    { key: 'name', label: 'Nombre', type: 'text' },
    { key: 'lat', label: 'Latitud (°)', type: 'text' },
    { key: 'lon', label: 'Longitud (° este positivo)', type: 'text' },
  ] as const;

  const inputs = {} as Record<(typeof fields)[number]['key'], HTMLInputElement>;
  const errorEls = {} as Record<(typeof fields)[number]['key'], HTMLElement>;

  for (const f of fields) {
    const wrap = doc.createElement('div');
    const label = doc.createElement('label');
    const input = doc.createElement('input');
    const err = doc.createElement('p');
    input.id = `custom-${f.key}`;
    input.name = f.key;
    input.type = f.type;
    label.htmlFor = input.id;
    label.textContent = f.label;
    err.id = `custom-${f.key}-error`;
    err.setAttribute('role', 'alert');
    input.setAttribute('aria-describedby', err.id);
    wrap.append(label, input, err);
    form.appendChild(wrap);
    inputs[f.key] = input;
    errorEls[f.key] = err;
  }

  const submit = doc.createElement('button');
  submit.type = 'submit';
  submit.textContent = 'Usar coordenadas';
  form.appendChild(submit);

  form.addEventListener('submit', (ev) => {
    ev.preventDefault();
    const res = validateCustomSite({
      name: inputs.name.value,
      lat: inputs.lat.value,
      lon: inputs.lon.value,
    });
    for (const f of fields) {
      const msg = res.ok ? '' : (res.errors[f.key] ?? '');
      errorEls[f.key].textContent = msg;
      inputs[f.key].setAttribute('aria-invalid', String(msg !== ''));
    }
    if (res.ok) onSubmit(res.value);
  });

  container.appendChild(form);
  return { destroy: () => form.remove() };
}
