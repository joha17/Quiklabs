/**
 * Práctica 4 — §28.1–28.5: balance químico, neutralización, precipitación, redox y magnesio (dominio puro).
 */
import { describe, expect, it } from 'vitest';
import { parseFormula, prettyFormula, compositionKey } from '../../simulation/chemistry/formula';
import { validateEquation, type ChemEquation } from '../../simulation/chemistry/equation';
import { phenolphthaleinPink, transmittance } from '../../simulation/chemistry/mixture';
import { CHEM, REACTIONS, reactionEnthalpyKJ } from '../../practices/practice-04/reactions';
import { COMPOUNDS } from '../../practices/practice-04/species';
import { equationRef } from '../../practices/practice-04/equations';
import {
  globalTotals, mergedCell, metalCuMg, speciesMol, vesselAppearance, vesselOrigin, vesselPH,
} from '../../simulation/reaction-world/world';
import type { P4World } from '../../simulation/reaction-world/types';
import { MG_LIGHT_MAX, mgExposure, mgLightIntensity } from '../../engine/reaction/protection';
import { burnMg, cmd4, ctx4, drops, lightBurner, measure, nailInto, pose, pourMl, run4, shake, stir, world4 } from '../helpers4';

const E = (s: string): ChemEquation => {
  // «2 HCl(ac) + 2 NaOH(ac) -> 2 NaCl(ac) + 2 H2O(l)»
  const side = (x: string) => x.split(' + ').map((t) => {
    const m = /^(\d+)?\s*([^()]+(?:\([^)]*\)[^()]*)*?)\((s|l|g|ac)\)(!)?$/.exec(t.trim())!;
    return { coef: m[1] ? Number(m[1]) : 1, formula: m[2].trim(), state: m[3] as 's', struck: !!m[4] };
  });
  const [r, p] = s.split(' -> ');
  return { reactants: side(r), products: side(p) };
};

function totalsClose(a: Record<string, number>, b: Record<string, number>) {
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
    // Relativo a la cantidad total (la carga total es ≈ 0: ahí se usa un margen absoluto de redondeo).
    const diff = Math.abs((a[k] ?? 0) - (b[k] ?? 0));
    expect(diff <= 1e-14 || diff / Math.abs(a[k] ?? 1) < 1e-9, `${k}: ${diff}`).toBe(true);
  }
}

function allNonNegative(w: P4World) {
  for (const v of Object.values(w.vessels)) for (const c of [v.bulk, v.plume]) for (const [id, m] of Object.entries(c.mol)) expect(m, `${v.id}:${id}`).toBeGreaterThanOrEqual(0);
}

/** Neutralización estándar: HCl en el beaker, 2 gotas de fenolftaleína, NaOH poco a poco con agitación. */
function neutralize(w: P4World, naohBottle = 'bottle_naoh10', naohMl = 5, slow = true) {
  cmd4(w, { type: 'confirmPpe' });
  measure(w, 'bottle_hcl', 'cyl10', 5.06);
  pourMl(w, 'cyl10', 'beaker', 6);
  drops(w, 'pheno', 'beaker', 2);
  stir(w, 'beaker', 2);
  measure(w, naohBottle, 'cyl25', naohMl + 0.12);
  if (slow) {
    for (let i = 0; i < 25; i++) {
      pourMl(w, 'cyl25', 'beaker', 0.21, 0.4);
      run4(w, 0.3);
    }
  } else pourMl(w, 'cyl25', 'beaker', naohMl + 1, 3);
  stir(w, 'beaker', 6);
  run4(w, 3);
}

describe('§15 fórmulas y validador de ecuaciones', () => {
  it('analiza subíndices, paréntesis, cargas e hidratos (ASCII y Unicode)', () => {
    expect(parseFormula('Fe(OH)3')!.elements).toEqual({ Fe: 1, O: 3, H: 3 });
    expect(parseFormula('SO4^2-')!.charge).toBe(-2);
    expect(parseFormula('SO₄²⁻')!.charge).toBe(-2);
    expect(parseFormula('Cu2+')!.charge).toBe(2);
    expect(parseFormula('NH4+')!.elements).toEqual({ N: 1, H: 4 });
    expect(parseFormula('NH4+')!.charge).toBe(1);
    expect(parseFormula('CO32-')!.charge).toBe(-2);
    expect(parseFormula('CuSO4·5H2O')!.elements).toEqual({ Cu: 1, S: 1, O: 9, H: 10 });
    expect(parseFormula('e-')!.electron).toBe(true);
    expect(parseFormula('Xx2')).toBeNull();
    expect(prettyFormula('Fe(OH)3')).toBe('Fe(OH)₃');
    expect(prettyFormula('SO4^2-')).toBe('SO₄²⁻');
    expect(compositionKey(parseFormula('HO-')!)).toBe(compositionKey(parseFormula('OH-')!));
  });

  it('28.1-5 reconoce coeficientes equivalentes y exige la relación mínima entera', () => {
    const w = world4();
    const ref = equationRef(w, 'A', 'MOLECULAR');
    const ok = validateEquation(E('HCl(ac) + NaOH(ac) -> NaCl(ac) + H2O(l)'), ref, COMPOUNDS);
    expect(ok.atomsBalanced && ok.chargeBalanced && ok.coefficientsLowestWholeNumbers && ok.phasesCorrect).toBe(true);
    const doubled = validateEquation(E('2 HCl(ac) + 2 NaOH(ac) -> 2 NaCl(ac) + 2 H2O(l)'), ref, COMPOUNDS);
    expect(doubled.atomsBalanced).toBe(true);
    expect(doubled.coefficientsLowestWholeNumbers).toBe(false);
    expect(doubled.errors.map((e) => e.code)).toContain('NOT_LOWEST');
    expect(doubled.errors.map((e) => e.code)).not.toContain('REACTION_MISMATCH');
    // Otro orden de los términos: la misma reacción (no se compara texto).
    const reordered = validateEquation(E('NaOH(ac) + HCl(ac) -> H2O(l) + NaCl(ac)'), ref, COMPOUNDS);
    expect(reordered.errors.map((e) => e.code)).not.toContain('REACTION_MISMATCH');
    const unbalanced = validateEquation(E('FeCl3(ac) + NaOH(ac) -> Fe(OH)3(s) + NaCl(ac)'), equationRef(w, 'B2', 'MOLECULAR'), COMPOUNDS);
    expect(unbalanced.atomsBalanced).toBe(false);
  });

  it('iónica completa: disociar electrolitos fuertes, tachar espectadores; neta sin espectadores; fases', () => {
    const w = world4();
    const ci = validateEquation(E('Ca^2+(ac) + 2 Cl-(ac)! + 2 Na+(ac)! + CO3^2-(ac) -> CaCO3(s) + 2 Na+(ac)! + 2 Cl-(ac)!'), equationRef(w, 'B1', 'COMPLETE_IONIC'), COMPOUNDS);
    expect(ci.atomsBalanced && ci.chargeBalanced).toBe(true);
    expect(ci.spectatorsCorrect).toBe(true);
    expect(ci.errors.map((e) => e.code)).not.toContain('REACTION_MISMATCH');
    const notDiss = validateEquation(E('CaCl2(ac) + Na2CO3(ac) -> CaCO3(s) + 2 NaCl(ac)'), equationRef(w, 'B1', 'COMPLETE_IONIC'), COMPOUNDS);
    expect(notDiss.errors.map((e) => e.code)).toContain('NOT_DISSOCIATED');
    const net = validateEquation(E('Ca^2+(ac) + CO3^2-(ac) -> CaCO3(s)'), equationRef(w, 'B1', 'NET_IONIC'), COMPOUNDS);
    expect(net.errors.filter((e) => e.code !== 'NOT_OBSERVED')).toEqual([]);
    // No disociar sólidos: escribir el precipitado como iones no es la reacción observada.
    const dissSolid = validateEquation(E('Ca^2+(ac) + CO3^2-(ac) -> Ca^2+(ac) + CO3^2-(ac)'), equationRef(w, 'B1', 'NET_IONIC'), COMPOUNDS);
    expect(dissSolid.ok).toBe(false);
    const wrongPhase = validateEquation(E('Ca^2+(ac) + CO3^2-(ac) -> CaCO3(ac)'), equationRef(w, 'B1', 'NET_IONIC'), COMPOUNDS);
    expect(wrongPhase.phasesCorrect).toBe(false);
    // Semirreacciones con electrones.
    const ox = validateEquation(E('Fe(s) -> Fe^2+(ac) + 2 e-(ac)'), equationRef(w, 'C1', 'OXIDATION'), COMPOUNDS);
    expect(ox.atomsBalanced && ox.chargeBalanced).toBe(true);
    expect(ox.errors.map((e) => e.code)).not.toContain('REACTION_MISMATCH');
  });
});

describe('§28.1 balance químico', () => {
  it('1. todas las reacciones del motor conservan átomos y carga (ΔH por Hess)', () => {
    for (const r of Object.values(REACTIONS)) {
      const el: Record<string, number> = { charge: 0 };
      for (const [id, v] of Object.entries(r.nu)) {
        const sp = CHEM.species[id];
        expect(sp, `${r.id}: especie ${id}`).toBeDefined();
        for (const [e, k] of Object.entries(sp.elements)) el[e] = (el[e] ?? 0) + v * k;
        el.charge += v * sp.charge;
      }
      for (const [e, x] of Object.entries(el)) expect(Math.abs(x), `${r.id}: ${e}`).toBeLessThan(1e-12);
    }
    expect(reactionEnthalpyKJ({ id: 'n', kind: 'NEUTRALIZATION', nu: { 'H+': -1, 'OH-': -1, H2O: 1 } })).toBeCloseTo(-55.8, 1);
    expect(reactionEnthalpyKJ(REACTIONS.feCu)).toBeLessThan(0);
    expect(reactionEnthalpyKJ(REACTIONS.mgO2)).toBeLessThan(-1000);
  });

  it('2–4. sin moles negativos; los derrames siguen en el balance global; los espectadores no desaparecen', () => {
    const w = world4({ seed: 77 });
    const ctx = ctx4(w);
    const t0 = globalTotals(w, ctx);
    neutralize(w);
    const naCl = () => speciesMol(w.vessels.beaker, 'Na+') + speciesMol(w.vessels.beaker, 'Cl-');
    const before = naCl();
    run4(w, 20);
    expect(naCl()).toBeCloseTo(before, 12);
    // Derrame: verter fuera de un recipiente.
    pourMl(w, 'beaker', null, 2);
    expect(w.spills.length).toBeGreaterThan(0);
    drops(w, 'db_na2co3', 'tube1', 20);
    drops(w, 'db_cacl2', 'tube1', 20);
    drops(w, 'db_fecl3', 'tube2', 20);
    drops(w, 'db_naoh15', 'tube2', 20);
    run4(w, 30);
    allNonNegative(w);
    totalsClose(t0, globalTotals(w, ctx));
  });
});

describe('§28.2 neutralización', () => {
  it('1–2, 5–6. 5,0 mL de HCl 0,10 M + 5,0 mL de NaOH 0,10 M: equivalencia incolora, remolinos transitorios y +0,3–0,7 °C', () => {
    const w = world4({ seed: 11 });
    const T0 = w.params.ambientC;
    neutralize(w);
    const ctx = ctx4(w);
    const b = w.vessels.beaker;
    const o = vesselOrigin(b);
    expect(o.hcl).toBeGreaterThan(4.8);
    expect(o.naoh10).toBeGreaterThan(4.8);
    expect(b.extents.neutralization).toBeGreaterThan(4.6e-4);
    const a = vesselAppearance(w, ctx, 'beaker')!;
    expect(a.pinkBulk).toBeLessThan(0.05);
    expect(w.evidence.pinkSwirlS ?? 0).toBeGreaterThan(0.2);
    const dT = b.tempLog.max - T0;
    expect(dT).toBeGreaterThan(0.25);
    expect(dT).toBeLessThan(0.75);
  });

  it('3. exceso de NaOH: rosa persistente; 4. exceso de HCl: incolora', () => {
    const w = world4({ seed: 12 });
    neutralize(w, 'bottle_naoh10', 6);
    const ctx = ctx4(w);
    expect(vesselPH(w.vessels.beaker)).toBeGreaterThan(10);
    expect(vesselAppearance(w, ctx, 'beaker')!.pinkBulk).toBeGreaterThan(0.3);
    const w2 = world4({ seed: 13 });
    neutralize(w2, 'bottle_naoh10', 3.5);
    expect(vesselPH(w2.vessels.beaker)).toBeLessThan(3);
    expect(vesselAppearance(w2, ctx4(w2), 'beaker')!.pinkBulk).toBeLessThan(0.02);
  });

  it('la fenolftaleína responde de forma continua (8,2–10,0) y el pH sigue la proporción', () => {
    expect(phenolphthaleinPink(7)).toBe(0);
    expect(phenolphthaleinPink(9.1)).toBeGreaterThan(0.2);
    expect(phenolphthaleinPink(9.1)).toBeLessThan(0.8);
    expect(phenolphthaleinPink(11)).toBe(1);
  });
});

describe('§28.3 precipitación', () => {
  it('1–2. Ca²⁺ + CO₃²⁻ forma CaCO₃ blanco: ≈ 15 mg con 0,15 mmol de cada uno', () => {
    const w = world4({ seed: 21 });
    cmd4(w, { type: 'confirmPpe' });
    // 1,0 mL de cada reactivo (vertido medido desde el frasco gotero).
    pourMl(w, 'db_na2co3', 'tube1', 1, 0.5);
    pourMl(w, 'db_cacl2', 'tube1', 1, 0.5);
    run4(w, 20);
    const v = w.vessels.tube1;
    const mg = speciesMol(v, 'CaCO3(s)') * 100.09 * 1000;
    expect(mg).toBeGreaterThan(14.5);
    expect(mg).toBeLessThan(15.1);
    const a = vesselAppearance(w, ctx4(w), 'tube1')!;
    expect(a.suspendedRgb[0]).toBeGreaterThan(0.85);
    expect(a.turbidity).toBeGreaterThan(0.3);
  });

  it('3–5. Fe³⁺ + 3 OH⁻ → Fe(OH)₃ marrón; 1:1 deja Fe³⁺ (OH⁻ limita); con 3,0 mL de NaOH precipita casi todo', () => {
    const w = world4({ seed: 22 });
    cmd4(w, { type: 'confirmPpe' });
    pourMl(w, 'db_fecl3', 'tube2', 1, 0.5);
    pourMl(w, 'db_naoh15', 'tube2', 1, 0.5);
    run4(w, 20);
    const v = w.vessels.tube2;
    const ppt = speciesMol(v, 'Fe(OH)3(s)');
    const fe = speciesMol(v, 'Fe^3+') + speciesMol(v, 'FeOH^2+');
    expect(ppt).toBeGreaterThan(2.5e-5);
    expect(ppt).toBeLessThanOrEqual(5.05e-5);
    expect(fe).toBeGreaterThan(9e-5);
    const a = vesselAppearance(w, ctx4(w), 'tube2')!;
    expect(a.suspendedRgb[0]).toBeGreaterThan(a.suspendedRgb[2] * 2);
    // Sobrenadante amarillo (absorbe el azul).
    expect(a.bulkRgb[2]).toBeLessThan(a.bulkRgb[0] * 0.6);
    const w2 = world4({ seed: 22 });
    pourMl(w2, 'db_fecl3', 'tube2', 1, 0.5);
    pourMl(w2, 'db_naoh15', 'tube2', 3, 0.5);
    run4(w2, 20);
    const v2 = w2.vessels.tube2;
    expect(speciesMol(v2, 'Fe(OH)3(s)')).toBeGreaterThan(1.45e-4);
    expect(speciesMol(v2, 'Fe^3+') + speciesMol(v2, 'FeOH^2+')).toBeLessThan(1e-6);
  });

  it('6. agitar cambia la sedimentación, no los moles de sólido', () => {
    const w = world4({ seed: 23 });
    pourMl(w, 'db_na2co3', 'tube1', 1, 0.5);
    pourMl(w, 'db_cacl2', 'tube1', 1, 0.5);
    run4(w, 200);
    const v = w.vessels.tube1;
    const before = speciesMol(v, 'CaCO3(s)');
    const susp0 = v.particles['CaCO3(s)'].suspended;
    shake(w, 'tube1', 3, 0.6);
    expect(v.particles['CaCO3(s)'].suspended).toBeGreaterThan(susp0);
    expect(speciesMol(v, 'CaCO3(s)')).toBeCloseTo(before, 9);
  });
});

describe('§28.4 redox Fe/Cu²⁺', () => {
  function c1(seed: number, sand: number, minutes: number, scen: Array<'RUSTY_NAIL'> = []) {
    const w = world4({ seed, scenarios: scen });
    measure(w, 'bottle_cuso4', 'cyl10', 2.56);
    pourMl(w, 'cyl10', 'tube3', 3);
    for (let i = 0; i < sand; i++) cmd4(w, { type: 'sand', id: 'nail' });
    nailInto(w, 'tube3');
    run4(w, minutes * 60);
    return w;
  }

  it('1–2, 5. el Fe reduce Cu²⁺ (se forma Fe²⁺), el sulfato es espectador y el azul disminuye', () => {
    const w = c1(31, 3, 10);
    const v = w.vessels.tube3;
    expect(speciesMol(v, 'Fe^2+')).toBeGreaterThan(5e-5);
    expect(speciesMol(v, 'SO4^2-')).toBeCloseTo(vesselOrigin(v).cuso4 / 1000 * 0.25, 7);
    const ctx = ctx4(w);
    const now = vesselAppearance(w, ctx, 'tube3')!.bulkRgb[0];
    const fresh = transmittance({ volL: 0.0025, mol: { 'Cu^2+': 0.000625, 'SO4^2-': 0.000625 } }, CHEM, 25, 1.4)[0];
    expect(now).toBeGreaterThan(fresh);
    expect(metalCuMg(w.metals.nail)).toBeGreaterThan(5);
  });

  it('3. el depósito de Cu nunca supera 39,7 mg (2,5 mL de CuSO₄ 0,25 M) y 6. el Cu desprendido va al fondo', () => {
    const w = c1(32, 3, 180);
    const ctx = ctx4(w);
    const cuTotal = metalCuMg(w.metals.nail) + speciesMol(w.vessels.tube3, 'Cu(s)') * 63546;
    expect(cuTotal).toBeLessThanOrEqual(39.75 * (vesselOrigin(w.vessels.tube3).cuso4 / 2.5) + 1e-6);
    const t0 = globalTotals(w, ctx);
    shake(w, 'tube3', 4, 0.9);
    expect(speciesMol(w.vessels.tube3, 'Cu(s)')).toBeGreaterThan(0);
    totalsClose(t0, globalTotals(w, ctx));
  });

  it('4. una superficie oxidada reacciona más lento que una lijada', () => {
    const rusty = c1(33, 0, 4, ['RUSTY_NAIL']);
    const sanded = c1(33, 4, 4, ['RUSTY_NAIL']);
    expect(metalCuMg(sanded.metals.nail)).toBeGreaterThan(metalCuMg(rusty.metals.nail) * 1.5);
  });

  it('7. el aluminio pasivado no muestra cambio inmediato', () => {
    const w = world4({ seed: 34, params: { aluminumEnabled: true } });
    measure(w, 'bottle_cuso4', 'cyl10', 2.56);
    pourMl(w, 'cyl10', 'tube3', 3);
    const t = w.objects.tube3.pose;
    cmd4(w, { type: 'setPose', id: 'al_strip', pose: pose(t.x, t.y, t.z + 0.3), support: 'in:tube3' });
    run4(w, 120);
    expect(metalCuMg(w.metals.al_strip)).toBeLessThan(0.3);
  });
});

describe('§28.5 magnesio', () => {
  it('1, 3. el MgO incorpora oxígeno; el residuo perdido reduce la recuperación, no la conversión', () => {
    const w = world4({ seed: 41 });
    cmd4(w, { type: 'confirmPpe' });
    lightBurner(w);
    const r = w.ribbons.mg1;
    const mgMass = r.massInitialG;
    burnMg(w);
    expect(r.burnFrac).toBeGreaterThan(0.99);
    const mgoTotal = (r.toCapsuleMol + r.toBenchMol + r.smokeMol + r.mgoMol) * 40.304;
    expect(mgoTotal).toBeGreaterThan(mgMass * 1.6);
    expect(r.toCapsuleMol * 40.304).toBeLessThan((mgMass / 24.305) * 40.304);
    expect(w.ledger.air['O2(g)']).toBeLessThan(0);
    // Sin cápsula debajo: la conversión es completa, la recuperación no.
    const w2 = world4({ seed: 41 });
    cmd4(w2, { type: 'confirmPpe' });
    lightBurner(w2);
    burnMg(w2, 'mg1', { capsuleUnder: false });
    expect(w2.ribbons.mg1.burnFrac).toBeGreaterThan(0.99);
    expect(w2.ribbons.mg1.toCapsuleMol).toBeLessThan(r.toCapsuleMol * 0.5);
    expect(w2.events.map((e) => e.code)).toContain('MG_NO_CAPSULE_BELOW');
  });

  it('2. sin oxígeno disponible el Mg no puede convertirse', () => {
    const w = world4({ seed: 42, params: { oxygenAvailability: 0 } });
    cmd4(w, { type: 'confirmPpe' });
    lightBurner(w);
    burnMg(w);
    expect(w.ribbons.mg1.burnFrac).toBe(0);
    expect(w.ribbons.mg1.mgoMol + w.ribbons.mg1.toCapsuleMol).toBe(0);
  });

  it('4–5. el agua sobre el MgO forma Mg(OH)₂ de forma gradual y la fenolftaleína responde al pH calculado', () => {
    const w = world4({ seed: 43 });
    cmd4(w, { type: 'confirmPpe' });
    lightBurner(w);
    burnMg(w);
    run4(w, 240);
    cmd4(w, { type: 'squeeze', washId: 'wash', targetId: 'cyl25', rateMlS: 1 });
    run4(w, 5.2);
    cmd4(w, { type: 'stopSqueeze', washId: 'wash' });
    pourMl(w, 'cyl25', 'capsule', 6);
    const cap = w.vessels.capsule;
    run4(w, 1);
    const early = cap.extents.mgoHydration ?? 0;
    stir(w, 'capsule', 30);
    const later = cap.extents.mgoHydration ?? 0;
    expect(early).toBeGreaterThan(0);
    expect(later).toBeGreaterThan(early * 3);
    expect(speciesMol(cap, 'MgO(s)')).toBeGreaterThan(0);
    drops(w, 'pheno', 'capsule', 2);
    run4(w, 20);
    const p = vesselPH(cap);
    expect(p).toBeGreaterThan(9.5);
    expect(p).toBeLessThan(10.7);
    expect(vesselAppearance(w, ctx4(w), 'capsule')!.pinkBulk).toBeGreaterThan(0.2);
    expect(mergedCell(cap).mol['Mg(OH)2(s)']).toBeGreaterThan(0);
  });

  it('6. la emisión visual se limita para proteger al usuario', () => {
    for (const reduced of [false, true]) {
      expect(mgExposure({ burning: true, shielded: false, reduced })).toBeLessThan(0.8);
      for (let t = 0; t < 2; t += 0.013) expect(mgLightIntensity({ burning: true, shielded: false, reduced }, t)).toBeLessThanOrEqual(MG_LIGHT_MAX);
    }
    expect(mgLightIntensity({ burning: true, shielded: true, reduced: false }, 0.3)).toBeLessThan(mgLightIntensity({ burning: true, shielded: false, reduced: false }, 0.3));
    expect(mgExposure({ burning: false, shielded: false, reduced: false })).toBeCloseTo(1.05);
  });
});
