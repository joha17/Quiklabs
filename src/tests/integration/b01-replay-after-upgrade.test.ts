/**
 * B01 — compatibilidad con intentos anteriores a la manipulación directa (§6.2, B01-OPT-07): las cintas viejas (sin
 * gestos, revólver sin `grip`, binocular sin `device`) se repiten igual, y un mundo guardado antes del cabezal
 * binocular del compuesto se reanuda con valores por defecto sin mover los mandos ya validados.
 */
import { describe, expect, it } from 'vitest';
import { dispatchB01, microscopeView, stepB01World } from '../../simulation/optical-world/world';
import type { B01Command } from '../../simulation/optical-world/commands';
import { newPracticeB01World } from '../../practices/practice-b01';
import { sanitizeOnResumeB01 } from '../../practices/practice-b01/resume';
import { idealAttemptB01 } from '../helpersB01';

describe('B01 — cintas y mundos de la versión anterior', () => {
  it('los comandos de antes (sin gestos, sin `grip`, sin `device`) se aceptan y la ruta ideal sigue sin errores', () => {
    const replay = newPracticeB01World({ mode: 'PRACTICE', seed: 1101 });
    const legacy: B01Command[] = [
      { type: 'setPPE', item: 'coat', enabled: true }, { type: 'setPPE', item: 'shoes', enabled: true }, { type: 'setPPE', item: 'hair', enabled: true }, { type: 'setPPE', item: 'hands', enabled: true },
      { type: 'startWork' }, { type: 'turnTurret', deltaDeg: 120 }, { type: 'setInterpupillary', valueMm: 60 }, { type: 'setDiopter', side: 'left', value: 1 },
    ];
    for (const c of legacy) expect(dispatchB01(replay, c).ok, c.type).toBe(true);
    expect(microscopeView(replay).objectiveX).toBe(10);
    // Sin `device`, el binocular es el del estereoscopio (como en las cintas anteriores).
    expect(replay.stereo.ipdMm).toBe(60);
    expect(replay.stereo.leftDiopter).toBe(1);
    expect(replay.microscope.ipdMm).toBe(replay.params.stereo.userIpdMm);
    // La ruta ideal (solo comandos de la versión anterior) no comete errores.
    const { w } = idealAttemptB01(1101, []);
    expect(Object.keys(w.evidence).filter((k) => k.startsWith('err:'))).toEqual([]);
  });

  it('un mundo guardado sin cabezal binocular ni gesto se reanuda con valores por defecto y sin mover los mandos', () => {
    const w = newPracticeB01World({ mode: 'PRACTICE', seed: 7 });
    for (const item of ['coat', 'shoes', 'hair', 'hands'] as const) dispatchB01(w, { type: 'setPPE', item, enabled: true });
    dispatchB01(w, { type: 'startWork' });
    dispatchB01(w, { type: 'turnCoarse', deltaTurns: 1.3 });
    dispatchB01(w, { type: 'turnTurret', deltaDeg: 120 });
    const old = JSON.parse(JSON.stringify(w));
    delete old.gesture;
    delete old.microscope.ipdMm;
    delete old.microscope.leftDiopter;
    delete old.microscope.rightDiopter;
    delete old.params.microscope.ipdRangeMm;
    delete old.params.microscope.diopterRange;
    sanitizeOnResumeB01(old);
    expect(old.gesture).toBeNull();
    expect(old.microscope.ipdMm).toBe(old.params.stereo.userIpdMm);
    expect(old.microscope.coarseTurns).toBe(1.3);
    expect(old.microscope.turretDeg).toBe(120);
    expect(dispatchB01(old, { type: 'setInterpupillary', device: 'microscope', valueMm: 70 }).ok).toBe(true);
    stepB01World(old);
    expect(old.microscope.ipdMm).toBe(70);
  });

  it('un gesto interrumpido (reanudación a mitad de un arrastre) termina sin juzgarse dos veces', () => {
    const w = newPracticeB01World({ mode: 'PRACTICE', seed: 9 });
    for (const item of ['coat', 'shoes', 'hair', 'hands'] as const) dispatchB01(w, { type: 'setPPE', item, enabled: true });
    dispatchB01(w, { type: 'startWork' });
    dispatchB01(w, { type: 'gesture', part: 'mic:turret', phase: 'begin' });
    dispatchB01(w, { type: 'turnTurret', deltaDeg: 50 });
    sanitizeOnResumeB01(w);
    expect(w.gesture).toBeNull();
    expect(w.microscope.turretDeg).toBe(50);
    expect(dispatchB01(w, { type: 'gesture', part: 'mic:turret', phase: 'end' }).ok).toBe(true);
    expect(w.evidence['err:E71']).toBeUndefined();
  });
});
