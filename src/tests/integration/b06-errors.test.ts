/**
 * B06 — los 71 errores atribuibles (§9) y las cuatro incidencias de recursos CEL-072…075: cada fixture ejecuta el gesto
 * real y comprueba la CONSECUENCIA en el estado, la observación o la libreta (no solo el aviso). Las incidencias no
 * dejan ningún `err:*`.
 */
import { describe, expect, it } from 'vitest';
import type { DivWorld, MarkStructure } from '../../simulation/div-world/types';
import { SC_B06, conservedDiv, dispatchDiv } from '../../simulation/div-world/world';
import { microscopeView } from '../../simulation/optical-world/world';
import { STAGE_SEAT, stageTopZCm } from '../../simulation/optical-world/geometry';
import { DIRTY_ZONE } from '../../simulation/div-world/geometry';
import { SIMULATED_ERRORS_B06, incidentCode, type B06Scenario } from '../../practices/practice-b06/error-scenarios';
import { notebookIssuesB06 } from '../../practices/practice-b06/rubric';
import { emptyB06Notebook } from '../../practices/practice-b06/notebook';
import {
  PREP_SPOT, centerOf, cmdD, coverD, cultureMount, dropD, elodeaMount, errKeys, focusD, idealAttemptB06, microscopeOn, placeD, ppeB06, runD,
  slideToPrep, toObjectiveD, toStageD, tradesMount, worldB06,
} from '../helpersB06';

const err = (w: DivWorld, code: string) => w.evidence[`err:${code}`] ?? 0;
const base = (scenarios: B06Scenario[] = []) => {
  const w = worldB06({ scenarios });
  ppeB06(w);
  return w;
};
const seat = { x: STAGE_SEAT.x, y: STAGE_SEAT.y, z: stageTopZCm(6) };
/** Lámina ya montada en la platina, 4X enfocado, ocular abierto. */
const onStage = (prep: (w: DivWorld) => void = (w) => tradesMount(w, 'sl1', 'cv1'), scenarios: B06Scenario[] = [], slideId = 'sl1') => {
  const w = base(scenarios);
  prep(w);
  microscopeOn(w);
  toObjectiveD(w, 4);
  toStageD(w, slideId);
  focusD(w);
  cmdD(w, { type: 'observe', instrument: 'compound', open: true });
  return w;
};
const capture = (w: DivWorld) => {
  runD(w, 1.6);
  const r = dispatchDiv(w, { type: 'captureObservation', instrument: 'compound' });
  return r.id ? w.observations[r.id] : null;
};
/** Captura a 4X y luego a 40X tras pasar por 10X. */
const at40 = (w: DivWorld) => {
  capture(w);
  for (const x of [10, 40] as const) {
    toObjectiveD(w, x);
    focusD(w);
  }
  cmdD(w, { type: 'setDiaphragm', value01: 0.6 });
  return capture(w)!;
};
/** Lámina permanente de la caja en la platina, 4X enfocado. */
const fixedOnStage = (id: string, scenarios: B06Scenario[] = []) =>
  onStage(
    (w) => {
      cmdD(w, { type: 'openSlideCase', open: true });
      placeD(w, id, 'hand');
    },
    scenarios,
    id,
  );
const mark = (w: DivWorld, obsId: string, structure: MarkStructure, at: [number, number]) =>
  cmdD(w, { type: 'markRegion', observationId: obsId, structure, u: at[0], v: at[1] });
/** Primera burbuja del montaje que cae dentro de la captura (u, v). */
const bubbleIn = (w: DivWorld, obsId: string): [number, number] | null => {
  const o = w.observations[obsId];
  const [cx, cy, vw, vh] = o.normalizedViewport;
  for (const [bx, by] of w.div.obsMeta[obsId]?.bubbles ?? []) {
    const u = 0.5 + (bx - cx) / vw;
    const v = 0.5 + (by - cy) / vh;
    if (u > 0.02 && u < 0.98 && v > 0.02 && v < 0.98) return [u, v];
  }
  return null;
};
/** Cultivo de Paramecium con aire atrapado (cubreobjetos a 20°): captura a 10X válida con la burbuja del medio en el campo. */
const bubblyParamecium = () => {
  const w = onStage((w) => {
    slideToPrep(w, 'sl1');
    dropD(w, 'cuP', 'sl1');
    dropD(w, 'mc', 'sl1');
    coverD(w, 'sl1', 'cv1', { angle: 20, speed: 0.4 });
  });
  expect(w.mounts.sl1.bubbleFraction).toBeGreaterThan(0.05);
  capture(w);
  toObjectiveD(w, 10);
  focusD(w);
  const o = capture(w)!;
  expect(o.isObservationValid).toBe(true);
  return { w, o };
};
/** Libreta sobre la ruta ideal, para los errores de interpretación. */
const nbCase = (edit: (r: ReturnType<typeof idealAttemptB06>) => void, code: string) => {
  const r = idealAttemptB06();
  expect(notebookIssuesB06(r.w, r.nb)).not.toContain(`nb:${code}`);
  edit(r);
  expect(notebookIssuesB06(r.w, r.nb)).toContain(`nb:${code}`);
  return r;
};
/** Incidencia de recurso: código por prefijo, sin ningún error atribuible. */
const assetCase = (w: DivWorld, code: string) => {
  expect(w.cell.incidents.map(incidentCode)).toContain(code);
  expect(w.cell.incidents.every((k) => w.evidence[`asset:unavailable:${k}`])).toBe(true);
  expect(errKeys(w)).toEqual([]);
};

const FIXTURES: Record<string, () => void> = {
  'CEL-001': () => {
    const w = worldB06();
    const r = placeD(w, 'sl1', 'hand', undefined, false);
    expect(r.ok).toBe(false);
    expect(err(w, 'CEL-001')).toBe(1);
    expect(w.objects.sl1.support).toBe('bench');
  },
  'CEL-002': () => {
    const w = base();
    placeD(w, 'sl1', 'dirtyZone', DIRTY_ZONE);
    expect(err(w, 'CEL-002')).toBe(1);
    expect(w.slides.sl1.dirty01).toBeGreaterThanOrEqual(0.7);
  },
  'CEL-003': () => {
    const w = base();
    const r = placeD(w, 'sl6', 'prep', PREP_SPOT, false);
    expect(r.ok).toBe(false);
    expect(err(w, 'CEL-003')).toBe(1);
    expect(w.objects.sl6.support).toBe('bench');
  },
  'CEL-004': () => {
    const w = base();
    placeD(w, 'sc', 'hand');
    cmdD(w, { type: 'goStation', station: 'B' });
    expect(err(w, 'CEL-004')).toBe(1);
    expect(w.div.sharpCarried).toBe(true);
  },
  'CEL-005': () => {
    const w = base();
    const r = cmdD(w, { type: 'useLancet' }, false);
    expect(r.code).toBe('LANCET_FORBIDDEN');
    expect(err(w, 'CEL-005')).toBe(1);
    expect(Object.values(w.mounts).some((m) => m.cell?.zones.some((z) => z.kind === 'blood' as never))).toBe(false);
  },
  'CEL-006': () => {
    const w = base();
    const r = cmdD(w, { type: 'openCulture', id: 'bcPlate' }, false);
    expect(r.code).toBe('BIOSAFETY');
    expect(err(w, 'CEL-006')).toBe(1);
  },
  'CEL-007': () => {
    const w = base();
    microscopeOn(w);
    cmdD(w, { type: 'squeezeDropper', dispenserId: 'dw', targetId: 'mic', force01: 0.5, dxCm: 0, dyCm: 0 });
    expect(err(w, 'CEL-007')).toBe(1);
    expect(w.div.micWet).toBe(true);
    expect(w.microscope.power).toBe(false);
    expect(cmdD(w, { type: 'setPower', device: 'microscope', on: true }, false).code).toBe('MIC_WET');
  },
  'CEL-008': () => {
    const w = base();
    placeD(w, 'sw1', 'hand');
    cmdD(w, { type: 'swab', swabId: 'sw1', sourceId: 'bucc', durationS: 4, pressure01: 0.5 });
    cmdD(w, { type: 'dispose', objectId: 'sw1', containerId: 'trashBin' });
    expect(err(w, 'CEL-008')).toBe(1);
    expect(w.objects.sw1.support).toBe('trashBin');
  },
  'CEL-009': () => {
    const w = base();
    cmdD(w, { type: 'turnCoarse', deltaTurns: 40 });
    expect(err(w, 'CEL-009')).toBe(1);
  },
  'CEL-010': () => {
    const w = base();
    microscopeOn(w);
    cmdD(w, { type: 'closeBench' });
    expect(err(w, 'CEL-010')).toBe(1);
    expect(w.evidence.benchRestored).toBeUndefined();
  },
  'CEL-011': () => {
    const w = onStage((w) => tradesMount(w, 'sl1', 'cv1', { thicknessMm: 0.9 }));
    expect(err(w, 'CEL-011')).toBe(1);
    const o = at40(w);
    expect(o.issues).toContain('THICK');
    expect(o.visibleRegionIds).not.toContain('stoma');
  },
  'CEL-012': () => {
    const w = base();
    slideToPrep(w, 'sl1');
    cmdD(w, { type: 'peelEpidermis', sourceId: 'tra', toolId: 'fc', thicknessMm: 0.12, lengthCm: 0.8 });
    cmdD(w, { type: 'placeSpecimen', toolId: 'fc', targetId: 'sl1', dxCm: 1.4, dyCm: 0 });
    expect(err(w, 'CEL-012')).toBe(1);
    expect(w.mounts.sl1.cell!.zones[0].centerCm[0]).toBeCloseTo(1.4, 6);
  },
  'CEL-013': () => {
    const w = base();
    placeD(w, 'sl5', 'prep', PREP_SPOT);
    cmdD(w, { type: 'peelEpidermis', sourceId: 'tra', toolId: 'fc', thicknessMm: 0.12, lengthCm: 0.8 });
    cmdD(w, { type: 'placeSpecimen', toolId: 'fc', targetId: 'sl5', dxCm: 0, dyCm: 0 });
    expect(err(w, 'CEL-013')).toBe(1);
    expect(w.mounts.sl5.contamination01).toBeGreaterThan(0.4);
  },
  'CEL-014': () => {
    const w = base();
    slideToPrep(w, 'sl1');
    cmdD(w, { type: 'peelEpidermis', sourceId: 'tra', toolId: 'fc', thicknessMm: 0.12, lengthCm: 0.8 });
    cmdD(w, { type: 'placeSpecimen', toolId: 'fc', targetId: 'sl1', dxCm: 0, dyCm: 0 });
    coverD(w, 'sl1', 'cv1');
    runD(w, 30);
    expect(err(w, 'CEL-014')).toBe(1);
    expect(w.mounts.sl1.hydrated01).toBeLessThan(0.6);
  },
  'CEL-015': () => {
    const w = base();
    slideToPrep(w, 'sl1');
    cmdD(w, { type: 'peelEpidermis', sourceId: 'tra', toolId: 'fc', thicknessMm: 0.12, lengthCm: 0.8 });
    cmdD(w, { type: 'placeSpecimen', toolId: 'fc', targetId: 'sl1', dxCm: 0, dyCm: 0 });
    for (let i = 0; i < 4; i++) dropD(w, 'dw', 'sl1', 1);
    coverD(w, 'sl1', 'cv1');
    expect(err(w, 'CEL-015')).toBe(1);
    expect(w.fluids.spilledMl).toBeGreaterThan(0);
  },
  'CEL-016': () => {
    const w = base();
    slideToPrep(w, 'sl1');
    cmdD(w, { type: 'peelEpidermis', sourceId: 'tra', toolId: 'fc', thicknessMm: 0.12, lengthCm: 0.8 });
    cmdD(w, { type: 'placeSpecimen', toolId: 'fc', targetId: 'sl1', dxCm: 0, dyCm: 0 });
    dropD(w, 'dw', 'sl1');
    coverD(w, 'sl1', 'cv1', { angle: 4, speed: 2 });
    expect(err(w, 'CEL-016')).toBe(1);
    expect(w.mounts.sl1.bubbleFraction).toBeGreaterThan(0.3);
  },
  'CEL-017': () => {
    const w = base();
    elodeaMount(w, 'sl1', 'cv1');
    cmdD(w, { type: 'pressCover', slideId: 'sl1', force01: 0.95 });
    expect(err(w, 'CEL-017')).toBe(1);
    expect(w.mounts.sl1.broken).toBe(true);
  },
  'CEL-018': () => {
    const w = base();
    slideToPrep(w, 'sl1', 'prep2');
    placeD(w, 'sw1', 'hand');
    cmdD(w, { type: 'swab', swabId: 'sw1', sourceId: 'bucc', durationS: 4, pressure01: 1 });
    cmdD(w, { type: 'smear', swabId: 'sw1', slideId: 'sl1', lengthCm: 0.3, pressure01: 1, dxCm: 0, dyCm: 0 });
    expect(err(w, 'CEL-018')).toBe(1);
    expect(w.mounts.sl1.cell!.smearDensity01).toBeGreaterThan(w.params.cellPrep!.smearDenseMax);
  },
  'CEL-019': () => {
    const w = base();
    const r = cmdD(w, { type: 'squeezeDropper', dispenserId: 'dw', targetId: 'fxB', force01: 0.5, dxCm: 0, dyCm: 0 }, false);
    expect(r.ok).toBe(false);
    expect(err(w, 'CEL-019')).toBe(1);
    expect(w.mounts.fxB).toBeUndefined();
  },
  'CEL-020': () => {
    const w = base();
    cultureMount(w, 'paramecium', 'sl1', 'cv1', { label: 'euglena' });
    expect(err(w, 'CEL-020')).toBe(1);
    expect(w.div.labels.sl1).not.toBe(w.mounts.sl1.cell!.zones[0].kind);
  },
  'CEL-021': () => {
    const { w, o } = bubblyParamecium();
    const at = bubbleIn(w, o.id);
    expect(at).not.toBeNull();
    mark(w, o.id, 'parameciumCell', at!);
    expect(err(w, 'CEL-021')).toBe(1);
    expect(w.div.marks.at(-1)!.verdict).toBe('bubble');
  },
  'CEL-022': () => {
    const w = base();
    cultureMount(w, 'paramecium', 'sl1', 'cv1');
    cmdD(w, { type: 'shiftCover', slideId: 'sl1', dxCm: 0.6 });
    expect(err(w, 'CEL-022')).toBe(1);
    expect(w.div.live.sl1.dragged).toBe(true);
    expect(w.div.live.sl1.viability01).toBeLessThan(1);
  },
  'CEL-023': () => {
    const w = base();
    tradesMount(w, 'sl1', 'cv1');
    cmdD(w, { type: 'openClip', open: false });
    const r = placeD(w, 'sl1', 'stage', seat, false);
    expect(r.ok).toBe(false);
    expect(err(w, 'CEL-023')).toBe(1);
    expect(w.microscope.slideOnStage).toBeNull();
  },
  'CEL-024': () => {
    const w = base();
    tradesMount(w, 'sl1', 'cv1');
    cmdD(w, { type: 'openClip', open: true });
    placeD(w, 'sl1', 'stage', seat);
    cmdD(w, { type: 'setStageXY', xMm: 4, yMm: 0 });
    expect(err(w, 'CEL-024')).toBe(1);
    expect(w.microscope.slideOffsetMm[0]).toBeCloseTo(-2, 6);
  },
  'CEL-025': () => {
    const w = base();
    tradesMount(w, 'sl1', 'cv1');
    toStageD(w, 'sl1');
    toObjectiveD(w, 40);
    expect(err(w, 'CEL-025')).toBe(1);
    expect(w.evidence.located4x).toBeUndefined();
  },
  'CEL-026': () => {
    const w = fixedOnStage('fxB', [SC_B06.BACT_IMMERSION as B06Scenario]);
    at40(w);
    cmdD(w, { type: 'turnTurret', deltaDeg: 45 });
    toObjectiveD(w, 100);
    focusD(w);
    const o = capture(w)!;
    expect(err(w, 'CEL-026')).toBe(1);
    expect(o.issues).toContain('NO_OIL');
    expect(o.isObservationValid).toBe(false);
  },
  'CEL-027': () => {
    const w = fixedOnStage('fxB', [SC_B06.BACT_IMMERSION as B06Scenario]);
    at40(w);
    cmdD(w, { type: 'addImmersionOil', slideId: 'fxB', drops: 1 });
    expect(err(w, 'CEL-027')).toBe(1);
    expect(w.div.lensOil[40]).toBeGreaterThan(0);
    expect(capture(w)!.issues).toContain('LENS_OIL');
  },
  'CEL-028': () => {
    const w = onStage();
    capture(w);
    toObjectiveD(w, 10);
    toObjectiveD(w, 40);
    focusD(w);
    for (let i = 0; i < 40 && !err(w, 'CEL-028'); i++) dispatchDiv(w, { type: 'turnFine', deltaTurns: 0.5 });
    expect(err(w, 'CEL-028')).toBe(1);
    expect(w.microscope.impactCount).toBe(1);
  },
  'CEL-029': () => {
    const w = fixedOnStage('fxB', [SC_B06.BACT_IMMERSION as B06Scenario]);
    at40(w);
    cmdD(w, { type: 'turnTurret', deltaDeg: 45 });
    cmdD(w, { type: 'addImmersionOil', slideId: 'fxB', drops: 1 });
    toObjectiveD(w, 100);
    const before = w.microscope.coarseTurns;
    const r = cmdD(w, { type: 'turnCoarse', deltaTurns: 0.2 }, false);
    expect(r.code).toBe('COARSE_AT_100X');
    expect(err(w, 'CEL-029')).toBe(1);
    expect(w.microscope.coarseTurns).toBe(before);
  },
  'CEL-030': () => {
    const w = onStage();
    cmdD(w, { type: 'turnTurret', deltaDeg: 60 });
    expect(capture(w)!.isObservationValid).toBe(false);
    expect(err(w, 'CEL-030')).toBe(1);
  },
  'CEL-031': () => {
    const w = onStage();
    cmdD(w, { type: 'setIllumination', device: 'microscope', value01: 0 });
    expect(capture(w)!.isObservationValid).toBe(false);
    expect(err(w, 'CEL-031')).toBe(1);
  },
  'CEL-032': () => {
    const w = onStage();
    cmdD(w, { type: 'setDiaphragm', value01: 1 });
    const o = capture(w)!;
    expect(err(w, 'CEL-032')).toBe(1);
    expect(o.issues).toContain('DIAPHRAGM_OPEN');
  },
  'CEL-033': () => {
    const w = onStage();
    cmdD(w, { type: 'setDiaphragm', value01: 0 });
    const o = capture(w)!;
    expect(err(w, 'CEL-033')).toBe(1);
    expect(o.issues).toContain('DIAPHRAGM_CLOSED');
  },
  'CEL-034': () => {
    const w = onStage();
    capture(w);
    cmdD(w, { type: 'setStageXY', xMm: -2.6, yMm: 0 });
    toObjectiveD(w, 10);
    expect(err(w, 'CEL-034')).toBe(1);
    expect(microscopeView(w).visible).toEqual([]);
  },
  'CEL-035': () => {
    const w = onStage();
    cmdD(w, { type: 'turnCoarse', deltaTurns: -1 });
    expect(capture(w)!.isObservationValid).toBe(false);
    expect(err(w, 'CEL-035')).toBe(1);
  },
  'CEL-036': () => {
    const w = onStage();
    capture(w);
    toObjectiveD(w, 10);
    toObjectiveD(w, 40);
    cmdD(w, { type: 'openClip', open: true });
    const r = placeD(w, 'sl1', 'bench', { x: 260, y: 14 }, false);
    expect(r.ok).toBe(false);
    expect(err(w, 'CEL-036')).toBe(1);
    expect(w.microscope.slideOnStage).toBe('sl1');
  },
  'CEL-037': () => nbCase(({ nb }) => (nb.epidermis.totalMag = '40'), 'CEL-037'),
  'CEL-038': () => {
    const w = base();
    const r = cmdD(w, { type: 'wipe', targetId: 'mic:lens', toolId: 'tw' }, false);
    expect(r.ok).toBe(false);
    expect(err(w, 'CEL-038')).toBe(1);
  },
  'CEL-039': () => {
    const w = base();
    const r = cmdD(w, { type: 'selectObjective', objectiveX: 100 }, false);
    expect(r.code).toBe('OBJECTIVE_UNAVAILABLE');
    expect(err(w, 'CEL-039')).toBe(1);
    expect(microscopeView(w).objectiveX).not.toBe(100);
  },
  'CEL-040': () => {
    const w = base([SC_B06.PROT_METHYL as B06Scenario]);
    cultureMount(w, 'paramecium', 'sl1', 'cv1');
    expect(err(w, 'CEL-040')).toBe(1);
    expect(w.evidence['mcMount:paramecium']).toBeUndefined();
  },
  'CEL-041': () => {
    const w = base();
    slideToPrep(w, 'sl1');
    dropD(w, 'cuP', 'sl1');
    dropD(w, 'mc', 'sl1');
    dropD(w, 'mc', 'sl1');
    expect(err(w, 'CEL-041')).toBe(1);
    expect(w.mounts.sl1.cell!.stainMl.methylcellulose).toBeGreaterThan(0);
  },
  'CEL-042': () => {
    const w = base();
    slideToPrep(w, 'sl1');
    dropD(w, 'cuP', 'sl1');
    dropD(w, 'iod', 'sl1');
    expect(err(w, 'CEL-042')).toBe(1);
    runD(w, w.params.div!.lugolKillS + 0.5);
    expect(w.div.live.sl1.viability01).toBe(0);
  },
  'CEL-043': () => nbCase(({ nb }) => {
    nb.protists.euglena.reserve = 'glycogen';
    nb.protists.euglena.reserveMethod = 'lugol';
  }, 'CEL-043'),
  'CEL-044': () => {
    const w = onStage((w) => cultureMount(w, 'euglena', 'sl1', 'cv1'));
    const o = at40(w);
    expect(o.isObservationValid).toBe(true);
    mark(w, o.id, 'flagellum', centerOf(w, o.id, 'flagellum') ?? centerOf(w, o.id, 'euglenaCell')!);
    expect(err(w, 'CEL-044')).toBe(1);
    expect(w.div.marks.at(-1)!.verdict).not.toBe('valid');
  },
  'CEL-045': () => {
    // Dos arrastres del cubreobjetos dejan a los organismos sin viabilidad: la movilidad se registra «inmóvil».
    const w = onStage((w) => {
      cultureMount(w, 'paramecium', 'sl1', 'cv1', { mc: true });
      cmdD(w, { type: 'shiftCover', slideId: 'sl1', dxCm: 0.6 });
      cmdD(w, { type: 'shiftCover', slideId: 'sl1', dxCm: -0.6 });
    });
    cmdD(w, { type: 'recordMotility', slideId: 'sl1' });
    expect(err(w, 'CEL-045')).toBe(1);
    expect(w.div.live.sl1.motility).toBe('immobile');
    expect(w.evidence['motility:paramecium:mc']).toBeUndefined();
  },
  'CEL-046': () => nbCase(({ nb }) => {
    nb.protists.euglena.speedUmS = '60';
    nb.protists.paramecium.speedUmS = '900';
  }, 'CEL-046'),
  'CEL-047': () => nbCase(({ nb }) => (nb.organisms.find((r) => r.specimen === 'paramecium')!.specimen = 'euglena'), 'CEL-047'),
  'CEL-048': () => {
    const w = onStage((w) => cultureMount(w, 'paramecium', 'sl1', 'cv1', { mc: true }));
    const o = at40(w);
    expect(o.isObservationValid).toBe(true);
    mark(w, o.id, 'cilia', centerOf(w, o.id, 'cilia') ?? centerOf(w, o.id, 'parameciumCell')!);
    expect(err(w, 'CEL-048')).toBe(1);
    expect(w.div.marks.at(-1)!.verdict).not.toBe('valid');
  },
  'CEL-049': () => {
    const { w, o } = bubblyParamecium();
    mark(w, o.id, 'contractileVacuole', bubbleIn(w, o.id)!);
    expect(err(w, 'CEL-049')).toBe(1);
    expect(w.div.marks.at(-1)!.verdict).toBe('bubble');
  },
  'CEL-050': () => {
    const w = fixedOnStage('fxO');
    const o = capture(w)!;
    expect(err(w, 'CEL-050')).toBe(1);
    expect(o.issues).toContain('NOT_ASSIGNED');
    expect(o.isObservationValid).toBe(false);
  },
  'CEL-051': () => {
    const w = base();
    cmdD(w, { type: 'openSlideCase', open: true });
    cmdD(w, { type: 'openClip', open: true });
    const r = placeD(w, 'fxB2', 'stage', seat, false);
    expect(r.code).toBe('BROKEN_FIXED_SLIDE');
    expect(err(w, 'CEL-051')).toBe(1);
    expect(w.microscope.slideOnStage).toBeNull();
  },
  'CEL-052': () => {
    const w = base();
    cmdD(w, { type: 'openSlideCase', open: true });
    placeD(w, 'fxB', 'hand');
    cmdD(w, { type: 'openSlideCase', open: false });
    cmdD(w, { type: 'closeBench' });
    expect(err(w, 'CEL-052')).toBe(1);
    expect(w.evidence.benchRestored).toBeUndefined();
  },
  'CEL-053': () => {
    const w = fixedOnStage('fxB', [SC_B06.BACT_IMMERSION as B06Scenario]);
    capture(w);
    toObjectiveD(w, 10);
    focusD(w);
    cmdD(w, { type: 'addImmersionOil', slideId: 'fxB', drops: 4 });
    expect(err(w, 'CEL-027')).toBe(0);
    toObjectiveD(w, 40);
    expect(err(w, 'CEL-053')).toBe(1);
    expect(w.div.lensOil[40]).toBeGreaterThan(0);
  },
  'CEL-054': () => {
    const w = fixedOnStage('fxB');
    const o = at40(w);
    expect(o.isObservationValid).toBe(true);
    mark(w, o.id, 'nucleolus', centerOf(w, o.id, 'bacilli')!);
    expect(err(w, 'CEL-054')).toBe(1);
    expect(w.div.marks.at(-1)!.verdict).toBe('never');
  },
  'CEL-055': () => {
    const w = onStage();
    const o = capture(w)!;
    const r = cmdD(w, { type: 'measure', observationId: o.id, ax: 100, ay: 500, bx: 900, by: 500, scale: 'assumed' }, false);
    expect(r.code).toBe('UNCALIBRATED_SCALE');
    expect(err(w, 'CEL-055')).toBe(1);
    expect(w.div.measurements).toEqual([]);
  },
  'CEL-056': () => {
    const w = fixedOnStage('fxS');
    const o = at40(w);
    mark(w, o.id, 'leukocyte', centerOf(w, o.id, 'erythrocyte')!);
    expect(err(w, 'CEL-056')).toBe(1);
    expect(w.div.marks.at(-1)!.hit).toBe('erythrocyte');
  },
  'CEL-057': () => {
    const w = fixedOnStage('fxS');
    const o = at40(w);
    mark(w, o.id, 'erythrocyte', centerOf(w, o.id, 'platelet')!);
    expect(err(w, 'CEL-057')).toBe(1);
    expect(w.div.marks.at(-1)!.verdict).toBe('wrong');
  },
  'CEL-058': () => {
    const w = fixedOnStage('fxS');
    const o = at40(w);
    mark(w, o.id, 'neutrophil', centerOf(w, o.id, 'leukocyte')!);
    expect(err(w, 'CEL-058')).toBe(1);
    expect(w.div.marks.at(-1)!.verdict).not.toBe('valid');
  },
  'CEL-059': () => {
    const w = base([SC_B06.BACT_IMMERSION as B06Scenario]);
    cmdD(w, { type: 'openSlideCase', open: true });
    placeD(w, 'fxB', 'hand');
    cmdD(w, { type: 'addImmersionOil', slideId: 'fxB', drops: 1 });
    expect(placeD(w, 'fxB', 'case:s01', undefined, false).code).toBe('OIL_ON_SLIDE');
    cmdD(w, { type: 'closeBench' });
    expect(err(w, 'CEL-059')).toBe(1);
    expect(w.evidence.benchRestored).toBeUndefined();
  },
  'CEL-060': () => {
    const w = base();
    cmdD(w, { type: 'openSlideCase', open: true });
    placeD(w, 'wr1', 'bench', { x: 330, y: 12 });
    dropD(w, 'wri', 'wr1');
    runD(w, 70);
    dropD(w, 'dw', 'wr1');
    expect(err(w, 'CEL-060')).toBe(1);
    expect(w.slides.wr1.assetId).toBe('bloodWrightWeak');
  },
  'CEL-061': () => nbCase(({ w, res }) => {
    const o = res.tradescantia[40];
    w.div.marks.push({ id: 'mkx', observationId: o, structure: 'chloroplasts', u: 0.5, v: 0.5, verdict: 'wrong', hit: 'stoma', assetId: w.observations[o].assetId, objectiveX: 40 });
  }, 'CEL-061'),
  'CEL-062': () => nbCase(({ nb }) => (nb.protists.paramecium.speedUmS = '900'), 'CEL-062'),
  'CEL-063': () => nbCase(({ nb }) => (nb.morpho[0].unit = ''), 'CEL-063'),
  'CEL-064': () => nbCase(({ nb }) => (nb.morpho[0].lengthMm = nb.morpho[0].lengthUm), 'CEL-064'),
  'CEL-065': () => {
    const w = onStage();
    cmdD(w, { type: 'setIllumination', device: 'microscope', value01: 0 });
    const o = capture(w)!;
    const nb = emptyB06Notebook('b06-test');
    nb.organisms = [{ observationId: o.id, specimen: 'tradescantia', cellType: 'eukaryote', group: 'plant', motility: 'notEvaluable', cells: 'multi', wall: 'inferred', nucleus: 'inferred' }];
    expect(notebookIssuesB06(w, nb)).toContain('nb:CEL-065');
  },
  'CEL-066': () => nbCase(({ nb }) => (nb.organisms.find((r) => r.specimen === 'bacillus')!.nucleus = 'visible'), 'CEL-066'),
  'CEL-067': () => nbCase(({ nb }) => (nb.organisms[0].observationId = 'obs-de-otro-intento'), 'CEL-067'),
  'CEL-068': () => nbCase(({ nb }) => (nb.morpho[0].uncertaintyUm = ''), 'CEL-068'),
  'CEL-069': () => nbCase(({ nb }) => (nb.organisms.find((r) => r.specimen === 'paramecium')!.cellType = 'prokaryote'), 'CEL-069'),
  'CEL-070': () => nbCase(({ nb }) => (nb.protists.euglena.photosynthesisProven = true), 'CEL-070'),
  'CEL-071': () => nbCase(({ nb }) => (nb.organisms[0].observationId = null), 'CEL-071'),
  'CEL-072': () => {
    const w = base([SC_B06.EUG_MOTILITY as B06Scenario]);
    const r = cmdD(w, { type: 'requestProtistVideo', kind: 'euglena' }, false);
    expect(r.code).toBe('ASSET_UNAVAILABLE');
    assetCase(w, 'CEL-072');
  },
  'CEL-073': () => {
    const w = onStage(undefined, [SC_B06.NO_SCALE as B06Scenario]);
    const o = capture(w)!;
    const r = cmdD(w, { type: 'measure', observationId: o.id, ax: 100, ay: 500, bx: 900, by: 500, scale: 'calibration' }, false);
    expect(r.code).toBe('UNCALIBRATED_SCALE');
    expect(w.div.measurements).toEqual([]);
    assetCase(w, 'CEL-073');
  },
  'CEL-074': () => {
    const w = fixedOnStage('fxS', [SC_B06.TEACHER_OVERRIDE as B06Scenario]);
    const o = at40(w);
    expect(o.issues).toContain('ASSET_OBJECTIVE');
    expect(o.isObservationValid).toBe(false);
    assetCase(w, 'CEL-074');
  },
  'CEL-075': () => {
    const w = base([SC_B06.EUG_MOTILITY as B06Scenario]);
    cultureMount(w, 'euglena', 'sl1', 'cv1');
    const r = cmdD(w, { type: 'estimateSpeed', slideId: 'sl1' }, false);
    expect(r.code).toBe('NOT_EVALUABLE');
    assetCase(w, 'CEL-075');
  },
};

describe('B06 — 71 errores con consecuencia causal y cuatro incidencias de recursos (§9)', () => {
  it('el catálogo tiene 75 casos únicos y una fixture por cada uno', () => {
    const codes = SIMULATED_ERRORS_B06.map((e) => e.code);
    expect(new Set(codes).size).toBe(75);
    expect(Object.keys(FIXTURES).sort()).toEqual([...codes].sort());
  });
  for (const e of SIMULATED_ERRORS_B06) it(`${e.code} — ${e.trigger} → ${e.effect}`, () => FIXTURES[e.code]());
  it('el camino correcto no comete ninguno, no deja incidencias y conserva los balances', () => {
    const { w, nb } = idealAttemptB06();
    expect(errKeys(w)).toEqual([]);
    expect(notebookIssuesB06(w, nb)).toEqual([]);
    expect(w.cell.incidents).toEqual([]);
    for (const [k, v] of Object.entries(conservedDiv(w))) expect(Math.abs(v), k).toBeLessThan(1e-6);
  });
  it('empezar por la sangre o las bacterias a 4X no cuenta como «empezar a 40X» (CEL-025)', () => {
    for (const id of ['fxS', 'fxB']) {
      const w = fixedOnStage(id);
      at40(w);
      expect(err(w, 'CEL-025'), id).toBe(0);
    }
  });
  it('ningún código de B01 o B02 sin traducir llega a la evidencia de B06', () => {
    const { w } = idealAttemptB06();
    const w2 = base();
    cmdD(w2, { type: 'squeezeDropper', dispenserId: 'dw', targetId: 'bench', force01: 0.5, dxCm: 0, dyCm: 0 });
    cmdD(w2, { type: 'turnCoarse', deltaTurns: 40 });
    for (const k of [...errKeys(w), ...errKeys(w2)]) expect(k).toMatch(/^err:CEL-0\d\d$/);
  });
});
