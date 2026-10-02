/**
 * Retroalimentación (§12): explica la CONSECUENCIA observada; distingue inseguro de ineficiente.
 * - Eventos del dominio → avisos, subtítulos y sonidos.
 * - Observaciones «en vivo» (práctica/guiado): mensajes ante situaciones visibles (filtrado oscuro, sin cristales…).
 * En modo evaluación solo se muestran alertas de seguridad y hechos observables, no pistas de técnica.
 */
import type { SimEvent, World } from '../simulation/entities/types';
import type { PracticeMode } from '../practices/practice-02/definition';
import { t } from './i18n';
import { liquidVolumeMl, particulateMassG } from '../simulation/solutions/mixture';
import { SUBSTANCES } from '../practices/practice-02/substances';
import type { SoundName } from '../engine/interaction/host';

interface FeedbackSink {
  toast(level: 'info' | 'warn' | 'alert' | 'critical', text: string): void;
  caption(text: string): void;
  stage: { audio: { play(n: SoundName): void } } | null;
  settings: { captions: boolean };
}

const HIDE_IN_EVALUATION = new Set([
  'PAPER_BAD_FOLD', 'CROSS_CONTAMINATION', 'ABRUPT_POWER', 'THERMAL_SHOCK_RISK', 'WARN_HOT_GLASS_NO_TONGS', 'FILTER_WETTED',
]);

const SHOW_INFO = new Set([
  'FAN_RESULT', 'BALANCE_TARED', 'COVER_SET', 'PAPER_SEATED', 'FILTER_WETTED', 'SPILL_CLEANED', 'TOOL_CLEANED', 'ICE_SCOOPED',
  'SHARDS_SWEPT', 'SPARE_ISSUED', 'INCIDENT_ACK', 'VESSEL_RIGHTED', 'SCRAPE',
]);

const SOUND: Partial<Record<string, SoundName>> = {
  GLASS_BROKEN: 'break', THERMAL_SHOCK_BREAK: 'break', ROD_BROKEN: 'break', BUMPING: 'boil', ICE_ADDED: 'ice', SCRAPE: 'stir',
};

export function eventFeedback(e: SimEvent, mode: PracticeMode, sink: FeedbackSink): void {
  if (mode === 'EVALUATION' && HIDE_IN_EVALUATION.has(e.code)) return;
  if (e.severity === 'INFO' && !SHOW_INFO.has(e.code)) return;
  const key = `ev.${e.code}`;
  const params: Record<string, unknown> = { ...(e.params ?? {}) };
  if (e.code === 'FAN_RESULT') params.odor = t(`ev.odor_${String(params.odor)}`);
  const text = t(key, params);
  if (text === key) return;
  const level = e.severity === 'CRITICAL' ? 'critical' : e.severity === 'ALERT' ? 'alert' : e.severity === 'WARN' ? 'warn' : 'info';
  sink.toast(level, text);
  const snd = SOUND[e.code] ?? (e.severity === 'CRITICAL' || e.severity === 'ALERT' ? 'alert' : undefined);
  if (snd) {
    sink.stage?.audio.play(snd);
    sink.caption(t(`cap.${snd}`));
  }
}

/** Estado de los avisos en vivo ya emitidos (por intento). */
const fired = new Set<string>();
let firedFor = '';

export function liveFeedback(w: World, mode: PracticeMode, attemptId: string, sink: FeedbackSink, nameOf: (id: string) => string): void {
  if (mode === 'EVALUATION') return;
  if (firedFor !== attemptId) {
    fired.clear();
    firedFor = attemptId;
  }
  const once = (k: string, level: 'info' | 'warn', text: string) => {
    if (fired.has(k)) return;
    fired.add(k);
    sink.toast(level, text);
  };
  for (const id in w.vessels) {
    const v = w.vessels[id];
    if (v.integrity === 0) continue;
    const lv = liquidVolumeMl(v.mix, SUBSTANCES);
    // Filtrado con carbón visible.
    if (v.type === 'BEAKER' && (w.evidence[`filtrateTo:${id}`] ?? 0) > 1 && (v.mix.solid.CARBON ?? 0) > 0.01) once(`dark:${id}`, 'warn', t('live.filtrateDark'));
    // Aceite: emulsión que se rompe.
    if (v.type === 'TEST_TUBE' && Object.keys(v.mix.oil).length && v.mix.waterG > 0.5) {
      if (v.mix.emulsion > 0.5) fired.add(`emul:${id}`);
      if (fired.has(`emul:${id}`) && v.mix.emulsion < 0.12) once(`layers:${id}`, 'info', t('live.oilLayers'));
    }
    // Tubo con soluble sin disolver tras agitar y reposar.
    if (v.type === 'TEST_TUBE' && v.agitatedTotalS > 2 && w.timeS - v.lastAgitatedS > 20) {
      for (const k of ['NaCl', 'SUCROSE'] as const) {
        if ((v.mix.solid[k] ?? 0) > 0.01 && v.mix.waterG > 0.5) once(`rem:${id}`, 'info', t('live.solidRemaining', { name: nameOf(id) }));
      }
    }
    // KNO₃ disuelto en frío (§2.1).
    if (v.type === 'BEAKER' && (v.mix.solid.CARBON ?? 0) > 0.2 && (v.mix.dissolved.KNO3 ?? 0) > 1.9 && (v.mix.solid.KNO3 ?? 0) < 0.01 && v.maxTempC < 35) {
      once(`cold:${id}`, 'info', t('live.dissolvedCold'));
    }
    // Baño de hielo sin cristales.
    if (v.support === 'bath' && v.temperatureC < 5 && !(v.mix.crystals?.massG)) {
      const since = coldSince.get(id) ?? w.timeS;
      coldSince.set(id, since);
      if (w.timeS - since > 180) once(`nocryst:${id}`, 'warn', t('live.noCrystals'));
      if ((v.cryst.phase === 'SUPERSATURATED' || v.cryst.phase === 'NUCLEATING') && w.timeS - since > 90) once(`nuc:${id}`, 'info', t('live.nucleating'));
    } else coldSince.delete(id);
    if (v.type === 'BEAKER' && (v.mix.crystals?.massG ?? 0) > 0.01 && lv > 2) once(`cryst:${id}`, 'info', t('live.crystalsAppear'));
    // Cápsula casi seca sobre la placa.
    if (v.type === 'PORCELAIN_DISH' && v.support === 'hotplate' && v.mix.waterG > 0 && v.mix.waterG < particulateMassG(v.mix) + 0.3 && w.devices.hotplate.powerPct > 0) {
      once(`dry:${id}`, 'warn', t('live.dryNear'));
    }
  }
}

const coldSince = new Map<string, number>();
