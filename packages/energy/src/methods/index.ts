import type { EnergyMethod } from '@lunar/contracts';
import { constantSource } from './constantSource';
import { dualAxis } from './dualAxis';
import { fixedTilt } from './fixedTilt';
import { horizontal } from './horizontal';
import { mast } from './mast';
import { singleAxis } from './singleAxis';
import { vertical } from './vertical';

export { constantSource, dualAxis, fixedTilt, horizontal, mast, singleAxis, vertical };

export const methods: EnergyMethod[] = [horizontal, fixedTilt, vertical, singleAxis, dualAxis, mast, constantSource];
