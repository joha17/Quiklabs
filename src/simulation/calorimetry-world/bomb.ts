/**
 * Bomba calorimétrica virtual (§20) — simulación educativa. Máquina de estados con enclavamientos: la ignición queda
 * bloqueada hasta cumplir todas las condiciones del perfil de equipo; no se abre un recipiente presurizado.
 * Energía: q_observada = C_sistema · ΔT_corregida; q_muestra = q_observada − q_alambre − q_auxiliares.
 * No describe la construcción ni la operación de un equipo real: los límites provienen del perfil configurado.
 */
import type { BombCommand, P6DispatchResult } from './commands';
import type { BombStage, BombState, P6Params, P6World } from './types';
import { BOMB_PROFILES, FOODS } from '../calorimetry/materials';
import { hashRange } from '../core/rng';
import { emit6, flag, bump, setBlock } from './world';

const ORDER: BombStage[] = [
  'UNASSEMBLED', 'SAMPLE_LOADED', 'WIRE_CONNECTED', 'SEALED', 'LEAK_TESTED', 'OXYGEN_CHARGED', 'SUBMERGED', 'BASELINE_STABLE', 'ARMED', 'IGNITED',
  'TEMPERATURE_RISE', 'COMPLETE', 'COOLED', 'DEPRESSURIZED', 'OPENED',
];
export const bombStageIndex = (s: BombStage) => ORDER.indexOf(s);

export function newBombState(params: P6Params, sealDamaged: boolean): BombState {
  const amb = params.ambientC;
  return {
    profile: null, stage: 'UNASSEMBLED', inspected: { vessel: false, seal: false, electrodes: false, valve: false }, sealDamaged,
    energyEquivalent: null, food: null, sampleG: 0, sampleReadingG: null, sampleInCrucible: false, wireCm: 0, wireContact: null,
    pressureAtm: 0, leakTestPassed: null, bucketWaterG: 0, inBucket: false, lidClosed: false,
    bucketC: amb - 1.2, displayedC: amb - 1.2, jacketC: amb, baselineS: 0, ignitedAt: null,
    qSampleJ: 0, qWireJ: 0, qAuxJ: 0, pendingJ: 0, completeness: 0, residue: 'NONE', series: [], effectiveJPerC: 0, aborted: false,
  };
}

const refuse = (w: P6World, code: string, sev: 'WARN' | 'ALERT' | 'CRITICAL' = 'WARN'): P6DispatchResult => {
  emit6(w, `BOMB_${code}`, sev);
  bump(w, `err:bomb:${code}`);
  return { ok: false, code };
};

/** Condiciones que impiden armar o encender (§20.2, §20.5). */
export function bombInterlocks(w: P6World): string[] {
  const b = w.bomb;
  const out: string[] = [];
  if (!w.params.bombEnabled) return ['DISABLED'];
  if (!b.profile) return ['NO_PROFILE'];
  const prof = BOMB_PROFILES[b.profile];
  if (!Object.values(b.inspected).every(Boolean)) out.push('NOT_INSPECTED');
  if (b.energyEquivalent === null) out.push('NO_CALIBRATION');
  if (!b.sampleInCrucible) out.push('NO_SAMPLE');
  if (b.sampleG > prof.maxSampleG) out.push('SAMPLE_TOO_LARGE');
  if (b.sampleG * (b.food ? FOODS[b.food].grossEnergyJPerG : 0) > prof.maxEnergyJ) out.push('ENERGY_OVER_LIMIT');
  if (!b.wireContact) out.push('NO_WIRE');
  if (bombStageIndex(b.stage) < bombStageIndex('SEALED')) out.push('NOT_SEALED');
  if (!b.leakTestPassed) out.push('LEAK_TEST');
  if (b.pressureAtm < prof.minAtm || b.pressureAtm > prof.maxAtm) out.push('PRESSURE_OUT_OF_RANGE');
  if (!b.inBucket) out.push('NOT_SUBMERGED');
  if (!b.lidClosed) out.push('LID_OPEN');
  if (b.baselineS < 120) out.push('BASELINE');
  return out;
}

export function dispatchBomb(w: P6World, cmd: BombCommand): P6DispatchResult {
  const b = w.bomb;
  if (!w.params.bombEnabled) return { ok: false, code: 'DISABLED' };
  if (cmd.type !== 'selectProfile' && !b.profile) return refuse(w, 'NO_PROFILE');
  const prof = b.profile ? BOMB_PROFILES[b.profile] : null;
  const idx = bombStageIndex(b.stage);
  const running = b.stage === 'IGNITED' || b.stage === 'TEMPERATURE_RISE';
  switch (cmd.type) {
    case 'selectProfile':
      if (idx > 0) return refuse(w, 'PROFILE_LOCKED');
      b.profile = cmd.profile;
      flag(w, 'bomb:profile');
      emit6(w, 'BOMB_PROFILE', 'INFO', { profile: cmd.profile });
      return { ok: true };
    case 'inspect':
      b.inspected[cmd.part] = true;
      if (cmd.part === 'seal' && b.sealDamaged) emit6(w, 'BOMB_SEAL_DAMAGED', 'ALERT');
      else emit6(w, 'BOMB_INSPECTED', 'INFO', { part: cmd.part });
      if (Object.values(b.inspected).every(Boolean)) flag(w, 'bomb:inspected');
      return { ok: true };
    case 'loadCalibration':
      b.energyEquivalent = prof!.energyEquivalentJPerC;
      flag(w, 'bomb:calibration');
      emit6(w, 'BOMB_CALIBRATION', 'INFO', { c: prof!.energyEquivalentJPerC });
      return { ok: true };
    case 'selectFood':
      if (idx > 0) return refuse(w, 'SAMPLE_LOCKED');
      b.food = cmd.food;
      return { ok: true };
    case 'weighSample': {
      if (!b.food) return refuse(w, 'NO_FOOD');
      if (idx > 0) return refuse(w, 'SAMPLE_LOCKED');
      const base = cmd.amount === 'small' ? 0.32 : cmd.amount === 'large' ? 1.35 : 0.5;
      b.sampleG = Math.round(hashRange(w.seed, `food${w.timeS}`, base * 0.94, base * 1.06) * 10000) / 10000;
      b.sampleReadingG = Math.round(b.sampleG * 10000) / 10000;
      if (b.sampleG > prof!.maxSampleG) emit6(w, 'BOMB_SAMPLE_TOO_LARGE', 'WARN', { max: prof!.maxSampleG });
      flag(w, 'bomb:weighed');
      return { ok: true, value: b.sampleReadingG };
    }
    case 'placeSample':
      if (b.sampleReadingG === null) return refuse(w, 'WEIGH_FIRST');
      if (idx > 0) return { ok: true };
      b.sampleInCrucible = true;
      b.stage = 'SAMPLE_LOADED';
      return { ok: true };
    case 'connectWire':
      if (b.stage !== 'SAMPLE_LOADED' && b.stage !== 'WIRE_CONNECTED') return refuse(w, 'ORDER');
      b.wireCm = Math.max(0, Math.min(15, cmd.lengthCm));
      b.wireContact = cmd.contact;
      b.stage = 'WIRE_CONNECTED';
      if (cmd.contact === 'NO_TOUCH') emit6(w, 'BOMB_WIRE_NO_CONTACT', 'WARN');
      if (cmd.contact === 'CRUCIBLE') emit6(w, 'BOMB_WIRE_SHORT', 'WARN');
      return { ok: true };
    case 'seal':
      if (b.stage !== 'WIRE_CONNECTED') return refuse(w, 'ORDER');
      b.stage = 'SEALED';
      return { ok: true };
    case 'leakTest':
      if (b.stage !== 'SEALED' && b.stage !== 'LEAK_TESTED') return refuse(w, 'ORDER');
      b.leakTestPassed = !b.sealDamaged;
      if (!b.leakTestPassed) return refuse(w, 'LEAK_TEST_FAILED', 'ALERT');
      b.stage = 'LEAK_TESTED';
      emit6(w, 'BOMB_LEAK_OK', 'INFO');
      return { ok: true };
    case 'pressurize': {
      if (!b.leakTestPassed || (b.stage !== 'LEAK_TESTED' && b.stage !== 'OXYGEN_CHARGED')) return refuse(w, b.sealDamaged ? 'SEAL_INVALID' : 'ORDER', 'ALERT');
      const d = Math.max(-5, Math.min(5, cmd.deltaAtm));
      if (Math.abs(cmd.deltaAtm) > 5) emit6(w, 'BOMB_FAST_FILL', 'WARN');
      b.pressureAtm = Math.max(0, Math.round((b.pressureAtm + d) * 10) / 10);
      if (b.pressureAtm > prof!.maxAtm) {
        emit6(w, 'BOMB_OVERPRESSURE', 'ALERT', { max: prof!.maxAtm });
        bump(w, 'err:bomb:OVERPRESSURE');
      }
      b.stage = b.pressureAtm >= prof!.minAtm && b.pressureAtm <= prof!.maxAtm ? 'OXYGEN_CHARGED' : 'LEAK_TESTED';
      return { ok: true, value: b.pressureAtm };
    }
    case 'fillBucket':
      if (b.inBucket) return refuse(w, 'ORDER');
      b.bucketWaterG = Math.max(0, Math.min(2400, cmd.waterG));
      if (Math.abs(b.bucketWaterG - prof!.bucketWaterG) > 2) emit6(w, 'BOMB_BUCKET_VOLUME', 'WARN', { g: Math.round(b.bucketWaterG) });
      return { ok: true };
    case 'submerge':
      if (b.stage !== 'OXYGEN_CHARGED') return refuse(w, 'ORDER');
      if (b.bucketWaterG < 1000) return refuse(w, 'NO_BUCKET_WATER');
      b.inBucket = true;
      b.stage = 'SUBMERGED';
      b.effectiveJPerC = prof!.energyEquivalentJPerC + (b.bucketWaterG - prof!.bucketWaterG) * 4.18;
      return { ok: true };
    case 'closeLid':
      if (!b.inBucket) return refuse(w, 'ORDER');
      b.lidClosed = true;
      b.baselineS = 0;
      return { ok: true };
    case 'arm': {
      const lock = bombInterlocks(w);
      if (lock.length) {
        emit6(w, 'BOMB_INTERLOCK', 'WARN', { list: lock.join(',') });
        return { ok: false, code: lock[0] };
      }
      b.stage = 'ARMED';
      flag(w, 'bomb:armed');
      return { ok: true };
    }
    case 'ignite': {
      if (b.stage !== 'ARMED') {
        const lock = bombInterlocks(w);
        emit6(w, 'BOMB_INTERLOCK', 'WARN', { list: (lock.length ? lock : ['NOT_ARMED']).join(',') });
        bump(w, 'err:bomb:IGNITE_LOCKED');
        return { ok: false, code: lock[0] ?? 'NOT_ARMED' };
      }
      const food = FOODS[b.food!];
      b.ignitedAt = w.timeS;
      b.stage = 'IGNITED';
      if (b.wireContact === 'CRUCIBLE') {
        // Cortocircuito virtual: no hay ignición.
        b.qWireJ = 0;
        b.qSampleJ = 0;
        b.residue = 'UNBURNED';
        emit6(w, 'BOMB_SHORT_CIRCUIT', 'ALERT');
        bump(w, 'err:bomb:SHORT');
      } else {
        const burned = Math.min(b.wireCm, 10) * 0.85;
        b.qWireJ = prof!.wireJPerCm * burned;
        if (b.wireContact === 'NO_TOUCH' || b.wireCm < 4) {
          b.qSampleJ = 0;
          b.residue = 'UNBURNED';
          emit6(w, 'BOMB_IGNITION_FAILED', 'WARN');
          bump(w, 'err:bomb:NO_IGNITION');
        } else {
          // Humedad y dificultad de ignición reducen la combustión completa.
          const pressureOk = b.pressureAtm >= prof!.fillAtm - 2 ? 1 : 0.985;
          b.completeness = Math.min(1, food.burnCompleteness * pressureOk * (1 - 0.15 * food.moistureFraction * food.ignitionDifficulty));
          b.qSampleJ = b.sampleG * food.grossEnergyJPerG * b.completeness;
          b.residue = b.completeness < 0.985 ? 'SOOT' : 'NONE';
          if (b.residue === 'SOOT') emit6(w, 'BOMB_INCOMPLETE', 'WARN');
        }
      }
      // Ácido nítrico del N₂ atrapado: corrección auxiliar pequeña.
      b.qAuxJ = b.qSampleJ > 0 ? Math.round(8 + 0.0025 * b.qSampleJ) : 0;
      b.pendingJ = b.qSampleJ + b.qWireJ + b.qAuxJ;
      flag(w, 'bomb:ignited');
      emit6(w, 'BOMB_FIRED', 'INFO');
      return { ok: true };
    }
    case 'depressurize':
      if (running) return refuse(w, 'RUNNING', 'ALERT');
      if (idx >= bombStageIndex('ARMED') && idx < bombStageIndex('COMPLETE')) return refuse(w, 'NOT_COMPLETE', 'ALERT');
      b.pressureAtm = 0;
      if (idx >= bombStageIndex('COMPLETE')) b.stage = 'DEPRESSURIZED';
      else if (idx >= bombStageIndex('OXYGEN_CHARGED')) b.stage = 'LEAK_TESTED';
      emit6(w, 'BOMB_VENTED', 'INFO');
      return { ok: true };
    case 'open':
      if (b.pressureAtm > 0) {
        // Abrir presurizado: bloqueo crítico (§21.5).
        setBlock(w, 'OPEN_PRESSURIZED');
        emit6(w, 'BOMB_OPEN_PRESSURIZED', 'CRITICAL');
        bump(w, 'err:bomb:OPEN_PRESSURIZED');
        return { ok: false, code: 'OPEN_PRESSURIZED' };
      }
      if (b.stage !== 'DEPRESSURIZED') return refuse(w, 'ORDER');
      b.stage = 'OPENED';
      b.lidClosed = false;
      b.inBucket = false;
      emit6(w, 'BOMB_OPENED', 'INFO', { residue: b.residue });
      flag(w, 'bomb:opened');
      return { ok: true };
    case 'abort':
      // Parada segura: corta la ignición; antes de encender, ventila.
      if (running) return refuse(w, 'RUNNING', 'ALERT');
      b.aborted = true;
      if (idx < bombStageIndex('IGNITED')) {
        b.pressureAtm = 0;
        if (idx >= bombStageIndex('OXYGEN_CHARGED')) b.stage = 'LEAK_TESTED';
      }
      emit6(w, 'BOMB_ABORTED', 'INFO');
      return { ok: true };
  }
  return { ok: false };
}

export function stepBomb(w: P6World, dt: number) {
  const b = w.bomb;
  if (!b.inBucket) return;
  const prof = b.profile ? BOMB_PROFILES[b.profile] : null;
  if (!prof) return;
  // Deriva hacia la camisa (isoperibólica) o casi nula (adiabática).
  const k = prof.jacket === 'ISOPERIBOL' ? 0.0006 : 0.00005;
  const stirW = 0.4; // agitador de la cubeta
  let q = stirW;
  if (b.pendingJ > 0) {
    const d = Math.min(b.pendingJ, b.pendingJ * (dt / 22) + 0.5 * dt);
    b.pendingJ -= d;
    q += d / dt;
  }
  b.bucketC += (q / Math.max(1, b.effectiveJPerC)) * dt + k * (b.jacketC - b.bucketC) * dt;
  b.displayedC += ((b.bucketC - b.displayedC) / 2) * dt;
  if (b.lidClosed && bombStageIndex(b.stage) < bombStageIndex('ARMED') && b.stage !== 'UNASSEMBLED') {
    b.baselineS += dt;
    if (b.baselineS >= 120 && b.stage === 'SUBMERGED') b.stage = 'BASELINE_STABLE';
  }
  if (b.stage === 'IGNITED' && b.ignitedAt !== null && w.timeS - b.ignitedAt > 2) b.stage = 'TEMPERATURE_RISE';
  if (b.stage === 'TEMPERATURE_RISE' && b.pendingJ < 1 && b.ignitedAt !== null && w.timeS - b.ignitedAt > 360) {
    b.stage = 'COMPLETE';
    emit6(w, 'BOMB_COMPLETE', 'INFO');
    flag(w, 'bomb:complete');
  }
  if (b.stage === 'COMPLETE' && b.ignitedAt !== null && w.timeS - b.ignitedAt > 480) b.stage = 'COOLED';
  // Serie a 1 Hz con resolución de 0,001 °C (termistor de la unidad).
  if (Math.floor(w.timeS) !== Math.floor(w.timeS - dt)) {
    b.series.push({ t: Math.round(w.timeS), c: Math.round(b.displayedC * 1000) / 1000 });
    if (b.series.length > 3600) b.series.splice(0, b.series.length - 3600);
  }
}

/**
 * ΔT corregido por deriva (método de las pendientes, tipo ASTM D240): ΔT = (T_c − T_a) − r₁(t_b − t_a) − r₂(t_c − t_b),
 * con t_a = ignición, t_b = 60 % del ascenso, t_c = inicio del periodo final (5 min después de la ignición).
 */
export function bombCorrectedDT(series: Array<{ t: number; c: number }>, tIgnition: number): { dT: number; ta: number; tb: number; tc: number; r1: number; r2: number } | null {
  const at = (t: number) => {
    let best = series[0];
    for (const s of series) if (Math.abs(s.t - t) < Math.abs(best.t - t)) best = s;
    return best;
  };
  if (series.length < 30) return null;
  const pre = series.filter((s) => s.t <= tIgnition && s.t >= tIgnition - 60);
  const tc = tIgnition + 300;
  const post = series.filter((s) => s.t >= tc && s.t <= tc + 120);
  if (pre.length < 10 || post.length < 10) return null;
  const slope = (a: typeof pre) => (a[a.length - 1].c - a[0].c) / Math.max(1, a[a.length - 1].t - a[0].t);
  const r1 = slope(pre);
  const r2 = slope(post);
  const Ta = at(tIgnition).c;
  const Tc = at(tc).c;
  const T60 = Ta + 0.6 * (Tc - Ta);
  const tb = series.find((s) => s.t > tIgnition && s.c >= T60)?.t ?? tIgnition + 30;
  return { dT: Tc - Ta - r1 * (tb - tIgnition) - r2 * (tc - tb), ta: tIgnition, tb, tc, r1, r2 };
}
