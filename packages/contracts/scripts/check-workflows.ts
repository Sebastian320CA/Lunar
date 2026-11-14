import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { checkWorkflows } from "./lib/checkWorkflows.ts";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..", "..", "..");
const dir = join(repoRoot, ".github", "workflows");

if (!existsSync(dir)) {
  console.error(`check-workflows: no existe ${dir}; no hay flujos que comprobar (se esperan ci.yml y codeql.yml).`);
  process.exit(1);
}

const names = readdirSync(dir).filter((n) => /\.ya?ml$/i.test(n));
if (names.length === 0) {
  console.error(`check-workflows: ${dir} no contiene archivos .yml/.yaml.`);
  process.exit(1);
}

const files = names.map((n) => ({
  path: `.github/workflows/${n}`,
  content: readFileSync(join(dir, n), "utf8"),
}));

const issues = checkWorkflows(files);
if (issues.length > 0) {
  for (const i of issues) console.error(i.message);
  console.error(`check-workflows: ${issues.length} problema(s) en ${files.length} flujo(s).`);
  process.exit(1);
}
console.log(`check-workflows: ${files.length} flujo(s) correctos.`);
