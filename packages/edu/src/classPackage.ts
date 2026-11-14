import type { Result } from '@lunar/contracts';
import { loadClassPackage } from '@lunar/security';
import type { ClassPackage } from '@lunar/security';
import type { ClassSession } from './classMode';

/** Builds the shareable package (teams and scores stay local; parts become lessons). */
export function toClassPackage(session: ClassSession): ClassPackage {
  const pkg: ClassPackage = {
    version: 1,
    name: session.name,
    siteIds: [...session.siteIds],
    lessons: session.parts.map((p) => (p.note === undefined ? { title: p.title } : { title: p.title, note: p.note })),
  };
  if (session.description !== undefined) pkg.description = session.description;
  return pkg;
}

/** JSON conforming to ClassPackageSchema. */
export function exportClassPackage(session: ClassSession): string {
  return JSON.stringify(toClassPackage(session));
}

/** Validates and loads a class package only through @lunar/security. */
export function importClassPackage(text: string): Result<ClassPackage> {
  return loadClassPackage(text);
}
