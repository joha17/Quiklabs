/**
 * Práctica 3 — §26.1–26.3: pruebas unitarias de combustión, térmica/hollín y espectros (Node, sin DOM).
 */
import { describe, expect, it } from 'vitest';
import {
  combustionProducts, computeAirMix, FUELS, flameShape, flameTemperatureAt, hottestZ, regimeOf,
} from '../../simulation/combustion/combustion';
import {
  activeEmitters, combustionParams, gasFlows, hasOpenFlame, isLit, localTemperature, mouthPos, observeEmitter, stepFlame,
} from '../../simulation/flame-world/world';
import {
  addComponents, applyFilter, bandEnergy, colorRegion, emptySpectrum, observe, peaks, spectrumAt, transmissionCurve,
} from '../../simulation/spectroscopy/spectrum';
import { CATION_PROFILES, COBALT_TRANSMISSION, type CationId } from '../../practices/practice-03/cation-profiles';
import { DEFAULT_P3_PARAMS } from '../../practices/practice-03/params';
import { generateUnknown } from '../../practices/practice-03/unknown-generator';
import {
  capsuleToFlame, capsuleToTile, cmd3, ctx3, ignite, loadLoop, loopToFlame, makeBlue, optimalPoint, pose, precheck, run3, world3,
} from '../helpers3';

const CP = combustionParams(DEFAULT_P3_PARAMS);

describe('§26.1 combustión', () => {
  it('1. sin llave de mesa o válvula de aguja abiertas, el flujo es cero', () => {
    const w = world3();
    precheck(w);
    cmd3(w, { type: 'setValve', valve: 'NEEDLE', value: 1 });
    expect(gasFlows(w).burner).toBe(0);
    cmd3(w, { type: 'setValve', valve: 'NEEDLE', value: 0 });
    cmd3(w, { type: 'setValve', valve: 'TABLE', value: 1 });
    expect(gasFlows(w).burner).toBe(0);
    cmd3(w, { type: 'setValve', valve: 'NEEDLE', value: 0.4 });
    expect(gasFlows(w).burner).toBeCloseTo(0.4, 5);
  });

  it('2. gas sin ignición se acumula y activa la seguridad', () => {
    const w = world3();
    precheck(w);
    cmd3(w, { type: 'setValve', valve: 'TABLE', value: 1 });
    cmd3(w, { type: 'setValve', valve: 'NEEDLE', value: 0.6 });
    run3(w, 30);
    expect(w.room.gasAccumMl).toBeGreaterThan(DEFAULT_P3_PARAMS.gasBlockMl);
    expect(w.safety.block?.code).toBe('GAS_ACCUMULATION');
    const codes = w.events.map((e) => e.code);
    expect(codes).toContain('GAS_SMELL');
    expect(codes).toContain('GAS_FLOWING_UNLIT');
  });

  it('3. aire cerrado: régimen luminoso con más hollín que con aire abierto', () => {
    const yellow = combustionProducts(FUELS.PROPANE, 1e-3, computeAirMix(0, 0.4, 1, CP), CP);
    const blue = combustionProducts(FUELS.PROPANE, 1e-3, computeAirMix(0.8, 0.4, 1, CP), CP);
    expect(regimeOf(computeAirMix(0, 0.4, 1, CP), 0.4, CP)).toBe('YELLOW');
    expect(yellow.sootMolS).toBeGreaterThan(blue.sootMolS * 20);
    expect(yellow.coMolS).toBeGreaterThan(blue.coMolS * 5);
  });

  it('4. abrir el aire produce dos conos y eleva la temperatura máxima', () => {
    const w = world3();
    precheck(w);
    ignite(w);
    expect(w.burner.flameState).toBe('YELLOW_LUMINOUS');
    const yellowMax = w.burner.flame.maxTempC;
    makeBlue(w);
    expect(w.burner.flameState).toBe('BLUE_STABLE');
    expect(w.burner.flame.innerConeHeightCm).toBeGreaterThan(0.25 * w.burner.flame.heightCm);
    expect(w.burner.flame.maxTempC).toBeGreaterThan(yellowMax + 150);
    // El punto más caliente está cerca de la punta del cono interno (§27-5).
    const f = w.burner.flame;
    const zHot = hottestZ(f);
    expect(Math.abs(zHot - f.innerConeHeightCm)).toBeLessThan(0.3 * f.innerConeHeightCm);
    const tHot = flameTemperatureAt(f, 0, zHot, 24);
    expect(tHot).toBeGreaterThan(flameTemperatureAt(f, 0, f.innerConeHeightCm * 0.4, 24));
    expect(tHot).toBeGreaterThan(flameTemperatureAt(f, 0, f.heightCm * 0.95, 24));
    expect(tHot).toBeGreaterThan(1100);
  });

  it('5. la llama responde de forma continua a gas y aire', () => {
    let prevH = -1;
    for (let g = 0.1; g <= 0.8; g += 0.05) {
      const s = flameShape(g, computeAirMix(0, g, 1, CP), 1, 'YELLOW', CP);
      expect(s.heightCm).toBeGreaterThan(prevH);
      if (prevH > 0) expect(s.heightCm - prevH).toBeLessThan(1.5);
      prevH = s.heightCm;
    }
    let prevB = -1;
    for (let a = 0; a <= 0.8; a += 0.05) {
      const am = computeAirMix(a, 0.5, 1, CP);
      const s = flameShape(0.5, am, 1, regimeOf(am, 0.5, CP), CP);
      expect(s.blueness).toBeGreaterThanOrEqual(prevB);
      if (prevB >= 0) expect(s.blueness - prevB).toBeLessThan(0.35);
      prevB = s.blueness;
    }
  });

  it('6. llama levantada y retroceso en los extremos configurados', () => {
    expect(regimeOf(computeAirMix(1, 0.25, 1, CP), 0.25, CP)).toBe('FLASHBACK');
    expect(regimeOf(computeAirMix(1, 0.32, 1, CP) + 0.2, 0.32, CP)).toBe('LIFTED');
    expect(regimeOf(0.7, 0.95, CP)).toBe('LIFTED');
    const w = world3({ seed: 7 });
    precheck(w);
    ignite(w, 0.28);
    cmd3(w, { type: 'setValve', valve: 'AIR', value: 1 });
    run3(w, 1);
    expect(w.burner.flameState).toBe('FLASHBACK');
    expect(w.events.map((e) => e.code)).toContain('FLASHBACK');
  });

  it('7. el CO se genera en combustión incompleta y la ventilación lo elimina', () => {
    const w = world3({ scenarios: ['POOR_VENTILATION'] });
    precheck(w);
    cmd3(w, { type: 'setExtraction', on: false });
    ignite(w, 0.45);
    run3(w, 120);
    const high = w.room.coPpm;
    expect(high).toBeGreaterThan(20);
    cmd3(w, { type: 'setValve', valve: 'NEEDLE', value: 0 });
    cmd3(w, { type: 'setValve', valve: 'TABLE', value: 0 });
    cmd3(w, { type: 'setExtraction', on: true });
    run3(w, 60);
    expect(w.room.coPpm).toBeLessThan(high * 0.1);
  });

  it('8. la altura puede ajustarse a 10 ± 1 cm', () => {
    const w = world3();
    precheck(w);
    ignite(w, 0.2);
    let best = Infinity;
    for (let n = 0.2; n <= 0.6; n += 0.02) {
      cmd3(w, { type: 'setValve', valve: 'NEEDLE', value: n });
      run3(w, 0.2);
      best = Math.min(best, Math.abs(w.burner.flame.heightCm - 10));
    }
    expect(best).toBeLessThan(1);
  });

  it('conservación elemental del perfil simplificado (propano y butano)', () => {
    for (const fuel of [FUELS.PROPANE, FUELS.BUTANE]) {
      for (const am of [0, 0.15, 0.3, 0.6, 1]) {
        const n = 2e-3;
        const p = combustionProducts(fuel, n, am, CP);
        expect(p.co2MolS + p.coMolS + p.sootMolS).toBeCloseTo(fuel.c * n, 12);
        expect(2 * p.h2oMolS).toBeCloseTo(fuel.h * n, 12);
        expect(2 * p.o2MolS).toBeCloseTo(2 * p.co2MolS + p.coMolS + p.h2oMolS, 12);
        expect(p.heatW).toBeLessThanOrEqual(fuel.lhvKjMol * n * 1000 + 1e-9);
      }
    }
  });
});

describe('§26.2 térmica y hollín', () => {
  it('1–3. la cápsula se ennegrece en llama amarilla, no fuera de la llama ni (de nuevo) en la azul', () => {
    const w = world3();
    precheck(w);
    ignite(w);
    // Fuera de la llama: a 6 cm del eje, a la altura de la llama.
    const m = mouthPos(w, ctx3);
    cmd3(w, { type: 'clamp', tongsId: 'tongs', targetId: 'capsule', grip: 0.9 });
    cmd3(w, { type: 'setPose', id: 'capsule', pose: pose(m.x + 9, m.y, m.z + 5), support: 'tongs:tongs' });
    run3(w, 8);
    expect(w.capsule.sootMassMg).toBe(0);
    capsuleToFlame(w);
    run3(w, 10);
    capsuleToTile(w);
    run3(w, 1);
    expect(w.capsule.sootMassMg).toBeGreaterThan(0.5);
    expect(w.capsule.sootCoverage).toBeGreaterThan(0.3);
    const sootYellow = w.capsule.sootMassMg;
    run3(w, 400);
    for (let i = 0; i < 3; i++) cmd3(w, { type: 'wipeCapsule' });
    expect(w.capsule.sootMassMg).toBeLessThan(0.05);
    makeBlue(w);
    cmd3(w, { type: 'clamp', tongsId: 'tongs', targetId: 'capsule', grip: 0.9 });
    capsuleToFlame(w, 4);
    run3(w, 10);
    capsuleToTile(w);
    run3(w, 1);
    const last = w.capsule.exposures[w.capsule.exposures.length - 1];
    expect(last.sootAfterMg - last.sootBeforeMg).toBeLessThan(sootYellow * 0.05);
    expect(last.maxTempC).toBeGreaterThan(w.capsule.exposures[w.capsule.exposures.length - 2].maxTempC);
  });

  it('4. cápsula y asa conservan calor después de retirarse', () => {
    const w = world3();
    precheck(w);
    ignite(w);
    makeBlue(w);
    capsuleToFlame(w, 4);
    run3(w, 10);
    const hot = w.objects.capsule.temperatureC;
    capsuleToTile(w);
    run3(w, 5);
    expect(w.objects.capsule.temperatureC).toBeGreaterThan(hot * 0.8);
    cmd3(w, { type: 'setPose', id: 'loop_nacl', pose: optimalPoint(w), support: 'hand' });
    run3(w, 3);
    const loopHot = w.loops.loop_nacl.temperatureC;
    expect(loopHot).toBeGreaterThan(800);
    cmd3(w, { type: 'setPose', id: 'loop_nacl', pose: pose(150, 20, 25), support: 'hand' });
    run3(w, 1);
    expect(w.loops.loop_nacl.temperatureC).toBeGreaterThan(200);
    expect(w.loops.loop_nacl.temperatureC).toBeLessThan(loopHot);
  });

  it('5. limpiar sin enfriar alerta y no borra mágicamente la temperatura ni el hollín', () => {
    const w = world3();
    precheck(w);
    ignite(w);
    capsuleToFlame(w);
    run3(w, 10);
    capsuleToTile(w);
    const t = w.objects.capsule.temperatureC;
    const soot = w.capsule.sootMassMg;
    const r = cmd3(w, { type: 'wipeCapsule' });
    expect(r.ok).toBe(false);
    expect(w.events.map((e) => e.code)).toContain('CLEAN_HOT_CAPSULE');
    expect(w.objects.capsule.temperatureC).toBe(t);
    expect(w.capsule.sootMassMg).toBe(soot);
  });

  it('tomar la cápsula caliente sin pinzas produce un evento de quemadura', () => {
    const w = world3();
    precheck(w);
    ignite(w);
    capsuleToFlame(w);
    run3(w, 10);
    capsuleToTile(w);
    const r = cmd3(w, { type: 'pickUp', id: 'capsule', tool: 'HAND' });
    expect(r.code).toBe('BURN');
    expect(w.safety.incident?.needs).toContain('FIRST_AID');
  });
});

const COBALT = transmissionCurve(COBALT_TRANSMISSION);
function cationSpectrum(c: CationId, scale = 1) {
  const s = emptySpectrum();
  addComponents(s, CATION_PROFILES[c].components, scale * CATION_PROFILES[c].sodiumSensitivity);
  return s;
}

describe('§26.3 espectros', () => {
  it('1. el Na da máximos dominantes cerca de 589,0/589,6 nm', () => {
    const p = peaks(cationSpectrum('Na+'), 1)[0];
    expect(Math.abs(p - 589.3)).toBeLessThan(1.5);
  });

  it('2. el K contiene componentes violetas cerca de 404 nm', () => {
    const s = cationSpectrum('K+');
    expect(spectrumAt(s, 404)).toBeGreaterThan(spectrumAt(s, 450) * 20);
    expect(bandEnergy(s, 400, 410)).toBeGreaterThan(0);
  });

  it('3–4. el vidrio de cobalto reduce mucho el amarillo del Na y en Na/K el K se distingue mejor', () => {
    const na = cationSpectrum('Na+', 0.025);
    const k = cationSpectrum('K+', 0.025);
    const fNa = applyFilter(na, COBALT);
    expect(bandEnergy(fNa, 585, 595)).toBeLessThan(bandEnergy(na, 585, 595) * 0.01);
    const mix = emptySpectrum();
    for (let i = 0; i < mix.length; i++) mix[i] = na[i] + k[i];
    const rawMix = observe(mix, 60);
    const filtMix = observe(applyFilter(mix, COBALT), 60);
    expect(colorRegion(rawMix.displayRgb)).toMatch(/amarillo|anaranjado/);
    expect(['violeta', 'lila', 'azul']).toContain(colorRegion(filtMix.displayRgb));
    // Fracción de la luz (luminancia) debida al K: mucho mayor con filtro.
    const yK = observe(k, 60).intensity / rawMix.intensity;
    const yKf = observe(applyFilter(k, COBALT), 60).intensity / filtMix.intensity;
    expect(yKf).toBeGreaterThan(yK * 5);
  });

  it('5. un asa limpia no cambia perceptiblemente la llama', () => {
    const w = world3();
    precheck(w);
    ignite(w);
    makeBlue(w);
    loopToFlame(w, 'loop_kcl', 3);
    expect(w.loops.loop_kcl.emission * DEFAULT_P3_PARAMS.emissionScale).toBeLessThan(0.05);
    expect(w.loops.loop_kcl.checkedClean).toBe(true);
  });

  it('6. un asa contaminada suma señales; no reemplaza una por otra', () => {
    const w = world3();
    const ob = observeEmitter(w, ctx3, { 'K+': 0.04 });
    const both = observeEmitter(w, ctx3, { 'K+': 0.04, 'Na+': 0.002 });
    for (const nm of [404, 767]) expect(spectrumAt(both.noFilter.spectrum, nm)).toBeCloseTo(spectrumAt(ob.noFilter.spectrum, nm), 6);
    expect(spectrumAt(both.noFilter.spectrum, 589)).toBeGreaterThan(spectrumAt(ob.noFilter.spectrum, 589) * 10);
    expect(both.sodiumShare).toBeGreaterThan(0.1);
  });

  it('7. la señal aparece, alcanza un máximo y disminuye cuando la muestra se consume', () => {
    const w = world3();
    precheck(w);
    ignite(w);
    makeBlue(w);
    loadLoop(w, 'sol_nacl');
    cmd3(w, { type: 'setPose', id: 'loop_nacl', pose: optimalPoint(w), support: 'hand' });
    const trace: number[] = [];
    for (let i = 0; i < 160; i++) {
      stepFlame(w, ctx3);
      trace.push(activeEmitters(w, ctx3).find((e) => e.id === 'loop_nacl')?.noFilter.intensity ?? 0);
    }
    const peak = Math.max(...trace);
    const iPeak = trace.indexOf(peak);
    expect(trace[0]).toBeLessThan(peak * 0.1); // primero se evapora el agua
    expect(iPeak).toBeGreaterThan(3);
    const useful = trace.filter((v) => v > peak * 0.2).length * DEFAULT_P3_PARAMS.dtS;
    expect(useful).toBeGreaterThanOrEqual(1);
    expect(useful).toBeLessThanOrEqual(5.5);
    expect(trace[trace.length - 1]).toBeLessThan(peak * 0.1);
  });

  it('8. una muestra fuera de la zona caliente produce menor intensidad', () => {
    const run = (dz: number | null, dr = 0) => {
      const w = world3();
      precheck(w);
      ignite(w);
      makeBlue(w);
      loadLoop(w, 'sol_nacl');
      const m = mouthPos(w, ctx3);
      const p = dz === null ? optimalPoint(w) : pose(m.x + dr, m.y, m.z + dz);
      cmd3(w, { type: 'setPose', id: 'loop_nacl', pose: p, support: 'hand' });
      let max = 0;
      for (let i = 0; i < 100; i++) {
        stepFlame(w, ctx3);
        max = Math.max(max, w.loops.loop_nacl.emission);
      }
      return max;
    };
    const best = run(null);
    expect(run(0.4)).toBeLessThan(best * 0.6); // dentro del cono interno frío
    expect(run(16)).toBeLessThan(best * 0.5); // demasiado arriba
    expect(run(4, 4)).toBeLessThan(best * 0.3); // afuera de la llama
  });

  it('9. la identidad de la incógnita se mantiene con la misma semilla (recarga)', () => {
    const a = generateUnknown(777);
    const b = generateUnknown(777);
    expect(b).toEqual(a);
    const w = world3({ seed: 777 });
    const restored = JSON.parse(JSON.stringify(w));
    expect(restored.unknown).toEqual(w.unknown);
    // Con historial, evita repetir identidades hasta completar el conjunto.
    const seen = new Set<string>();
    const hist: string[] = [];
    for (let i = 0; i < 6; i++) {
      const u = generateUnknown(1000 + i, hist);
      seen.add(u.cation);
      hist.push(u.cation);
    }
    expect(seen.size).toBe(6);
  });

  it('las seis sales dan colores distinguibles y coherentes con la guía (§9.2)', () => {
    const regions: Record<string, string[]> = {
      'Na+': ['amarillo', 'amarillo_anaranjado'], 'K+': ['violeta', 'lila'], 'Ca2+': ['rojo_anaranjado', 'anaranjado', 'rojo'],
      'Cu2+': ['verde_azulado', 'verde'], 'Li+': ['carmin', 'rojo'], 'Ba2+': ['verde', 'amarillo_verdoso'],
    };
    const w = world3();
    const rgbs: number[][] = [];
    for (const [c, ok] of Object.entries(regions)) {
      const o = observeEmitter(w, ctx3, { [c]: 0.04 });
      expect(ok, c).toContain(colorRegion(o.noFilter.displayRgb));
      rgbs.push(o.noFilter.displayRgb);
    }
    for (let i = 0; i < rgbs.length; i++) for (let j = i + 1; j < rgbs.length; j++) {
      const d = Math.hypot(rgbs[i][0] - rgbs[j][0], rgbs[i][1] - rgbs[j][1], rgbs[i][2] - rgbs[j][2]);
      expect(d).toBeGreaterThan(0.12);
    }
  });

  it('temperatura local: dentro del cono interno es menor que en la región óptima', () => {
    const w = world3();
    precheck(w);
    ignite(w);
    makeBlue(w);
    const m = mouthPos(w, ctx3);
    expect(localTemperature(w, ctx3, pose(m.x, m.y, m.z + 0.5))).toBeLessThan(localTemperature(w, ctx3, optimalPoint(w)) - 250);
    expect(isLit(w) && hasOpenFlame(w)).toBe(true);
  });
});
