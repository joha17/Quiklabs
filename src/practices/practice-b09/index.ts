/** Creación del mundo de la práctica B09 a partir de la semilla, el modo, los escenarios y los parámetros. */
import type { B01Params } from '../../simulation/optical-world/types';
import { SC_B09, createPlantWorld } from '../../simulation/plant-world/world';
import type { PlantWorld } from '../../simulation/plant-world/types';
import { PLANT_MEDIA } from '../../simulation/specimens/thin-section';
import { SOURCES_B09, buildB09Spec, requiredSlidesB09, type B09Mode } from './definition';
import { DEFAULT_B09_PARAMS } from './params';
import { validScenariosB09, type B09Scenario } from './error-scenarios';

export interface PracticeB09Options {
  mode: B09Mode;
  seed: number;
  scenarios?: B09Scenario[];
  params?: Partial<B01Params>;
}

export function newPracticeB09World(opts: PracticeB09Options): PlantWorld {
  const scenarios = validScenariosB09(opts.scenarios ?? []);
  const has = (s: string) => scenarios.includes(s as B09Scenario);
  const base = structuredClone(DEFAULT_B09_PARAMS);
  // Dosis mal calibrada (S11): cada gota de reactivo rinde el doble.
  if (has(SC_B09.BAD_DOSE)) {
    base.mount.dropMlMin *= 2;
    base.mount.dropMlMax *= 2;
  }
  const params: B01Params = { ...base, ...(opts.params ?? {}) };
  const noStain = has(SC_B09.NO_LIGNIN);
  const p = params.plant!;
  const contingency = has(SC_B09.CONTINGENCY);
  const w = createPlantWorld(
    buildB09Spec(opts.seed >>> 0, opts.mode, params, scenarios),
    {
      assigned: ['celery', 'pear', 'plantLeaf'],
      routes: { fixed: true, stereo: true, video: false },
      sources: SOURCES_B09,
      swabs: [],
      stains: PLANT_MEDIA,
      extraAllowed: { pear: ['water', 'phloroglucinol', 'hcl'] },
      assetOverride: {
        ...(has(SC_B09.TEACHER) ? { celery: 'celeryT2' } : {}),
        // Epidermis sin estomas en el campo inicial (S15) y estomas resueltos (S14) salen de `plantAssets.farStomata`.
      },
      // Contingencia (S26): falta la foto teñida de la pera; se sustituye la tarea sin costo para el estudiante.
      missingAssets: contingency ? ['pearWiesner'] : [],
      plantAssets: { wiesnerMinS: p.wiesnerMinS, wiesnerMaxS: p.wiesnerMaxS, farStomata: has(SC_B09.NO_STOMATA) },
    },
    {
      // El módulo de inmersión NO está instalado: el aceite existe en la mesa solo como distractor (TV-51).
      immersion: true,
      oilMl: 5,
      wrightMl: 0,
      bufferMl: 0,
      brokenSlides: [],
      brokenFixed: [],
      wrightSlides: [],
      scale: { available: !has(SC_B09.NO_SCALE), traceable: has(SC_B09.MOSAIC) },
    },
    {
      wiesnerAssigned: !noStain,
      stereoRequired: has(SC_B09.MACRO),
      requiredSlides: requiredSlidesB09(scenarios),
      mislabeled: has(SC_B09.MISLABELED) ? 'fxRM' : null,
      coverJam: has(SC_B09.BAD_COVER),
      unknowns: has(SC_B09.UNKNOWNS),
      assetScope: has(SC_B09.TEACHER) ? 'course' : 'standard',
      ringsAnnualKnown: false,
    },
  );
  return w;
}
