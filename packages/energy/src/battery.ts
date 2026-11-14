export interface BatteryConfig {
  /** Usable capacity, Wh (>= 0). */
  capacityWh: number;
  /** Constant load, W (>= 0). */
  loadW: number;
  /** Charge efficiency 0..1 applied to surplus power; discharge is lossless (simple model). */
  efficiency: number;
}

export interface BatterySimulation {
  /** State of charge after each step, Wh, always within [0, capacityWh]. */
  socWh: number[];
  /** State of charge after each step as a fraction 0..1 (0 if capacity is 0). */
  socFraction: number[];
  /** Longest endured stretch, hours, in which generation was below the load (the "night"). */
  nightEnduredHours: number;
  /** True if the battery reached 0 while the load was not covered. */
  depleted: boolean;
  /** Energy of the load that could not be supplied, Wh. */
  unmetWh: number;
}

export interface Battery {
  readonly config: Readonly<BatteryConfig>;
  /** Starts full. `powerSeries` is generation in W per step of `stepSeconds`. */
  simulate(powerSeries: readonly number[], stepSeconds: number): BatterySimulation;
}

const nonNeg = (x: number): number => (Number.isFinite(x) && x > 0 ? x : 0);

export function createBattery(config: BatteryConfig): Battery {
  const capacityWh = nonNeg(config.capacityWh);
  const loadW = nonNeg(config.loadW);
  const efficiency = Number.isFinite(config.efficiency) ? Math.min(1, Math.max(0, config.efficiency)) : 0;
  return {
    config: { capacityWh, loadW, efficiency },
    simulate(powerSeries, stepSeconds) {
      const dtH = nonNeg(stepSeconds) / 3600;
      const socWh: number[] = [];
      const socFraction: number[] = [];
      let soc = capacityWh;
      let depleted = false;
      let unmetWh = 0;
      let best = 0;
      let run = 0; // endured hours in the current deficit run
      let runEmpty = false; // battery already empty in this run
      for (const p of powerSeries) {
        const net = nonNeg(p) - loadW;
        if (net >= 0) {
          soc = Math.min(capacityWh, soc + net * efficiency * dtH);
          run = 0;
          runEmpty = false;
        } else {
          const need = -net * dtH;
          const draw = Math.min(soc, need);
          soc -= draw;
          unmetWh += need - draw;
          if (draw < need) depleted = true;
          if (!runEmpty) {
            // fraction of this step that was still covered
            run += need > 0 ? (draw / need) * dtH : dtH;
            if (draw < need) runEmpty = true;
          }
          best = Math.max(best, run);
        }
        soc = Math.min(capacityWh, Math.max(0, soc));
        socWh.push(soc);
        socFraction.push(capacityWh > 0 ? soc / capacityWh : 0);
      }
      return { socWh, socFraction, nightEnduredHours: best, depleted, unmetWh };
    },
  };
}
