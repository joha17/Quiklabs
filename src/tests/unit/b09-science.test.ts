/** B09 — modelos puros (§8): R1–R12 con valores de la guía y los manifiestos que deciden lo que se puede rotular. */
import { describe, expect, it } from 'vitest';
import { areaFraction, fieldOfViewUm, lengthUm, lengthUncertaintyUm, partitionLiquid, partitionTissue, sectionQuality, totalMagnification } from '../../simulation/plant-world/model';
import { DEFAULT_B09_PARAMS } from '../../practices/practice-b09/params';
import { PLANT_ASSETS, structureStatus, visibleStructures } from '../../simulation/specimens/assets';

const p = DEFAULT_B09_PARAMS.plant!;
const good = { thicknessUm: 80, pressure01: 0.3, held: true, planeOk: true, regionOk: true };

describe('B09: cálculos', () => {
  it('R1 y R2: aumento total y campo visual con FN 18 mm', () => {
    expect(totalMagnification(10, 40)).toBe(400);
    expect(fieldOfViewUm(18, 4)).toBe(4500);
    expect(fieldOfViewUm(18, 10)).toBe(1800);
    expect(fieldOfViewUm(18, 40)).toBe(450);
  });
  it('R3 y R4: longitud e incertidumbre combinada', () => {
    expect(lengthUm(400, 1.8)).toBe(720);
    expect(lengthUncertaintyUm(400, 1.8, 2, 0.045)).toBeCloseTo(Math.hypot(3.6, 18), 5);
  });
  it('R5: fracción de área adimensional y sin división por cero', () => {
    expect(areaFraction(25, 100)).toBe(0.25);
    expect(areaFraction(1, 0)).toBe(0);
  });
  it('R6 y R7: el líquido y el tejido se conservan', () => {
    expect(partitionLiquid(5, 0.05, 0.02).balanceMl).toBeCloseTo(0, 12);
    expect(partitionTissue(100, 2, 1)).toEqual({ remainingMg: 97, balanceMg: 0 });
  });
});

describe('B09: calidad del corte', () => {
  it('el corte objetivo es íntegro y aprovechable', () => {
    expect(sectionQuality(p, good)).toEqual({ integrity01: 1, viableAreaFraction: 1 });
  });
  it('cada defecto del gesto la baja por su propia causa', () => {
    expect(sectionQuality(p, { ...good, thicknessUm: 400 }).viableAreaFraction).toBeLessThan(0.3);
    expect(sectionQuality(p, { ...good, thicknessUm: 10 }).integrity01).toBeLessThan(p.minSectionIntegrity);
    expect(sectionQuality(p, { ...good, pressure01: 0.9 }).integrity01).toBeLessThan(p.minSectionIntegrity);
    expect(sectionQuality(p, { ...good, held: false }).integrity01).toBeLessThan(p.minSectionIntegrity);
    expect(sectionQuality(p, { ...good, regionOk: false }).viableAreaFraction).toBeLessThan(0.3);
  });
});

describe('B09: manifiestos', () => {
  it('lo no resuelto no se puede validar', () => {
    expect(structureStatus(PLANT_ASSETS.stemEudicot, 'companionCell')).toBe('unavailable');
    expect(structureStatus(PLANT_ASSETS.rootEudicot, 'casparian')).toBe('unavailable');
    expect(structureStatus(PLANT_ASSETS.stemEudicot, 'cambium')).toBe('inferred');
    expect(structureStatus(PLANT_ASSETS.stemEudicotCambium, 'cambium')).toBe('visible');
  });
  it('los haces van en anillo o dispersos, y la pared lignificada solo aparece con Wiesner', () => {
    expect(PLANT_ASSETS.stemEudicot.annotations.filter((a) => a.structureId === 'vascularBundle')).toHaveLength(8);
    expect(PLANT_ASSETS.stemMonocot.annotations.filter((a) => a.structureId === 'vascularBundle')).toHaveLength(15);
    expect(structureStatus(PLANT_ASSETS.celery, 'lignifiedWall')).toBe('unavailable');
    expect(structureStatus(PLANT_ASSETS.celeryWiesner, 'lignifiedWall')).toBe('visible');
  });
  it('el 4X abarca el órgano y el xilema aparece desde 10X', () => {
    const at = (x: number) => visibleStructures(PLANT_ASSETS.stemEudicot, [0, 0], 18 / x, { objectiveX: x });
    expect(at(4)).toContain('vascularBundle');
    expect(at(4)).not.toContain('xylem');
    expect(at(10)).toContain('xylem');
  });
});
