/**
 * Práctica 4 — §28.6: pruebas de integración del dominio (recorridos completos, sin escena), seguridad (§18.3)
 * y catálogo de errores simulables (§29-13).
 */
import { describe, expect, it } from 'vitest';
import { createActor } from 'xstate';
import type { P4World } from '../../simulation/reaction-world/types';
import type { ChemEquation, EqTerm } from '../../simulation/chemistry/equation';
import { isLit, mouthPos } from '../../simulation/flame-world/world';
import { globalTotals, liquidMl, metalCuMg, speciesMol, submissionBlockers, vesselAppearance, vesselPH } from '../../simulation/reaction-world/world';
import { emptyP4Notebook, type P4Notebook } from '../../practices/practice-04/notebook';
import { EXPERIMENT_REFS, type ExperimentId, type RefTerm } from '../../practices/practice-04/reactions';
import { completeIonic, allEquations } from '../../practices/practice-04/equations';
import { expectedResults } from '../../practices/practice-04/expected-results';
import { p4StageEvidence } from '../../practices/practice-04/evidence';
import { practice4Machine, p4StageName } from '../../practices/practice-04/workflow.machine';
import { evaluateP4 } from '../../practices/practice-04/rubric';
import { SIMULATED_ERRORS_P4 } from '../../practices/practice-04/error-scenarios';
import { p4LiveFeedback } from '../../app/p4/feedback';
import {
  burnMg, burnerOff, cmd4, ctx4, drops, gas4, hotPoint, lightBurner, measure, nailInto, pose, pourMl, run4, shake, step4, stir, world4,
} from '../helpers4';

const terms = (ts: RefTerm[], spectators: string[] = []): EqTerm[] => ts.map((t) => ({ ...t, struck: spectators.includes(t.formula) }));
const eq = (s: { reactants: RefTerm[]; products: RefTerm[] }, spectators: string[] = []): ChemEquation => ({ reactants: terms(s.reactants, spectators), products: terms(s.products, spectators) });

/** Vacía un recipiente del todo en un contenedor (incluido el sedimento, inclinándolo mucho). */
function drain(w: P4World, src: string, target: string) {
  cmd4(w, { type: 'setPour', sourceId: src, targetId: target, rateMlS: 3, tiltDeg: 120 });
  for (let i = 0; i < 200 && liquidMl(w.vessels[src]) > 0.06; i++) step4(w);
  cmd4(w, { type: 'stopPour', sourceId: src });
}

function neutralization(w: P4World, naohBottle = 'bottle_naoh10') {
  cmd4(w, { type: 'inspect', target: 'beaker' });
  measure(w, 'bottle_hcl', 'cyl10', 5.06);
  pourMl(w, 'cyl10', 'beaker', 6);
  drops(w, 'pheno', 'beaker', 2);
  cmd4(w, { type: 'setPose', id: 'probe', pose: pose(95.5, 28, 0.5), support: 'in:beaker' });
  stir(w, 'beaker', 2);
  measure(w, naohBottle, 'cyl25', 5.12);
  for (let i = 0; i < 25; i++) {
    pourMl(w, 'cyl25', 'beaker', 0.21, 0.4);
    run4(w, 0.3);
    if (i % 3 === 0) stir(w, 'beaker', 0.4, 0.3);
  }
  stir(w, 'beaker', 6);
  run4(w, 5);
  cmd4(w, { type: 'setPose', id: 'probe', pose: pose(126, 30, 0.3), support: 'bench' });
}

function precipitations(w: P4World) {
  cmd4(w, { type: 'label', id: 'tube1', label: 'B1' });
  drops(w, 'db_na2co3', 'tube1', 20);
  drops(w, 'db_cacl2', 'tube1', 20);
  shake(w, 'tube1', 1.5, 0.4);
  cmd4(w, { type: 'label', id: 'tube2', label: 'B2' });
  drops(w, 'db_fecl3', 'tube2', 20);
  drops(w, 'db_naoh15', 'tube2', 20);
  shake(w, 'tube2', 1.5, 0.4);
  run4(w, 30);
}

function redox(w: P4World) {
  cmd4(w, { type: 'washVessel', id: 'cyl10' });
  measure(w, 'bottle_cuso4', 'cyl10', 2.56);
  pourMl(w, 'cyl10', 'tube3', 3);
  cmd4(w, { type: 'label', id: 'tube3', label: 'C1' });
  cmd4(w, { type: 'inspect', target: 'nail' });
  for (let i = 0; i < 3; i++) cmd4(w, { type: 'sand', id: 'nail' });
  nailInto(w, 'tube3');
  cmd4(w, { type: 'stopwatch', action: 'START' });
  run4(w, 605);
  cmd4(w, { type: 'stopwatch', action: 'STOP' });
}

function magnesium(w: P4World) {
  for (const t of ['extinguisher', 'blanket', 'estop']) cmd4(w, { type: 'inspect', target: t });
  lightBurner(w);
  burnMg(w);
  burnerOff(w);
  run4(w, 240);
  cmd4(w, { type: 'washVessel', id: 'cyl25' });
  cmd4(w, { type: 'squeeze', washId: 'wash', targetId: 'cyl25', rateMlS: 1 });
  run4(w, 5.15);
  cmd4(w, { type: 'stopSqueeze', washId: 'wash' });
  pourMl(w, 'cyl25', 'capsule', 6);
  stir(w, 'capsule', 20);
  drops(w, 'pheno', 'capsule', 2);
  run4(w, 30);
}

function disposeAll(w: P4World) {
  cmd4(w, { type: 'setGloves', on: true });
  cmd4(w, { type: 'checkPh', id: 'beaker' });
  drain(w, 'beaker', 'waste_acidbase');
  drain(w, 'tube1', 'waste_solids');
  drain(w, 'tube2', 'waste_iron');
  const m = w.objects.waste_metals.pose;
  cmd4(w, { type: 'setPose', id: 'nail', pose: pose(m.x, m.y, 2), support: 'disposed:waste_metals' });
  drain(w, 'tube3', 'waste_metals');
  drain(w, 'capsule', 'waste_solids');
  for (const c of ['cyl10', 'cyl25']) cmd4(w, { type: 'washVessel', id: c });
}

function fillNotebook(w: P4World): P4Notebook {
  const nb = emptyP4Notebook();
  const exp = expectedResults(w);
  for (const row of ['A', 'B1', 'B2', 'C1', 'Mg'] as const) {
    for (const [k, v] of Object.entries(exp[row])) (nb[row] as unknown as Record<string, string>)[k] = v[0];
  }
  nb.A.hclVolMl = '5,0';
  nb.A.naohVolMl = '5,0';
  nb.A.tInitial = '23,0 °C';
  nb.A.tFinal = '23,4 °C';
  for (const [id, ref] of Object.entries(EXPERIMENT_REFS) as Array<[ExperimentId, (typeof EXPERIMENT_REFS)[ExperimentId]]>) {
    for (const k of ref.kinds) {
      nb.eq[id][k] = k === 'MOLECULAR' ? eq(ref.molecular) : k === 'NET_IONIC' ? eq(ref.net) : k === 'COMPLETE_IONIC' ? eq(completeIonic(id), ref.spectators) : k === 'OXIDATION' ? eq(ref.oxidation!) : eq(ref.reduction!);
    }
  }
  for (const q of ['q1', 'q2', 'q3', 'q4', 'q5', 'q6'] as const) nb.analysis[q] = 'Respuesta argumentada del estudiante con los cálculos.';
  nb.complexes.read = true;
  return nb;
}

describe('§28.6 integración — Práctica 4', () => {
  it('1. ruta ideal completa: evidencia, máquina por etapas, entrega permitida y evaluación alta', () => {
    const w = world4({ seed: 2025 });
    const ctx = ctx4(w);
    const t0 = globalTotals(w, ctx);
    cmd4(w, { type: 'confirmPpe' });
    // La app calcula la evidencia en cada tic del flujo; aquí, al terminar cada módulo.
    for (const phase of [neutralization, precipitations, redox, magnesium, disposeAll]) {
      phase(w);
      p4StageEvidence(w, emptyP4Notebook());
    }
    run4(w, 2);
    expect(isLit(w.gas)).toBe(false);
    expect(submissionBlockers(w, ctx)).toEqual([]);
    const nb = fillNotebook(w);
    const eqs = allEquations(w, nb);
    expect(eqs.filter((e) => !e.v?.ok).map((e) => `${e.id}/${e.kind}: ${e.v?.errors.map((x) => x.code).join(',')}`)).toEqual([]);
    const flags = p4StageEvidence(w, nb);
    expect(Object.entries(flags).filter(([, v]) => !v).map(([k]) => k)).toEqual([]);
    const actor = createActor(practice4Machine).start();
    actor.send({ type: 'START' });
    actor.send({ type: 'PPE_CONFIRMED' });
    actor.send({ type: 'EVIDENCE', flags });
    expect(p4StageName(actor.getSnapshot().value)).toBe('NOTEBOOK');
    const ev = evaluateP4(w, nb, { ppeConfirmed: true });
    const missed = ev.components.flatMap((c) => c.items.filter((i) => i.ok === false).map((i) => i.key));
    expect(missed).toEqual([]);
    expect(ev.total).toBeGreaterThan(0.9);
    // Conservación de átomos y carga en todo el recorrido (también desechos, humo y aire).
    const t1 = globalTotals(w, ctx);
    for (const k of Object.keys(t0)) expect(Math.abs((t1[k] ?? 0) - t0[k]) <= 1e-12 || Math.abs((t1[k] ?? 0) - t0[k]) / Math.abs(t0[k]) < 1e-9, k).toBe(true);
  });

  it('2. NaOH de concentración equivocada (0,15 M) en la neutralización: equivalencia antes de 5,0 mL y mezcla rosada', () => {
    const w = world4({ seed: 31 });
    cmd4(w, { type: 'confirmPpe' });
    // El estudiante usa el gotero del NaOH 0,15 M para llenar la probeta.
    measure(w, 'bottle_hcl', 'cyl10', 5.06);
    pourMl(w, 'cyl10', 'beaker', 6);
    drops(w, 'pheno', 'beaker', 2);
    pourMl(w, 'db_naoh15', 'cyl25', 5.12);
    pourMl(w, 'cyl25', 'beaker', 6);
    stir(w, 'beaker', 6);
    expect(vesselPH(w.vessels.beaker)).toBeGreaterThan(11);
    expect(vesselAppearance(w, ctx4(w), 'beaker')!.pinkBulk).toBeGreaterThan(0.3);
    expect(expectedResults(w).A.colorFinal).not.toContain('incolora');
    const ev = evaluateP4(w, emptyP4Notebook(), { ppeConfirmed: true });
    expect(ev.components[0].items.find((i) => i.key === 'p4.reagents')!.ok).toBe(false);
  });

  it('3. precipitación parcial del Fe³⁺ explicada con las cantidades reales (1:3)', () => {
    const w = world4({ seed: 32 });
    cmd4(w, { type: 'confirmPpe' });
    drops(w, 'db_fecl3', 'tube2', 20);
    drops(w, 'db_naoh15', 'tube2', 20);
    run4(w, 20);
    const msgs: string[] = [];
    const sink = { toast: (_l: string, txt: string) => msgs.push(txt), caption: () => undefined, stage: null, settings: { captions: false } };
    p4LiveFeedback(w, 'PRACTICE', 'a3', sink);
    const m = msgs.find((x) => x.includes('amarillo'));
    expect(m).toBeDefined();
    expect(m).toMatch(/1:3/);
    expect(expectedResults(w).B2.limiting).toEqual(['OH-']);
    expect(expectedResults(w).B2.supernatant).toEqual(['amarillo']);
    // En evaluación no hay pistas.
    const quiet: string[] = [];
    p4LiveFeedback(w, 'EVALUATION', 'a3e', { ...sink, toast: (_l: string, t: string) => quiet.push(t) });
    expect(quiet).toEqual([]);
  });

  it('4. gotero contaminado con ácido: el resto de HCl va al frasco, consume CO₃²⁻ (→ HCO₃⁻) y deja menos CaCO₃; con más ácido, CO₂', () => {
    const clean = world4({ seed: 33 });
    const dirty = world4({ seed: 33, scenarios: ['CONTAMINATED_DROPPER'] });
    for (const w of [clean, dirty]) {
      cmd4(w, { type: 'confirmPpe' });
      drops(w, 'db_na2co3', 'tube1', 20);
      drops(w, 'db_cacl2', 'tube1', 20);
      run4(w, 20);
    }
    expect(dirty.events.map((e) => e.code)).toContain('BOTTLE_CONTAMINATED');
    expect(dirty.vessels.db_na2co3.contaminated).toBe(true);
    expect(speciesMol(dirty.vessels.tube1, 'HCO3-')).toBeGreaterThan(speciesMol(clean.vessels.tube1, 'HCO3-') * 5);
    expect(speciesMol(dirty.vessels.tube1, 'CaCO3(s)')).toBeLessThan(speciesMol(clean.vessels.tube1, 'CaCO3(s)'));
    // Ácido en exceso sobre el carbonato: efervescencia de CO₂ (§9.5 «puede aparecer CO₂»).
    const w = world4({ seed: 33 });
    cmd4(w, { type: 'confirmPpe' });
    drops(w, 'db_na2co3', 'tube1', 10);
    measure(w, 'bottle_hcl', 'cyl10', 3);
    pourMl(w, 'cyl10', 'tube1', 4);
    run4(w, 5);
    expect(w.events.map((e) => e.code)).toContain('GAS_BUBBLES');
    expect(w.vessels.tube1.released['CO2(g)'] ?? 0).toBeGreaterThan(0);
  });

  it('5. clavo oxidado y luego lijado: la reacción se acelera; retirarlo antes de 10 min se advierte', () => {
    const w = world4({ seed: 34, scenarios: ['RUSTY_NAIL'] });
    measure(w, 'bottle_cuso4', 'cyl10', 2.56);
    pourMl(w, 'cyl10', 'tube3', 3);
    nailInto(w, 'tube3');
    run4(w, 120);
    const slow = metalCuMg(w.metals.nail);
    // Retirar (con la pinza), lijar y volver a introducir.
    cmd4(w, { type: 'clamp', tongsId: 'tube_tongs', targetId: 'nail', grip: 0.9 });
    cmd4(w, { type: 'setPose', id: 'nail', pose: pose(220, 12, 20), support: 'tongs:tube_tongs' });
    expect(w.events.map((e) => e.code)).toContain('METAL_REMOVED_EARLY');
    cmd4(w, { type: 'unclamp', tongsId: 'tube_tongs' });
    cmd4(w, { type: 'setPose', id: 'nail', pose: pose(322, 16, 0.3), support: 'bench' });
    for (let i = 0; i < 4; i++) cmd4(w, { type: 'sand', id: 'nail' });
    nailInto(w, 'tube3');
    run4(w, 120);
    expect(metalCuMg(w.metals.nail) - slow).toBeGreaterThan(slow * 1.5);
  });

  it('6. Mg retirado de golpe al encender: se apaga y queda Mg metálico', () => {
    const w = world4({ seed: 35 });
    cmd4(w, { type: 'confirmPpe' });
    lightBurner(w);
    const m = mouthPos(w.gas, ctx4(w).gasCtx);
    cmd4(w, { type: 'acceptMgWarning' });
    cmd4(w, { type: 'setShield', alignment: 1, placed: true });
    cmd4(w, { type: 'setPose', id: 'capsule', pose: pose(m.x + 8, m.y, 0), support: 'bench' });
    cmd4(w, { type: 'clamp', tongsId: 'crucible_tongs', targetId: 'mg1', grip: 0.9 });
    cmd4(w, { type: 'setPose', id: 'mg1', pose: hotPoint(w), support: 'tongs:crucible_tongs' });
    for (let i = 0; i < 80 && w.ribbons.mg1.phase !== 'BRIGHT_COMBUSTION'; i++) step4(w);
    cmd4(w, { type: 'setPose', id: 'mg1', pose: pose(m.x - 30, m.y, 20), support: 'tongs:crucible_tongs' });
    run4(w, 2);
    expect(w.events.map((e) => e.code)).toContain('MG_WENT_OUT');
    expect(w.ribbons.mg1.mgMol).toBeGreaterThan(0);
    expect(w.ribbons.mg1.phase).not.toBe('BRIGHT_COMBUSTION');
  });

  it('7. derrame importante sin limpiar → incidente; limpiarlo con las toallas lo resuelve (balance intacto)', () => {
    const w = world4({ seed: 36 });
    const ctx = ctx4(w);
    const t0 = globalTotals(w, ctx);
    cmd4(w, { type: 'confirmPpe' });
    pourMl(w, 'bottle_hcl', null, 4, 2);
    run4(w, 25);
    expect(w.safety.incident?.code).toBe('SPILL');
    expect(submissionBlockers(w, ctx)).toContain('SPILL');
    for (const s of w.spills) cmd4(w, { type: 'cleanSpill', spillId: s.id });
    expect(cmd4(w, { type: 'acknowledge' }).ok).toBe(true);
    const t1 = globalTotals(w, ctx);
    for (const k of Object.keys(t0)) expect(Math.abs((t1[k] ?? 0) - t0[k]) <= 1e-12 || Math.abs((t1[k] ?? 0) - t0[k]) / Math.abs(t0[k]) < 1e-9).toBe(true);
  });

  it('8. clasificación de residuos: el cobre nunca al desagüe; contenedor equivocado se registra', () => {
    const w = world4({ seed: 37 });
    cmd4(w, { type: 'confirmPpe' });
    measure(w, 'bottle_cuso4', 'cyl10', 2.5);
    const r = cmd4(w, { type: 'setPour', sourceId: 'cyl10', targetId: 'sink', rateMlS: 1, tiltDeg: 70 });
    expect(r.ok).toBe(false);
    expect(r.code).toBe('DRAIN_METALS');
    expect(w.events.map((e) => e.code)).toContain('DRAIN_METALS');
    cmd4(w, { type: 'acknowledge' });
    drain(w, 'cyl10', 'waste_acidbase');
    expect(w.disposals[w.disposals.length - 1].correct).toBe(false);
    expect(w.disposals[w.disposals.length - 1].expected).toBe('waste_metals');
    drops(w, 'db_na2co3', 'tube1', 20);
    drops(w, 'db_cacl2', 'tube1', 20);
    run4(w, 10);
    drain(w, 'tube1', 'waste_solids');
    expect(w.disposals[w.disposals.length - 1].correct).toBe(true);
  });

  it('9. persistencia y reanudación segura; determinismo con la misma semilla', () => {
    const w = world4({ seed: 38 });
    cmd4(w, { type: 'confirmPpe' });
    lightBurner(w);
    measure(w, 'bottle_cuso4', 'cyl10', 2.5);
    pourMl(w, 'cyl10', 'tube3', 3);
    nailInto(w, 'tube3');
    run4(w, 30);
    const saved: P4World = JSON.parse(JSON.stringify(w));
    const cu = metalCuMg(saved.metals.nail);
    // Reanudación (lo hace la app): gas cerrado, sin llama; la reacción lenta no avanzó «con la app cerrada».
    saved.gas.burner.needleGasValve = 0;
    saved.gas.burner.tableGasValve = 0;
    saved.gas.lighter.sparking = false;
    expect(metalCuMg(saved.metals.nail)).toBeCloseTo(cu, 12);
    for (let i = 0; i < 5; i++) step4(saved);
    expect(isLit(saved.gas)).toBe(false);
    const a = world4({ seed: 5 });
    const b = world4({ seed: 5 });
    for (const x of [a, b]) {
      cmd4(x, { type: 'confirmPpe' });
      drops(x, 'db_fecl3', 'tube2', 20);
      drops(x, 'db_naoh15', 'tube2', 20);
      run4(x, 10);
    }
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});

describe('§18.3 bloqueos críticos de seguridad', () => {
  it('no se enciende con la fenolftaleína (etanol) junto al mechero', () => {
    const w = world4({ seed: 41 });
    cmd4(w, { type: 'confirmPpe' });
    const m = mouthPos(w.gas, ctx4(w).gasCtx);
    cmd4(w, { type: 'setPose', id: 'pheno', pose: pose(m.x + 12, m.y, 0), support: 'bench' });
    lightBurner(w);
    expect(isLit(w.gas)).toBe(false);
    expect(w.events.map((e) => e.code)).toContain('ETHANOL_NEAR_FLAME');
    expect(cmd4(w, { type: 'acknowledge' }).ok).toBe(false);
    cmd4(w, { type: 'setPose', id: 'pheno', pose: pose(64, 52, 0), support: 'bench' });
    gas4(w, { type: 'setValve', valve: 'NEEDLE', value: 0 });
    gas4(w, { type: 'setValve', valve: 'TABLE', value: 0 });
    expect(cmd4(w, { type: 'acknowledge' }).ok).toBe(true);
  });

  it('Mg: sin pantalla/advertencia/cápsula se bloquea; la pinza para tubo no sirve; agua sobre Mg caliente se impide', () => {
    const w = world4({ seed: 42 });
    cmd4(w, { type: 'confirmPpe' });
    lightBurner(w);
    expect(cmd4(w, { type: 'clamp', tongsId: 'tube_tongs', targetId: 'mg1', grip: 0.9 }).code).toBe('WRONG_TONGS');
    cmd4(w, { type: 'clamp', tongsId: 'crucible_tongs', targetId: 'mg1', grip: 0.9 });
    cmd4(w, { type: 'setPose', id: 'mg1', pose: hotPoint(w), support: 'tongs:crucible_tongs' });
    run4(w, 3);
    expect(w.safety.block?.code).toBe('MG_SETUP');
    expect(w.ribbons.mg1.phase).toBe('COLD_METAL');
    // Con todo preparado, enciende; el agua sobre el residuo caliente se rechaza.
    const w2 = world4({ seed: 42 });
    cmd4(w2, { type: 'confirmPpe' });
    lightBurner(w2);
    burnMg(w2, 'mg1', { holdS: 5 });
    const r = cmd4(w2, { type: 'squeeze', washId: 'wash', targetId: 'capsule', rateMlS: 1 });
    expect(r.ok).toBe(false);
    expect(w2.events.map((e) => e.code)).toContain('WATER_ON_HOT_MG');
    // Tomar con la mano el residuo caliente: quemadura simulada.
    expect(cmd4(w2, { type: 'pickUp', id: 'capsule', tool: 'HAND' }).code).toBe('BURN');
  });

  it('no se puede entregar con el mechero encendido ni con residuos sin desechar', () => {
    const w = world4({ seed: 43 });
    cmd4(w, { type: 'confirmPpe' });
    lightBurner(w);
    drops(w, 'db_na2co3', 'tube1', 20);
    const b = submissionBlockers(w, ctx4(w));
    expect(b).toContain('FLAME_LIT');
    expect(b).toContain('WASTE_PENDING');
  });
});

describe('§29-13 errores simulables', () => {
  it('al menos 25 errores distintos producen eventos observables', () => {
    const seen = new Set<string>();
    const collect = (w: P4World) => w.events.forEach((e) => e.severity !== 'INFO' && seen.add(e.code));
    const w1 = world4({ seed: 51, scenarios: ['WET_BEAKER', 'DIRTY_TUBE', 'CONTAMINATED_DROPPER'] });
    cmd4(w1, { type: 'confirmPpe' });
    cmd4(w1, { type: 'inspect', target: 'beaker' });
    cmd4(w1, { type: 'inspect', target: 'tube2' });
    pourMl(w1, 'bottle_hcl', null, 0.5); // derrame
    pourMl(w1, 'bottle_hcl', 'tube4', 25); // rebosa
    // Gotero cruzado y gota fuera de un recipiente.
    cmd4(w1, { type: 'aspirate', dropperId: 'dropper_fecl3', sourceId: 'db_fecl3' });
    cmd4(w1, { type: 'aspirate', dropperId: 'dropper_fecl3', sourceId: 'db_naoh15' });
    cmd4(w1, { type: 'drop', dropperId: 'dropper_fecl3', targetId: null });
    cmd4(w1, { type: 'setPose', id: 'dropper_cacl2', pose: pose(160, 52, 1.2), support: 'cap:db_na2co3' });
    drops(w1, 'db_na2co3', 'tube1', 20);
    drops(w1, 'db_cacl2', 'tube1', 20);
    shake(w1, 'tube1', 3, 1);
    cmd4(w1, { type: 'setPose', id: 'tube5', pose: { x: 200, y: 30, z: 0, rotationRad: 0, quat: [0.7, 0, 0, 0.7] }, support: 'bench' });
    cmd4(w1, { type: 'setPose', id: 'tube1', pose: { x: 200, y: 30, z: 0, rotationRad: 0, quat: [0.7, 0, 0, 0.7] }, support: 'bench' });
    cmd4(w1, { type: 'impact', id: 'tube6', speedCmS: 400 });
    // Metal en disolución sin Cu²⁺, retirado pronto; sonda en el fondo.
    nailInto(w1, 'tube2');
    run4(w1, 20);
    cmd4(w1, { type: 'setPose', id: 'nail', pose: pose(300, 20, 0.2), support: 'bench' });
    cmd4(w1, { type: 'setPose', id: 'probe', pose: pose(96, 28, 0.27), support: 'in:beaker' });
    run4(w1, 30);
    drain(w1, 'beaker', 'waste_metals');
    collect(w1);
    const w2 = world4({ seed: 52 });
    cmd4(w2, { type: 'confirmPpe' });
    const m = mouthPos(w2.gas, ctx4(w2).gasCtx);
    cmd4(w2, { type: 'setPose', id: 'pheno', pose: pose(m.x + 10, m.y, 0), support: 'bench' });
    lightBurner(w2); // etanol cerca: bloqueo
    cmd4(w2, { type: 'setPose', id: 'pheno', pose: pose(64, 52, 0), support: 'bench' });
    gas4(w2, { type: 'setValve', valve: 'TABLE', value: 0 });
    gas4(w2, { type: 'setValve', valve: 'NEEDLE', value: 0 });
    cmd4(w2, { type: 'acknowledge' });
    gas4(w2, { type: 'setValve', valve: 'AIR', value: 0.6 });
    gas4(w2, { type: 'setValve', valve: 'TABLE', value: 1 });
    gas4(w2, { type: 'setValve', valve: 'NEEDLE', value: 0.4 });
    run4(w2, 12); // gas sin llama
    gas4(w2, { type: 'setPose', id: 'lighter', pose: pose(m.x + 1, m.y, m.z + 0.6), support: 'hand' });
    gas4(w2, { type: 'spark', on: true });
    run4(w2, 1);
    gas4(w2, { type: 'spark', on: false });
    gas4(w2, { type: 'setValve', valve: 'NEEDLE', value: 0 });
    gas4(w2, { type: 'setValve', valve: 'TABLE', value: 0 });
    cmd4(w2, { type: 'acknowledge' });
    gas4(w2, { type: 'acknowledge' });
    run4(w2, 30);
    lightBurner(w2);
    cmd4(w2, { type: 'clamp', tongsId: 'tube_tongs', targetId: 'mg1', grip: 0.9 }); // pinza equivocada
    cmd4(w2, { type: 'setPose', id: 'mg1', pose: hotPoint(w2), support: 'hand' }); // Mg con la mano
    run4(w2, 1);
    cmd4(w2, { type: 'setPose', id: 'mg1', pose: pose(384, 26, 0.35), support: 'dish' });
    cmd4(w2, { type: 'acknowledge' });
    cmd4(w2, { type: 'clamp', tongsId: 'crucible_tongs', targetId: 'mg1', grip: 0.9 });
    cmd4(w2, { type: 'setPose', id: 'mg1', pose: hotPoint(w2), support: 'tongs:crucible_tongs' });
    run4(w2, 1); // sin pantalla ni advertencia
    cmd4(w2, { type: 'acceptMgWarning' });
    cmd4(w2, { type: 'setShield', alignment: 1, placed: true });
    cmd4(w2, { type: 'setPose', id: 'capsule', pose: pose(m.x + 30, m.y + 20, 0), support: 'bench' });
    run4(w2, 1); // cápsula lejos
    cmd4(w2, { type: 'setPose', id: 'capsule', pose: pose(m.x + 18, m.y, 0), support: 'bench' });
    cmd4(w2, { type: 'acknowledge' });
    cmd4(w2, { type: 'setMgView', inView: true, shielded: false });
    run4(w2, 6);
    cmd4(w2, { type: 'unclamp', tongsId: 'crucible_tongs' });
    cmd4(w2, { type: 'pickUp', id: 'mg1', tool: 'HAND' });
    collect(w2);
    // Desagüe con cobre, efervescencia, derrame limpiado sin guantes, residuo de Mg sin cápsula.
    const w3 = world4({ seed: 53 });
    cmd4(w3, { type: 'confirmPpe' });
    measure(w3, 'bottle_cuso4', 'cyl10', 2);
    cmd4(w3, { type: 'setPour', sourceId: 'cyl10', targetId: 'sink', rateMlS: 1, tiltDeg: 70 });
    cmd4(w3, { type: 'acknowledge' });
    drops(w3, 'db_na2co3', 'tube1', 10);
    pourMl(w3, 'bottle_hcl', 'tube1', 3);
    run4(w3, 3);
    pourMl(w3, 'bottle_hcl', null, 3, 2);
    for (const sp of w3.spills) cmd4(w3, { type: 'cleanSpill', spillId: sp.id });
    collect(w3);
    expect(seen.size, [...seen].sort().join(', ')).toBeGreaterThanOrEqual(25);
    // Todos los códigos vistos están en el catálogo documentado o son del mechero de la Práctica 3.
    const catalog = new Set(SIMULATED_ERRORS_P4.map((e) => e.code));
    expect([...seen].filter((c) => catalog.has(c)).length).toBeGreaterThanOrEqual(18);
  });
});
