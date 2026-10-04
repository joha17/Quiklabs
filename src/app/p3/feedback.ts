/**
 * Retroalimentación de la Práctica 3 (§22): explica la señal física observada, prioriza la seguridad y no reemplaza
 * la observación con la respuesta. En evaluación solo se muestran alertas de seguridad y hechos observables.
 */
import type { FlameWorld, SimEvent } from '../../simulation/flame-world/types';
import type { P3Mode } from '../../practices/practice-03/definition';
import { localContact, flameRelative, hasOpenFlame } from '../../simulation/flame-world/world';
import { CTX3 } from '../../practices/practice-03';
import { t } from '../i18n';
import type { FlameSound } from '../../engine/flame/host';

interface Sink {
  toast(level: 'info' | 'warn' | 'alert' | 'critical', text: string): void;
  caption(text: string): void;
  stage: { audio: { play(n: FlameSound): void } } | null;
  settings: { captions: boolean };
}

/** Pistas de técnica que se ocultan en evaluación (las de seguridad siempre se muestran). */
const HIDE_IN_EVALUATION = new Set([
  'GRIP_POOR', 'CAPSULE_OUT_OF_FLAME', 'LOOP_CONTAMINATED_SIGNAL', 'WRONG_LOOP', 'LOOP_WRONG_SLOT', 'PART_WRONG', 'IGNITION_WITHOUT_PRECHECK',
  'GAS_BEFORE_SPARK', 'IGNITION_AIR_OPEN', 'IGNITION_ABRUPT', 'TABLE_CLOSED_FIRST', 'ATOMIZER_MISSED', 'CAPSULE_TOO_LONG', 'LOOP_CLEAN_CONFIRMED',
  'SHARED_LOOP_NOT_CLEANED', 'HCL_CLOSED_LID', 'IGNITION_NO_EXTRACTION',
]);

const SHOW_INFO = new Set([
  'HOSE_CONNECTED', 'HOSE_DISCONNECTED', 'HOSE_REPLACED', 'HOSE_OK', 'SOAP_NO_BUBBLES', 'SOAP_NO_PRESSURE', 'IGNITED', 'CAPSULE_SOOTED',
  'CAPSULE_HEATED_CLEAN', 'CAPSULE_CLEAN', 'CAPSULE_WIPED', 'PART_IDENTIFIED', 'SUPPLY_RESTORED', 'BLANKET_USED', 'EXTINGUISHER_USED',
  'FIRST_AID', 'INCIDENT_RESOLVED', 'STATION_RESET', 'HCL_OPENED', 'HCL_CLOSED', 'GLASS_CLEANED', 'SPARE_LOOP', 'LOOP_CLEAN_CONFIRMED',
  'BURNER_INSPECTED', 'HCL_CLOSED_LID',
]);

const SOUND: Partial<Record<string, FlameSound>> = {
  IGNITED: 'ignite', FLASHBACK: 'flashback', LOOP_SPUTTER: 'sizzle', HOT_LOOP_IN_TUBE: 'sizzle', HOT_LOOP_IN_HCL: 'sizzle', TUBE_SPILLED: 'glass',
  CAPSULE_SLIPPED: 'porcelain', GAS_SMELL: 'hiss',
};

export function p3EventFeedback(e: SimEvent, mode: P3Mode, sink: Sink): void {
  if (mode === 'EVALUATION' && HIDE_IN_EVALUATION.has(e.code)) return;
  if (e.severity === 'INFO' && !SHOW_INFO.has(e.code)) return;
  const key = `p3.ev.${e.code}`;
  const params: Record<string, unknown> = { ...(e.params ?? {}) };
  if (typeof params.part === 'string') params.part = t(`p3.part.${params.part}`);
  if (typeof params.answer === 'string') params.answer = t(`p3.part.${params.answer}`);
  if (typeof params.obj === 'string') params.obj = t(`p3.kind.${params.obj}`);
  const text = t(key, params);
  if (text === key) return;
  const level = e.severity === 'CRITICAL' ? 'critical' : e.severity === 'ALERT' ? 'alert' : e.severity === 'WARN' ? 'warn' : 'info';
  sink.toast(level, text);
  const snd = SOUND[e.code] ?? (e.severity === 'CRITICAL' || e.severity === 'ALERT' ? 'alert' : undefined);
  if (snd) {
    sink.stage?.audio.play(snd);
    sink.caption(t(`p3.cap.${snd}`));
  }
}

const fired = new Set<string>();
let firedFor = '';

/**
 * Observaciones en vivo (práctica y guiado): mensajes ante situaciones visibles, con la explicación física
 * (§22.2). Se emiten una vez por situación y por intento.
 */
export function p3LiveFeedback(w: FlameWorld, mode: P3Mode, attemptId: string, sink: Sink): void {
  if (mode === 'EVALUATION') return;
  if (firedFor !== attemptId) {
    fired.clear();
    firedFor = attemptId;
  }
  const once = (k: string, level: 'info' | 'warn', key: string) => {
    if (fired.has(k)) return;
    fired.add(k);
    sink.toast(level, t(key));
  };
  const b = w.burner;
  if (b.flameState === 'YELLOW_LUMINOUS' && w.capsule.activeExposure && w.capsule.sootMassMg > 0.3) once('yellowSoot', 'info', 'p3.live.yellowSoot');
  for (const l of Object.values(w.loops)) {
    const o = w.objects[l.id];
    if (!o || o.support !== 'hand') continue;
    const contact = localContact(w, CTX3, o.pose);
    if (contact > 0.2 && hasOpenFlame(w)) {
      const q = flameRelative(w, CTX3, o.pose);
      if (b.flameState !== 'BLUE_STABLE' && l.emission > 0) once(`yellowTest`, 'warn', 'p3.live.yellowTest');
      if (q.z < b.flame.innerConeHeightCm * 0.7 && b.flame.blueness > 0.6 && l.surfaceWaterMg === 0 && l.depositedSpeciesMg && Object.keys(l.depositedSpeciesMg).length) once(`innerCone:${l.id}`, 'info', 'p3.live.innerCone');
    }
  }
  const mix = w.observations.sol_mix;
  if (mix?.noFilter && !mix.filter && mix.noFilter.sodiumShare > 0.6) once('mixHint', 'info', 'p3.live.mixFilter');
  const cap = w.capsule;
  const last = cap.exposures[cap.exposures.length - 1];
  if (last && (last.regimeS.BLUE_STABLE ?? 0) > 2 && last.sootBeforeMg > 0.1) once('residualSoot', 'warn', 'p3.live.residualSoot');
  if (w.room.coPpm > w.params.coWarnPpm * 0.7 && !w.room.extractionOn) once('coVent', 'warn', 'p3.live.coVent');
}
