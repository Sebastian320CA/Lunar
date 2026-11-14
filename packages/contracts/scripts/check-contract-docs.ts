import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { checkContractDocs } from './lib/checkContractDocs.ts';

const target = process.argv[2] ?? fileURLToPath(new URL('../src/index.ts', import.meta.url));
const missing = checkContractDocs(readFileSync(target, 'utf8'));

if (missing.length > 0) {
  console.error(`Campos numericos sin "Unidad:" en ${target}:`);
  for (const name of missing) console.error(`  - ${name}`);
  process.exit(1);
}
console.log('OK: todos los campos numericos documentan su unidad.');
