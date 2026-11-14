/** Comprobación de flujos de GitHub Actions (Requirements 12.10, 12.12). Función pura, sin E/S. */

export interface WorkflowFile {
  path: string;
  content: string;
}

export interface WorkflowIssue {
  file: string;
  /** Referencia `uses:` afectada; ausente en problemas de permisos. */
  action?: string;
  kind: "unpinned-action" | "missing-permissions" | "excessive-permissions";
  message: string;
}

const SHA40 = /^[0-9a-f]{40}$/i;
const DOCKER_DIGEST = /@sha256:[0-9a-f]{64}$/i;

function stripComment(line: string): string {
  // Quita comentarios `# ...` que no estén dentro de comillas (suficiente para flujos de Actions).
  let quote: string | null = null;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quote) {
      if (c === quote) quote = null;
    } else if (c === '"' || c === "'") {
      quote = c;
    } else if (c === "#" && (i === 0 || /\s/.test(line[i - 1] ?? ""))) {
      return line.slice(0, i);
    }
  }
  return line;
}

function indentOf(line: string): number {
  return line.length - line.trimStart().length;
}

function unquote(v: string): string {
  const t = v.trim();
  if (t.length >= 2 && (t[0] === '"' || t[0] === "'") && t[t.length - 1] === t[0]) {
    return t.slice(1, -1);
  }
  return t;
}

function isPinned(ref: string): boolean {
  if (ref.startsWith("./")) return true; // acción local: excluida
  if (ref.startsWith("docker://")) return DOCKER_DIGEST.test(ref);
  const at = ref.lastIndexOf("@");
  if (at < 0) return false;
  return SHA40.test(ref.slice(at + 1));
}

interface PermBlock {
  indent: number;
  line: number;
  /** `contents` efectivo: "read" | "none" | "write" | undefined (no indicado). */
  contents?: string;
  /** Valor escalar (`read-all`, `write-all`) o `{}`. */
  scalar?: string;
}

function permissionExcess(p: PermBlock): string | null {
  if (p.scalar !== undefined) {
    if (p.scalar === "write-all") return "permissions: write-all";
    return null; // read-all, {} o similares
  }
  if (p.contents === "write") return "contents: write";
  return null;
}

function checkPermissions(file: WorkflowFile, lines: string[], issues: WorkflowIssue[]): void {
  const blocks: PermBlock[] = [];
  for (let i = 0; i < lines.length; i++) {
    const m = /^(\s*)permissions:\s*(.*)$/.exec(lines[i]!);
    if (!m) continue;
    const indent = m[1]!.length;
    const inline = unquote(m[2]!.trim());
    const block: PermBlock = { indent, line: i + 1 };
    if (inline !== "") {
      block.scalar = inline;
      if (inline.startsWith("{") && inline.includes("contents")) {
        const c = /contents\s*:\s*([A-Za-z-]+)/.exec(inline);
        if (c) {
          block.scalar = undefined;
          block.contents = c[1];
        }
      }
    } else {
      for (let j = i + 1; j < lines.length; j++) {
        const l = lines[j]!;
        if (l.trim() === "") continue;
        if (indentOf(l) <= indent) break;
        const c = /^\s*contents\s*:\s*([A-Za-z-]+)/.exec(l);
        if (c) block.contents = c[1];
      }
    }
    blocks.push(block);
  }

  for (const b of blocks) {
    const excess = permissionExcess(b);
    if (excess) {
      issues.push({
        file: file.path,
        kind: "excessive-permissions",
        message: `${file.path}:${b.line}: permisos excesivos (${excess}); se permite como máximo contents: read`,
      });
    }
  }

  if (blocks.some((b) => b.indent === 0)) return;

  // Sin permisos de nivel superior: cada job debe declarar los suyos.
  const jobsIdx = lines.findIndex((l) => /^jobs:\s*$/.test(l));
  const jobNames: string[] = [];
  const jobsWithPerms = new Set<string>();
  if (jobsIdx >= 0) {
    let jobIndent = -1;
    let current: string | null = null;
    for (let i = jobsIdx + 1; i < lines.length; i++) {
      const l = lines[i]!;
      if (l.trim() === "") continue;
      const ind = indentOf(l);
      if (ind === 0) break;
      if (jobIndent < 0) jobIndent = ind;
      if (ind === jobIndent) {
        const m = /^\s*([^\s:#][^:]*):/.exec(l);
        if (m) {
          current = m[1]!.trim();
          jobNames.push(current);
        }
      } else if (current && ind === jobIndent + 2 && /^\s*permissions:/.test(l)) {
        jobsWithPerms.add(current);
      }
    }
  }
  const missing = jobNames.filter((j) => !jobsWithPerms.has(j));
  if (jobNames.length === 0 || missing.length > 0) {
    issues.push({
      file: file.path,
      kind: "missing-permissions",
      message:
        jobNames.length === 0
          ? `${file.path}: falta el bloque permissions (contents: read como máximo)`
          : `${file.path}: falta el bloque permissions (nivel superior o en los jobs: ${missing.join(", ")})`,
    });
  }
}

export function checkWorkflows(files: WorkflowFile[]): WorkflowIssue[] {
  const issues: WorkflowIssue[] = [];
  for (const file of files) {
    const lines = file.content.split(/\r?\n/).map(stripComment);
    lines.forEach((line, idx) => {
      const m = /^\s*(?:-\s*uses|uses):\s*(.+?)\s*$/.exec(line);
      if (!m) return;
      const ref = unquote(m[1]!);
      if (!isPinned(ref)) {
        issues.push({
          file: file.path,
          action: ref,
          kind: "unpinned-action",
          message: `${file.path}:${idx + 1}: la acción ${ref} no está fijada por SHA de 40 caracteres hexadecimales`,
        });
      }
    });
    checkPermissions(file, lines, issues);
  }
  return issues;
}
