// Copia los decodificadores Draco y Basis (KTX2) de three a public/assets/decoders/.
import { cpSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const threeRoot = join(here, '..', 'node_modules', 'three');
const libs = join(threeRoot, 'examples', 'jsm', 'libs');
const out = resolve(here, '..', '..', '..', 'public', 'assets', 'decoders');

for (const dir of ['draco', 'basis']) {
  mkdirSync(join(out, dir), { recursive: true });
  cpSync(join(libs, dir), join(out, dir), { recursive: true });
}
console.log(`Decodificadores copiados a ${out}`);
