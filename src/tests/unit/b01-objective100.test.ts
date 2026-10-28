/**
 * Revólver de cuatro posiciones (4X, 10X, 40X y 100X de cuerpo negro): enclavamientos a 90°, aumento y campo del 100X,
 * enfoque fino desde el 40X sin chocar, macrométrico vetado a 100X, y compatibilidad con el revólver de tres de los
 * intentos anteriores (sus opciones crean los mismos parámetros, así la calificación del servidor no cambia).
 */
import { describe, expect, it } from 'vitest';
import { microscopeView } from '../../simulation/optical-world/world';
import { DEFAULT_B01_PARAMS } from '../../practices/practice-b01/params';
import { newPracticeB02World } from '../../practices/practice-b02';
import { DEFAULT_B02_PARAMS } from '../../practices/practice-b02/params';
import { objectiveLengthsCm } from '../../engine/optical/models/CompoundMicroscopeRig';
import { cmdB, focusMicroscope, inspectAll, ppeB01, runB, toObjective, toStage, worldB01 } from '../helpersB01';

const four = () => {
  const w = worldB01({ turretPositions: 4 });
  ppeB01(w);
  inspectAll(w);
  return w;
};

describe('B01 — revólver de cuatro objetivos', () => {
  it('enclava 4X, 10X, 40X y 100X cada 90° y da la vuelta completa', () => {
    const w = four();
    const seen: Array<number | null> = [microscopeView(w).objectiveX];
    for (let i = 0; i < 4; i++) {
      cmdB(w, { type: 'turnTurret', deltaDeg: 90 });
      seen.push(microscopeView(w).objectiveX);
    }
    expect(seen).toEqual([4, 10, 40, 100, 4]);
    cmdB(w, { type: 'turnTurret', deltaDeg: 45 });
    expect(microscopeView(w).locked).toBe(false);
  });

  it('a 100X el aumento total es 1000X y el campo, FN/100', () => {
    const w = four();
    toObjective(w, 100);
    const v = microscopeView(w);
    expect(v.objectiveX).toBe(100);
    expect(v.magnification).toBe(1000);
    expect(v.fovMm).toBeCloseTo(w.params.microscope.fieldNumberMm / 100, 9);
  });

  it('desde 40X enfocado, el 100X se enclava sin chocar, se afina con el micro y deja ver la estructura', () => {
    const w = four();
    cmdB(w, { type: 'setPower', device: 'microscope', on: true });
    cmdB(w, { type: 'openSlideCase', open: true });
    toStage(w, 'fx1');
    cmdB(w, { type: 'openSlideCase', open: false });
    cmdB(w, { type: 'setIllumination', device: 'microscope', value01: 0.5 });
    focusMicroscope(w);
    cmdB(w, { type: 'observe', instrument: 'compound', open: true });
    runB(w, 1);
    expect(w.evidence.located4x).toBeTruthy();
    toObjective(w, 10);
    focusMicroscope(w);
    toObjective(w, 40);
    focusMicroscope(w);
    toObjective(w, 100);
    const v0 = microscopeView(w);
    expect(v0.objectiveX).toBe(100);
    expect(v0.gapMm).toBeGreaterThan(w.params.microscope.gapWarnMm);
    focusMicroscope(w);
    const v = microscopeView(w);
    expect(v.sharpness01).toBeGreaterThanOrEqual(w.params.microscope.sharpnessValid);
    expect(v.visible.length).toBeGreaterThan(0);
    expect(w.microscope.impactCount).toBe(0);
    expect(Object.keys(w.evidence).filter((k) => ['err:E79', 'err:E70', 'err:E18'].includes(k))).toEqual([]);
  });

  it('a 100X acercar con el macrométrico es la aproximación peligrosa (E22), como a 40X', () => {
    const w = four();
    cmdB(w, { type: 'setPower', device: 'microscope', on: true });
    cmdB(w, { type: 'openSlideCase', open: true });
    toStage(w, 'fx1');
    cmdB(w, { type: 'openSlideCase', open: false });
    focusMicroscope(w);
    toObjective(w, 100);
    cmdB(w, { type: 'turnCoarse', deltaTurns: 0.3 }, false);
    expect(w.evidence['err:E22']).toBeTruthy();
  });

  it('el modelo dibuja cuatro objetivos y el de 100X es el más largo', () => {
    const L = objectiveLengthsCm(four());
    expect(L).toHaveLength(4);
    expect(Math.max(...L)).toBe(L[3]);
    expect(objectiveLengthsCm(worldB01())).toHaveLength(3);
  });

  it('sin la opción (cintas anteriores) los parámetros son exactamente los del revólver de tres', () => {
    expect(worldB01().params).toEqual(DEFAULT_B01_PARAMS);
    expect(worldB01().params.microscope.objectives).toBeUndefined();
    expect(newPracticeB02World({ mode: 'PRACTICE', seed: 5 }).params).toEqual(DEFAULT_B02_PARAMS);
    expect(DEFAULT_B01_PARAMS.microscope.workingDistanceMm[100]).toBeUndefined();
    expect(newPracticeB02World({ mode: 'PRACTICE', seed: 5, turretPositions: 4 }).params.microscope.objectives).toEqual([4, 10, 40, 100]);
  });
});
