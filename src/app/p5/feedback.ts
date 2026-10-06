/**
 * Retroalimentación de la Práctica 5: primero la consecuencia observable y luego la causa, con las masas realmente
 * medidas (§24). En evaluación solo se muestran alertas de seguridad y hechos observables; nunca se completan cálculos.
 */
import type { P5World, SimEvent } from '../../simulation/stoich-world/types';
import type { P5Mode } from '../../practices/practice-05/definition';
import { tubeTempC } from '../../simulation/stoich-world/world';
import { differences } from '../../practices/practice-05/evidence';
import { t } from '../i18n';
import type { StoichSound } from '../../engine/stoich/host';

interface Sink {
  toast(level: 'info' | 'warn' | 'alert' | 'critical', text: string): void;
  caption(text: string): void;
  stage: { audio: { play(n: StoichSound): void } } | null;
  settings: { captions: boolean };
}

/** Pistas de técnica que se ocultan en evaluación (las de seguridad siempre se muestran). */
const HIDE_IN_EVALUATION = new Set([
  'READING_UNCALIBRATED', 'BALANCE_NOT_SETTLED', 'ZERO_NOT_ADJUSTED', 'READING_UNSTABLE', 'POORLY_MIXED', 'ORDER_KCLO3_FIRST', 'MNO2_AFTER_KCLO3',
  'HEATING_TOO_FAST', 'FIXED_HOT_SPOT', 'FIRST_CYCLE_SHORT', 'TUBE_TOO_STEEP', 'TUBE_TOO_FLAT', 'CONSTANT_MASS', 'IGNITION_AIR_OPEN', 'IGNITION_ABRUPT',
  'IGNITION_WITHOUT_PRECHECK', 'GAS_BEFORE_SPARK', 'TABLE_CLOSED_FIRST', 'IGNITION_NO_EXTRACTION', 'CLAMP_TOO_TIGHT',
]);

const SHOW_INFO = new Set([
  'BALANCE_CALIBRATED', 'BALANCE_LEVELED', 'READING_RECORDED', 'CONSTANT_MASS', 'HEATING_STARTED', 'HEATING_ENDED', 'PAN_CLEANED', 'TUBE_DRIED',
  'SPATULA_CLEANED', 'RESIDUE_DISPOSED', 'STATION_RESET', 'INSPECTED',
  // Mechero (Práctica 3)
  'HOSE_CONNECTED', 'HOSE_DISCONNECTED', 'HOSE_OK', 'IGNITED', 'BURNER_INSPECTED', 'SUPPLY_RESTORED',
]);

const SOUND: Partial<Record<string, StoichSound>> = {
  IGNITED: 'ignite', FLASHBACK: 'flashback', TUBE_CRACKED: 'break', TUBE_FELL: 'break', BURN_HOT_TUBE: 'sizzle', GAS_SMELL: 'hiss', SOLID_EXPELLED: 'sand',
};

export function p5EventFeedback(e: SimEvent, mode: P5Mode, sink: Sink): void {
  if (mode === 'EVALUATION' && HIDE_IN_EVALUATION.has(e.code)) return;
  if (e.severity === 'INFO' && !SHOW_INFO.has(e.code)) return;
  const gas = !!e.params?.gas;
  const params: Record<string, unknown> = { ...(e.params ?? {}) };
  if (typeof params.obj === 'string') params.obj = t(`p5.obj.${params.obj}`);
  if (typeof params.target === 'string') params.target = t(`p5.inspect.${params.target}`) !== `p5.inspect.${params.target}` ? t(`p5.inspect.${params.target}`) : params.target;
  if (typeof params.g === 'number') params.g = (params.g as number).toFixed(params.g < 1 ? 3 : 1).replace('.', ',');
  if (typeof params.code === 'string') params.code = t(`p5.block.short.${params.code}`) !== `p5.block.short.${params.code}` ? t(`p5.block.short.${params.code}`) : params.code;
  if (typeof params.what === 'string') params.what = t(`p5.contaminant.${params.what}`);
  if (typeof params.s === 'number') params.s = Math.round((params.s as number) / 6) / 10;
  if (e.code === 'INSPECTED' && mode === 'EVALUATION') return;
  const key = gas ? `p3.ev.${e.code}` : `p5.ev.${e.code}`;
  let text = t(key, params);
  if (text === key) {
    if (!gas) return;
    text = t(`p5.ev.${e.code}`, params);
    if (text === `p5.ev.${e.code}`) return;
  }
  const level = e.severity === 'CRITICAL' ? 'critical' : e.severity === 'ALERT' ? 'alert' : e.severity === 'WARN' ? 'warn' : 'info';
  sink.toast(level, text);
  const snd = SOUND[e.code] ?? (e.severity === 'CRITICAL' || e.severity === 'ALERT' ? 'alert' : undefined);
  if (snd) {
    sink.stage?.audio.play(snd);
    sink.caption(t(`p4.cap.${snd}`));
  }
}

const fired = new Set<string>();
let firedFor = '';
const fmt = (v: number, d = 2) => v.toFixed(d).replace('.', ',');

/**
 * Observaciones en vivo (práctica y guiado): una vez por situación y por intento; describen lo que se ve y por qué,
 * con las masas medidas. Nunca dan el resultado de un cálculo.
 */
export function p5LiveFeedback(w: P5World, mode: P5Mode, attemptId: string, sink: Sink): void {
  if (mode === 'EVALUATION') return;
  if (firedFor !== attemptId) {
    fired.clear();
    firedFor = attemptId;
  }
  const once = (k: string, level: 'info' | 'warn', key: string, params?: Record<string, unknown>) => {
    if (fired.has(k)) return;
    fired.add(k);
    sink.toast(level, t(key, params));
  };
  const b = w.balance;
  // Balanza oscilando con el tubo recién puesto: esperar.
  if (b.panObjectId && w.timeS - b.disturbedAt < 2) once('wait', 'info', 'p5.live.wait');
  // El tubo caliente «pesa menos»: la convección empuja el platillo.
  if (b.panObjectId === 'tube' && tubeTempC(w.tube) > w.params.ambientC + 8) once('hotLight', 'info', 'p5.live.hotLight');
  // Burbujeo / fusión.
  if (w.tube.sampleC > 356 && w.tube.contents.KClO3 > 1e-4) once('molten', 'info', 'p5.live.molten');
  if (w.tube.o2RateMolS > 2e-6) once('o2', 'info', 'p5.live.o2');
  // Tras dos lecturas después de calentar: diferencia entre ellas (criterio de masa constante).
  const d = differences(w);
  const after = d.readings.afterHeat;
  if (after.length >= 2) {
    const diff = Math.abs(after[after.length - 1].displayedMassG - after[after.length - 2].displayedMassG);
    if (diff > w.params.constantMassCriterionG + 1e-9) once(`notConst${after.length}`, 'info', 'p5.live.notConstant', { d: fmt(diff, 1) });
  }
  // Masa de KClO₃ fuera del rango del protocolo (con lo medido).
  if (d.kclo3 !== null && (d.kclo3 < w.params.kclo3MinG - 0.05 || d.kclo3 > w.params.kclo3MaxG + 0.05)) once('range', 'warn', 'p5.live.range', { g: fmt(d.kclo3, 1) });
  if (w.gas.room.coPpm > w.gas.params.coWarnPpm * 0.7 && !w.gas.room.extractionOn) once('coVent', 'warn', 'p3.live.coVent');
}
