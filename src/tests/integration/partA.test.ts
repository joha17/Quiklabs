/**
 * §17.2-1 — Ruta ideal de la Parte A y errores A1–A7; §17.2-8 guardar/recargar.
 */
import { describe, expect, it } from 'vitest';
import { newPracticeWorld } from '../../practices/practice-02';
import { LABEL_TO_SUBSTANCE, tubeLabels } from '../../practices/practice-02/definition';
import { tubeStatus } from '../../simulation/entities/tube';
import type { World } from '../../simulation/entities/types';
import { SUBSTANCES } from '../../practices/practice-02/substances';
import { cmd, lv, pourMl, run, squeezeTo } from '../helpers';
import { filter, heat, prepareSample, setupFilter } from '../routes';
import { partBResults } from '../../practices/practice-02/results';
import { describeVessel } from '../../app/describe';

const JARS = ['jar_zn', 'jar_graphite', 'jar_s', 'jar_nacl', 'jar_sucrose'];

function partA(w: World, opts: { clean?: boolean; shake?: boolean; waterMl?: number; labels?: string[] } = {}) {
  const { clean = true, shake = true, waterMl = 2.0 } = opts;
  const labels = opts.labels ?? tubeLabels(w.params.oilProfile);
  for (let i = 0; i < 6; i++) {
    cmd(w, { type: 'grab', id: `t${i + 1}` });
    cmd(w, { type: 'place', id: `t${i + 1}`, support: `rack:${i}` });
    cmd(w, { type: 'label', vesselId: `t${i + 1}`, label: labels[i] });
  }
  for (let i = 0; i < 5; i++) {
    cmd(w, { type: 'scoop', toolId: 'spatula', sourceId: JARS[i] });
    cmd(w, { type: 'tapTool', toolId: 'spatula', targetId: `t${i + 1}` });
    if (clean) cmd(w, { type: 'cleanTool', toolId: 'spatula' });
  }
  cmd(w, { type: 'aspirate', toolId: 'dropper', sourceId: 'bottle_oil', ml: 0.6 });
  cmd(w, { type: 'dispenseDrops', toolId: 'dropper', targetId: 't6', drops: 10 });
  for (let i = 0; i < 6; i++) {
    squeezeTo(w, 'cyl', waterMl);
    pourMl(w, 'cyl', `t${i + 1}`, 5, 1);
    if (shake) {
      cmd(w, { type: 'setAgitation', vesselId: `t${i + 1}`, intensity: 0.8, tool: 'SHAKE' });
      run(w, 4);
      cmd(w, { type: 'setAgitation', vesselId: `t${i + 1}`, intensity: 0, tool: 'NONE' });
    }
  }
  run(w, 40);
}

const status = (w: World, id: string) => tubeStatus(w, w.vessels[id], SUBSTANCES, LABEL_TO_SUBSTANCE);

describe('§17.2-1 ruta ideal de la Parte A', () => {
  for (const oil of ['OIL_VEG', 'OIL_MIN'] as const) {
    it(`observaciones coherentes con §4.1 (${oil})`, () => {
      const w = newPracticeWorld({ mode: 'PRACTICE', seed: 42, oilProfile: oil });
      partA(w);
      const expected = ['SEDIMENT', 'SEDIMENT', 'FLOATING_PARTICLES', 'CLEAR_SOLUTION', 'CLEAR_SOLUTION', 'TWO_LAYERS'];
      for (let i = 0; i < 6; i++) {
        const s = status(w, `t${i + 1}`);
        expect(s.state, `t${i + 1}`).toBe('OBSERVABLE');
        expect(s.errors, `t${i + 1}`).toEqual([]);
        expect(s.appearance, `t${i + 1}`).toBe(expected[i]);
        expect(s.waterMl).toBeGreaterThan(1.9);
        expect(s.waterMl).toBeLessThan(2.1);
      }
      // El aceite nunca se disuelve (§16).
      expect(Object.keys(w.vessels.t6.mix.dissolved)).toEqual([]);
      expect(w.vessels.t6.mix.oil[oil]).toBeGreaterThan(0.3);
    });
  }

  it('el grafito forma una nube oscura al agitar y luego sedimenta', () => {
    const w = newPracticeWorld({ mode: 'PRACTICE', seed: 4 });
    cmd(w, { type: 'scoop', toolId: 'spatula', sourceId: 'jar_graphite' });
    cmd(w, { type: 'tapTool', toolId: 'spatula', targetId: 't2' });
    squeezeTo(w, 'cyl', 2);
    pourMl(w, 'cyl', 't2', 5, 1);
    cmd(w, { type: 'setAgitation', vesselId: 't2', intensity: 0.9, tool: 'SHAKE' });
    run(w, 3);
    cmd(w, { type: 'setAgitation', vesselId: 't2', intensity: 0, tool: 'NONE' });
    expect(status(w, 't2').appearance).toBe('DARK_CLOUD');
    expect(describeVessel(w, w.vessels.t2)).toContain('suspensión negra');
    run(w, 90);
    expect(status(w, 't2').appearance).toBe('SEDIMENT');
  });

  it('la descripción de una suspensión usa el color del sólido suspendido', () => {
    const w = newPracticeWorld({ mode: 'PRACTICE', seed: 4 });
    for (const [jar, tube] of [['jar_s', 't3'], ['jar_zn', 't1']] as const) {
      cmd(w, { type: 'scoop', toolId: 'spatula', sourceId: jar });
      cmd(w, { type: 'tapTool', toolId: 'spatula', targetId: tube });
      cmd(w, { type: 'cleanTool', toolId: 'spatula' });
      squeezeTo(w, 'cyl', 2);
      pourMl(w, 'cyl', tube, 5, 1);
      cmd(w, { type: 'setAgitation', vesselId: tube, intensity: 0.9, tool: 'SHAKE' });
      run(w, 3);
      cmd(w, { type: 'setAgitation', vesselId: tube, intensity: 0, tool: 'NONE' });
    }
    const s = describeVessel(w, w.vessels.t3);
    const zn = describeVessel(w, w.vessels.t1);
    expect(s).not.toMatch(/oscura|negra/);
    if (s.includes('suspensión')) expect(s).toContain('suspensión amarilla');
    if (zn.includes('suspensión')) expect(zn).toContain('suspensión gris');
  });

  it('el aceite agitado forma emulsión temporal y luego dos fases (A6)', () => {
    const w = newPracticeWorld({ mode: 'PRACTICE', seed: 4 });
    cmd(w, { type: 'aspirate', toolId: 'dropper', sourceId: 'bottle_oil', ml: 0.6 });
    cmd(w, { type: 'dispenseDrops', toolId: 'dropper', targetId: 't6', drops: 10 });
    squeezeTo(w, 'cyl', 2);
    pourMl(w, 'cyl', 't6', 5, 1);
    cmd(w, { type: 'setAgitation', vesselId: 't6', intensity: 0.9, tool: 'SHAKE' });
    run(w, 3);
    cmd(w, { type: 'setAgitation', vesselId: 't6', intensity: 0, tool: 'NONE' });
    expect(status(w, 't6').appearance).toBe('EMULSION');
    expect(status(w, 't6').state).toBe('SETTLING');
    run(w, 60);
    expect(status(w, 't6').appearance).toBe('TWO_LAYERS');
  });
});

describe('§8 errores de la Parte A', () => {
  it('A1 tubo mal rotulado: el resultado sigue la sustancia real', () => {
    const w = newPracticeWorld({ mode: 'PRACTICE', seed: 1 });
    partA(w);
    // Re-rotular después de añadir las muestras (la espátula ya no deja depositar en un tubo con otro rótulo).
    cmd(w, { type: 'label', vesselId: 't4', label: 'sacarosa' });
    cmd(w, { type: 'label', vesselId: 't5', label: 'NaCl' });
    expect(status(w, 't4').errors).toContain('MISLABELED');
    expect(status(w, 't4').sample).toBe('NaCl');
  });

  it('la espátula solo deposita en el tubo rotulado con su sustancia', () => {
    const w = newPracticeWorld({ mode: 'PRACTICE', seed: 1 });
    const labels = tubeLabels('OIL_VEG');
    for (let i = 0; i < 6; i++) cmd(w, { type: 'label', vesselId: `t${i + 1}`, label: labels[i] });
    cmd(w, { type: 'label', vesselId: 't6', label: null });
    cmd(w, { type: 'scoop', toolId: 'spatula', sourceId: 'jar_nacl' });
    const load = w.vessels.spatula.mix.solid.NaCl ?? 0;
    const wrong = cmd(w, { type: 'tapTool', toolId: 'spatula', targetId: 't1' });
    expect(wrong).toMatchObject({ ok: false, code: 'WRONG_TUBE' });
    // Sin rótulo tampoco, si ya existe el tubo de NaCl.
    expect(cmd(w, { type: 'tapTool', toolId: 'spatula', targetId: 't6' })).toMatchObject({ ok: false, code: 'USE_LABELED_TUBE' });
    expect(w.vessels.t1.mix.solid.NaCl ?? 0).toBe(0);
    expect(w.vessels.spatula.mix.solid.NaCl).toBe(load); // la carga sigue en la espátula
    expect(cmd(w, { type: 'tapTool', toolId: 'spatula', targetId: 't4' }).ok).toBe(true);
    expect(w.vessels.t4.mix.solid.NaCl ?? 0).toBeGreaterThan(0);
  });

  it('A2 espátula sin limpiar: contaminación cruzada', () => {
    const w = newPracticeWorld({ mode: 'PRACTICE', seed: 1 });
    partA(w, { clean: false });
    expect(status(w, 't2').contaminants).toContain('Zn');
    expect(status(w, 't2').errors).toContain('CONTAMINATED');
    expect(w.evidence.crossContamination ?? 0).toBeGreaterThan(0);
  });

  it('A3 exceso de sólido: sólido remanente en un soluble (falso «insoluble»)', () => {
    const w = newPracticeWorld({ mode: 'PRACTICE', seed: 1 });
    for (let i = 0; i < 9; i++) {
      cmd(w, { type: 'scoop', toolId: 'spatula', sourceId: 'jar_nacl' });
      cmd(w, { type: 'tapTool', toolId: 'spatula', targetId: 't4' });
    }
    squeezeTo(w, 'cyl', 2);
    pourMl(w, 'cyl', 't4', 5, 1);
    cmd(w, { type: 'setAgitation', vesselId: 't4', intensity: 0.8, tool: 'SHAKE' });
    run(w, 120);
    cmd(w, { type: 'setAgitation', vesselId: 't4', intensity: 0, tool: 'NONE' });
    run(w, 20);
    expect(status(w, 't4').appearance).toBe('SOLID_REMAINING');
  });

  it('A4 menos de 2 mL: más concentrada', () => {
    const w = newPracticeWorld({ mode: 'PRACTICE', seed: 1 });
    partA(w, { waterMl: 1.0 });
    expect(status(w, 't4').waterMl).toBeLessThan(1.1);
  });

  it('A5 sin agitar: observación inconclusa en un soluble', () => {
    const w = newPracticeWorld({ mode: 'PRACTICE', seed: 1 });
    cmd(w, { type: 'scoop', toolId: 'spatula', sourceId: 'jar_sucrose' });
    cmd(w, { type: 'tapTool', toolId: 'spatula', targetId: 't5' });
    squeezeTo(w, 'cyl', 2);
    pourMl(w, 'cyl', 't5', 5, 1);
    run(w, 5);
    expect(status(w, 't5').appearance).toBe('INCONCLUSIVE');
    expect(status(w, 't5').state).toBe('WATER_ADDED');
  });

  it('A7 oler directamente: alerta de seguridad y sin dato; abanicar sí da dato', () => {
    const w = newPracticeWorld({ mode: 'PRACTICE', seed: 1 });
    partA(w);
    const r = cmd(w, { type: 'sniffDirect', vesselId: 't6' });
    expect(r.ok).toBe(false);
    expect(w.events.at(-1)!.code).toBe('SAFETY_DIRECT_SNIFF');
    expect(w.events.some((e) => e.code === 'FAN_RESULT')).toBe(false);
    cmd(w, { type: 'fan', vesselId: 't6' });
    const fan = w.events.at(-1)!;
    expect(fan.code).toBe('FAN_RESULT');
    expect(fan.params?.odor).toBe('FAINT');
    cmd(w, { type: 'fan', vesselId: 't1' });
    expect(w.events.at(-1)!.params?.odor).toBe('NONE');
  });

  it('añadir agua antes de la muestra es una desviación registrada, no un bloqueo', () => {
    const w = newPracticeWorld({ mode: 'PRACTICE', seed: 1 });
    squeezeTo(w, 'cyl', 2);
    pourMl(w, 'cyl', 't4', 5, 1);
    cmd(w, { type: 'scoop', toolId: 'spatula', sourceId: 'jar_nacl' });
    expect(cmd(w, { type: 'tapTool', toolId: 'spatula', targetId: 't4' }).ok).toBe(true);
    expect(status(w, 't4').waterBeforeSample).toBe(true);
  });
});

describe('§17.2-8 guardar, recargar y continuar sin alterar resultados', () => {
  it('JSON ida y vuelta a mitad de la Parte B', () => {
    const a = newPracticeWorld({ mode: 'GUIDED', seed: 77 });
    prepareSample(a);
    heat(a, 60);
    const saved = JSON.stringify(a);
    const b = JSON.parse(saved) as World;
    for (const w of [a, b]) {
      setupFilter(w);
      filter(w);
    }
    expect(JSON.stringify(partBResults(a))).toBe(JSON.stringify(partBResults(b)));
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(lv(a, 'beaker2')).toBeGreaterThan(10);
  });
});
