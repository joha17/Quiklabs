/**
 * Parte B — ley de Boyle (§20–23): jeringa sellada conectada al sensor de presión.
 *
 * - Émbolo (§22.2): la mano lo lleva hacia una marca con una fuerza limitada (resorte rígido); se oponen la
 *   diferencia de presión (P − P_atm)·A y la fricción estática/cinética del sello (stick-slip, histéresis). Si se
 *   suelta, la presión lo desplaza hasta que la fricción lo detiene. Integración implícita (estable con dt = 0,05 s).
 * - Gas (§22.3): `n·Cv·dT/dt = −P·dV/dt − hA·(T − T_amb)`: compresión rápida calienta (presión alta transitoria),
 *   expansión rápida enfría; al sostener el volumen vuelve a T_amb. En modo curricular la temperatura es constante.
 * - Volumen total = marca + volumen interno del sensor + conectores + compliance·(P − P_atm) (§20.3, §22.5).
 * - Fugas (§22.4): conexión floja o sello dañado → la presión tiende a la atmosférica.
 * - Sensor (§21): respuesta de primer orden, presión absoluta, rango y sobrecarga.
 */
import type { P10Command, P10DispatchResult } from './commands';
import type { BoylePoint, P10Params, P10World, SyringeState } from './types';
import { R_KPA_ML, GEO10 } from './geometry';
import { SENSOR_PROFILES, sensorReading, stepSensor } from '../instruments/pressure-sensor';
import { bump10, emit10, flag10, latch10, rearm10 } from './events';

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const CV_AIR = 20.79;

export function newSyringe(p: P10Params, sealDamaged: boolean): SyringeState {
  return {
    stage: 'DISCONNECTED', markMl: 20, held: false, targetMl: 20, velocityMlS: 0, connected: false, valve: 'TO_SYRINGE', sealDamaged,
    nAir: 0, gasK: p.ambientC + 273.15, pressureKPa: p.pressureKPa, extraVolumeMl: 0, collecting: false, leakedMol: 0,
  };
}

/** Volumen del gas encerrado (mL) para una presión dada. */
export function syringeTotalMl(w: P10World, pKPa: number): number {
  const s = w.syringe;
  const p = w.params;
  const compliance = p.model === 'REALISTIC' ? p.complianceMlPerKPa * (pKPa - p.pressureKPa) : 0;
  return s.markMl + (s.connected ? w.sensor.internalVolumeMl + s.extraVolumeMl : 0) + compliance;
}

/** Presión del gas encerrado (kPa): resuelve P = nRT/V(P) (la compliance hace que V dependa de P). */
function gasPressure(w: P10World): number {
  const s = w.syringe;
  if (!s.connected || s.valve === 'VENT' || s.nAir <= 0) return w.params.pressureKPa;
  let P = s.pressureKPa;
  for (let i = 0; i < 4; i++) P = (s.nAir * R_KPA_ML * s.gasK) / Math.max(0.2, syringeTotalMl(w, P));
  return P;
}

/** Volumen muerto real (sensor + conectores) que hay que sumar a la marca. */
export const deadVolumeMl = (w: P10World) => w.sensor.internalVolumeMl + w.syringe.extraVolumeMl;

/** La lectura del sensor cambia menos que el criterio de estabilidad en los últimos 2 s (§21.3). */
export function sensorStable(w: P10World): boolean {
  const ser = w.series.sensor;
  if (ser.length < 3) return false;
  const last = ser.slice(-3);
  const span = Math.max(...last.map((x) => x.p)) - Math.min(...last.map((x) => x.p));
  return Number.isFinite(span) && span <= 0.25 && Math.abs(w.syringe.velocityMlS) < 0.02;
}

export function dispatchBoyle(w: P10World, cmd: P10Command): P10DispatchResult {
  const s = w.syringe;
  const p = w.params;
  switch (cmd.type) {
    case 'setPlunger': {
      s.held = cmd.held;
      s.targetMl = clamp(cmd.targetMl, 0, p.syringeMl + 1.5);
      if (s.held && s.connected && s.targetMl < 3.5) latch10(w, 'unsafeCompression', 'UNSAFE_COMPRESSION', 'WARN');
      return { ok: true };
    }
    case 'connectSyringe': {
      if (cmd.on === s.connected) return { ok: true };
      if (cmd.on) {
        s.connected = true;
        w.sensor.connected = true;
        w.objects.syringe.support = 'sensor';
        // Al conectar queda atrapado el aire a la presión ambiente (§20.4).
        s.gasK = p.ambientC + 273.15;
        s.pressureKPa = p.pressureKPa;
        s.nAir = (p.pressureKPa * syringeTotalMl(w, p.pressureKPa)) / (R_KPA_ML * s.gasK);
        w.evidence.__boyleN0 = s.nAir;
        w.evidence.__connectMark = s.markMl;
        s.leakedMol = 0;
        s.stage = 'CONNECTED';
        if (Math.abs(s.markMl - 10) > 0.25) {
          emit10(w, 'CONNECTED_NOT_AT_10', 'WARN', { ml: Math.round(s.markMl * 10) / 10 });
          bump10(w, 'err:connectNot10');
        } else flag10(w, 'connectedAt10');
        if (sc(w, 'LOOSE_LUER')) emit10(w, 'LUER_LOOSE', 'INFO');
        return { ok: true, value: s.nAir };
      }
      s.connected = false;
      w.sensor.connected = false;
      s.collecting = false;
      if (w.objects.syringe.support === 'sensor') w.objects.syringe.support = 'bench';
      s.stage = 'DISCONNECTED';
      return { ok: true };
    }
    case 'setValve':
      s.valve = cmd.valve;
      if (cmd.valve === 'VENT' && s.collecting) {
        emit10(w, 'VALVE_VENTED', 'WARN');
        bump10(w, 'err:valveVent');
      }
      return { ok: true };
    case 'startCollection': {
      if (cmd.on && !s.connected) return { ok: false, code: 'NOT_CONNECTED' };
      s.collecting = cmd.on;
      if (cmd.on) {
        s.stage = 'COLLECTING';
        flag10(w, 'collectionStarted');
      } else if (w.points.length >= 3) s.stage = 'FITTING';
      return { ok: true };
    }
    case 'keepPoint':
      return keepPoint(w, cmd.enteredTotalMl);
    case 'deletePoint': {
      const i = w.points.findIndex((x) => x.index === cmd.index);
      if (i < 0) return { ok: false };
      w.points.splice(i, 1);
      return { ok: true };
    }
  }
  return { ok: false, code: 'UNKNOWN' };
}

const sc = (w: P10World, s: string) => w.scenarios.includes(s);

function keepPoint(w: P10World, enteredTotalMl: number): P10DispatchResult {
  const s = w.syringe;
  if (!s.collecting || !s.connected) return { ok: false, code: 'NOT_COLLECTING' };
  const shown = sensorReading(w.sensor);
  if (!Number.isFinite(shown)) {
    emit10(w, 'SENSOR_CANNOT_READ', 'ALERT');
    return { ok: false, code: 'SENSOR_FAULT' };
  }
  // No se guardan datos inestables (§21.3, §39).
  if (!sensorStable(w)) {
    emit10(w, 'UNSTABLE_READING', 'WARN');
    bump10(w, 'err:unstableKeep');
    return { ok: false, code: 'UNSTABLE' };
  }
  if (w.sensor.overload) {
    emit10(w, 'SENSOR_OVERLOAD', 'WARN');
    bump10(w, 'err:overloadKeep');
  }
  const dead = deadVolumeMl(w);
  const mark = Math.round(s.markMl * 100) / 100;
  const entered = Math.round(enteredTotalMl * 100) / 100;
  if (w.points.some((q) => Math.abs(q.markMl - mark) < 0.25)) {
    emit10(w, 'DUPLICATE_VOLUME', 'WARN');
    bump10(w, 'err:duplicatePoint');
  }
  if (Math.abs(entered - mark) < 0.05 && dead > 0.1) bump10(w, 'err:noDeadVolume');
  else if (Math.abs(entered - (mark + 2 * dead)) < 0.06) bump10(w, 'err:deadTwice');
  else if (Math.abs(entered - (mark + dead)) > 0.3) bump10(w, 'err:wrongTotal');
  if (!s.held && Math.abs(s.velocityMlS) > 0.005) bump10(w, 'err:notHeld');
  const pt: BoylePoint = {
    index: (w.points[w.points.length - 1]?.index ?? 0) + 1, t: w.timeS, markMl: mark, enteredTotalMl: entered, displayedKPa: shown, trueKPa: s.pressureKPa,
    gasK: s.gasK, stable: true, held: s.held,
  };
  w.points.push(pt);
  s.stage = 'POINT_SAVED';
  emit10(w, 'POINT_SAVED', 'INFO', { kPa: Math.round(shown * 100) / 100, ml: entered });
  return { ok: true, id: String(pt.index), value: shown };
}

export function stepBoyle(w: P10World, dt: number) {
  const s = w.syringe;
  const p = w.params;
  const A = p.syringeAreaCm2 || GEO10.syringe.areaCm2;
  const amb = p.ambientC + 273.15;
  const P = gasPressure(w);
  // Fuerza del gas (N) en el sentido de aumentar el volumen: 1 kPa·cm² = 0,1 N.
  const effP = s.connected && s.valve === 'TO_SYRINGE' ? P : p.pressureKPa;
  const Fg = (effP - p.pressureKPa) * A * 0.1;
  const x = s.markMl / A / 100; // m
  const b = p.plungerDampingNsPerM;
  let xNew = x;
  if (s.held) {
    const xt = s.targetMl / A / 100;
    const Fh = p.handStiffnessNPerM * (xt - x);
    const drive = Fh + Fg;
    if (Math.abs(s.velocityMlS) < 1e-3 && Math.abs(drive) <= p.frictionStaticN) xNew = x;
    else {
      const Ff = p.frictionKineticN * Math.sign(drive);
      if (Math.abs(Fh) > p.handMaxN) {
        // La mano empuja con su fuerza máxima, sin pasarse del punto donde ya no la necesita.
        xNew = x + (dt / b) * (Math.sign(Fh) * p.handMaxN + Fg - Ff);
        const xLim = xt - (Math.sign(Fh) * p.handMaxN * 0.95) / p.handStiffnessNPerM;
        if (Math.sign(Fh) * (xNew - xLim) > 0) xNew = xLim;
      } else xNew = (x + (dt / b) * (p.handStiffnessNPerM * xt + Fg - Ff)) / (1 + (dt * p.handStiffnessNPerM) / b);
    }
  } else if (Math.abs(Fg) > p.frictionStaticN || Math.abs(s.velocityMlS) > 1e-3) {
    const net = Math.abs(Fg) - p.frictionKineticN;
    xNew = net > 0 ? x + (dt / b) * Math.sign(Fg) * net : x;
  }
  let mark = clamp(xNew * 100 * A, 0, p.syringeMl + 1.5);
  if (mark > p.syringeMl + 1) {
    // El sello salió del barril: entra aire.
    mark = p.syringeMl + 1;
    if (s.connected && s.nAir > 0) {
      s.nAir = (p.pressureKPa * syringeTotalMl(w, p.pressureKPa)) / (R_KPA_ML * s.gasK);
      emit10(w, 'PLUNGER_OUT', 'ALERT');
      bump10(w, 'err:plungerOut');
    }
  }
  const dV = mark - s.markMl;
  s.velocityMlS = dV / dt;
  s.markMl = mark;
  if (s.connected && s.valve === 'TO_SYRINGE' && s.nAir > 0) {
    // Termodinámica del gas encerrado (§22.3).
    if (p.model === 'REALISTIC') {
      const nCv = s.nAir * CV_AIR;
      const work = -s.pressureKPa * dV * 1e-3; // J (kPa·mL = mJ)
      const loss = p.syringeHeatWPerK * (s.gasK - amb) * dt;
      s.gasK += (work - loss) / nCv;
    } else s.gasK = amb;
    // Fugas (§22.4).
    const G = (sc(w, 'LOOSE_LUER') ? p.syringeLeakLoose : 0) + (s.sealDamaged ? p.syringeLeakSeal : 0);
    if (G > 0) {
      const mol = G * (s.pressureKPa - p.pressureKPa) * dt;
      s.nAir -= mol;
      s.leakedMol += mol;
    }
    s.pressureKPa = gasPressure(w);
  } else {
    s.pressureKPa = p.pressureKPa;
    s.gasK += (amb - s.gasK) * Math.min(1, dt / 2);
    if (s.connected && s.valve === 'VENT') s.nAir = (p.pressureKPa * syringeTotalMl(w, p.pressureKPa)) / (R_KPA_ML * s.gasK);
  }
  // Sensor: ve el gas si la jeringa está conectada; si no, el ambiente.
  const seen = s.connected ? s.pressureKPa : p.pressureKPa;
  stepSensor(w.sensor, seen, p.pressureKPa, dt, p.allowSensorDamage);
  if (w.sensor.overload && s.connected) latch10(w, 'overload', 'SENSOR_OVERLOAD', 'WARN');
  else rearm10(w, 'overload');
  if (s.connected && Math.abs(s.velocityMlS) > 3) latch10(w, 'fastMove', 'FAST_PLUNGER', 'INFO');
  else if (Math.abs(s.velocityMlS) < 0.5) rearm10(w, 'fastMove');
  // Etapas visibles.
  if (s.collecting) {
    const stable = sensorStable(w);
    if (Math.abs(s.velocityMlS) > 0.05) s.stage = 'VOLUME_SELECTED';
    else if (!stable) s.stage = 'PRESSURE_STABILIZING';
    else if (s.stage !== 'POINT_SAVED') s.stage = 'POINT_READY';
  }
  // Serie a 1 Hz del sensor (y la verdad para el docente).
  const t = Math.round(w.timeS * 1000) / 1000;
  if (Math.abs(t - Math.round(t)) < 1e-6) {
    const ser = w.series.sensor;
    ser.push({ t, p: sensorReading(w.sensor), pTrue: Math.round(s.pressureKPa * 1000) / 1000, tK: Math.round(s.gasK * 100) / 100, mark: Math.round(s.markMl * 100) / 100 });
    if (ser.length > 3600) ser.splice(0, ser.length - 3600);
  }
}

export const sensorProfile = (w: P10World) => SENSOR_PROFILES[w.sensor.model];
