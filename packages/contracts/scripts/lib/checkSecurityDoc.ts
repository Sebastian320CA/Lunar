import { existsSync } from 'node:fs';
import { isAbsolute, relative, resolve } from 'node:path';

/** Estados válidos de un control ASVS_Adaptada. */
export const VALID_STATUSES = ['cumplido', 'pendiente', 'no aplicable'] as const;

/** Categorías STRIDE exigidas (Requirement 14.2). */
export const STRIDE_CATEGORIES = [
  'Spoofing',
  'Tampering',
  'Repudiation',
  'Information Disclosure',
  'Denial of Service',
  'Elevation of Privilege',
] as const;

/** Las cinco secciones H2 exigidas (Requirement 14.1). */
export const REQUIRED_SECTIONS = [
  { name: 'STRIDE', pattern: /stride/i },
  { name: 'ASVS_Adaptada', pattern: /asvs/i },
  { name: 'CSP', pattern: /\bcsp\b/i },
  { name: 'Class_Package', pattern: /class[_ -]?package/i },
  { name: 'verificación de hashes', pattern: /hash/i },
] as const;

export type SecurityDocIssueCode =
  | 'missing-h1'
  | 'missing-section'
  | 'missing-stride-category'
  | 'missing-asvs-table'
  | 'invalid-status'
  | 'cumplido-without-existing-path'
  | 'nonexistent-path'
  | 'no-aplicable-without-justification';

export interface SecurityDocIssue {
  code: SecurityDocIssueCode;
  message: string;
  /** Identificador del control ASVS afectado, si aplica. */
  id?: string;
  /** Ruta inexistente, si aplica. */
  path?: string;
  /** Sección o categoría faltante, si aplica. */
  name?: string;
}

interface Heading {
  level: number;
  title: string;
  /** Índice de línea del encabezado. */
  line: number;
}

function splitLines(markdown: string): string[] {
  return markdown.split(/\r\n|\r|\n/);
}

/** Marca las líneas dentro de bloques de código delimitados. */
function fencedMask(lines: string[]): boolean[] {
  const mask: boolean[] = [];
  let fence: string | null = null;
  for (const line of lines) {
    const m = /^\s{0,3}(`{3,}|~{3,})/.exec(line);
    if (fence === null) {
      if (m?.[1] !== undefined) {
        fence = m[1].slice(0, 1);
        mask.push(true);
        continue;
      }
      mask.push(false);
    } else {
      mask.push(true);
      if (m?.[1] !== undefined && m[1].startsWith(fence)) fence = null;
    }
  }
  return mask;
}

function findHeadings(lines: string[], mask: boolean[]): Heading[] {
  const out: Heading[] = [];
  lines.forEach((line, i) => {
    if (mask[i] === true) return;
    const m = /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line);
    if (m?.[1] !== undefined && m[2] !== undefined) {
      out.push({ level: m[1].length, title: m[2], line: i });
    }
  });
  return out;
}

/** Líneas [start, end) del cuerpo de la sección H2 que empieza en `h2`. */
function sectionRange(headings: Heading[], h2: Heading, total: number): [number, number] {
  const next = headings.find((h) => h.line > h2.line && h.level <= 2);
  return [h2.line + 1, next ? next.line : total];
}

function splitRow(line: string): string[] | null {
  const trimmed = line.trim();
  if (!trimmed.includes('|')) return null;
  let body = trimmed;
  if (body.startsWith('|')) body = body.slice(1);
  if (body.endsWith('|') && !body.endsWith('\\|')) body = body.slice(0, -1);
  const cells: string[] = [];
  let cur = '';
  for (let i = 0; i < body.length; i++) {
    const ch = body.charAt(i);
    if (ch === '\\' && body.charAt(i + 1) === '|') {
      cur += '|';
      i++;
    } else if (ch === '|') {
      cells.push(cur.trim());
      cur = '';
    } else {
      cur += ch;
    }
  }
  cells.push(cur.trim());
  return cells;
}

function isSeparatorRow(cells: string[]): boolean {
  return cells.length > 0 && cells.every((c) => /^:?-{1,}:?$/.test(c));
}

function normalizeStatus(raw: string): string {
  return raw
    .replace(/[*_`]/g, '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

/** Extrae rutas candidatas del texto de evidencia (enlaces Markdown y código en línea). */
export function extractPaths(evidence: string): string[] {
  const found: string[] = [];
  const push = (raw: string): void => {
    let p = raw.trim();
    if (p === '' || /^[a-z][a-z0-9+.-]*:/i.test(p) || p.startsWith('#') || p.startsWith('//')) return;
    p = p.replace(/[#?].*$/, '');
    if (p === '' || /\s/.test(p)) return;
    if (!p.includes('/') && !/\.[A-Za-z0-9]{1,8}$/.test(p)) return;
    if (!found.includes(p)) found.push(p);
  };
  // Enlace con titulo opcional, expresado como dos alternativas sin cuantificadores anidados.
  for (const m of evidence.matchAll(/\[[^\]]*\]\((?:([^)\s]+)|([^)\s]+)\s+"[^"]*")\)/g)) {
    const target = m[1] ?? m[2];
    if (target !== undefined) push(target);
  }
  const withoutLinks = evidence.replace(/\[[^\]]*\]\([^)]*\)/g, ' ');
  for (const m of withoutLinks.matchAll(/`([^`]+)`/g)) {
    if (m[1] !== undefined) push(m[1]);
  }
  return found;
}

function pathExists(repoRoot: string, p: string): boolean {
  const root = resolve(repoRoot);
  const clean = p.replace(/^\.\//, '');
  const abs = resolve(root, clean.replace(/^\/+/, ''));
  const rel = relative(root, abs);
  if (rel.startsWith('..') || isAbsolute(rel)) return false;
  return existsSync(abs);
}

/**
 * Verifica `docs/SEGURIDAD.md` (Requirements 14.1, 14.2, 14.3, 14.4, 14.5, 14.7, 14.8).
 * Devuelve la lista de fallos; vacía si el documento cumple.
 * @param markdown contenido del documento
 * @param repoRoot raíz del repositorio contra la que se resuelven las rutas de evidencia
 */
export function checkSecurityDoc(markdown: string, repoRoot: string): SecurityDocIssue[] {
  const issues: SecurityDocIssue[] = [];
  const lines = splitLines(markdown);
  const mask = fencedMask(lines);
  const headings = findHeadings(lines, mask);

  if (!headings.some((h) => h.level === 1)) {
    issues.push({ code: 'missing-h1', message: 'Falta el encabezado de primer nivel (H1).' });
  }

  const h2s = headings.filter((h) => h.level === 2);
  const sectionByName = new Map<string, Heading>();
  for (const req of REQUIRED_SECTIONS) {
    const h = h2s.find((x) => req.pattern.test(x.title));
    if (h) sectionByName.set(req.name, h);
    else {
      issues.push({
        code: 'missing-section',
        name: req.name,
        message: `Falta la sección H2 "${req.name}".`,
      });
    }
  }

  // Categorías STRIDE: dentro de la sección STRIDE (o en todo el documento si falta).
  const strideH2 = sectionByName.get('STRIDE');
  let strideText = markdown;
  if (strideH2) {
    const [s, e] = sectionRange(headings, strideH2, lines.length);
    strideText = lines.slice(s, e).join('\n');
  }
  for (const cat of STRIDE_CATEGORIES) {
    if (!strideText.toLowerCase().includes(cat.toLowerCase())) {
      issues.push({
        code: 'missing-stride-category',
        name: cat,
        message: `Falta la categoría STRIDE "${cat}".`,
      });
    }
  }

  // Tabla ASVS: dentro de la sección ASVS (o en todo el documento si falta).
  const asvsH2 = sectionByName.get('ASVS_Adaptada');
  let start = 0;
  let end = lines.length;
  if (asvsH2) [start, end] = sectionRange(headings, asvsH2, lines.length);

  let inTable = false;
  let tableFound = false;
  for (let i = start; i < end; i++) {
    if (mask[i] === true) {
      inTable = false;
      continue;
    }
    const cells = splitRow(lines[i] ?? '');
    if (cells === null) {
      inTable = false;
      continue;
    }
    if (!inTable) {
      const isHeader =
        cells.length >= 4 &&
        normalizeStatus(cells[0] ?? '') === 'id' &&
        normalizeStatus(cells[2] ?? '') === 'estado';
      if (isHeader) {
        inTable = true;
        tableFound = true;
      }
      continue;
    }
    if (isSeparatorRow(cells)) continue;

    const id = cells[0] ?? '';
    const statusRaw = cells[2] ?? '';
    const evidence = cells.slice(3).join(' | ').trim();
    const status = normalizeStatus(statusRaw);
    const label = id === '' ? '(sin identificador)' : id;

    const valid = (VALID_STATUSES as readonly string[]).includes(status);
    if (!valid) {
      issues.push({
        code: 'invalid-status',
        id,
        message: `Control ${label}: estado inválido "${statusRaw}" (válidos: ${VALID_STATUSES.join(', ')}).`,
      });
    }

    const paths = extractPaths(evidence);
    const missing = paths.filter((p) => !pathExists(repoRoot, p));
    for (const p of missing) {
      issues.push({
        code: 'nonexistent-path',
        id,
        path: p,
        message: `Control ${label}: la ruta "${p}" no existe en el repositorio.`,
      });
    }

    if (status === 'cumplido' && !paths.some((p) => pathExists(repoRoot, p))) {
      issues.push({
        code: 'cumplido-without-existing-path',
        id,
        message: `Control ${label}: "cumplido" requiere al menos una ruta existente como evidencia.`,
      });
    }

    if (status === 'no aplicable' && evidence.replace(/[\s`*_.\-]/g, '') === '') {
      issues.push({
        code: 'no-aplicable-without-justification',
        id,
        message: `Control ${label}: "no aplicable" requiere una justificación.`,
      });
    }
  }

  if (!tableFound) {
    issues.push({
      code: 'missing-asvs-table',
      message: 'No se encontró la tabla ASVS con columnas "ID | Control | Estado | Evidencia o justificación".',
    });
  }

  return issues;
}
