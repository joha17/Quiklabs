/**
 * Casos de referencia numéricos de B03 (§8, REF-01..REF-12): molaridad, flujo difusivo y osmótico con signo y
 * unidades, estequiometría del AgCl, balance de volúmenes, fuga no selectiva, recurso faltante sin descuento,
 * aumentos del microscopio compartido y determinismo. Son pruebas COMPUTACIONALES, no predicciones de un material.
 */
import { describe, expect, it } from 'vitest';
import {
  agclPrecipitate, biuretReading, diffusiveStep, elodeaState, molarityFromWv, osmoticPressureKPa, osmoticStep, protoplastTarget, relaxProtoplast,
} from '../../simulation/membrane-transport/model';
import { conservedPerm, dispatchPerm, permSummary, runPermFor } from '../../simulation/perm-world/world';
import { stableHash } from '../../simulation/core/math';
import { evaluateB03 } from '../../practices/practice-b03/rubric';
import { emptyB03Notebook } from '../../practices/practice-b03/notebook';
import { DEFAULT_PERM_PARAMS } from '../../practices/practice-b03/params';
import { cmdP, idealAttemptB03, mountMembrane, pourTo, ppeB03, worldB03 } from '../helpersB03';

describe('B03 — casos de referencia (§8)', () => {
  it('REF-01/02: NaCl 0,9 % y 5 % m/v a mol/L', () => {
    expect(molarityFromWv(0.9)).toBeCloseTo(0.154004, 6);
    expect(molarityFromWv(5)).toBeCloseTo(0.855578, 6);
  });

  it('REF-03/04: flujo difusivo P·A·ΔC con signo A → B; proteína con P = 0 no pasa', () => {
    // C_A = 0,100 mmol/mL en 10 mL, C_B = 0 en 10 mL; un paso de 0,05 s.
    const d = diffusiveStep(0.005, 10, 1, 10, 0, 10, 0.05);
    expect(d).toBeCloseTo(0.00025, 12);
    expect(diffusiveStep(0.005, 10, 1, 10, 0, 10, 1)).toBeCloseTo(0.005, 12);
    expect(diffusiveStep(0, 10, 1, 10, 0, 10, 0.05)).toBe(0);
    // El limitador nunca invierte el gradiente.
    expect(diffusiveStep(1, 10, 1, 10, 0, 10, 100)).toBeCloseTo(0.5, 12);
  });

  it('REF-05/06: Δπ = R·T·ΔC y flujo de agua hacia el lado hiperosmótico', () => {
    const dpi = osmoticPressureKPa(0.2, 298.15);
    expect(dpi).toBeCloseTo(495.76, 1);
    const j = osmoticStep(1e-7, 10, 0, dpi, 0, 0, 1);
    expect(j).toBeCloseTo(0.00049576, 7);
    expect(osmoticStep(1e-7, 10, 0, dpi, 0, 0, 0.05)).toBeCloseTo(0.000024788, 8);
    // B hiperosmótico → positivo (A → B); invertido, negativo.
    expect(osmoticStep(1e-7, 10, dpi, 0, 0, 0, 1)).toBeLessThan(0);
    // Una contrapresión hidrostática igual a Δπ anula el flujo.
    expect(osmoticStep(1e-7, 10, 0, dpi, 0, dpi, 1)).toBeCloseTo(0, 12);
  });

  it('REF-07: AgCl limitado por el reactivo en defecto', () => {
    const r = agclPrecipitate(0.1, 0.08);
    expect(r.pptMmol).toBeCloseTo(0.08, 12);
    expect(r.chlorideLeft).toBeCloseTo(0.02, 12);
    expect(r.silverLeft).toBeCloseTo(0, 12);
  });

  it('Biuret: sin proteína queda azul; con proteína y tiempo, violeta; con plata, interferencia', () => {
    const o = { biuretMl: 0.25, ageS: 200, delayS: 120, silver: false, minMgMl: 1 };
    expect(biuretReading(0, o)).toBe('blue');
    expect(biuretReading(20, o)).toBe('violet');
    // Antes del tiempo de desarrollo la señal es preliminar y más débil (PERM34).
    expect(biuretReading(2, o)).toBe('weak');
    expect(biuretReading(2, { ...o, ageS: 20 })).toBe('blue');
    expect(biuretReading(20, { ...o, silver: true })).toBe('interference');
    expect(biuretReading(20, { ...o, biuretMl: 0 })).toBe('none');
  });

  it('REF-08: ΔV = +0,5 mL de A a B conserva el total en la cámara', () => {
    const w = worldB03();
    ppeB03(w);
    mountMembrane(w, 'md1', 'c3');
    pourTo(w, 'bW', 'c3:A', 20);
    pourTo(w, 'bW', 'c3:B', 20);
    const c = w.perm.cells.c3;
    const tot = c.sides.A.volumeMl + c.sides.B.volumeMl;
    c.sides.A.volumeMl -= 0.5;
    c.sides.B.volumeMl += 0.5;
    expect(c.sides.A.volumeMl + c.sides.B.volumeMl).toBeCloseTo(tot, 9);
    for (const [k, v] of Object.entries(conservedPerm(w))) expect(Math.abs(v), k).toBeLessThan(1e-6);
  });

  it('REF-09: junta sin sellar → fuga convectiva de TODO (también la proteína) y alerta; no es difusión selectiva', () => {
    const w = worldB03();
    ppeB03(w);
    mountMembrane(w, 'md1', 'c2', { turns: 0.5 });
    pourTo(w, 'bW', 'c2:A', 15);
    pourTo(w, 'bE', 'c2:B', 15);
    runPermFor(w, 60);
    const c = w.perm.cells.c2;
    expect(w.evidence['err:PERM02']).toBeGreaterThan(0);
    expect(c.leakOutMl).toBeGreaterThan(0);
    // La proteína llega a A por la fuga aunque la membrana de diálisis tenga P_proteína = 0.
    expect(DEFAULT_PERM_PARAMS.materials.dialysis.p.protein).toBe(0);
    expect(c.sides.A.amounts.protein).toBeGreaterThan(0);
    for (const [k, v] of Object.entries(conservedPerm(w))) expect(Math.abs(v), k).toBeLessThan(1e-6);
  });

  it('REF-09 bis: sellada, la proteína NO cruza y la sal sí', () => {
    const w = worldB03();
    ppeB03(w);
    mountMembrane(w, 'md1', 'c1');
    pourTo(w, 'bW', 'c1:A', 15);
    pourTo(w, 'bW', 'c1:B', 15);
    cmdP(w, { type: 'readInstrument', instrument: 'scale', targetId: 'c1:A' });
    runPermFor(w, 22);
    cmdP(w, { type: 'readInstrument', instrument: 'scale', targetId: 'c1:A' });
    mountMembrane(w, 'md2', 'c2');
    pourTo(w, 'bW', 'c2:A', 15);
    pourTo(w, 'bE', 'c2:B', 10);
    pourTo(w, 'bN', 'c2:B', 5);
    runPermFor(w, 600);
    const c = w.perm.cells.c2;
    expect(c.sides.A.amounts.protein).toBe(0);
    expect(c.sides.A.amounts.salt).toBeGreaterThan(0.5);
    expect(c.leakOutMl).toBe(0);
  });

  it('REF-10: Elodea sin foto de NaCl 5 % (SC-18) → incidencia sin descuento', () => {
    const { w, nb } = idealAttemptB03(11, ['SC-18']);
    expect(Object.keys(w.evidence).filter((k) => k.startsWith('err:'))).toEqual([]);
    expect(w.cell.incidents).toContain('elodeaPlasmo');
    const ev = evaluateB03(w, nb);
    expect(ev.components.find((c) => c.id === 'safety')!.score).toBe(1);
    expect(ev.components.find((c) => c.id === 'microscopy')!.items.find((i) => i.key === 'b03.mounts')!.ok).toBe(true);
  });

  it('REF-11: ocular 10X con 4X/10X/40X(/100X) → 40, 100, 400(, 1000) aumentos', () => {
    const w = worldB03();
    expect(w.params.microscope.objectives!.map((x) => x * w.params.microscope.ocularX)).toEqual([40, 100, 400, 1000]);
  });

  it('REF-12: misma semilla, parámetros y cinta → mismo mundo y misma nota', () => {
    const a = idealAttemptB03(41);
    const b = idealAttemptB03(41);
    expect(stableHash(permSummary(a.w))).toBe(stableHash(permSummary(b.w)));
    expect(stableHash(a.w.perm)).toBe(stableHash(b.w.perm));
    expect(evaluateB03(a.w, a.nb).total).toBe(evaluateB03(b.w, b.nb).total);
  });

  it('Elodea: el 0,9 % NO es isotónico por definición; depende de la célula configurada (SC-17)', () => {
    const inner = DEFAULT_PERM_PARAMS.elodea.innerOsm;
    const n09 = DEFAULT_PERM_PARAMS.salineOsm['nacl-0.9'];
    expect(protoplastTarget(n09, inner, 0.25)).toBe(1);
    const v17 = protoplastTarget(n09, 0.25, 0.25);
    expect(elodeaState(v17, 0.95, 0.75)).toBe('incipient');
    const v5 = protoplastTarget(DEFAULT_PERM_PARAMS.salineOsm['nacl-5'], inner, 0.25);
    expect(elodeaState(v5, 0.95, 0.75)).toBe('plasmolyzed');
    // Relajación exponencial: tras 3τ queda menos del 5 % del cambio.
    let v = 1;
    for (let i = 0; i < 2400; i++) v = relaxProtoplast(v, v5, 40, 0.05);
    expect(Math.abs(v - v5) / (1 - v5)).toBeLessThan(0.05);
  });

  it('la libreta vacía no inventa puntos de cálculo ni de interpretación', () => {
    const w = worldB03();
    const ev = evaluateB03(w, emptyB03Notebook('x'));
    expect(ev.total).toBeLessThan(0.15);
    expect(dispatchPerm(w, { type: 'startPour', sourceId: 'bW', targetId: 'c1:A', tiltDeg: 60 }).ok).toBe(false);
  });
});
