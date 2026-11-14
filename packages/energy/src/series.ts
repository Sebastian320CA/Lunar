import type { EnergyInput, EnergyMethod, EnergyResult } from '@lunar/contracts';

/**
 * Evaluates `method` for each input. `stepSeconds` of each input overrides the `stepH` param so that
 * energyWh = powerW x stepSeconds / 3600 holds for every element.
 * Inputs with a non-positive or non-finite step produce zero energy.
 */
export function computeSeries(method: EnergyMethod, inputs: EnergyInput[]): EnergyResult[] {
  return inputs.map((input) => {
    const valid = Number.isFinite(input.stepSeconds) && input.stepSeconds > 0;
    const stepH = valid ? input.stepSeconds / 3600 : 0;
    const r = method.compute(input.sky, { ...input.params, stepH });
    return { ...r, energyWh: r.powerW * stepH };
  });
}

/** Running sum of `energyWh`, same length as the input. Unit: Wh. */
export function cumulativeEnergyWh(results: readonly EnergyResult[]): number[] {
  const out: number[] = [];
  let acc = 0;
  for (const r of results) {
    acc += r.energyWh;
    out.push(acc);
  }
  return out;
}

/** Total energy of a series, Wh. */
export function totalEnergyWh(results: readonly EnergyResult[]): number {
  let acc = 0;
  for (const r of results) acc += r.energyWh;
  return acc;
}
