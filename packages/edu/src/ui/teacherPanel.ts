import type { ClassPackage } from '@lunar/security';
import type { ClassSessionApi } from '../classMode';
import { exportClassPackage, importClassPackage } from '../classPackage';

export interface TeacherPanelOptions {
  /** Called after any change so a projector view can refresh. */
  onChange?: () => void;
  /** Called with the imported package when the teacher loads valid JSON. */
  onImport?: (pkg: ClassPackage) => void;
}

export interface TeacherPanelHandle {
  readonly el: HTMLElement;
  destroy(): void;
}

/** Teacher panel: add teams, start rounds, add points, export/import class package. textContent only. */
export function mountTeacherPanel(
  container: HTMLElement,
  api: ClassSessionApi,
  opts: TeacherPanelOptions = {},
): TeacherPanelHandle {
  const doc = container.ownerDocument;
  const el = doc.createElement('section');
  el.className = 'edu-teacher';
  el.setAttribute('aria-label', 'Teacher panel');

  const title = doc.createElement('h2');
  title.textContent = api.session.name;
  const msg = doc.createElement('p');
  msg.setAttribute('role', 'status');
  const teamInput = doc.createElement('input');
  teamInput.type = 'text';
  teamInput.setAttribute('aria-label', 'Team name');
  teamInput.maxLength = 60;
  const addBtn = doc.createElement('button');
  addBtn.type = 'button';
  addBtn.textContent = 'Add team';
  const roundBtn = doc.createElement('button');
  roundBtn.type = 'button';
  roundBtn.textContent = 'Start round';
  const table = doc.createElement('ul');
  const exportBtn = doc.createElement('button');
  exportBtn.type = 'button';
  exportBtn.textContent = 'Export package';
  const area = doc.createElement('textarea');
  area.setAttribute('aria-label', 'Class package JSON');
  const importBtn = doc.createElement('button');
  importBtn.type = 'button';
  importBtn.textContent = 'Import package';
  el.append(title, msg, teamInput, addBtn, roundBtn, table, exportBtn, area, importBtn);
  container.appendChild(el);

  const render = (): void => {
    table.replaceChildren();
    const totals = api.totals();
    for (const t of totals) {
      const li = doc.createElement('li');
      const label = doc.createElement('span');
      label.textContent = `${t.name}: ${t.total} `;
      const plus = doc.createElement('button');
      plus.type = 'button';
      plus.textContent = '+1';
      plus.setAttribute('aria-label', `+1 ${t.name}`);
      plus.dataset['team'] = t.teamId;
      plus.addEventListener('click', () => {
        const r = api.addScore(t.teamId, 1);
        msg.textContent = r.ok ? '' : r.error;
        render();
        opts.onChange?.();
      });
      li.append(label, plus);
      table.appendChild(li);
    }
  };

  addBtn.addEventListener('click', () => {
    const r = api.addTeam(teamInput.value);
    msg.textContent = r.ok ? '' : r.error;
    if (r.ok) teamInput.value = '';
    render();
    opts.onChange?.();
  });
  teamInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') addBtn.click();
  });
  roundBtn.addEventListener('click', () => {
    msg.textContent = `Round ${api.startRound() + 1}`;
    opts.onChange?.();
  });
  exportBtn.addEventListener('click', () => {
    area.value = exportClassPackage(api.session);
    msg.textContent = 'Exported';
  });
  importBtn.addEventListener('click', () => {
    const r = importClassPackage(area.value);
    if (!r.ok) {
      msg.textContent = r.error;
      return;
    }
    msg.textContent = `Imported: ${r.value.name}`;
    opts.onImport?.(r.value);
  });

  render();
  return {
    el,
    destroy() {
      el.remove();
    },
  };
}
