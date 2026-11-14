import { readdirSync, readFileSync } from "node:fs";
import { checkVersions, type PackageJsonFile } from "./lib/checkVersions.ts";


const SKIP = new Set(["node_modules", ".git", "dist", "coverage"]);

function collect(dir: string, root: string, out: PackageJsonFile[]): void {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!SKIP.has(entry.name)) collect(`${dir}/${entry.name}`, root, out);
    } else if (entry.name === "package.json") {
      const full = `${dir}/${entry.name}`;
      out.push({
        path: full.slice(root.length + 1),
        json: JSON.parse(readFileSync(full, "utf8")),
      });
    }
  }
}

const root = process.cwd().replace(/\\/g, "/");
const files: PackageJsonFile[] = [];
collect(root, root, files);

const violations = checkVersions(files);
if (violations.length > 0) {
  for (const v of violations) {
    process.stderr.write(`${v.file}: ${v.name} ${v.version}\n`);
  }
  process.stderr.write(`${violations.length} dependencia(s) sin versión exacta\n`);
  process.exitCode = 1;
} else {
  process.stdout.write(`Versiones exactas en ${files.length} package.json\n`);
}
