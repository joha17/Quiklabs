/**
 * B01 — casos numéricos de §8.1 (U01–U06) e invariantes de §8.3: aumento, campo, límite teórico, conservación del
 * líquido, traslación de la platina, curva de nitidez, topes de los mandos, choque y pinza.
 */
import { describe, expect, it } from 'vitest';
import { fieldOfViewMm, resolutionLimitM, sharpness01, totalMagnification, turretObjective } from '../../simulation/instruments/optical/microscope-model';
import { bubbleFractionFor } from '../../simulation/specimens/mount-world';
import { ledgerError } from '../../simulation/specimens/volumes';
import { ASSETS, visibleStructures } from '../../simulation/specimens/assets';
import { DEFAULT_B01_PARAMS } from '../../practices/practice-b01/params';
import { dispatchB01, microscopeView } from '../../simulation/optical-world/world';
import { cmdB, focusMicroscope, inspectAll, ppeB01, runB, toObjective, toStage, wetMount, worldB01 } from '../helpersB01';

describe('B01 — casos calculados a mano (§8.1)', () => {
  it('U01 aumentos 40X, 100X y 400X con ocular 10X', () => {
    expect([4, 10, 40].map((x) => totalMagnification(10, x))).toEqual([40, 100, 400]);
  });
  it('U02 campo con FN 18 mm: 4,50 / 1,80 / 0,45 mm (diámetro diez veces menor, no cien)', () => {
    expect(fieldOfViewMm(18, 4)).toBeCloseTo(4.5, 10);
    expect(fieldOfViewMm(18, 10)).toBeCloseTo(1.8, 10);
    expect(fieldOfViewMm(18, 40)).toBeCloseTo(0.45, 10);
    expect(fieldOfViewMm(18, 4) / fieldOfViewMm(18, 40)).toBeCloseTo(10, 10);
  });
  it('U03 límite teórico 0,61·550 nm / 0,65 ≈ 516 nm', () => {
    expect(resolutionLimitM(5.5e-7, 0.65)).toBeCloseTo(5.1615e-7, 10);
  });
  it('U04 conservación del gotero: 3,95 + 0,04 + 0,01 = 4,00 mL', () => {
    expect(ledgerError({ initialMl: 4, reservoirMl: 3.95, mountMl: 0.04, wasteMl: 0, spilledMl: 0.01, evaporatedMl: 0 })).toBeCloseTo(0, 12);
  });
  it('U05 traslación de 0,90 mm = medio campo a 10X, con el signo de la platina', () => {
    const w = worldB01();
    ppeB01(w);
    inspectAll(w);
    wetMount(w);
    cmdB(w, { type: 'setPower', device: 'microscope', on: true });
    toStage(w, 'sl1');
    focusMicroscope(w);
    toObjective(w, 10);
    const c0 = microscopeView(w).centerMm;
    cmdB(w, { type: 'setStageXY', xMm: 0.9, yMm: 0 });
    const c1 = microscopeView(w).centerMm;
    expect(c1[0] - c0[0]).toBeCloseTo(-0.9, 9);
    expect(Math.abs(c1[0] - c0[0]) / microscopeView(w).fovMm).toBeCloseTo(0.5, 9);
  });
  it('U06 nitidez: 1 · e^−½ · e^−2 a 0, σ y 2σ', () => {
    expect(sharpness01(0, 0.04)).toBe(1);
    expect(sharpness01(0.04, 0.04)).toBeCloseTo(0.60653, 5);
    expect(sharpness01(0.08, 0.04)).toBeCloseTo(0.13534, 5);
  });
});

describe('B01 — invariantes del instrumento (§8.3)', () => {
  it('el revólver solo opera enclavado y el cambio de objetivo no altera el activo', () => {
    const p = DEFAULT_B01_PARAMS.microscope;
    expect(turretObjective(120, p)).toMatchObject({ objectiveX: 10, locked: true });
    expect(turretObjective(60, p)).toMatchObject({ objectiveX: null, locked: false });
    const w = worldB01();
    ppeB01(w);
    wetMount(w);
    toStage(w, 'sl1');
    const a = microscopeView(w).assetId;
    toObjective(w, 40);
    expect(microscopeView(w).assetId).toBe(a);
  });
  it('burbujas: bajar plano y deprisa da más aire que inclinado y lento; sin líquido entra aire', () => {
    const m = DEFAULT_B01_PARAMS.mount;
    expect(bubbleFractionFor(m, 45, 0.4, 0.05)).toBeLessThan(0.05);
    expect(bubbleFractionFor(m, 5, 3, 0.05)).toBeGreaterThan(0.5);
    expect(bubbleFractionFor(m, 45, 0.4, 0)).toBeGreaterThan(bubbleFractionFor(m, 45, 0.4, 0.05));
  });
  it('las estructuras visibles dependen del aumento: cloroplastos no a 4X, sí a 10X', () => {
    expect(visibleStructures(ASSETS.elodea, [0, 0], 4.5, { objectiveX: 4 })).not.toContain('chloroplasts');
    expect(visibleStructures(ASSETS.elodea, [0, 0], 1.8, { objectiveX: 10 })).toContain('chloroplasts');
    expect(visibleStructures(ASSETS.elodea, [20, 20], 1.8, { objectiveX: 10 })).toEqual([]);
  });
  it('topes de macro y micro: el mando no pasa del límite (E24, E25)', () => {
    const w = worldB01();
    ppeB01(w);
    cmdB(w, { type: 'turnCoarse', deltaTurns: 50 });
    expect(w.evidence['err:E24']).toBe(1);
    cmdB(w, { type: 'turnFine', deltaTurns: 50 });
    expect(w.evidence['err:E25']).toBe(1);
  });
  it('el mismo gap da el mismo riesgo sin importar los pasos de simulación (fps)', () => {
    const a = worldB01();
    const b = worldB01();
    for (const w of [a, b]) {
      ppeB01(w);
      wetMount(w);
      toStage(w, 'sl1');
    }
    runB(b, 7.3);
    expect(microscopeView(a).gapMm).toBeCloseTo(microscopeView(b).gapMm, 2);
  });
  it('la pinza: con la pinza cerrada la lámina no entra (E15)', () => {
    const w = worldB01();
    ppeB01(w);
    cmdB(w, { type: 'openClip', open: false });
    const r = dispatchB01(w, { type: 'setPose', id: 'fx1', pose: { x: 280, y: 30, z: 14.6, rotationRad: 0 }, support: 'stage' });
    expect(r.ok).toBe(false);
  });
});
