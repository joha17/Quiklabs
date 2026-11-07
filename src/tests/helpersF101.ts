/**
 * Ayudantes de prueba de F101: rutas del estudiante expresadas con los MISMOS comandos que la escena y el panel
 * accesible (nada de atajos del dominio). Sirven a las pruebas de integración, de repetición y a la demostración.
 */
import type { F101Command, F101DispatchResult } from '../simulation/f101-world/commands';
import type { F101Params, F101World, Pose, ReadingF } from '../simulation/f101-world/types';
import { dispatchF101, runF101For } from '../simulation/f101-world/world';
import { GEOF101 } from '../simulation/f101-world/geometry';
import { projectedExtentMm } from '../simulation/instruments/vernier-caliper';
import { newPracticeF101World } from '../practices/practice-f101';
import type { F101Scenario } from '../practices/practice-f101/error-scenarios';
import { BALANCE_POS } from '../practices/practice-f101/definition';
import { emptyF101Notebook, type Dim, type F101Notebook } from '../practices/practice-f101/notebook';
import { dimReadings, expectedDensity, expectedDim, expectedVectors, massReading, volumeReadings, zeroReading } from '../practices/practice-f101/expected-results';

export const pose = (x: number, y: number, z = 0): Pose => ({ x, y, z, rotationRad: 0 });

export function worldF(opts: { seed?: number; scenarios?: F101Scenario[]; params?: Partial<F101Params>; scientificMode?: F101Params['scientificMode'] } = {}): F101World {
  return newPracticeF101World({ mode: 'PRACTICE', seed: opts.seed ?? 101, scenarios: opts.scenarios, params: opts.params, scientificMode: opts.scientificMode });
}
export const cmdF = (w: F101World, c: F101Command): F101DispatchResult => dispatchF101(w, c);
export const runF = (w: F101World, s: number) => runF101For(w, s);
export const readingOf = (w: F101World, r: F101DispatchResult): ReadingF => w.readings[r.id!];

export function ppe(w: F101World) {
  for (const item of ['coat', 'goggles', 'shoes', 'hair'] as const) cmdF(w, { type: 'equipPpe', item, on: true });
  return cmdF(w, { type: 'startWork' });
}

export function explore(w: F101World) {
  for (const t of ['caliper01', 'micrometer01', 'ruler01', 'gaugeBlock01', 'massStd01']) cmdF(w, { type: 'inspect', target: t });
}

// ─────────────────────────── Calibrador ───────────────────────────

/** Cierra las mordazas sin pieza con una presión suave y lee el cero. */
export function caliperZero(w: F101World, viewDeg = 0) {
  cmdF(w, { type: 'placeInCaliper', partId: null, dimension: 'd', tiltDeg: 0, spinDeg: 0 });
  cmdF(w, { type: 'setCaliperSlide', targetMm: -0.5 });
  const r = cmdF(w, { type: 'readCaliper', viewDeg });
  cmdF(w, { type: 'releaseCaliper' });
  return r;
}

/** Abre, coloca la pieza, empuja el cursor `pushMm` más allá del contacto y lee. */
export function caliperMeasure(w: F101World, partId: string, dimension: 'd' | 'h' | 'L', opts: { spinDeg?: number; tiltDeg?: number; pushMm?: number; viewDeg?: number } = {}) {
  const extent = dimension === 'h' ? 50 : 20;
  cmdF(w, { type: 'setCaliperSlide', targetMm: extent + 8 });
  cmdF(w, { type: 'placeInCaliper', partId, dimension, tiltDeg: opts.tiltDeg ?? 0, spinDeg: opts.spinDeg ?? 0 });
  // El pulgar empuja el cursor `pushMm` más allá del contacto con la pieza (lo que el gesto haría).
  const contact = w.caliper.part ? projectedExtentMm(w.caliper.part) : 0;
  cmdF(w, { type: 'setCaliperSlide', targetMm: contact - (opts.pushMm ?? 0.5) });
  const r = cmdF(w, { type: 'readCaliper', viewDeg: opts.viewDeg ?? 0 });
  cmdF(w, { type: 'releaseCaliper' });
  cmdF(w, { type: 'setCaliperSlide', targetMm: extent + 8 });
  cmdF(w, { type: 'placeInCaliper', partId: null, dimension, tiltDeg: 0, spinDeg: 0 });
  return r;
}

// ─────────────────────────── Micrómetro ───────────────────────────

export function microOpen(w: F101World, toMm = 24) {
  for (let i = 0; i < 20 && w.micrometer.spindleMm < toMm; i++) cmdF(w, { type: 'turnMicrometer', deltaDeg: -Math.min(3600, ((toMm - w.micrometer.spindleMm) / 0.5) * 360 + 1), via: 'thimble' });
}

/** Cierra hasta el contacto y da una vuelta extra con el trinquete (o con el tambor, si `via` lo indica). */
export function microClose(w: F101World, via: 'ratchet' | 'thimble' = 'ratchet', extraDeg = 90) {
  for (let i = 0; i < 40 && w.micrometer.forceN <= 0; i++) cmdF(w, { type: 'turnMicrometer', deltaDeg: 3600, via: 'thimble' });
  // Retroceder y acercar en pasos finos hasta tocar (como se hace a mano antes del trinquete).
  cmdF(w, { type: 'turnMicrometer', deltaDeg: -60, via: 'thimble' });
  for (let i = 0; i < 80 && w.micrometer.forceN <= 0; i++) cmdF(w, { type: 'turnMicrometer', deltaDeg: 2, via });
  cmdF(w, { type: 'turnMicrometer', deltaDeg: extraDeg, via });
}

export function microZero(w: F101World, opts: { clean?: boolean } = {}) {
  if (opts.clean ?? true) cmdF(w, { type: 'cleanFaces' });
  microClose(w);
  const r = cmdF(w, { type: 'readMicrometer', viewDeg: 0 });
  microOpen(w);
  return r;
}

export function microMeasure(w: F101World, partId: string, opts: { spinDeg?: number; via?: 'ratchet' | 'thimble'; extraDeg?: number; viewDeg?: number } = {}) {
  microOpen(w);
  cmdF(w, { type: 'placeInMicrometer', partId, spinDeg: opts.spinDeg ?? 0 });
  microClose(w, opts.via ?? 'ratchet', opts.extraDeg ?? 90);
  const r = cmdF(w, { type: 'readMicrometer', viewDeg: opts.viewDeg ?? 0 });
  microOpen(w);
  cmdF(w, { type: 'placeInMicrometer', partId: null, spinDeg: 0 });
  return r;
}

// ─────────────────────────── Balanza y probeta ───────────────────────────

export const PAN = pose(BALANCE_POS.x, BALANCE_POS.y, GEOF101.balance.panZ);
export const onPan = (w: F101World, id: string) => cmdF(w, { type: 'setPose', id, pose: PAN, support: 'pan' });
export const offPan = (w: F101World, id: string, at = pose(196, 18)) => cmdF(w, { type: 'setPose', id, pose: at, support: 'bench' });

export function balanceReady(w: F101World) {
  cmdF(w, { type: 'inspect', target: 'balance01' });
  cmdF(w, { type: 'powerBalance', on: true });
  cmdF(w, { type: 'levelBalance' });
  runF(w, 2);
  cmdF(w, { type: 'tare' });
  runF(w, 1);
}

export function readMass(w: F101World, waitS = 2): F101DispatchResult {
  runF(w, waitS);
  for (let i = 0; i < 40 && !w.balance.stable; i++) runF(w, 0.5);
  return cmdF(w, { type: 'readBalance' });
}

export function weigh(w: F101World, id: string) {
  onPan(w, id);
  const r = readMass(w);
  offPan(w, id);
  runF(w, 1);
  return r;
}

export function readVol(w: F101World, eyeDzCm = 0, waitS = 3) {
  runF(w, waitS);
  return cmdF(w, { type: 'readVolume', eyeDzCm, occluded: false });
}

// ─────────────────────────── Mesa de fuerzas ───────────────────────────

/** Montaje 3-4-5: 150 g a 0°, 200 g a 90° y 250 g a 233° (la equilibrante de las dos primeras). */
export const IDEAL_SETUP: Array<{ pulley: string; hanger: string; angle: number; masses: string[] }> = [
  { pulley: 'pulley1', hanger: 'hanger1', angle: 0, masses: ['s100a'] },
  { pulley: 'pulley2', hanger: 'hanger2', angle: 90, masses: ['s100b', 's50a'] },
  { pulley: 'pulley3', hanger: 'hanger3', angle: 233, masses: ['s200a'] },
];

export function levelTable(w: F101World) {
  cmdF(w, { type: 'inspect', target: 'forceTable01' });
  cmdF(w, { type: 'setPose', id: 'level01', pose: pose(300, 32, GEOF101.forceTable.topZ), support: 'forceTable01' });
  cmdF(w, { type: 'levelTable' });
  cmdF(w, { type: 'setPose', id: 'level01', pose: pose(48, 44), support: 'bench' });
}

export function setupForces(w: F101World, setup = IDEAL_SETUP, opts: { seat?: boolean } = {}) {
  for (const s of setup) {
    cmdF(w, { type: 'setPulleyAngle', pulleyId: s.pulley, angleDeg: s.angle });
    if (opts.seat ?? true) cmdF(w, { type: 'seatPulley', pulleyId: s.pulley, on: true });
  }
  for (const s of setup) {
    cmdF(w, { type: 'hang', hangerId: s.hanger, pulleyId: s.pulley });
    for (const m of s.masses) cmdF(w, { type: 'loadMass', massId: m, hangerId: s.hanger });
  }
  runF(w, 1);
}

export function releaseAndRecord(w: F101World, viewElevDeg = 80) {
  cmdF(w, { type: 'setPin', on: false });
  runF(w, 3);
  return cmdF(w, { type: 'recordEquilibrium', viewElevDeg });
}

export function unloadAll(w: F101World) {
  cmdF(w, { type: 'setPin', on: true });
  for (const s of IDEAL_SETUP) {
    for (const m of s.masses) cmdF(w, { type: 'loadMass', massId: m, hangerId: null });
    cmdF(w, { type: 'hang', hangerId: s.hanger, pulleyId: null });
  }
}

/** Calibra el sensor con el patrón y captura con el perno colocado (mide la resultante de lo colgado). */
export function sensorContrast(w: F101World, opts: { calibrate?: boolean; connect?: boolean; rateHz?: 5 | 50; seconds?: number } = {}) {
  cmdF(w, { type: 'inspect', target: 'sensorBox01' });
  if (opts.connect ?? true) cmdF(w, { type: 'connectSensor', on: true });
  cmdF(w, { type: 'setSensorRate', hz: opts.rateHz ?? 50 });
  if (opts.calibrate ?? true) {
    cmdF(w, { type: 'setPose', id: 'massStd01', pose: pose(342, 48, 4), support: 'sensor01' });
    cmdF(w, { type: 'calibrateSensor' });
    cmdF(w, { type: 'setPose', id: 'massStd01', pose: pose(54, 20), support: 'bench' });
  }
  cmdF(w, { type: 'setPin', on: true });
  cmdF(w, { type: 'hang', hangerId: 'hanger3', pulleyId: null });
  cmdF(w, { type: 'loadMass', massId: 's200a', hangerId: null });
  runF(w, 2);
  cmdF(w, { type: 'startCapture' });
  runF(w, opts.seconds ?? 2);
  return cmdF(w, { type: 'stopCapture' });
}

// ─────────────────────────── Ruta ideal ───────────────────────────

export interface IdealResult {
  w: F101World;
  ids: Record<string, string>;
}

/** Ruta ideal completa por comandos: exploración, dimensiones, masa y volumen, vectores, contraste y cierre. */
export function idealRoute(seed = 101, scenarios: F101Scenario[] = [], mode?: F101Params['scientificMode'], start?: F101World, resume?: (w: F101World) => F101World): IdealResult {
  let w = start ?? worldF({ seed, scenarios, scientificMode: mode });
  const ids: Record<string, string> = {};
  ppe(w);
  explore(w);
  // Repetición: cerrar y reanudar a mitad del intento (JSON + estado seguro) no debe cambiar nada.
  if (resume) w = resume(w);
  ids.calZero = caliperZero(w).id!;
  ids.microZero = microZero(w).id!;
  ids.standard = caliperMeasure(w, 'gaugeBlock01', 'L').id!;
  [0, 60, 120].forEach((s, i) => (ids[`cylD${i}`] = caliperMeasure(w, 'metalCyl01', 'd', { spinDeg: s }).id!));
  [0, 90, 180].forEach((s, i) => (ids[`cylH${i}`] = caliperMeasure(w, 'metalCyl01', 'h', { spinDeg: s }).id!));
  [0, 45, 90].forEach((s, i) => (ids[`ballD${i}`] = microMeasure(w, 'steelBall01', { spinDeg: s }).id!));
  balanceReady(w);
  ids.mCyl = weigh(w, 'metalCyl01').id!;
  ids.mBall = weigh(w, 'steelBall01').id!;
  cmdF(w, { type: 'inspect', target: 'gradCyl01' });
  ids.v0 = readVol(w).id!;
  cmdF(w, { type: 'dropIntoCylinder', partId: 'metalCyl01', heightCm: 1 });
  ids.v1 = readVol(w).id!;
  cmdF(w, { type: 'retrievePart', partId: 'metalCyl01' });
  cmdF(w, { type: 'dryPart', partId: 'metalCyl01' });
  levelTable(w);
  // S08 exige tres fuerzas oblicuas: el mismo triángulo 3-4-5 girado 20°.
  const oblique = scenarios.includes('F101-S08_oblique_forces' as F101Scenario);
  setupForces(w, oblique ? IDEAL_SETUP.map((s) => ({ ...s, angle: s.angle + 20 })) : IDEAL_SETUP);
  ids.eq = releaseAndRecord(w).id!;
  ids.sensor = sensorContrast(w).id!;
  unloadAll(w);
  cmdF(w, { type: 'closeStation' });
  return { w, ids };
}

const fmt = (v: number, d: number) => (Number.isFinite(v) ? v.toFixed(d) : '');

/** Libreta completa y correcta a partir de las lecturas del intento (importadas, no escritas). */
export function fillNotebook(w: F101World, ids: Record<string, string>, nb: F101Notebook = emptyF101Notebook()): F101Notebook {
  const imp = (id: string | undefined) => ({ value: id && w.readings[id] ? String(w.readings[id].value) : '', uncertainty: '', readingId: id && w.readings[id] ? id : null });
  nb.hypothesis = { question: '¿Coincide la densidad geométrica del cilindro con la del material y cierra el polígono de fuerzas?', prediction: 'Densidad cercana a 2,70 g/cm³ y resultante de las tres fuerzas menor que 0,05 N.' };
  const p = w.params;
  const rows: Record<string, [string, string, string]> = {
    caliper: [String(p.caliper.resolutionMm), fmt(p.uB.caliperMm, 4), 'hypothetical'], micrometer: [String(p.micrometer.resolutionMm), fmt(p.uB.micrometerMm, 4), 'hypothetical'],
    ruler: ['1', fmt(p.uB.rulerMm, 2), 'hypothetical'], balance: ['0.01', '0.01', 'hypothetical'], gradCyl: ['1', fmt(p.uB.gradCylMl, 2), 'hypothetical'],
    dynamometer: ['0.1', fmt(p.uB.dynamometerN, 3), 'hypothetical'], angle: ['1', fmt(p.uB.angleDeg, 2), 'hypothetical'],
  };
  for (const [k, [res, u, st]] of Object.entries(rows)) nb.instruments[k as keyof F101Notebook['instruments']] = { resolution: res, uncertainty: u, status: st };
  nb.zeros.caliper = imp(ids.calZero ?? zeroReading(w, 'caliper01')?.id);
  nb.zeros.micrometer = imp(ids.microZero ?? zeroReading(w, 'micrometer01')?.id);
  nb.zeros.standard = imp(ids.standard);
  for (const d of ['cylD', 'cylH', 'ballD'] as Dim[]) {
    const rs = dimReadings(w, d).slice(-3);
    nb.dims[d] = rs.map((r) => imp(r.id));
    while (nb.dims[d].length < 3) nb.dims[d].push({ value: '', uncertainty: '', readingId: null });
    const e = expectedDim(w, nb, d);
    nb.means[d] = { value: fmt(e.mean, 3), uncertainty: fmt(e.u, 4), readingId: null };
  }
  nb.masses.cyl = imp(ids.mCyl ?? massReading(w, 'metalCyl01')?.id);
  nb.masses.ball = imp(ids.mBall ?? massReading(w, 'steelBall01')?.id);
  const vols = volumeReadings(w);
  nb.volumes.initial = imp(ids.v0 ?? vols.initial?.id);
  nb.volumes.final = imp(ids.v1 ?? vols.final?.id);
  const ed = expectedDensity(w, nb);
  nb.calc.volGeom = { value: fmt(ed.V, 4), uncertainty: fmt(ed.uV, 4), readingId: null };
  nb.calc.volDisp = { value: fmt(ed.vDisp, 1), uncertainty: fmt(Math.SQRT2 * p.uB.gradCylMl, 2), readingId: null };
  nb.calc.rho = { value: fmt(ed.rho, 4), uncertainty: fmt(ed.urho, 4), readingId: null };
  nb.calc.rhoSI = { value: fmt(ed.rhoSI, 1), uncertainty: fmt(ed.urho * 1000, 1), readingId: null };
  nb.calc.relErr = { value: fmt(ed.relErr, 2), uncertainty: '', readingId: null };
  const q = ids.eq ? w.readings[ids.eq] : null;
  nb.equilibriumId = q?.id ?? null;
  (q?.forces ?? []).slice(0, 3).forEach((f, i) => {
    nb.vectors[i].mass = { value: f.massG !== undefined ? String(f.massG) : `${f.readN} N`, uncertainty: '', readingId: q!.id };
    nb.vectors[i].angle = { value: String(f.angleRead), uncertainty: '', readingId: q!.id };
  });
  const ev = expectedVectors(w, nb);
  ev.forces.forEach((f, i) => {
    nb.vectors[i].F = fmt(f.F, 4);
    nb.vectors[i].Fx = fmt(f.x, 4);
    nb.vectors[i].Fy = fmt(f.y, 4);
  });
  nb.vec = {
    Rx: fmt(ev.R.x, 4), Ry: fmt(ev.R.y, 4), R: fmt(ev.Rmag, 4), thetaR: fmt(ev.thetaR, 1), equilibrant: fmt(ev.equilibrant, 1), residual: fmt(ev.residual, 4),
    dot12: fmt(ev.dot12, 4), cross12: fmt(ev.cross12, 4), unitX: fmt(ev.unitX, 4), unitY: fmt(ev.unitY, 4),
  };
  nb.contrastId = ids.sensor ?? null;
  nb.contrastText = 'El sensor del perno midió la resultante de F1 y F2 al retirar F3; coincide con la suma de componentes dentro de la incertidumbre angular.';
  nb.analysis = {
    q1: 'El diámetro del cilindro controló la incertidumbre del volumen porque entra al cuadrado en la fórmula del volumen.',
    q2: 'La lectura más sensible a la calibración fue la del sensor 2D: sin calibrar multiplicaba las fuerzas por 1,06.',
    q3: 'El mayor residual del polígono vino de la fricción de las poleas y de la lectura del ángulo con división de un grado.',
    q4: 'Las fórmulas dejan de valer si el hilo roza el borde, si el anillo toca el perno o si las piezas se deforman al medirlas.',
  };
  nb.closure = 'Portapesas y masas devueltos al soporte, perno colocado, probeta y mesada secas, balanza apagada; sin incidentes.';
  return nb;
}
