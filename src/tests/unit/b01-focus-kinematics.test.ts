/**
 * B01 — cinemática de los mandos y valores de referencia (§8 de la revisión de instrumentos): vueltas → mm de la
 * platina, enclavamientos del revólver, ida y vuelta del carro X/Y, binocular que no enfoca, zoom y enfoque del
 * estereoscopio, y gestos continuos (muchos pasos pequeños) juzgados como un solo gesto.
 */
import { describe, expect, it } from 'vitest';
import { microscopeView, stereoView } from '../../simulation/optical-world/world';
import { stageZmm, turretObjective } from '../../simulation/instruments/optical/microscope-model';
import { cmdB, focusMicroscope, inspectAll, ppeB01, toObjective, toStage, wetMount, worldB01, runB } from '../helpersB01';

const ready = () => {
  const w = worldB01();
  ppeB01(w);
  inspectAll(w);
  return w;
};
const onStage = () => {
  const w = ready();
  wetMount(w);
  cmdB(w, { type: 'setPower', device: 'microscope', on: true });
  toStage(w, 'sl1');
  focusMicroscope(w);
  cmdB(w, { type: 'observe', instrument: 'compound', open: true });
  return w;
};

describe('B01 — mandos del microscopio (modelo curricular)', () => {
  it('un cuarto de vuelta desplaza 0,50 mm con el macro y 0,025 mm con el micro', () => {
    const w = ready();
    const p = w.params.microscope;
    const z0 = stageZmm(w.microscope, p);
    cmdB(w, { type: 'turnCoarse', deltaTurns: 0.25 });
    expect(stageZmm(w.microscope, p) - z0).toBeCloseTo(0.5, 9);
    const z1 = stageZmm(w.microscope, p);
    cmdB(w, { type: 'turnFine', deltaTurns: 0.25 });
    expect(stageZmm(w.microscope, p) - z1).toBeCloseTo(0.025, 9);
  });

  it('el revólver solo da objetivo en un enclavamiento; entre dos posiciones no hay objetivo operativo', () => {
    const w = ready();
    const p = w.params.microscope;
    for (let a = 0; a <= 240; a += 10) {
      const t = turretObjective(a, p);
      const atDetent = a % p.turretDetentDeg === 0;
      expect(t.locked, `${a}°`).toBe(atDetent);
      if (atDetent) expect(t.objectiveX).toBe(([4, 10, 40] as const)[a / p.turretDetentDeg]);
    }
    cmdB(w, { type: 'turnTurret', deltaDeg: 60 });
    expect(microscopeView(w).locked).toBe(false);
    cmdB(w, { type: 'turnTurret', deltaDeg: 60 });
    expect(microscopeView(w).objectiveX).toBe(10);
    // Vuelta completa: desde 4X hacia atrás llega el 40X; a 1° antes de dar la vuelta ya enclava el 4X.
    cmdB(w, { type: 'turnTurret', deltaDeg: -240 });
    expect(w.microscope.turretDeg).toBe(240);
    expect(microscopeView(w).objectiveX).toBe(40);
    expect(turretObjective(359, p).objectiveX).toBe(4);
  });

  it('dos giros opuestos e iguales del carro X/Y vuelven al mismo punto y a la misma región', () => {
    const w = onStage();
    const v0 = microscopeView(w);
    for (let i = 0; i < 20; i++) cmdB(w, { type: 'setStageXY', xMm: w.microscope.stageXmm + 0.05, yMm: w.microscope.stageYmm - 0.03 });
    for (let i = 0; i < 20; i++) cmdB(w, { type: 'setStageXY', xMm: w.microscope.stageXmm - 0.05, yMm: w.microscope.stageYmm + 0.03 });
    const v1 = microscopeView(w);
    expect(Math.abs(w.microscope.stageXmm)).toBeLessThan(1e-9);
    expect(Math.abs(w.microscope.stageYmm)).toBeLessThan(1e-9);
    expect(v1.centerMm[0]).toBeCloseTo(v0.centerMm[0], 9);
    expect(v1.visible).toEqual(v0.visible);
  });

  it('el macro y el micro mueven la platina en el mismo sentido físico que la nitidez calibrada', () => {
    const w = onStage();
    const p = w.params.microscope;
    // Por debajo del foco, subir la platina acerca al foco (mejora); por encima, lo aleja.
    cmdB(w, { type: 'turnFine', deltaTurns: -3 });
    const below = microscopeView(w).sharpness01;
    cmdB(w, { type: 'turnFine', deltaTurns: 1 });
    expect(microscopeView(w).sharpness01).toBeGreaterThan(below);
    expect(stageZmm(w.microscope, p)).toBeGreaterThan(0);
  });

  it('la distancia interpupilar y las dioptrías no cambian el aumento ni la nitidez de la muestra', () => {
    const w = onStage();
    const v0 = microscopeView(w);
    cmdB(w, { type: 'setInterpupillary', device: 'microscope', valueMm: 70 });
    cmdB(w, { type: 'setDiopter', device: 'microscope', side: 'right', value: 1.5 });
    const v1 = microscopeView(w);
    expect(v1.magnification).toBe(v0.magnification);
    expect(v1.sharpness01).toBe(v0.sharpness01);
    expect(w.microscope.ipdMm).toBe(70);
  });

  it('un arrastre del macro a 40X en pasos pequeños cuenta como un solo gesto (E22)', () => {
    const w = onStage();
    runB(w, 1.6);
    cmdB(w, { type: 'captureObservation', instrument: 'compound' });
    toObjective(w, 10);
    toObjective(w, 40);
    cmdB(w, { type: 'gesture', part: 'mic:coarse', phase: 'begin' });
    for (let i = 0; i < 6; i++) cmdB(w, { type: 'turnCoarse', deltaTurns: 0.02 });
    cmdB(w, { type: 'gesture', part: 'mic:coarse', phase: 'end' });
    expect(w.evidence['err:E22']).toBe(1);
    expect(w.gesture).toBeNull();
  });

  it('un arrastre de los mandos X/Y que aleja la estructura se juzga desde el inicio del gesto (E34)', () => {
    const w = onStage();
    runB(w, 1.6);
    cmdB(w, { type: 'captureObservation', instrument: 'compound' });
    toObjective(w, 10);
    focusMicroscope(w);
    cmdB(w, { type: 'gesture', part: 'mic:stageX', phase: 'begin' });
    for (let i = 0; i < 26; i++) cmdB(w, { type: 'setStageXY', xMm: w.microscope.stageXmm + 0.05, yMm: 0 });
    cmdB(w, { type: 'gesture', part: 'mic:stageX', phase: 'end' });
    expect(w.evidence['err:E34']).toBe(1);
  });
});

describe('B01 — estereoscopio', () => {
  it('más zoom reduce el campo; la perilla de enfoque cambia el plano del cabezal, no la muestra', () => {
    const w = ready();
    cmdB(w, { type: 'setStereoZoom', zoomX: 1 });
    const f1 = stereoView(w).fovMm;
    cmdB(w, { type: 'setStereoZoom', zoomX: 3 });
    expect(stereoView(w).fovMm).toBeLessThan(f1);
    expect(stereoView(w).fovMm).toBeCloseTo(f1 / 3, 9);
    const before = [...w.stereo.sampleOffsetMm];
    const t0 = w.stereo.focusTurns;
    cmdB(w, { type: 'setStereoFocus', deltaTurns: 1 });
    expect(w.stereo.focusTurns).toBe(t0 + 1);
    expect(w.stereo.sampleOffsetMm).toEqual(before);
  });
});
