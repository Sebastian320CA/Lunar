export interface PackageJsonFile {
  path: string;
  json: unknown;
}

export interface VersionViolation {
  file: string;
  name: string;
  version: string;
}

const VERSION_CORE = /^\d+\.\d+\.\d+$/;
const VERSION_PRERELEASE = /^[0-9A-Za-z.-]+$/;

/** Version exacta `x.y.z` con sufijo opcional `-prerelease` (equivale a /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/). */
export function isExactVersion(text: string): boolean {
  const dash = text.indexOf('-');
  if (dash === -1) return VERSION_CORE.test(text);
  return VERSION_CORE.test(text.slice(0, dash)) && VERSION_PRERELEASE.test(text.slice(dash + 1));
}

export const DEPENDENCY_FIELDS = [
  "dependencies",
  "devDependencies",
  "peerDependencies",
  "optionalDependencies",
] as const;

/**
 * Lista toda dependencia cuya versión no es exacta (MAJOR.MINOR.PATCH[-prerelease]).
 * Ignora el protocolo `workspace:*`.
 */
export function checkVersions(files: PackageJsonFile[]): VersionViolation[] {
  const violations: VersionViolation[] = [];
  for (const { path, json } of files) {
    if (typeof json !== "object" || json === null) continue;
    const record = json as Record<string, unknown>;
    for (const field of DEPENDENCY_FIELDS) {
      const deps = record[field];
      if (typeof deps !== "object" || deps === null) continue;
      for (const [name, version] of Object.entries(deps as Record<string, unknown>)) {
        if (version === "workspace:*") continue;
        const text = typeof version === "string" ? version : String(version);
        if (!isExactVersion(text)) violations.push({ file: path, name, version: text });
      }
    }
  }
  return violations;
}
