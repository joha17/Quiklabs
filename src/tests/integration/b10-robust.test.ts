/**
 * B10 — pruebas de robustez: un agente que manda comandos al azar (válidos, en mal orden o basura) y trampas contra la nota.
 * Los invariantes valen para cualquier secuencia: nada revienta, no aparece NaN, la nota queda en [0, 1] y la misma semilla da el mismo mundo.
 */
import { writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { AnimalWorld } from '../../simulation/animal-world/types';
import { SC_B10, dispatchAnimal } from '../../simulation/animal-world/world';
import { microscopeView } from '../../simulation/optical-world/world';
import { CLEAN_TRAY, PREP_SPOT, STAGE_SEAT, stageTopZCm } from '../../simulation/optical-world/geometry';
import { ANATOMY_MODELS, orientationFor } from '../../simulation/animal-world/catalog';
import { MATERIALS } from '../../simulation/animal-world/materials';
import { gradeSnapshot } from '../../practices/grading';
import { evaluateB10 } from '../../practices/practice-b10/rubric';
import { emptyB10Notebook } from '../../practices/practice-b10/notebook';
import { sanitizeOnResumeB10 } from '../../practices/practice-b10/resume';
import { idealAttemptB10, ppeB10, runA, worldB10 } from '../helpersB10';

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const NASTY = [NaN, Infinity, -Infinity, -1, 0, 1e9, -1e9, 0.5];
const JUNK = ['', 'nope', '__proto__', 'constructor', 'fxSK', 'fxO', 'sl1', 'cv1', 'fc', 'lp', 'sc', 'dw', 'oil', 'mic', 'mus', 'board', 'stDaphnia', 'stLouse', 'hand', 'stage', 'cleanTray', 'stereoBase'];

/** Tramos sensatos: sin ellos, el azar casi nunca enfoca una lámina ni abre un modelo, y solo se prueba el rechazo. */
function macro(r: () => number, w: AnimalWorld) {
  const pick = <T,>(a: readonly T[]) => a[Math.floor(r() * a.length)];
  const D = (c: any) => dispatchAnimal(w, c);
  const kind = pick(['slide', 'slide', 'capture', 'model', 'stereo', 'fresh']);
  if (kind === 'slide') {
    const fixed = Object.entries(w.slides).filter(([, x]) => x.kind === 'fixed').map(([id]) => id);
    const id = pick(fixed);
    if (w.microscope.slideOnStage) {
      const cur = w.microscope.slideOnStage;
      D({ type: 'openClip', open: true });
      D({ type: 'selectObjective', objectiveX: 4 });
      for (let i = 0; i < 12; i++) D({ type: 'turnCoarse', deltaTurns: -0.5 });
      D({ type: 'setPose', id: cur, pose: { x: CLEAN_TRAY.x, y: CLEAN_TRAY.y, z: 0, rotationRad: 0 }, support: 'cleanTray' });
    }
    D({ type: 'setPower', device: 'microscope', on: true });
    D({ type: 'setIllumination', device: 'microscope', value01: 0.45 });
    D({ type: 'openSlideCase', open: true });
    if (r() < 0.7) D({ type: 'readSlideLabel', slideId: id });
    D({ type: 'setPose', id, pose: { x: 0, y: 0, z: 0, rotationRad: 0 }, support: 'hand' });
    D({ type: 'openClip', open: true });
    D({ type: 'setPose', id, pose: { x: STAGE_SEAT.x, y: STAGE_SEAT.y, z: stageTopZCm(6), rotationRad: 0 }, support: 'stage' });
    D({ type: 'openClip', open: false });
  }
  if (kind === 'capture' && w.microscope.slideOnStage) {
    D({ type: 'checkSide' });
    for (let i = 0; i < 80 && microscopeView(w).sharpness01 < 0.25; i++) D({ type: 'turnCoarse', deltaTurns: 0.1 });
    for (const dir of [1, -1]) {
      let best = microscopeView(w).sharpness01;
      for (let i = 0; i < 40; i++) {
        D({ type: 'turnFine', deltaTurns: dir * 0.02 });
        const s = microscopeView(w).sharpness01;
        if (s < best) { D({ type: 'turnFine', deltaTurns: -dir * 0.02 }); break; }
        best = s;
      }
    }
    D({ type: 'observe', instrument: 'compound', open: true });
    runA(w, 1.6);
    const res = D({ type: 'captureObservation', instrument: 'compound' });
    if (res.id) {
      for (let i = 0; i < 3; i++) D({ type: 'markRegion', observationId: res.id, structure: pick(['striations', 'peripheralNucleus', 'choanocyte', 'mesoglea', 'scolexS', 'nucleolus']), u: r(), v: r() });
      D({ type: 'measure', observationId: res.id, ax: r(), ay: r(), bx: r(), by: r(), scale: 'nominal' });
    }
  }
  if (kind === 'model') {
    const m = pick(ANATOMY_MODELS);
    D({ type: 'openModel', modelId: m.id });
    for (const reg of m.regions) {
      if (r() < 0.5) continue;
      const o = orientationFor(reg);
      D({ type: 'orientModel', modelId: m.id, yawDeg: o.yawDeg, pitchDeg: o.pitchDeg, zoom: 1 });
      D({ type: 'labelRegion', modelId: m.id, regionId: reg.id, part: r() < 0.7 ? reg.part : pick(pick(ANATOMY_MODELS).regions.length ? m.regions : m.regions).part });
    }
  }
  if (kind === 'stereo') {
    D({ type: 'setPower', device: 'stereo', on: true });
    D({ type: 'setIllumination', device: 'stereo-incident', value01: 0.5 });
    D({ type: 'wipe', targetId: 'fc', toolId: 'lp' });
    D({ type: 'pickSpecimen', toolId: 'fc', sourceId: pick(['stDaphnia', 'stLouse']), pressure01: 0.3 });
    D({ type: 'placeSpecimen', toolId: 'fc', targetId: 'stereoBase', dxCm: 0, dyCm: 0 });
    D({ type: 'observe', instrument: 'stereo', open: true });
    runA(w, 1.6);
    D({ type: 'captureObservation', instrument: 'stereo' });
  }
  if (kind === 'fresh') {
    D({ type: 'setPose', id: 'sl1', pose: { x: PREP_SPOT.x, y: PREP_SPOT.y, z: 0, rotationRad: 0 }, support: 'prep' });
    D({ type: 'wipe', targetId: 'sc', toolId: 'lp' });
    D({ type: 'cutSource', sourceId: 'mus', toolId: 'sc', thicknessMm: 0.3, lengthCm: 0.5 });
    D({ type: 'wipe', targetId: 'fc', toolId: 'lp' });
    D({ type: 'pickSpecimen', toolId: 'fc', sourceId: 'board' });
    D({ type: 'placeSpecimen', toolId: 'fc', targetId: 'sl1', dxCm: 0, dyCm: 0 });
    D({ type: 'squeezeDropper', dispenserId: 'dw', targetId: 'sl1', force01: 0.5, dxCm: 0, dyCm: 0 });
  }
}

function command(r: () => number, w: AnimalWorld, garbage: boolean): any {
  const pick = <T,>(a: readonly T[]) => a[Math.floor(r() * a.length)];
  const n = () => (garbage && r() < 0.3 ? pick(NASTY) : r());
  const big = (k: number) => (garbage && r() < 0.3 ? pick(NASTY) : (r() - 0.5) * k);
  const obj = () => (r() < 0.75 ? pick(Object.keys(w.objects)) : pick(JUNK));
  const slide = () => (r() < 0.8 ? pick(Object.keys(w.slides)) : pick(JUNK));
  const model = () => (r() < 0.9 ? pick(ANATOMY_MODELS).id : pick(JUNK));
  const m = pick(ANATOMY_MODELS);
  const region = () => (m.regions.length && r() < 0.9 ? pick(m.regions).id : pick(JUNK));
  const part = () => (m.regions.length && r() < 0.8 ? pick(m.regions).part : pick(JUNK));
  const obs = () => (Object.keys(w.observations).length && r() < 0.85 ? pick(Object.keys(w.observations)) : pick(JUNK));
  const makers: Array<() => any> = [
    () => ({ type: 'setPower', device: pick(['microscope', 'stereo']), on: r() < 0.7 }),
    () => ({ type: 'setIllumination', device: pick(['microscope', 'stereo-incident', 'stereo-transmitted', 'nope']), value01: n() }),
    () => ({ type: 'setDiaphragm', value01: n() }),
    () => ({ type: 'openSlideCase', open: r() < 0.8 }),
    () => ({ type: 'readSlideLabel', slideId: slide() }),
    () => ({ type: 'openClip', open: r() < 0.5 }),
    () => ({ type: 'setPose', id: obj(), pose: { x: big(1000), y: big(200), z: big(40), rotationRad: big(7) }, support: pick(['hand', 'stage', 'cleanTray', 'prep', 'case:A1', 'bench', 'nope']) }),
    () => ({ type: 'selectObjective', objectiveX: pick([4, 10, 40, 100, 7, NaN]) }),
    () => ({ type: 'turnCoarse', deltaTurns: big(4) }),
    () => ({ type: 'turnFine', deltaTurns: big(1) }),
    () => ({ type: 'checkSide' }),
    () => ({ type: 'setStageXY', xMm: big(40), yMm: big(40) }),
    () => ({ type: 'observe', instrument: pick(['compound', 'stereo']), open: r() < 0.8 }),
    () => ({ type: 'captureObservation', instrument: pick(['compound', 'stereo']) }),
    () => ({ type: 'setStereoZoom', zoomX: big(12) }),
    () => ({ type: 'setStereoFocus', deltaTurns: big(8) }),
    () => ({ type: 'wipe', targetId: obj(), toolId: pick(['lp', 'fc', 'sc']) }),
    () => ({ type: 'pickSpecimen', toolId: pick(['fc', 'sc', 'nope']), sourceId: obj(), pressure01: n() }),
    () => ({ type: 'placeSpecimen', toolId: 'fc', targetId: pick(['sl1', 'sl2', 'stereoBase', 'fxSK', 'nope']), dxCm: big(6), dyCm: big(6) }),
    () => ({ type: 'cutSource', sourceId: pick(['mus', 'nope']), toolId: 'sc', thicknessMm: big(3), lengthCm: big(3) }),
    () => ({ type: 'squeezeDropper', dispenserId: pick(['dw', 'oil', 'nope']), targetId: slide(), force01: n(), dxCm: big(3), dyCm: big(3) }),
    () => ({ type: 'grabCover', coverId: pick(['cv1', 'cv2', 'nope']), toolId: 'fc' }),
    () => ({ type: 'setCoverTilt', coverId: 'cv1', angleDeg: big(200) }),
    () => ({ type: 'lowerCover', coverId: 'cv1', slideId: slide(), speedCmS: big(8), dxCm: big(3), dyCm: big(3) }),
    () => ({ type: 'pressCover', slideId: slide(), force01: n() }),
    () => ({ type: 'flipSlide', slideId: slide() }),
    () => ({ type: 'addImmersionOil', slideId: slide(), drops: big(6) }),
    () => ({ type: 'markRegion', observationId: obs(), structure: pick(['striations', 'intercalatedDisc', 'peripheralNucleus', 'choanocyte', 'mesoglea', 'scolexS', 'nope']), u: n(), v: n() }),
    () => ({ type: 'measure', observationId: obs(), ax: big(2000), ay: big(2000), bx: big(2000), by: big(2000), scale: pick(['assumed', 'nominal', 'calibrated', 'nope']) }),
    () => ({ type: 'classifyMaterial', materialId: pick([...Object.keys(MATERIALS), 'nope']), materialClass: pick(['specimen', 'slide', 'model', 'track', 'nope']), instrument: pick(['microscope', 'stereo', 'viewer', 'nope']) }),
    () => ({ type: 'openModel', modelId: r() < 0.1 ? null : model() }),
    () => ({ type: 'orientModel', modelId: r() < 0.5 ? m.id : model(), yawDeg: big(2000), pitchDeg: big(400), zoom: big(8) }),
    () => ({ type: 'setStudyLabels', on: r() < 0.5 }),
    () => ({ type: 'labelRegion', modelId: m.id, regionId: region(), part: part() }),
    () => ({ type: 'identifyModel', modelId: model(), guess: pick(ANATOMY_MODELS).taxon }),
    () => ({ type: 'answerBird', modelId: model(), beak: pick(['seed', 'hook', 'nope', null]), foot: pick(['webbed', 'perching', 'nope', null]) }),
    () => ({ type: 'answerSkull', modelId: model(), taxon: pick(['horse', 'cow', 'nope']), diet: pick(['grazer', 'carnivore', '', 'nope']) }),
    () => ({ type: 'compareModels', a: model(), b: r() < 0.2 ? null : model() }),
    () => ({ type: 'setTrackLight', trackId: model(), azimuthDeg: big(2000), elevationDeg: big(400) }),
    () => ({ type: 'answerTrack', trackId: model(), digits: big(20), support: pick(['unguligrade', 'digitigrade', 'nope']), claws: r() < 0.5 }),
    () => ({ type: 'requestVideo', subject: pick(['daphnia', 'nope']) }),
    () => ({ type: 'reportAsset', assetId: model(), problem: pick(['missing', 'incomplete', 'noScale', 'lowResolution', 'lowRelief', 'nope']) }),
    () => ({ type: pick(JUNK) }),
  ];
  return pick(makers)();
}

function badNumbers(o: unknown, path = '', out: string[] = [], seen = new Set<unknown>()): string[] {
  if (typeof o === 'number') {
    if (!Number.isFinite(o)) out.push(path);
  } else if (o && typeof o === 'object' && !seen.has(o)) {
    seen.add(o);
    for (const [k, v] of Object.entries(o)) badNumbers(v, `${path}.${k}`, out, seen);
  }
  return out;
}

function fuzz(seed: number, steps: number, garbage: boolean, resumeEvery = 0) {
  const r = rng(seed);
  let w = worldB10({ seed: 1000 + seed, scenarios: seed % 3 === 0 ? [SC_B10.FRESH] : [] });
  if (r() < 0.8) ppeB10(w);
  for (let i = 0; i < steps; i++) {
    const c = command(r, w, garbage);
    try {
      if (r() < 0.2) macro(r, w);
      dispatchAnimal(w, c);
      if (r() < 0.2) runA(w, r() * 3);
    } catch (e) {
      throw new Error(`semilla ${seed}, paso ${i}: ${JSON.stringify(c)} → ${(e as Error).message}`, { cause: e });
    }
    if (resumeEvery && i % resumeEvery === resumeEvery - 1) {
      w = JSON.parse(JSON.stringify(w));
      sanitizeOnResumeB10(w);
    }
    if (i % 25 === 0) {
      const bad = badNumbers(w);
      if (bad.length) throw new Error(`semilla ${seed}, paso ${i}: ${JSON.stringify(c)} deja NaN en ${bad.slice(0, 6).join(', ')}`);
    }
  }
  return w;
}

function coverage() {
  const by: Record<string, { ok: number; no: number }> = {};
  const codes = new Set<string>();
  let captures = 0, valid = 0;
  const errs = new Set<string>();
  for (let seed = 0; seed < 40; seed++) {
    const r = rng(seed);
    const w = worldB10({ seed: 1000 + seed, scenarios: seed % 3 === 0 ? [SC_B10.FRESH] : [] });
    ppeB10(w);
    for (let i = 0; i < 400; i++) {
      if (r() < 0.2) macro(r, w);
      const c = command(r, w, false);
      const res = dispatchAnimal(w, c);
      const k = (by[c.type] ??= { ok: 0, no: 0 });
      if (res.ok) k.ok++;
      else { k.no++; if (res.code) codes.add(res.code); }
      if (r() < 0.2) runA(w, r() * 3);
    }
    captures += Object.keys(w.observations).length;
    valid += Object.values(w.observations).filter((o) => o.isObservationValid).length;
    for (const k of Object.keys(w.evidence)) if (k.startsWith('err:')) errs.add(k);
  }
  return { by, codes: [...codes], captures, valid, errs: errs.size };
}

describe('B10: agente al azar', () => {
  it('el agente de verdad recorre el lab: si solo lo rechazan, las demás pruebas no valen nada', () => {
    const c = coverage();
    if (process.env.COV) writeFileSync(process.env.COV, JSON.stringify(c));
    expect(c.valid).toBeGreaterThan(30);
    expect(c.errs).toBeGreaterThan(30);
    for (const t of ['markRegion', 'labelRegion', 'answerBird', 'answerSkull', 'answerTrack', 'identifyModel', 'pickSpecimen', 'placeSpecimen', 'cutSource', 'lowerCover', 'squeezeDropper', 'captureObservation']) expect(c.by[t]?.ok ?? 0, t).toBeGreaterThan(0);
  }, 300000);
  it('comandos válidos en cualquier orden: sin excepciones ni NaN, y nota en [0, 1]', () => {
    for (let s = 0; s < 40; s++) {
      const w = fuzz(s, 400, false);
      expect(badNumbers(w)).toEqual([]);
      const ev = evaluateB10(w, emptyB10Notebook());
      expect(ev.total).toBeGreaterThanOrEqual(0);
      expect(ev.total).toBeLessThanOrEqual(1);
    }
  }, 300000);
  it('entradas basura (NaN, Infinity, ids falsos, __proto__): sin excepciones ni NaN', () => {
    for (let s = 100; s < 140; s++) {
      const w = fuzz(s, 400, true);
      expect(badNumbers(w)).toEqual([]);
      expect(({} as Record<string, unknown>).polluted).toBeUndefined();
      const ev = evaluateB10(w, emptyB10Notebook());
      expect(Number.isFinite(ev.total)).toBe(true);
    }
  }, 300000);
  it('la misma semilla da exactamente el mismo mundo', () => {
    for (const s of [1, 2, 3, 101, 102]) expect(JSON.stringify(fuzz(s, 300, s > 100))).toBe(JSON.stringify(fuzz(s, 300, s > 100)));
  }, 120000);
  it('reanudar a mitad no revienta ni introduce NaN', () => {
    for (let s = 200; s < 215; s++) expect(badNumbers(fuzz(s, 300, s % 2 === 0, 40))).toEqual([]);
  }, 120000);
  it('cerrar el puesto a mitad no deja el mundo en un estado que reviente', () => {
    for (let s = 400; s < 410; s++) {
      const w = fuzz(s, 150, false);
      dispatchAnimal(w, { type: 'closeBench' });
      const r = rng(s);
      for (let i = 0; i < 100; i++) dispatchAnimal(w, command(r, w, false));
      expect(badNumbers(w)).toEqual([]);
    }
  }, 120000);
  it('el azar nunca llega a una nota alta', () => {
    let best = 0;
    for (let s = 300; s < 330; s++) best = Math.max(best, evaluateB10(fuzz(s, 500, false), emptyB10Notebook()).total);
    expect(best).toBeLessThan(0.4);
  }, 300000);
});

describe('B10: trampas contra la nota', () => {
  const ideal = idealAttemptB10();
  const good = evaluateB10(ideal.w, ideal.nb).total;
  const fresh = () => {
    const w = worldB10();
    ppeB10(w);
    return w;
  };
  const clone = <T,>(x: T) => structuredClone(x);

  it('la ruta ideal es la referencia', () => expect(good).toBeGreaterThan(0.85));
  it('libreta perfecta copiada, sin haber trabajado: casi nada', () => {
    expect(evaluateB10(fresh(), clone(ideal.nb)).total).toBeLessThan(0.25);
  });
  it('libreta de otro intento con otra semilla: no acredita las capturas', () => {
    const other = idealAttemptB10(4242);
    const copied = evaluateB10(other.w, clone(ideal.nb)).total;
    const own = evaluateB10(other.w, other.nb).total;
    expect(copied).toBeLessThanOrEqual(own);
  });
  it('una sola captura usada en todas las filas no vale por todas', () => {
    const nb = clone(ideal.nb);
    const one = nb.tissues.find((r) => r.observationId)!.observationId;
    for (const r of [...nb.tissues, ...nb.inverts, ...nb.small]) r.observationId = one;
    nb.muscle.skeletalObservationId = one;
    nb.muscle.cardiacObservationId = one;
    expect(evaluateB10(ideal.w, nb).total).toBeLessThan(good - 0.1);
  });
  it('capturas inválidas no acreditan aunque el texto sea correcto', () => {
    const w = clone(ideal.w);
    for (const o of Object.values(w.observations)) o.isObservationValid = false;
    expect(evaluateB10(w, clone(ideal.nb)).total).toBeLessThan(good - 0.2);
  });
  it('escribir solo texto sin referencias no puntúa filas', () => {
    const nb = clone(ideal.nb);
    for (const r of [...nb.tissues, ...nb.inverts, ...nb.small]) r.observationId = null;
    expect(evaluateB10(ideal.w, nb).total).toBeLessThan(good - 0.1);
  });
  it('filas duplicadas no suman más de lo que suma una', () => {
    const nb = clone(ideal.nb);
    nb.tissues = Array.from({ length: 40 }, () => clone(nb.tissues[0]));
    expect(evaluateB10(ideal.w, nb).total).toBeLessThanOrEqual(good);
  });
  it('una libreta deformada termina en nota o en INVALID_NOTEBOOK, nunca en otro error', () => {
    const shapes: unknown[] = [{}, { tissues: null }, { tissues: 'x', inverts: 3, small: {}, zoo: null, muscle: null, claims: null, atlas: null, skull: null, trackRows: 7 }, { tissues: [null, 3, 'a', {}], inverts: [null], small: [null], zoo: [null], trackRows: [null] }];
    const seed = ideal.w.seed;
    for (const s of shapes) {
      const notebook = { ...emptyB10Notebook(), ...(s as object) };
      try {
        const g = gradeSnapshot('b10', { world: clone(ideal.w), notebook, ppe: true, mode: 'PRACTICE' }, { attemptId: `b10-${seed.toString(36)}-t`, options: { mode: 'PRACTICE', seed, scenarios: [] } });
        expect(g.evaluation.total).toBeLessThanOrEqual(good);
      } catch (e) {
        expect((e as Error).message, JSON.stringify(s)).toBe('INVALID_NOTEBOOK');
      }
    }
  });
});
