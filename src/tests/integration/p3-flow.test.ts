/**
 * Práctica 3 — §26.4: pruebas de integración del dominio (recorridos completos, sin escena).
 */
import { describe, expect, it } from 'vitest';
import { createActor } from 'xstate';
import {
  activeEmitters, dispatchFlame, gasFlows, hasOpenFlame, isLit, mouthPos, stepFlame, submissionBlockers,
} from '../../simulation/flame-world/world';
import type { FlameWorld } from '../../simulation/flame-world/types';
import { SOLUTION_ROWS, UNKNOWN_ID, loopIdFor } from '../../practices/practice-03/definition';
import { emptyP3Notebook, BURNER_PARTS, type P3Notebook } from '../../practices/practice-03/notebook';
import { p3StageEvidence } from '../../practices/practice-03/evidence';
import { practice3Machine, p3StageName } from '../../practices/practice-03/workflow.machine';
import { evaluateP3, expectedFor, regionToNotebook } from '../../practices/practice-03/rubric';
import { BASIC_UNKNOWN_POOL } from '../../practices/practice-03/unknown-generator';
import {
  capsuleToFlame, capsuleToTile, cmd3, ctx3, ignite, loadLoop, loopToFlame, loopToHolder, makeBlue, pose, precheck, run3, shutdown, world3,
} from '../helpers3';

/** Llena la libreta con lo que REALMENTE se observó (como haría un estudiante cuidadoso). */
function recordObservations(w: FlameWorld, nb: P3Notebook) {
  nb.table32.initial = { color: 'amarillo', shape: 'irregular', luminosity: 'luminosa', soot: '', interpretation: 'Combustión incompleta', updatedAt: 1 };
  nb.table32.capsule1 = { color: 'amarillo', shape: 'irregular', luminosity: 'luminosa', soot: 'negro', interpretation: 'Depósito de carbono', updatedAt: 1 };
  nb.table32.airOpen = { color: 'azul', shape: 'dos_conos', luminosity: 'no_luminosa', soot: '', interpretation: 'Combustión completa', updatedAt: 1 };
  nb.table32.capsule2 = { color: 'azul', shape: 'dos_conos', luminosity: 'no_luminosa', soot: 'no', interpretation: 'Sin hollín', updatedAt: 1 };
  for (const r of SOLUTION_ROWS) {
    const o = w.observations[r];
    nb.table33[r] = {
      solutionColor: w.solutions[r].displayColor === 0xf4f8fb ? 'incolora' : 'azul_verdosa_palida',
      noFilter: regionToNotebook(o.noFilter?.region),
      filter: regionToNotebook(o.filter?.region),
      intensity: 'intensa_breve',
      observations: '',
      updatedAt: 1,
    };
  }
  for (const q of ['q1', 'q2', 'q3', 'q4', 'q5', 'q6', 'q7'] as const) nb.questions[q] = 'Respuesta argumentada del estudiante con detalle.';
}

/** Prueba completa de una disolución: comprobar asa limpia, cargar, llama sin filtro y con filtro, guardar. */
function testSolution(w: FlameWorld, sol: string, slot: number) {
  const loop = loopIdFor(sol);
  loopToFlame(w, loop, 2.5); // comprobación de limpieza
  run3(w, 0);
  cmd3(w, { type: 'setPose', id: loop, pose: pose(150, 20, 25), support: 'hand' });
  run3(w, 12); // enfriar antes de sumergir
  loadLoop(w, sol);
  loopToFlame(w, loop, 5);
  cmd3(w, { type: 'setPose', id: loop, pose: pose(150, 20, 25), support: 'hand' });
  run3(w, 12);
  loadLoop(w, sol);
  cmd3(w, { type: 'setFilterAlignment', alignment: 1, distanceCm: 30 });
  loopToFlame(w, loop, 5);
  cmd3(w, { type: 'setFilterAlignment', alignment: 0, distanceCm: 30 });
  cmd3(w, { type: 'setPose', id: loop, pose: pose(150, 20, 25), support: 'hand' });
  run3(w, 12);
  loopToHolder(w, loop, slot);
}

function idealRun(seed = 2024) {
  const w = world3({ seed });
  const nb = emptyP3Notebook();
  precheck(w);
  for (const p of BURNER_PARTS) cmd3(w, { type: 'identifyPart', part: p, answer: p });
  ignite(w);
  // Altura ~10 cm en llama amarilla.
  run3(w, 4);
  capsuleToFlame(w);
  run3(w, 10);
  capsuleToTile(w);
  makeBlue(w);
  run3(w, 4);
  run3(w, 300); // la cápsula se enfría sobre el soporte
  for (let i = 0; i < 3; i++) cmd3(w, { type: 'wipeCapsule' });
  capsuleToFlame(w, 4);
  run3(w, 8);
  capsuleToTile(w);
  SOLUTION_ROWS.forEach((s, i) => testSolution(w, s, i));
  nb.unknown.identity = w.unknown.cation;
  nb.unknown.justification = 'Color de llama comparado con los patrones, con y sin vidrio de cobalto.';
  shutdown(w);
  run3(w, 400);
  recordObservations(w, nb);
  return { w, nb };
}

describe('§26.4 integración', () => {
  it('1. ruta completa ideal con apagado seguro y avance de la máquina por evidencia', () => {
    const { w, nb } = idealRun();
    expect(submissionBlockers(w)).toEqual([]);
    expect(isLit(w)).toBe(false);
    const flags = p3StageEvidence(w, nb);
    for (const [k, v] of Object.entries(flags)) expect(v, k).toBe(true);
    const actor = createActor(practice3Machine).start();
    actor.send({ type: 'START' });
    actor.send({ type: 'PPE_CONFIRMED' });
    actor.send({ type: 'EVIDENCE', flags });
    expect(p3StageName(actor.getSnapshot().value)).toBe('NOTEBOOK');
    const ev = evaluateP3(w, nb, { ppeConfirmed: true });
    const failed = ev.components.flatMap((c) => c.items.filter((i) => i.ok === false).map((i) => i.key));
    expect(failed).toEqual([]);
    expect(ev.total).toBeGreaterThan(0.85);
    // La libreta coincide con la referencia en todas las filas conocidas.
    for (const r of SOLUTION_ROWS) expect(expectedFor(w, r).noFilter, r).toContain(nb.table33[r].noFilter);
  });

  it('2. encendido con aire abierto y recuperación correcta', () => {
    const w = world3({ seed: 11 });
    precheck(w);
    cmd3(w, { type: 'setValve', valve: 'AIR', value: 1 });
    const m = mouthPos(w, ctx3);
    cmd3(w, { type: 'setValve', valve: 'TABLE', value: 1 });
    cmd3(w, { type: 'setPose', id: 'lighter', pose: pose(m.x + 1, m.y, m.z + 0.6), support: 'hand' });
    cmd3(w, { type: 'spark', on: true });
    cmd3(w, { type: 'setValve', valve: 'NEEDLE', value: 0.25 });
    run3(w, 0.5);
    cmd3(w, { type: 'spark', on: false });
    const codes = w.events.map((e) => e.code);
    expect(codes).toContain('IGNITION_AIR_OPEN');
    expect(['FLASHBACK', 'LIFTED']).toContain(w.burner.flameState);
    // Recuperación: cerrar gas, cerrar aire, repetir según la guía.
    cmd3(w, { type: 'setValve', valve: 'NEEDLE', value: 0 });
    cmd3(w, { type: 'setValve', valve: 'AIR', value: 0 });
    run3(w, 3);
    expect(isLit(w)).toBe(false);
    ignite(w);
    expect(w.burner.flameState).toBe('YELLOW_LUMINOUS');
  });

  it('3. fuga de manguera detectada antes de encender (inspección y agua jabonosa)', () => {
    const w = world3({ scenarios: ['CRACKED_HOSE'] });
    cmd3(w, { type: 'confirmPpe' });
    cmd3(w, { type: 'inspect', target: 'hose' });
    expect(w.hose.crackFound).toBe(true);
    cmd3(w, { type: 'connectHose', connected: true });
    cmd3(w, { type: 'setValve', valve: 'TABLE', value: 1 });
    cmd3(w, { type: 'soapTest' });
    expect(w.events.map((e) => e.code)).toContain('SOAP_BUBBLES');
    expect(gasFlows(w).leak).toBeGreaterThan(0);
    // No buscar fugas con llama: chispa junto a la manguera → bloqueo.
    const mid = w.hose.mid;
    cmd3(w, { type: 'setPose', id: 'lighter', pose: pose(mid.x, mid.y, mid.z + 1), support: 'hand' });
    cmd3(w, { type: 'spark', on: true });
    expect(w.safety.block?.code).toBe('LEAK_FLAME_TEST');
    cmd3(w, { type: 'spark', on: false });
    expect(cmd3(w, { type: 'replaceHose' }).ok).toBe(false);
    cmd3(w, { type: 'setValve', valve: 'TABLE', value: 0 });
    run3(w, 60);
    expect(cmd3(w, { type: 'acknowledge' }).ok).toBe(true);
    expect(cmd3(w, { type: 'replaceHose' }).ok).toBe(true);
    expect(w.hose.cracked).toBe(false);
  });

  it('4. el gas acumulado obliga a cerrar y ventilar antes de encender', () => {
    const w = world3();
    precheck(w);
    cmd3(w, { type: 'setExtraction', on: false });
    cmd3(w, { type: 'setValve', valve: 'TABLE', value: 1 });
    cmd3(w, { type: 'setValve', valve: 'NEEDLE', value: 0.6 });
    run3(w, 25);
    const m = mouthPos(w, ctx3);
    cmd3(w, { type: 'setPose', id: 'lighter', pose: pose(m.x + 1, m.y, m.z + 0.6), support: 'hand' });
    cmd3(w, { type: 'spark', on: true });
    run3(w, 0.5);
    cmd3(w, { type: 'spark', on: false });
    expect(isLit(w)).toBe(false);
    expect(w.events.map((e) => e.code)).toContain('IGNITION_BLOCKED');
    expect(cmd3(w, { type: 'acknowledge' }).code).toBe('CLOSE_VALVES_FIRST');
    cmd3(w, { type: 'setValve', valve: 'NEEDLE', value: 0 });
    cmd3(w, { type: 'setValve', valve: 'TABLE', value: 0 });
    expect(cmd3(w, { type: 'acknowledge' }).code).toBe('VENTILATE_FIRST');
    cmd3(w, { type: 'setExtraction', on: true });
    run3(w, 90);
    expect(cmd3(w, { type: 'acknowledge' }).ok).toBe(true);
    ignite(w);
    expect(isLit(w)).toBe(true);
  });

  it('5. comparación de cápsula amarilla/azul; el hollín residual no se atribuye a la segunda llama', () => {
    const w = world3();
    precheck(w);
    ignite(w);
    capsuleToFlame(w);
    run3(w, 10);
    capsuleToTile(w);
    makeBlue(w);
    run3(w, 300);
    cmd3(w, { type: 'wipeCapsule' }); // limpieza insuficiente: una pasada
    capsuleToFlame(w, 4);
    run3(w, 8);
    capsuleToTile(w);
    const blueSoot = w.capsule.sootByRegimeMg.BLUE_STABLE ?? 0;
    expect(w.capsule.sootMassMg).toBeGreaterThan(0.1); // sigue visible
    expect(blueSoot).toBeLessThan(0.05); // no lo produjo la llama azul
    const ev = evaluateP3(w, emptyP3Notebook(), { ppeConfirmed: true });
    const comb = ev.components.find((c) => c.id === 'p3combustion')!;
    expect(comb.items.find((i) => i.key === 'p3.cleanBetween')!.ok).toBe(false);
  });

  it('6. contaminación por sodio detectada en la comprobación y limpieza exitosa (asa compartida + HCl)', () => {
    const w = world3({ params: { loopMode: 'SHARED' } });
    precheck(w);
    ignite(w);
    makeBlue(w);
    loadLoop(w, 'sol_nacl', 'loop_shared');
    loopToFlame(w, 'loop_shared', 2);
    // Sin limpiar: todavía quedan residuos de Na en el asa.
    cmd3(w, { type: 'setPose', id: 'loop_shared', pose: pose(150, 20, 25), support: 'hand' });
    run3(w, 0.3);
    // Asa caliente al HCl: advertencia.
    cmd3(w, { type: 'setHcl', open: true });
    const hcl = w.objects.hcl.pose;
    cmd3(w, { type: 'setPose', id: 'loop_shared', pose: pose(hcl.x, hcl.y, hcl.z + 2), support: 'hand' });
    stepFlame(w, ctx3);
    expect(w.events.map((e) => e.code)).toContain('HOT_LOOP_IN_HCL');
    cmd3(w, { type: 'setPose', id: 'loop_shared', pose: pose(hcl.x, hcl.y + 10, hcl.z + 12), support: 'hand' });
    run3(w, 15);
    for (let cycle = 0; cycle < 3; cycle++) {
      cmd3(w, { type: 'setPose', id: 'loop_shared', pose: pose(hcl.x, hcl.y, hcl.z + 2), support: 'hand' });
      run3(w, 2);
      const r = w.objects.rinse.pose;
      cmd3(w, { type: 'setPose', id: 'loop_shared', pose: pose(r.x, r.y, r.z + 2), support: 'hand' });
      run3(w, 2);
      loopToFlame(w, 'loop_shared', 3);
      cmd3(w, { type: 'setPose', id: 'loop_shared', pose: pose(150, 20, 25), support: 'hand' });
      run3(w, 15);
    }
    cmd3(w, { type: 'setHcl', open: false });
    loopToFlame(w, 'loop_shared', 2.5);
    expect(w.loops.loop_shared.checkedClean).toBe(true);
    expect(w.loops.loop_shared.isCleanForTest).toBe(true);
  });

  it('6b. un asa contaminada (escenario) da señal amarilla antes de tocar la muestra', () => {
    const w = world3({ scenarios: ['CONTAMINATED_LOOP'] });
    precheck(w);
    ignite(w);
    makeBlue(w);
    loopToFlame(w, 'loop_kcl', 1.5);
    expect(w.events.map((e) => e.code)).toContain('LOOP_CONTAMINATED_SIGNAL');
    expect(w.loops.loop_kcl.checkedClean).toBe(false);
    const sp = cmd3(w, { type: 'requestSpareLoop', solutionId: 'sol_kcl' });
    expect(sp.ok).toBe(true);
    expect(w.loops[sp.id!].isCleanForTest).toBe(true);
  });

  it('7. mezcla Na/K: sin filtro domina el amarillo; con vidrio se revela el K', () => {
    const w = world3();
    precheck(w);
    ignite(w);
    makeBlue(w);
    loadLoop(w, 'sol_mix');
    loopToFlame(w, 'loop_mix', 4);
    cmd3(w, { type: 'setPose', id: 'loop_mix', pose: pose(150, 20, 25), support: 'hand' });
    run3(w, 12);
    loadLoop(w, 'sol_mix');
    cmd3(w, { type: 'setFilterAlignment', alignment: 1, distanceCm: 30 });
    loopToFlame(w, 'loop_mix', 4);
    const o = w.observations.sol_mix;
    expect(o.noFilter?.region).toMatch(/amarillo|anaranjado/);
    expect(['violeta', 'lila']).toContain(o.filter?.region);
    expect(o.noFilter!.sodiumShare).toBeGreaterThan(0.6);
  });

  it('8. identificación correcta de cada una de las seis posibles incógnitas', () => {
    const found = new Map<string, number>();
    for (let s = 1; found.size < 6 && s < 400; s++) {
      const w = world3({ seed: s });
      if (!found.has(w.unknown.cation)) found.set(w.unknown.cation, s);
    }
    expect([...found.keys()].sort()).toEqual([...BASIC_UNKNOWN_POOL].sort());
    for (const [cation, seed] of found) {
      const w = world3({ seed });
      precheck(w);
      ignite(w);
      makeBlue(w);
      const loop = loopIdFor(UNKNOWN_ID);
      loadLoop(w, UNKNOWN_ID, loop);
      loopToFlame(w, loop, 4);
      const obs = w.observations[UNKNOWN_ID].noFilter!;
      // Comparar con los patrones conocidos: la región coincide con la esperada para su catión.
      expect(expectedFor(w, UNKNOWN_ID).noFilter, cation).toContain(regionToNotebook(obs.region));
      // El color del tubo no revela la identidad (salvo el Cu, muy pálido).
      if (cation !== 'Cu2+') expect(w.solutions[UNKNOWN_ID].displayColor).toBe(w.solutions.sol_nacl.displayColor);
      // El rótulo no contiene la identidad.
      expect(w.solutions[UNKNOWN_ID].label).not.toMatch(/Na|K|Li|Ca|Cu|Ba/);
    }
  });

  it('9. persistencia: JSON → mundo idéntico y reanudación en estado seguro', () => {
    const w = world3({ seed: 99 });
    precheck(w);
    ignite(w);
    run3(w, 3);
    const saved: FlameWorld = JSON.parse(JSON.stringify(w));
    expect(saved.unknown).toEqual(w.unknown);
    // Reanudación segura (lo hace la capa de la app): se cierran válvulas y se apaga.
    saved.burner.needleGasValve = 0;
    saved.burner.tableGasValve = 0;
    saved.lighter.sparking = false;
    for (let i = 0; i < 5; i++) stepFlame(saved, ctx3);
    expect(isLit(saved)).toBe(false);
    // Determinismo: misma semilla + mismos comandos ⇒ mismo resultado.
    const a = world3({ seed: 5 });
    const b = world3({ seed: 5 });
    for (const x of [a, b]) {
      precheck(x);
      ignite(x);
      makeBlue(x);
      loadLoop(x, 'sol_licl');
      loopToFlame(x, 'loop_licl', 3);
    }
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('10. ruta opcional con atomizador', () => {
    const w = world3({ params: { atomizerEnabled: true } });
    precheck(w);
    ignite(w);
    makeBlue(w);
    const m = mouthPos(w, ctx3);
    // Apuntado hacia la llama a ~20 cm.
    cmd3(w, { type: 'setPose', id: 'atom_nacl', pose: pose(m.x - 20, m.y, m.z + 5 - 9), support: 'hand' });
    cmd3(w, { type: 'setAtomizerYaw', id: 'atom_nacl', yawRad: 0 });
    cmd3(w, { type: 'spray', atomizerId: 'atom_nacl' });
    stepFlame(w, ctx3);
    expect(w.atomizers.atom_nacl.lastHitFraction).toBeGreaterThan(0.5);
    expect(activeEmitters(w, ctx3).some((e) => e.id === 'atom_nacl')).toBe(true);
    // Mal orientado: aerosol fuera de la llama.
    cmd3(w, { type: 'setAtomizerYaw', id: 'atom_nacl', yawRad: Math.PI / 2 });
    cmd3(w, { type: 'spray', atomizerId: 'atom_nacl' });
    expect(w.events.map((e) => e.code)).toContain('ATOMIZER_MISSED');
    // Hacia el estudiante: alerta.
    cmd3(w, { type: 'setAtomizerYaw', id: 'atom_nacl', yawRad: -Math.PI / 2 });
    cmd3(w, { type: 'spray', atomizerId: 'atom_nacl' });
    expect(w.events.map((e) => e.code)).toContain('ATOMIZER_TOWARD_PERSON');
    run3(w, 5);
    expect(activeEmitters(w, ctx3).some((e) => e.id === 'atom_nacl')).toBe(false);
  });

  it('la práctica no puede entregarse con gas abierto ni material caliente mal dispuesto', () => {
    const w = world3();
    precheck(w);
    ignite(w);
    capsuleToFlame(w);
    run3(w, 8);
    cmd3(w, { type: 'setPose', id: 'capsule', pose: pose(260, 30, 0), support: 'bench' });
    cmd3(w, { type: 'unclamp', tongsId: 'tongs' });
    cmd3(w, { type: 'setValve', valve: 'NEEDLE', value: 0 });
    run3(w, 1);
    const b = submissionBlockers(w);
    expect(b).toContain('TABLE_OPEN');
    expect(b).toContain('HOT_CAPSULE');
    expect(hasOpenFlame(w)).toBe(false);
    expect(w.events.map((e) => e.code)).toContain('HOT_ON_BENCH');
  });

  it('al menos 20 errores simulables producen eventos observables (§27-13)', () => {
    const seen = new Set<string>();
    const collect = (w: FlameWorld) => w.events.forEach((e) => e.severity !== 'INFO' && seen.add(e.code));
    // Varias rutas con errores deliberados.
    const w1 = world3({ seed: 3, scenarios: ['CRACKED_HOSE'] });
    dispatchFlame(w1, { type: 'confirmPpe' }, ctx3);
    cmd3(w1, { type: 'inspect', target: 'hose' });
    cmd3(w1, { type: 'connectHose', connected: true });
    cmd3(w1, { type: 'setValve', valve: 'TABLE', value: 1 });
    cmd3(w1, { type: 'soapTest' });
    cmd3(w1, { type: 'setValve', valve: 'NEEDLE', value: 0.9 });
    run3(w1, 30);
    cmd3(w1, { type: 'connectHose', connected: false });
    collect(w1);
    const w2 = world3({ seed: 4 });
    precheck(w2);
    cmd3(w2, { type: 'setValve', valve: 'AIR', value: 0.5 });
    ignite(w2, 0.95);
    run3(w2, 4);
    cmd3(w2, { type: 'setValve', valve: 'AIR', value: 0 });
    cmd3(w2, { type: 'setValve', valve: 'NEEDLE', value: 0.3 });
    run3(w2, 1);
    cmd3(w2, { type: 'setPose', id: 'glass', pose: optimal(w2), support: 'hand' });
    capsuleToFlame(w2, 1);
    run3(w2, 50);
    cmd3(w2, { type: 'setPose', id: 'capsule', pose: pose(260, 30, 0), support: 'bench' });
    cmd3(w2, { type: 'unclamp', tongsId: 'tongs' });
    cmd3(w2, { type: 'wipeCapsule' });
    cmd3(w2, { type: 'pickUp', id: 'capsule', tool: 'HAND' });
    cmd3(w2, { type: 'firstAid' });
    cmd3(w2, { type: 'acknowledge' });
    makeBlue(w2);
    loadLoop(w2, 'sol_nacl', 'loop_kcl', 3); // asa equivocada y sobrecargada
    loopToFlame(w2, 'loop_kcl', 3);
    loadLoop(w2, 'sol_kcl', 'loop_kcl'); // asa caliente al tubo
    cmd3(w2, { type: 'setPose', id: 'loop_licl', pose: pose(150, 20, 25), support: 'hand' });
    cmd3(w2, { type: 'setPose', id: 'loop_nacl', pose: pose(150.2, 20, 25), support: 'hand' });
    run3(w2, 0.5);
    cmd3(w2, { type: 'setPose', id: 'sol_bacl2', pose: { x: 100, y: 30, z: 0, rotationRad: 0, quat: [0.7, 0, 0, 0.7] }, support: 'bench' });
    cmd3(w2, { type: 'setPose', id: 'burner', pose: pose(205, 30, 0), support: 'hand' });
    run3(w2, 12);
    collect(w2);
    const w3 = world3({ seed: 5, params: { atomizerEnabled: true, loopMode: 'SHARED' } });
    precheck(w3);
    cmd3(w3, { type: 'setExtraction', on: false });
    ignite(w3);
    w3.room.draft = 0.9;
    cmd3(w3, { type: 'setAtomizerYaw', id: 'atom_kcl', yawRad: -Math.PI / 2 });
    cmd3(w3, { type: 'spray', atomizerId: 'atom_kcl' });
    cmd3(w3, { type: 'setHcl', open: true });
    loadLoop(w3, 'sol_nacl', 'loop_shared');
    loopToFlame(w3, 'loop_shared', 2);
    w3.hose.mid = { ...mouthPos(w3, ctx3), z: mouthPos(w3, ctx3).z + 4 };
    cmd3(w3, { type: 'setValve', valve: 'NEEDLE', value: 0.2 });
    run3(w3, 65);
    collect(w3);
    expect(seen.size, [...seen].join(', ')).toBeGreaterThanOrEqual(20);
  });
});

function optimal(w: FlameWorld) {
  const m = mouthPos(w, ctx3);
  return pose(m.x, m.y, m.z + 3);
}

// Silencia el uso de loopToHolder si cambia la ruta ideal.
void loopToHolder;
