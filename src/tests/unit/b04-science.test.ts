/**
 * Ciencia del mundo B04 (§3, §8): preparaciones con placa y barra, ensayos de Lugol, Biuret, Benedict y emulsión,
 * catalasa con gas recogido (PV = nRT) y amilasa con conservación de glucosilos. Las cifras son de las funciones
 * puras y parámetros de software, no predicciones de una muestra real.
 */
import { describe, expect, it } from 'vitest';
import { gasVolumeMl } from '../../simulation/biochem/model';
import { conservedBio, observeVessel } from '../../simulation/bio-world/world';
import { cmdB, drops, eye, label, mix, pipette, placeB, ppeB04, prepareAmylase, prepareLiver, prepareStarch, runB, worldB04 } from '../helpersB04';

const balanced = (w: ReturnType<typeof worldB04>) => {
  const c = conservedBio(w);
  for (const [k, v] of Object.entries(c)) if (k.startsWith('bio:')) expect(Math.abs(v), k).toBeLessThan(1e-6 * Math.max(1, Math.abs(w.bio.initial[k.slice(4)] ?? 1)));
};

describe('B04 · gas y preparaciones', () => {
  it('1 mmol de O₂ a 298,15 K y 101 325 Pa ocupa 24,47 mL', () => {
    expect(gasVolumeMl(1, 298.15, 101325)).toBeCloseTo(24.465, 2);
  });

  it('P1 queda como suspensión agitada a ~30 °C y sin errores de preparación', () => {
    const w = worldB04();
    ppeB04(w);
    prepareStarch(w);
    const b = w.bio.preps.P1!;
    expect(b.solidG).toBeGreaterThan(24);
    expect(b.solidG).toBeLessThan(26);
    expect(b.waterMl).toBeGreaterThan(96);
    expect(b.measuredTK).toBeGreaterThan(301.5);
    expect(b.homog01).toBeGreaterThan(0.8);
    // Sigue habiendo almidón sin dispersar: es una suspensión, no una disolución.
    expect(w.bio.vessels.bk1.s.starchSolid).toBeGreaterThan(0);
    balanced(w);
  });
});

describe('B04 · ensayos de biomoléculas', () => {
  it('Lugol: P1 da azul-negro y el agua queda amarilla', () => {
    const w = worldB04();
    ppeB04(w);
    prepareStarch(w);
    label(w, 'A1', 'LUG/P1');
    pipette(w, 'bk1', 'A1', 2);
    label(w, 'A2', 'LUG/L-AGU');
    pipette(w, 'bW', 'A2', 2);
    for (const t of ['A1', 'A2']) {
      drops(w, 'dI', t, 3);
      mix(w, t);
    }
    expect(eye(w, 'A1').quality).toMatch(/lugol:(black|blue)/);
    expect(eye(w, 'A2').quality).toBe('lugol:yellow');
    balanced(w);
  });

  it('Biuret: el patrón proteico vira a violeta solo en medio alcalino', () => {
    const w = worldB04();
    ppeB04(w);
    label(w, 'A3', 'BIU/L-PRO');
    pipette(w, 'sStd', 'A3', 2);
    drops(w, 'dNa', 'A3', 10);
    drops(w, 'dCu', 'A3', 3);
    mix(w, 'A3');
    runB(w, 90);
    expect(eye(w, 'A3').quality).toMatch(/biuret:(violet|lilac)/);
    label(w, 'A4', 'BIU/L-AGU');
    pipette(w, 'bW', 'A4', 2);
    drops(w, 'dNa', 'A4', 10);
    drops(w, 'dCu', 'A4', 3);
    mix(w, 'A4');
    runB(w, 90);
    expect(eye(w, 'A4').quality).toBe('biuret:blue');
  });

  it('Benedict: la glucosa forma Cu₂O al calentar; sin calor no reacciona (R01)', () => {
    const w = worldB04();
    ppeB04(w);
    cmdB(w, { type: 'setBathSetpoint', bathId: 'ba1', temperatureK: 368.15 });
    cmdB(w, { type: 'setBathPower', bathId: 'ba1', on: true });
    runB(w, 600);
    label(w, 'C1', 'BEN/L-GLU');
    pipette(w, 'sGlu', 'C1', 2);
    pipette(w, 'bBe', 'C1', 2);
    mix(w, 'C1');
    cmdB(w, { type: 'tongs', tubeId: 'C1', to: 'ba1', depth01: 1 });
    runB(w, 240);
    cmdB(w, { type: 'tongs', tubeId: 'C1', to: 'home' });
    runB(w, 400);
    expect(w.bio.vessels.C1.s.cu2o).toBeGreaterThan(0);
    expect(eye(w, 'C1').quality).toMatch(/benedict:(green|yellow|orange|brick)/);
    label(w, 'C2', 'BEN/L-GLU');
    pipette(w, 'sGlu', 'C2', 2);
    pipette(w, 'bBe', 'C2', 2);
    mix(w, 'C2');
    expect(eye(w, 'C2').quality).toBe('benedict:blue');
    expect(w.evidence['err:R01']).toBeGreaterThan(0);
    balanced(w);
  });

  it('Emulsión: aceite + etanol y luego agua se enturbia; sin agua es E02', () => {
    const w = worldB04();
    ppeB04(w);
    label(w, 'B3', 'EMU/L-ACE');
    pipette(w, 'sOil', 'B3', 0.5);
    pipette(w, 'bEt', 'B3', 3);
    cmdB(w, { type: 'capTube', tubeId: 'B3', capped: true });
    cmdB(w, { type: 'mixTube', tubeId: 'B3', vigor01: 0.6, durationS: 20 });
    cmdB(w, { type: 'capTube', tubeId: 'B3', capped: false });
    expect(eye(w, 'B3').quality).toMatch(/^emulsion:/);
    expect(w.evidence['err:E02']).toBeGreaterThan(0);
    pipette(w, 'bW', 'B3', 3);
    mix(w, 'B3');
    expect(observeVessel(w, 'B3').quality).toMatch(/emulsion:(cloudy|milky)/);
    balanced(w);
  });
});

describe('B04 · enzimas', () => {
  it('Catalasa: el extracto de hígado libera O₂ medible y se conserva el balance H/O', () => {
    const w = worldB04();
    ppeB04(w);
    prepareLiver(w);
    expect(w.bio.vessels.bk2.s.catAct).toBeGreaterThan(0);
    label(w, 'D1', 'CAT/P2');
    pipette(w, 'bk2', 'D1', 1);
    cmdB(w, { type: 'connectCollector', tubeId: 'D1', sealed: true });
    cmdB(w, { type: 'startTimer', tubeId: 'D1' });
    pipette(w, 'bH', 'D1', 2);
    runB(w, 60);
    const g = cmdB(w, { type: 'readInstrument', instrument: 'gas', targetId: 'D1' });
    expect(g.value!).toBeGreaterThan(0.5);
    expect(w.bio.tubes.D1.condition).toBe('liver');
    // Blanco sin enzima: nada de gas.
    label(w, 'D2', 'CAT/L-AGU');
    pipette(w, 'bW', 'D2', 1);
    cmdB(w, { type: 'connectCollector', tubeId: 'D2', sealed: true });
    pipette(w, 'bH', 'D2', 2);
    runB(w, 60);
    expect(cmdB(w, { type: 'readInstrument', instrument: 'gas', targetId: 'D2' }).value).toBe(0);
    balanced(w);
  });

  it('Catalasa hervida pierde actividad (desnaturalización)', () => {
    const w = worldB04();
    ppeB04(w);
    prepareLiver(w);
    cmdB(w, { type: 'setBathSetpoint', bathId: 'ba2', temperatureK: 368.15 });
    cmdB(w, { type: 'setBathPower', bathId: 'ba2', on: true });
    runB(w, 600);
    label(w, 'D3', 'CAT/P2');
    pipette(w, 'bk2', 'D3', 1);
    cmdB(w, { type: 'tongs', tubeId: 'D3', to: 'ba2', depth01: 1 });
    runB(w, 300);
    cmdB(w, { type: 'tongs', tubeId: 'D3', to: 'home' });
    runB(w, 600);
    cmdB(w, { type: 'readInstrument', instrument: 'thermo', targetId: 'D3' }, false);
    const v = w.bio.vessels.D3;
    expect(v.s.catAct / (v.s.catAct + v.s.catDen)).toBeLessThan(0.05);
    balanced(w);
  });

  it('Amilasa: el almidón se hidroliza a dextrinas y maltosa conservando glucosilos', () => {
    const w = worldB04();
    ppeB04(w);
    prepareStarch(w);
    cmdB(w, { type: 'setStirRate', plateId: 'hp1', rpm: 0 });
    cmdB(w, { type: 'retrieveStirBar', barId: 'sb1' });
    placeB(w, 'bk1', 'bench', { x: 214, y: 22 });
    prepareAmylase(w);
    label(w, 'D5', 'AMY/P1');
    pipette(w, 'bk1', 'D5', 3);
    cmdB(w, { type: 'usePhStrip', vesselId: 'D5' });
    cmdB(w, { type: 'startTimer', tubeId: 'D5' });
    pipette(w, 'bk3', 'D5', 1);
    const s0 = w.bio.vessels.D5.s.starch;
    runB(w, 600);
    const v = w.bio.vessels.D5;
    expect(v.s.starch).toBeLessThan(s0 * 0.7);
    expect(v.s.maltose + v.s.dextrin).toBeGreaterThan(0);
    balanced(w);
  });
});
