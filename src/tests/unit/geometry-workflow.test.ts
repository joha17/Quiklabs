import { describe, expect, it } from 'vitest';
import { createActor } from 'xstate';
import { SHAPES, capacityAtTilt, lipPoint, liquidLevel, markHeight, pourRate, volumeBelowLevel } from '../../engine/physics/geometry';
import { VESSEL_DEFAULTS } from '../../simulation/entities/vessel';
import { brimVolume, FUNNEL_PAPER_RIM_Y, heightFromVolume, PROFILES, volumeToHeight } from '../../practices/practice-02/instruments';
import { practiceMachine, stageName } from '../../practices/practice-02/workflow.machine';
import type { StageFlags } from '../../practices/practice-02/evidence';

describe('§17.3 geometría 3D del líquido (perfiles de revolución, sin DOM)', () => {
  const beaker = SHAPES.BEAKER!;
  const rad = (d: number) => (d * Math.PI) / 180;

  it('vertical: el volumen bajo el nivel calculado coincide con el volumen pedido', () => {
    for (const t of ['BEAKER', 'TEST_TUBE', 'GRADUATED_CYLINDER', 'PORCELAIN_DISH', 'FUNNEL'] as const) {
      const sh = SHAPES[t]!;
      for (const f of [0.1, 0.35, 0.7, 0.95]) {
        const vol = sh.fullVolumeMl * f;
        const L = liquidLevel(sh, 0, vol);
        expect(volumeBelowLevel(sh, 0, L) / vol).toBeCloseTo(1, 1);
      }
    }
  });

  it('inclinado: el nivel es un plano horizontal que encierra el mismo volumen (mientras no se derrame)', () => {
    for (const deg of [10, 25, 40, 60, 80]) {
      const a = rad(deg);
      const vol = 20;
      const L = liquidLevel(beaker, a, vol);
      expect(L).toBeLessThanOrEqual(lipPoint(beaker, a)[1] + 1e-9);
      if (capacityAtTilt(beaker, a) >= vol) expect(volumeBelowLevel(beaker, a, L)).toBeCloseTo(vol, 0);
    }
  });

  it('lo que cabe sin derramar disminuye al inclinar', () => {
    let prev = Infinity;
    for (const deg of [0, 15, 30, 45, 60, 75, 90]) {
      const c = capacityAtTilt(beaker, rad(deg));
      expect(c).toBeLessThanOrEqual(prev + 1e-6);
      prev = c;
    }
    expect(capacityAtTilt(beaker, 0)).toBeCloseTo(beaker.fullVolumeMl, 0);
  });

  it('la marca de 10 mL de la probeta corresponde exactamente a 10 mL de su cavidad (§7)', () => {
    const cyl = SHAPES.GRADUATED_CYLINDER!;
    const h10 = markHeight(cyl, 10);
    expect(volumeBelowLevel(cyl, 0, h10)).toBeCloseTo(10, 1);
    expect(volumeToHeight(PROFILES.GRADUATED_CYLINDER, h10)).toBeCloseTo(10, 2);
    expect(heightFromVolume(PROFILES.GRADUATED_CYLINDER, 5)).toBeLessThan(h10);
  });

  it('las capacidades del dominio son coherentes con la cavidad del modelo 3D', () => {
    for (const t of ['BEAKER', 'TEST_TUBE', 'GRADUATED_CYLINDER', 'PORCELAIN_DISH', 'FUNNEL'] as const) {
      // El embudo trabaja con papel de filtro: su capacidad útil llega hasta el borde del papel.
      const brim = t === 'FUNNEL' ? volumeToHeight(PROFILES.FUNNEL, FUNNEL_PAPER_RIM_Y) : brimVolume(PROFILES[t]);
      const cap = VESSEL_DEFAULTS[t].capacityMl;
      expect(Math.abs(cap - brim) / brim, `${t}: dominio ${cap} mL vs cavidad ${brim.toFixed(1)} mL`).toBeLessThan(0.2);
    }
  });

  it('el vertido empieza cuando el nivel alcanza el pico y crece con el ángulo', () => {
    const vol = 20;
    expect(pourRate(beaker, 0, vol)).toBe(0);
    const angles = [20, 40, 60, 80, 100].map((d) => pourRate(beaker, (d * Math.PI) / 180, vol));
    expect(angles[0]).toBe(0);
    for (let i = 1; i < angles.length; i++) expect(angles[i]).toBeGreaterThanOrEqual(angles[i - 1]);
    expect(angles[angles.length - 1]).toBeGreaterThan(0);
  });

  it('la viscosidad reduce el caudal', () => {
    const a = (90 * Math.PI) / 180;
    expect(pourRate(beaker, a, 30, 6)).toBeLessThan(pourRate(beaker, a, 30, 1));
  });
});

describe('Máquina del flujo (XState): avance por evidencia y en cualquier orden seguro', () => {
  const none: StageFlags = {
    aSetupDone: false, aSamplesDone: false, aSolubilityDone: false, aRecorded: false, bPrepared: false, bHeated: false,
    bFiltered: false, bSplit: false, bEvaporated: false, bCrystallized: false, notebookDone: false,
  };
  it('no avanza sin evidencia y encadena etapas ya cumplidas', () => {
    const a = createActor(practiceMachine).start();
    a.send({ type: 'START' });
    a.send({ type: 'PPE_CONFIRMED' });
    expect(stageName(a.getSnapshot().value)).toBe('PART_A_SETUP');
    a.send({ type: 'EVIDENCE', flags: none });
    expect(stageName(a.getSnapshot().value)).toBe('PART_A_SETUP');
    // El estudiante hizo varias cosas a la vez (orden distinto): se encadenan.
    a.send({ type: 'EVIDENCE', flags: { ...none, aSetupDone: true, aSamplesDone: true, aSolubilityDone: true } });
    expect(stageName(a.getSnapshot().value)).toBe('PART_A_REVIEW');
  });

  it('se puede entregar en cualquier momento y volver si se cancela', () => {
    const a = createActor(practiceMachine).start();
    a.send({ type: 'START' });
    a.send({ type: 'PPE_CONFIRMED' });
    a.send({ type: 'EVIDENCE', flags: { ...none, aSetupDone: true } });
    a.send({ type: 'SUBMIT' });
    expect(stageName(a.getSnapshot().value)).toBe('SUBMISSION');
    a.send({ type: 'CANCEL' });
    expect(stageName(a.getSnapshot().value)).toBe('PART_A_OBSERVATION');
    a.send({ type: 'SUBMIT' });
    a.send({ type: 'CONFIRM' });
    expect(stageName(a.getSnapshot().value)).toBe('REVIEW');
  });

  it('la instantánea persistida restaura la etapa', () => {
    const a = createActor(practiceMachine).start();
    a.send({ type: 'START' });
    a.send({ type: 'PPE_CONFIRMED' });
    a.send({ type: 'EVIDENCE', flags: { ...none, aSetupDone: true, aSamplesDone: true } });
    const snap = JSON.parse(JSON.stringify(a.getPersistedSnapshot()));
    const b = createActor(practiceMachine, { snapshot: snap }).start();
    expect(stageName(b.getSnapshot().value)).toBe('PART_A_SOLUBILITY');
  });
});
