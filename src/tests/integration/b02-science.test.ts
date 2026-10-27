/**
 * B02 — modelos de preparación y tinción (§6.5, §8): fórmulas de corte, raspado y frotis, desarrollo del Lugol con el
 * tiempo de contacto, zonas separadas de frutos en un portaobjetos, recursos por escenario y balances con derrames.
 */
import { describe, expect, it } from 'vitest';
import { SC, conservedCell, dispatchCell } from '../../simulation/cell-world/world';
import { DEFAULT_B02_PARAMS } from '../../practices/practice-b02/params';
import type { B02Scenario } from '../../practices/practice-b02/error-scenarios';
import { cutFragment, scrapeFragment, smearDensity, swabLoadMg, zoneVisible, emptyCellInfo, type CellZone } from '../../simulation/specimens/thin-section';
import { assetById, structureStatus, visibleStructures } from '../../simulation/specimens/assets';
import { resolutionUm } from '../../practices/practice-b02/expected-results';
import { captureC, cmdC, coverC, dropC, focusC, fruitMount, microscopeOn, potatoMount, ppeB02, runC, slideToPrep, toObjectiveC, toStageC, worldB02 } from '../helpersB02';

const P = DEFAULT_B02_PARAMS.cellPrep!;

describe('B02 — modelos de tejido', () => {
  it('corte: área = (10·L)²/2 y masa = área·espesor·densidad', () => {
    const f = cutFragment(P, 'tomato', 'tom', 0.15, 0.8);
    expect(f.areaMm2).toBeCloseTo(32, 6);
    expect(f.massMg).toBeCloseTo(32 * 0.15 * P.densityMgPerMm3, 3);
  });
  it('raspado: la presión engrosa y, sobre el umbral, desgarra', () => {
    const soft = scrapeFragment(P, 'potato', 'pot', 1.2, 0.4);
    const hard = scrapeFragment(P, 'potato', 'pot', 1.2, 0.9);
    expect(hard.thicknessMm).toBeGreaterThan(soft.thicknessMm);
    expect(soft.tear01).toBe(0);
    expect(hard.tear01).toBeGreaterThan(P.tearMax);
  });
  it('hisopo y frotis: carga crece con la duración; extendido corto y apretado = denso', () => {
    expect(swabLoadMg(P, 0.3, 1)).toBe(0);
    expect(swabLoadMg(P, 4, 0.5)).toBeGreaterThan(swabLoadMg(P, 1, 0.5));
    expect(smearDensity(1.5, 0.3, 1)).toBeGreaterThan(P.smearDenseMax);
    expect(smearDensity(1.5, 1.6, 0.4)).toBeLessThan(P.smearDenseMax);
  });
  it('la preparación oculta estructuras pero nunca las crea', () => {
    const a = assetById('tomato')!;
    const vis = visibleStructures(a, [0, 0], 0.45, { objectiveX: 40 });
    const z: CellZone = { specimenId: 'm:tomato:1', kind: 'tomato', asset: 'tomato', centerCm: [0, 0], prep: 'cut', thicknessMm: 0.9, areaMm2: 30, tear01: 0, massMg: 1 };
    const thick = zoneVisible(P, vis, z, emptyCellInfo());
    expect(thick.every((s) => vis.includes(s))).toBe(true);
    expect(thick).not.toContain('chromoplasts');
  });
  it('estado de evidencia: membrana vegetal no evaluable, núcleo con eosina solo inferido', () => {
    expect(structureStatus(assetById('tomato')!, 'cellMembrane')).toBe('unavailable');
    expect(structureStatus(assetById('buccalEosin')!, 'nucleus')).toBe('inferred');
    expect(structureStatus(assetById('buccalMB')!, 'nucleus')).toBe('visible');
  });
  it('resolución de Abbe con las aperturas de ejemplo', () => {
    expect(resolutionUm(40)).toBeCloseTo(0.52, 2);
    expect(resolutionUm(4)).toBeGreaterThan(resolutionUm(10));
  });
});

describe('B02 — mundo celular', () => {
  it('el Lugol se desarrolla con el tiempo de contacto (potatoPlain → potatoLugol)', () => {
    const w = worldB02();
    ppeB02(w);
    potatoMount(w, 'sl1', 'cv1', { waitS: 5 });
    expect(w.mounts.sl1.specimenAsset).toBe('potatoPlain');
    runC(w, 20);
    expect(w.mounts.sl1.specimenAsset).toBe('potatoLugol');
  });

  it('frutos en zonas separadas de un mismo portaobjetos: cada zona su recurso y su captura', () => {
    const w = worldB02();
    ppeB02(w);
    slideToPrep(w, 'sl1');
    for (const [src, dx] of [['tom', -0.4], ['pep', 0.4]] as const) {
      cmdC(w, { type: 'cutSource', sourceId: src, toolId: 'sc', thicknessMm: 0.15, lengthCm: 0.5 });
      cmdC(w, { type: 'pickSpecimen', toolId: 'fc', sourceId: 'board' });
      cmdC(w, { type: 'placeSpecimen', toolId: 'fc', targetId: 'sl1', dxCm: dx, dyCm: 0 });
      cmdC(w, { type: 'wipe', targetId: 'sc', toolId: 'lp' });
      cmdC(w, { type: 'wipe', targetId: 'fc', toolId: 'lp' });
    }
    expect(w.mounts.sl1.cell!.mixed).toBe(false);
    dropC(w, 'dw', 'sl1');
    coverC(w, 'sl1', 'cv1');
    microscopeOn(w);
    toObjectiveC(w, 4);
    toStageC(w, 'sl1');
    const ids: string[] = [];
    for (const x of [-4, 4]) {
      cmdC(w, { type: 'setStageXY', xMm: -x, yMm: 0 });
      focusC(w);
      ids.push(captureC(w));
    }
    const [a, b] = ids.map((id) => w.observations[id]);
    expect(a.specimenId).toMatch(/^m:tomato/);
    expect(b.specimenId).toMatch(/^m:pepper/);
    expect(a.assetId).toBe('tomato');
    expect(b.assetId).toBe('pepper');
  });

  it('escenarios de recursos: chile rojo (S10), esclereidas claras (S11), versiones docentes (S17)', () => {
    const run = (scenarios: B02Scenario[], src: string) => {
      const w = worldB02({ scenarios });
      ppeB02(w);
      fruitMount(w, src, 'sl1', 'cv1');
      return w.mounts.sl1.specimenAsset;
    };
    expect(run([SC.SIMILAR_FRUITS], 'pep')).toBe('pepperRed');
    expect(run([SC.CLEAR_SCLEREIDS], 'pea')).toBe('pearClear');
    expect(run([SC.TEACHER_ASSETS], 'tom')).toBe('tomatoT2');
    expect(run([], 'pea')).toBe('pear');
  });

  it('S14 sin azul de metileno; S07 profundidad de campo a la mitad; S12 guayaba asignada', () => {
    expect(worldB02({ scenarios: [SC.EOSIN_ONLY] }).dispensers.mb).toBeUndefined();
    const hard = worldB02({ scenarios: [SC.HARD_FOCUS] });
    expect(hard.params.microscope.focusSigmaMm[40]).toBeCloseTo(DEFAULT_B02_PARAMS.microscope.focusSigmaMm[40] / 2, 9);
    expect(DEFAULT_B02_PARAMS.microscope.focusSigmaMm[40]).toBe(0.01);
    expect(worldB02({ scenarios: [SC.GUAVA] }).cell.assigned).toContain('guava');
    expect(worldB02().cell.assigned).not.toContain('apple');
  });

  it('S08: pedir el video de ciclosis deja incidencia, sin error ni descuento', () => {
    const w = worldB02({ scenarios: [SC.CYCLOSIS_VIDEO] });
    ppeB02(w);
    const r = dispatchCell(w, { type: 'requestVideo' });
    expect(r.ok).toBe(false);
    expect(w.cell.incidents).toContain('cyclosis');
    expect(Object.keys(w.evidence).filter((k) => k.startsWith('err:'))).toEqual([]);
    expect(dispatchCell(worldB02(), { type: 'requestVideo' }).code).toBe('PPE');
  });

  it('balances exactos con derrames, papel y residuos', () => {
    const w = worldB02({ scenarios: [SC.DROPPER_JITTER, SC.LUGOL_CONTROL] });
    ppeB02(w);
    slideToPrep(w, 'sl1');
    for (const [d, dx] of [['iod', 5], ['dw', 0], ['iod', 0], ['eo', 6]] as const) dispatchCell(w, { type: 'squeezeDropper', dispenserId: d, targetId: 'sl1', force01: 0.8, dxCm: dx, dyCm: 0 });
    cmdC(w, { type: 'scrape', sourceId: 'pot', toolId: 'sp', distanceCm: 1.2, pressure01: 0.4 });
    cmdC(w, { type: 'placeSpecimen', toolId: 'sp', targetId: 'sl1', dxCm: 0, dyCm: 0 });
    cmdC(w, { type: 'wipe', targetId: 'sl1', toolId: 'pp', dxCm: 1, dyCm: 0, strong: true });
    cmdC(w, { type: 'wipe', targetId: 'bench', toolId: 'pp' });
    cmdC(w, { type: 'cutSource', sourceId: 'tom', toolId: 'sc', thicknessMm: 0.2, lengthCm: 0.6 });
    cmdC(w, { type: 'dispose', objectId: 'board', containerId: 'bioWaste' });
    runC(w, 30);
    for (const [k, v] of Object.entries(conservedCell(w))) expect(Math.abs(v), k).toBeLessThan(1e-6);
    expect(w.cell.stainLedger.lugol.wasteMl).toBeGreaterThan(0);
  });

  it('determinismo: misma semilla y escenarios → mismo estado', () => {
    const go = () => {
      const w = worldB02({ seed: 99, scenarios: [SC.DROPPER_JITTER] });
      ppeB02(w);
      potatoMount(w, 'sl1', 'cv1');
      return w;
    };
    expect(JSON.stringify(go())).toBe(JSON.stringify(go()));
  });
});
