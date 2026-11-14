import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkSecurityDoc } from './lib/checkSecurityDoc.ts';

// scripts/ -> contracts -> packages -> raíz del repositorio
const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..', '..', '..');
const docPath = resolve(repoRoot, process.argv[2] ?? 'docs/SEGURIDAD.md');

if (!existsSync(docPath)) {
  console.error(`check-security-doc: no existe ${docPath}. Se crea en la tarea 11.1 (docs/SEGURIDAD.md).`);
  process.exit(1);
}

const issues = checkSecurityDoc(readFileSync(docPath, 'utf8'), repoRoot);

if (issues.length === 0) {
  console.log('check-security-doc: docs/SEGURIDAD.md cumple todas las reglas.');
  process.exit(0);
}

for (const issue of issues) console.error(`- [${issue.code}] ${issue.message}`);
console.error(`check-security-doc: ${issues.length} fallo(s).`);
process.exit(1);
