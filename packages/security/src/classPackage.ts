import { ManifestSchema } from '@lunar/contracts';
import type { Manifest, Result } from '@lunar/contracts';
import { z } from 'zod';
import { sanitizeText } from './sanitize.js';
import { SITE_ID_ALLOWLIST, validateSiteId } from './siteId.js';

export const MAX_CLASS_PACKAGE_BYTES = 1_048_576;
const MAX_DEPTH = 32;
const FORBIDDEN_KEYS: readonly string[] = ['__proto__', 'constructor', 'prototype'];

export const ClassPackageSchema = z.strictObject({
  version: z.literal(1),
  name: z.string().max(64),
  description: z.string().max(500).optional(),
  siteIds: z.array(z.string().max(64)).max(32),
  lessons: z
    .array(
      z.strictObject({
        title: z.string().max(64),
        note: z.string().max(280).optional(),
      }),
    )
    .max(50),
});

export type ClassPackage = z.infer<typeof ClassPackageSchema>;

function formatPath(path: ReadonlyArray<PropertyKey>): string {
  return path.length === 0 ? '(raíz)' : path.map((p) => String(p)).join('.');
}

/** Busca claves prohibidas con pila explícita. Devuelve un mensaje de error o null. */
function findForbidden(root: unknown): string | null {
  const stack: Array<{ node: unknown; depth: number }> = [{ node: root, depth: 0 }];
  while (stack.length > 0) {
    const item = stack.pop();
    if (item === undefined) break;
    const { node, depth } = item;
    if (node === null || typeof node !== 'object') continue;
    if (depth > MAX_DEPTH) return 'se superó la profundidad máxima de anidación';
    if (Array.isArray(node)) {
      for (const child of node as unknown[]) stack.push({ node: child, depth: depth + 1 });
      continue;
    }
    for (const [key, child] of Object.entries(node)) {
      if (FORBIDDEN_KEYS.includes(key)) return `clave prohibida: ${key}`;
      stack.push({ node: child, depth: depth + 1 });
    }
  }
  return null;
}

function cleanText(x: string, max: number, field: string): Result<string> {
  const r = sanitizeText(x, max);
  return r.ok ? r : { ok: false, error: `campo inválido en ${field}: ${r.error}` };
}

function buildPackage(data: ClassPackage): Result<ClassPackage> {
  for (const id of data.siteIds) {
    if (!SITE_ID_ALLOWLIST.includes(id) || !validateSiteId(id).ok) {
      return { ok: false, error: 'identificador de sitio no permitido' };
    }
  }
  const name = cleanText(data.name, 64, 'name');
  if (!name.ok) return name;
  const out: ClassPackage = { version: 1, name: name.value, siteIds: [...data.siteIds], lessons: [] };
  if (data.description !== undefined) {
    const d = cleanText(data.description, 500, 'description');
    if (!d.ok) return d;
    out.description = d.value;
  }
  for (const [i, lesson] of data.lessons.entries()) {
    const title = cleanText(lesson.title, 64, `lessons.${i}.title`);
    if (!title.ok) return title;
    const entry: { title: string; note?: string } = { title: title.value };
    if (lesson.note !== undefined) {
      const n = cleanText(lesson.note, 280, `lessons.${i}.note`);
      if (!n.ok) return n;
      entry.note = n.value;
    }
    out.lessons.push(entry);
  }
  return { ok: true, value: out };
}

/** Carga un paquete de clase desde JSON. Nunca lanza. */
export function loadClassPackage(input: string | Uint8Array): Result<ClassPackage> {
  try {
    let text: string;
    if (typeof input === 'string') {
      if (new TextEncoder().encode(input).length > MAX_CLASS_PACKAGE_BYTES) {
        return { ok: false, error: 'se superó el tamaño máximo' };
      }
      text = input;
    } else if (input instanceof Uint8Array) {
      if (input.byteLength > MAX_CLASS_PACKAGE_BYTES) {
        return { ok: false, error: 'se superó el tamaño máximo' };
      }
      text = new TextDecoder().decode(input);
    } else {
      return { ok: false, error: 'tipo de entrada no válido' };
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      return { ok: false, error: 'JSON inválido' };
    }

    const forbidden = findForbidden(parsed);
    if (forbidden !== null) return { ok: false, error: forbidden };

    const result = ClassPackageSchema.safeParse(parsed);
    if (!result.success) {
      const issue = result.error.issues[0];
      return { ok: false, error: `campo inválido en ${formatPath(issue?.path ?? [])}` };
    }
    return buildPackage(result.data);
  } catch {
    return { ok: false, error: 'paquete no válido' };
  }
}

/** Valida un Manifest. Nunca lanza; informa del primer issue con su ruta. */
export function validateManifest(x: unknown): Result<Manifest> {
  try {
    const result = ManifestSchema.safeParse(x);
    if (result.success) return { ok: true, value: result.data };
    const issue = result.error.issues[0];
    const where = formatPath(issue?.path ?? []);
    return { ok: false, error: `manifest inválido en ${where}: ${issue?.message ?? 'error'}` };
  } catch {
    return { ok: false, error: 'manifest no válido' };
  }
}
