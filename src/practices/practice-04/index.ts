import type { P4Params, P4World, VesselKind } from '../../simulation/reaction-world/types';
import { createReactionWorld, type ReactionContext, type ReagentSpec } from '../../simulation/reaction-world/world';
import { brimVolume, heightFromVolume } from '../practice-02/instruments';
import { CTX3, DEFAULT_P3_PARAMS } from '../practice-03';
import { CHEM } from './reactions';
import { buildGasObjects, buildObjects4, buildVessels4, DROPPER_IN_BOTTLE_Z, REAGENTS, type P4Mode } from './definition';
import {
  AL_STRIP, CAPACITY_ML, CAPSULE_PROFILE, MG_RIBBON, NAIL, PATH_CM, PROFILE_OF, THERMAL, TUBE_RACK_Z,
} from './instruments';
import { DEFAULT_P4_PARAMS } from './params';
import { type P4Scenario } from './error-scenarios';

function reagentSpecs(naohSingle: number | null): Record<string, ReagentSpec> {
  const out: Record<string, ReagentSpec> = {};
  for (const [id, r] of Object.entries(REAGENTS)) out[id] = { molar: r.molar, solvent: r.solvent };
  if (naohSingle) out.naohX = { molar: { 'Na+': naohSingle, 'OH-': naohSingle }, solvent: 'WATER' };
  return out;
}

/** Tablas volumen → altura por tipo de recipiente (la integración del perfil es costosa para cada paso). */
const LEVEL_TABLES = new Map<VesselKind, { step: number; h: Float64Array }>();

const level = (kind: VesselKind, ml: number): number => {
  const p = PROFILE_OF[kind];
  if (!p) return 0;
  let t = LEVEL_TABLES.get(kind);
  if (!t) {
    const N = 600;
    const cap = brimVolume(p);
    const step = cap / N;
    const h = new Float64Array(N + 1);
    for (let i = 0; i <= N; i++) h[i] = heightFromVolume(p, i * step);
    t = { step, h };
    LEVEL_TABLES.set(kind, t);
  }
  const x = ml / t.step;
  if (x <= 0) return t.h[0];
  const i = Math.floor(x);
  if (i >= t.h.length - 1) return t.h[t.h.length - 1];
  return t.h[i] + (t.h[i + 1] - t.h[i]) * (x - i);
};

export function makeContext4(naohSingle: number | null = null): ReactionContext {
  return {
    chem: CHEM,
    gasCtx: CTX3,
    reagents: reagentSpecs(naohSingle),
    geo: {
      level,
      mouth: (kind) => {
        const p = PROFILE_OF[kind];
        if (kind === 'DROPPER') return { r: 0.1, rimZ: 0 };
        if (kind === 'SINK') return { r: 18, rimZ: 0.5 };
        return p ? { r: p.mouthR, rimZ: p.rimY } : { r: 1, rimZ: 1 };
      },
      footR: (kind) => PROFILE_OF[kind]?.outerR ?? 1,
      capacityMl: CAPACITY_ML,
      thermal: THERMAL,
      pathCm: PATH_CM,
      nail: { length: NAIL.length, d: NAIL.d, segments: NAIL.segments },
      alStrip: { length: AL_STRIP.length, w: AL_STRIP.w, t: AL_STRIP.t, segments: AL_STRIP.segments },
      ribbon: { length: MG_RIBBON.length, w: MG_RIBBON.w, t: MG_RIBBON.t, density: MG_RIBBON.density },
      dropperInBottleZ: DROPPER_IN_BOTTLE_Z,
      tubeRackZ: TUBE_RACK_Z,
      capsuleRimR: CAPSULE_PROFILE.mouthR,
    },
  };
}

/** Contexto predeterminado (dos frascos de NaOH: 0,10 y 0,15 M). */
export const CTX4 = makeContext4();

export interface Practice4Options {
  mode: P4Mode;
  seed: number;
  scenarios?: P4Scenario[];
  params?: Partial<P4Params>;
}

export function contextFor(w: P4World): ReactionContext {
  return w.params.naohSingle ? makeContext4(w.params.naohSingle) : CTX4;
}

export function newPractice4World(opts: Practice4Options): P4World {
  const params: P4Params = { ...structuredClone(DEFAULT_P4_PARAMS), ...(opts.params ?? {}) };
  const ctx = contextFor({ params } as P4World);
  return createReactionWorld(
    {
      objects: buildObjects4({ aluminum: params.aluminumEnabled }),
      vessels: buildVessels4({ naohSingle: params.naohSingle, aluminum: params.aluminumEnabled }),
      gasObjects: buildGasObjects(),
      gasParams: { ...structuredClone(DEFAULT_P3_PARAMS), ambientC: params.ambientC },
      scenarios: opts.scenarios ?? [],
    },
    opts.seed,
    params,
    ctx,
  );
}

export { DEFAULT_P4_PARAMS };
