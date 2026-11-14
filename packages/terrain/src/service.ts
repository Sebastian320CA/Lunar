import type { HorizonProfile, LunarSite, TerrainService } from '@lunar/contracts';

export function validateProfile(p: HorizonProfile): string | null {
  if (!Number.isFinite(p.azimuthStepDeg) || p.azimuthStepDeg <= 0) return 'azimuthStepDeg invalido';
  const expected = 360 / p.azimuthStepDeg;
  if (!Number.isInteger(expected)) return 'azimuthStepDeg no divide 360';
  if (p.elevationDeg.length !== expected) {
    return `largo ${p.elevationDeg.length} != ${expected}`;
  }
  if (!p.elevationDeg.every(Number.isFinite)) return 'elevaciones no finitas';
  return null;
}

export function createTerrainService(
  loadProfile: (site: LunarSite) => Promise<HorizonProfile>,
): TerrainService {
  return {
    async getHorizon(site) {
      const profile = await loadProfile(site);
      const err = validateProfile(profile);
      if (err) throw new Error(`Perfil de horizonte invalido para ${site.id}: ${err}`);
      return profile;
    },
  };
}

/** Elevacion del horizonte en un azimut (grados), interpolacion lineal con cierre circular. */
export function horizonElevationAt(profile: HorizonProfile, azimuthDeg: number): number {
  const n = profile.elevationDeg.length;
  const pos = ((((azimuthDeg % 360) + 360) % 360) / profile.azimuthStepDeg);
  const i0 = Math.floor(pos) % n;
  const i1 = (i0 + 1) % n;
  const f = pos - Math.floor(pos);
  const a = profile.elevationDeg[i0] ?? 0;
  const b = profile.elevationDeg[i1] ?? 0;
  return a + (b - a) * f;
}
