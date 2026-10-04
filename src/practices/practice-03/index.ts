import type { FlameWorld, Practice3Params, SolutionState } from '../../simulation/flame-world/types';
import { createFlameWorld, type FlameContext } from '../../simulation/flame-world/world';
import { transmissionCurve } from '../../simulation/spectroscopy/spectrum';
import { BLUE_FLAME_COMPONENTS, CATION_PROFILES, COBALT_TRANSMISSION } from './cation-profiles';
import { buildObjects, loopIdFor, SOLUTIONS, UNKNOWN_ID, unknownSolutionColor } from './definition';
import { BURNER, CAPSULE, GAS_TAP, GLASS, HCL_VIAL, LOOP, RINSE, TUBE } from './instruments';
import { DEFAULT_P3_PARAMS } from './params';
import { generateUnknown } from './unknown-generator';
import { scenarioEffects, type P3Scenario } from './error-scenarios';
import type { P3Mode } from './definition';
import type { FuelId } from '../../simulation/combustion/combustion';

export const CTX3: FlameContext = {
  profiles: CATION_PROFILES,
  blueFlame: BLUE_FLAME_COMPONENTS,
  cobalt: transmissionCurve(COBALT_TRANSMISSION),
  geo: {
    burner: { mouthZ: BURNER.mouthZ, mouthR: BURNER.mouthR, inlet: BURNER.inlet },
    tapNozzleDy: GAS_TAP.nozzleDy,
    tube: { innerR: TUBE.innerR, height: TUBE.height, bottomZ: TUBE.bottomZ, cmPerMl: TUBE.cmPerMl },
    loopTouchCm: LOOP.touchCm,
    capsule: { rimR: CAPSULE.rimR, height: CAPSULE.height },
    glass: { halfW: GLASS.halfW, halfH: GLASS.halfH },
    hcl: { r: HCL_VIAL.r, h: HCL_VIAL.h },
    rinse: { r: RINSE.r, waterZ: RINSE.waterZ },
  },
};

export interface Practice3Options {
  mode: P3Mode;
  seed: number;
  fuel?: FuelId;
  scenarios?: P3Scenario[];
  params?: Partial<Practice3Params>;
  /** Identidades de incógnita ya asignadas a este estudiante (para no repetir, §18.2). */
  unknownHistory?: string[];
}

export function newPractice3World(opts: Practice3Options): FlameWorld {
  const params: Practice3Params = { ...structuredClone(DEFAULT_P3_PARAMS), ...(opts.params ?? {}) };
  const fx = scenarioEffects(opts.scenarios ?? []);
  const unknown = generateUnknown(opts.seed, opts.unknownHistory);
  const solutions: SolutionState[] = SOLUTIONS.map((s) => ({
    id: s.id, label: s.label, volumeMl: 2.5, concentrationPercent: s.concentrationPercent, species: { ...s.species } as Record<string, number>,
    displayColor: s.solutionColor, displayOpacity: s.solutionOpacity, contamination: {}, spilled: false, foreignLoops: [],
  }));
  const uc = unknownSolutionColor(unknown.cation);
  const uMass = 2.5 * 1000;
  solutions.push({
    id: UNKNOWN_ID, label: `Incógnita N.º ${unknown.number}`, volumeMl: 2.5, concentrationPercent: 2, species: { [unknown.cation]: 0.02 },
    displayColor: uc.color, displayOpacity: uc.opacity,
    contamination: Object.fromEntries(Object.entries(unknown.background).map(([s, f]) => [s, f * 0.02 * uMass])), spilled: false, foreignLoops: [],
  });
  const objects = buildObjects({ loopMode: params.loopMode, atomizer: params.atomizerEnabled });
  const loops = params.loopMode === 'SHARED'
    ? [{ id: 'loop_shared' }]
    : solutions.map((s) => ({ id: loopIdFor(s.id), assignedSolutionId: s.id, contamination: fx.loopContamination[loopIdFor(s.id)] }));
  const atomizers = params.atomizerEnabled ? [{ id: 'atom_nacl', solutionId: 'sol_nacl' }, { id: 'atom_kcl', solutionId: 'sol_kcl' }] : [];
  const w = createFlameWorld(
    { objects, solutions, loops, atomizers, unknown, hose: { cracked: fx.crackedHose }, room: { ventilation: fx.ventilation, draft: fx.draft }, fuel: opts.fuel },
    opts.seed,
    params,
  );
  w.evidence.baseVentilation = fx.ventilation;
  return w;
}

export { DEFAULT_P3_PARAMS };
