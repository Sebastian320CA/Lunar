/**
 * Verificador de unidades documentadas (Requirement 2.6).
 * Analisis por lineas (no AST): dentro de cada `interface`/`type` exportado, todo campo
 * cuyo tipo contiene `number` exige el texto `Unidad:` en el comentario inmediatamente
 * anterior (JSDoc o `//`) o en un comentario de la misma linea.
 * Devuelve los nombres de los campos que no lo cumplen, en orden de aparicion.
 */

const UNIT_MARK = 'Unidad:';

interface SplitLine {
  code: string;
  comment: string;
}

// Separa codigo y comentarios (de linea o de bloque en una sola linea) respetando comillas.
function splitLine(line: string): SplitLine {
  let code = '';
  let comment = '';
  let quote: string | null = null;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i] as string;
    if (quote) {
      code += ch;
      if (ch === '\\') {
        code += line[i + 1] ?? '';
        i++;
      } else if (ch === quote) quote = null;
      continue;
    }
    if (ch === "'" || ch === '"' || ch === '`') {
      quote = ch;
      code += ch;
      continue;
    }
    if (ch === '/' && line[i + 1] === '/') {
      comment += line.slice(i);
      break;
    }
    if (ch === '/' && line[i + 1] === '*') {
      const end = line.indexOf('*/', i + 2);
      if (end === -1) {
        comment += line.slice(i);
        break;
      }
      comment += line.slice(i, end + 2);
      i = end + 1;
      continue;
    }
    code += ch;
  }
  return { code, comment };
}

const FIELD_HEAD_RE = /^([A-Za-z_$][\w$]*)\??\s*:\s*/;
const DECL_HEAD_RE = /^(interface|type)\s+[A-Za-z_$]/;

// Quita una palabra clave inicial opcional (p. ej. `readonly`) si va seguida de espacio.
function skipKeyword(s: string, keyword: string): string {
  if (s.startsWith(keyword) && /\s/.test(s.charAt(keyword.length))) {
    return s.slice(keyword.length).trimStart();
  }
  return s;
}

// Equivale a /^\s*export\s+(?:declare\s+)?(interface|type)\s+<ident>/: devuelve la clase de declaracion.
function declKind(code: string): 'interface' | 'type' | null {
  const s = code.trimStart();
  if (!s.startsWith('export') || !/\s/.test(s.charAt(6))) return null;
  const m = DECL_HEAD_RE.exec(skipKeyword(s.slice(6).trimStart(), 'declare'));
  return m ? (m[1] as 'interface' | 'type') : null;
}

// Equivale a /^\s*(?:readonly\s+)?(name)\??\s*:\s*(.+)$/: devuelve nombre y tipo.
function parseField(text: string): { name: string; type: string } | null {
  const s = skipKeyword(text.trimStart(), 'readonly');
  const m = FIELD_HEAD_RE.exec(s);
  if (!m) return null;
  return { name: m[1] as string, type: s.slice(m[0].length) };
}

function countChar(s: string, c: string): number {
  let n = 0;
  for (const ch of s) if (ch === c) n++;
  return n;
}

export function checkContractDocs(source: string): string[] {
  const lines = source.split(/\r?\n/);
  const missing: string[] = [];

  let depth = 0; // profundidad de llaves dentro de la declaracion exportada actual
  let inDecl = false;
  let inBlockComment = false;
  // Texto de comentarios contiguos inmediatamente anteriores a la linea actual.
  let pendingComment = '';

  for (const raw of lines) {
    const trimmed = raw.trim();

    // Lineas dentro de un comentario de bloque multilinea.
    if (inBlockComment) {
      pendingComment += '\n' + trimmed;
      if (trimmed.includes('*/')) inBlockComment = false;
      continue;
    }
    if (trimmed === '') {
      pendingComment = '';
      continue;
    }
    if (trimmed.startsWith('/*') && !trimmed.includes('*/')) {
      pendingComment = trimmed;
      inBlockComment = true;
      continue;
    }
    if (trimmed.startsWith('//') || (trimmed.startsWith('/*') && trimmed.endsWith('*/'))) {
      pendingComment += '\n' + trimmed;
      continue;
    }

    const { code, comment } = splitLine(raw);
    const codeTrim = code.trim();

    if (!inDecl && declKind(code) !== null) {
      const eq = code.indexOf('=');
      const brace = code.indexOf('{');
      const isObjectDecl = declKind(code) === 'interface' || (eq !== -1 && brace > eq);
      if (isObjectDecl && brace !== -1) {
        inDecl = true;
        depth = 0;
        // Contenido tras la primera llave en la misma linea (tipos de una linea).
        const head = code.slice(0, brace + 1);
        const rest = code.slice(brace + 1);
        depth += countChar(head, '{') - countChar(head, '}');
        const restFields = rest.split(';');
        for (const part of restFields) {
          const m = parseField(part);
          if (m && /\bnumber\b/.test(m.type.split('}')[0] as string)) {
            if (!(pendingComment + comment).includes(UNIT_MARK)) missing.push(m.name);
          }
        }
        depth += countChar(rest, '{') - countChar(rest, '}');
        if (depth <= 0) {
          inDecl = false;
          depth = 0;
        }
      }
      pendingComment = '';
      continue;
    }

    if (inDecl) {
      const m = parseField(code);
      if (m && /\bnumber\b/.test(m.type)) {
        if (!(pendingComment + '\n' + comment).includes(UNIT_MARK)) missing.push(m.name);
      }
      depth += countChar(code, '{') - countChar(code, '}');
      if (depth <= 0) {
        inDecl = false;
        depth = 0;
      }
    }
    // Una linea de codigo consume el comentario pendiente.
    pendingComment = codeTrim === '' ? pendingComment : '';
  }

  return missing;
}
