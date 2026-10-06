/**
 * Cinta del intento en la aplicación: el runtime graba cada comando con su tic; el guardado lleva la cola no confirmada
 * (aquí no hay IndexedDB: todo viaja en la cola) y al reanudar la cinta continúa con la marca de reanudación. La
 * repetición de esa cinta llega exactamente al estado del runtime.
 */
import { describe, expect, it } from 'vitest';
import { TapeRecorder } from '../../app/platform/tape';
import { CalorRuntime } from '../../app/p6/runtime';
import { newPractice6World } from '../../practices/practice-06';
import { sanitizeOnResume6 } from '../../practices/practice-06/resume';
import { emptyP6Notebook } from '../../practices/practice-06/notebook';
import { evaluateP6 } from '../../practices/practice-06/rubric';
import { RESUME, replayTape, type TapeEntry } from '../../practices/grading';
import type { P6World } from '../../simulation/calorimetry-world/types';

const frames = (rt: CalorRuntime, s: number, fps = 60) => {
  for (let i = 0; i < s * fps; i++) rt.advance(1 / fps);
};

describe('cinta del intento (TapeRecorder)', () => {
  it('runtime → guardado → reanudación → entrega: la repetición coincide exactamente', async () => {
    const options = { mode: 'PRACTICE' as const, seed: 4321 };
    const tape = TapeRecorder.start('p6', 'p6-3c1-x', options);
    let rt = new CalorRuntime(newPractice6World(options), 'p6-3c1-x');
    rt.tape = tape;
    rt.timeScale = 5;
    rt.dispatch({ type: 'confirmPpe' });
    const p = rt.world.objects.cup.pose;
    for (let i = 0; i < 90; i++) {
      rt.dispatch({ type: 'setPose', id: 'cup', pose: { ...p, x: p.x + i * 0.1, z: 2 }, support: 'hand' });
      rt.advance(1 / 60);
    }
    rt.dispatch({ type: 'setPose', id: 'cup', pose: { ...p, x: p.x + 9 }, support: 'bench' });
    rt.dispatch({ type: 'setPlate', knob: 0.6 });
    frames(rt, 4);
    // Guardado síncrono (como `save()`): el mundo serializado y la cola de la cinta.
    const saved = JSON.parse(JSON.stringify({ world: rt.world, ...rt.tape.forSave() })) as { world: P6World; tapeBase: number; tapeTail: TapeEntry[]; tapeOptions: unknown };
    expect(saved.tapeBase).toBe(0);
    expect(saved.tapeTail.length).toBe(tape.entries.length);
    // Comandos después del guardado que se pierden al cerrar la pestaña.
    rt.dispatch({ type: 'setPlate', knob: 1 });
    frames(rt, 1);

    // Reanudar: estado seguro y cinta con la marca.
    const w = saved.world;
    sanitizeOnResume6(w);
    rt = new CalorRuntime(w, 'p6-3c1-x');
    rt.tape = TapeRecorder.resume('p6', 'p6-3c1-x', w.tick, saved);
    await rt.tape.ready;
    expect(rt.tape.broken).toBe(false);
    rt.timeScale = 5;
    rt.dispatch({ type: 'setPlate', knob: 0.4 });
    rt.dispatch({ type: 'setLid', closed: true });
    frames(rt, 3);

    const t = (await rt.tape.toTape())!;
    expect(t.entries.filter(([, c]) => c === RESUME)).toHaveLength(1);
    expect(t.options).toEqual(options);
    const nb = emptyP6Notebook();
    const snap = JSON.parse(JSON.stringify({ world: { ...rt.world, events: [] }, notebook: nb, ppe: true, mode: 'PRACTICE' }));
    const out = await replayTape(JSON.parse(JSON.stringify(t)), snap, evaluateP6(structuredClone(rt.world), nb));
    expect(out).toMatchObject({ status: 'OK', exactState: true, steps: rt.world.tick });
  });

  it('sin la parte confirmada de la cinta (otro navegador) la cinta queda rota y la entrega no la incluye', async () => {
    const r = TapeRecorder.resume('p6', 'p6-1-x', 100, { tapeBase: 2500, tapeTail: [], tapeOptions: { mode: 'PRACTICE', seed: 1 } });
    await r.ready;
    expect(r.broken).toBe(true);
    expect(await r.toTape()).toBeNull();
    const old = TapeRecorder.resume('p6', 'p6-1-x', 100, {});
    await old.ready;
    expect(await old.toTape()).toBeNull();
  });
});
