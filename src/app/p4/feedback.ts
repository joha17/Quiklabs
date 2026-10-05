/**
 * Retroalimentación de la Práctica 4 (§24): describe primero la consecuencia observada y luego la causa, con los
 * cálculos de las cantidades realmente usadas; distingue termodinámica de cinética; nunca completa ecuaciones.
 * En evaluación solo se muestran alertas de seguridad y hechos observables.
 */
import type { P4World, SimEvent } from '../../simulation/reaction-world/types';
import type { P4Mode } from '../../practices/practice-04/definition';
import { liquidMl, metalCuMg, speciesMol, vesselAppearance, vesselPH } from '../../simulation/reaction-world/world';
import { contextFor } from '../../practices/practice-04';
import { deliveredMl, experimentVessels, redoxElapsedS } from '../../practices/practice-04/evidence';
import { t } from '../i18n';
import type { ReactionSound } from '../../engine/reaction/host';

interface Sink {
  toast(level: 'info' | 'warn' | 'alert' | 'critical', text: string): void;
  caption(text: string): void;
  stage: { audio: { play(n: ReactionSound): void } } | null;
  settings: { captions: boolean };
}

/** Pistas de técnica que se ocultan en evaluación (las de seguridad siempre se muestran). */
const HIDE_IN_EVALUATION = new Set([
  'GRIP_POOR', 'METAL_REMOVED_EARLY', 'METAL_WRONG_SOLUTION', 'PROBE_ON_BOTTOM', 'CROSS_DROPPER', 'DROPPER_WRONG_BOTTLE', 'VESSEL_WET', 'VESSEL_DIRTY',
  'VESSEL_LOOKS_CONTAMINATED', 'MG_NO_CAPSULE_BELOW', 'MG_ABRUPT_IGNITION', 'WASTE_MISCLASSIFIED', 'GAS_BEFORE_SPARK', 'IGNITION_AIR_OPEN',
  'IGNITION_ABRUPT', 'IGNITION_WITHOUT_PRECHECK', 'TABLE_CLOSED_FIRST', 'IGNITION_NO_EXTRACTION', 'PRECIPITATE_FORMED', 'COPPER_VISIBLE', 'PINK_SWIRL',
]);

const SHOW_INFO = new Set([
  'GLOVES_ON', 'GLOVES_OFF', 'POUR_DONE', 'ASPIRATED', 'LABELED', 'VESSEL_DRIED', 'PH_CHECKED', 'SPILL_CLEANED', 'NEW_RIBBON', 'METAL_IMMERSED',
  'METAL_REMOVED', 'METAL_SANDED', 'METAL_INSPECTED', 'VESSEL_CLEAN_DRY', 'VESSEL_WASHED', 'RESIDUE_TO_CAPSULE', 'MG_BURN_DONE', 'COPPER_VISIBLE',
  'PRECIPITATE_FORMED', 'GAS_BUBBLES', 'WASTE_OK', 'PINK_SWIRL', 'INCIDENT_RESOLVED', 'STATION_RESET', 'SPARE', 'COPPER_DETACHED', 'EYEWASH_USED',
  'FIRST_AID', 'METAL_DISPOSED', 'GLOVES_RECOMMENDED',
  // Mechero (Práctica 3)
  'HOSE_CONNECTED', 'HOSE_DISCONNECTED', 'HOSE_OK', 'IGNITED', 'BURNER_INSPECTED', 'SUPPLY_RESTORED',
]);

const SOUND: Partial<Record<string, ReactionSound>> = {
  IGNITED: 'ignite', FLASHBACK: 'flashback', GAS_BUBBLES: 'fizz', GLASS_BROKEN: 'break', MG_IGNITED: 'mgBurn', SPLASH: 'drip', VESSEL_TIPPED: 'glass',
  GAS_SMELL: 'hiss', METAL_SANDED: 'sand',
};

export function p4EventFeedback(e: SimEvent, mode: P4Mode, sink: Sink): void {
  if (mode === 'EVALUATION' && HIDE_IN_EVALUATION.has(e.code)) return;
  if (e.severity === 'INFO' && !SHOW_INFO.has(e.code)) return;
  const gas = !!e.params?.gas;
  const key = gas ? `p3.ev.${e.code}` : `p4.ev.${e.code}`;
  const params: Record<string, unknown> = { ...(e.params ?? {}) };
  if (typeof params.container === 'string') params.container = t(`p4.obj.${params.container}`);
  if (typeof params.expected === 'string') params.expected = t(`p4.waste.${params.expected}`);
  if (typeof params.to === 'string') params.to = params.to ? t(`p4.obj.${params.to}`) : '';
  if (typeof params.solid === 'string') params.solid = t(`p4.species.${params.solid}`);
  if (typeof params.obj === 'string') params.obj = t(`p4.obj.${params.obj}`) !== `p4.obj.${params.obj}` ? t(`p4.obj.${params.obj}`) : t(`p3.kind.${params.obj}`);
  if (typeof params.missing === 'string') params.missing = params.missing.split(',').map((m) => t(`p4.mgSetup.${m}`)).join(', ');
  if (typeof params.metal === 'string') params.metal = params.metal === 'Fe' ? t('p4.obj.nail') : t('p4.obj.alStrip');
  let text = t(key, params);
  if (text === key) {
    if (!gas) return;
    text = t(`p4.ev.${e.code}`, params);
    if (text === `p4.ev.${e.code}`) return;
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
 * Observaciones en vivo (práctica y guiado, §24.2): primero la consecuencia, luego la causa y los cálculos con las
 * cantidades usadas. Una vez por situación y por intento.
 */
export function p4LiveFeedback(w: P4World, mode: P4Mode, attemptId: string, sink: Sink): void {
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
  const ctx = contextFor(w);
  const ev = experimentVessels(w);
  // A — remolinos que desaparecen y equivalencia incolora.
  if (ev.A) {
    const a = w.vessels[ev.A];
    const app = vesselAppearance(w, ctx, ev.A);
    if ((w.evidence.pinkSwirlS ?? 0) > 0.6 && app && app.pinkBulk < 0.05 && a.agitation > 0.1) once('swirlGone', 'info', 'p4.live.swirlGone');
    const d = deliveredMl(w, ev.A);
    const naoh = (d.naoh10 ?? 0) + (d.naoh15 ?? 0) + (d.naohX ?? 0);
    if ((d.hcl ?? 0) > 4.5 && naoh > 4.5 && a.agitation < 0.05 && a.plume.volL < 1e-6 && app) {
      const p = vesselPH(a);
      if (app.pinkBulk < 0.05) once('aColorless', 'info', 'p4.live.aColorless', { ph: fmt(p, 1) });
      else once('aPink', 'info', 'p4.live.aPink', { ph: fmt(p, 1) });
    }
    if ((d.naoh15 ?? 0) > 1) once('aWrongNaoh', 'warn', 'p4.live.aWrongNaoh');
  }
  // B2 — sobrenadante amarillo por Fe³⁺ sobrante (con los moles reales).
  if (ev.B2) {
    const v = w.vessels[ev.B2];
    const d = deliveredMl(w, ev.B2);
    const fe = speciesMol(v, 'Fe^3+') + speciesMol(v, 'FeOH^2+');
    const ppt = speciesMol(v, 'Fe(OH)3(s)');
    if (ppt > 1e-5 && fe > 1e-6 && liquidMl(v) > 1.5) {
      const nFe = ((d.fecl3 ?? 0) / 1000) * 0.15 * 1000;
      const nOH = ((d.naoh15 ?? 0) / 1000) * 0.15 * 1000;
      once('b2Yellow', 'info', 'p4.live.b2Yellow', { fe: fmt(nFe, 3), oh: fmt(nOH, 3), max: fmt(nOH / 3, 3), left: fmt(fe * 1000, 3) });
    }
  }
  // Agitar no crea producto.
  for (const v of Object.values(w.vessels)) {
    if (v.kind === 'TUBE' && v.agitation > 0.4 && Object.values(v.particles).some((p) => p.suspended < 0.5)) once(`shake:${v.id}`, 'info', 'p4.live.shakeNoMore');
  }
  // C1 — óxido y cinética.
  const nail = w.metals.nail;
  if (nail?.immersedIn && nail.sandStrokes === 0) {
    const el = redoxElapsedS(w);
    if (el > 120 && metalCuMg(nail) < 3) once('nailOxide', 'info', 'p4.live.nailOxide');
  }
  if (nail?.immersedIn && redoxElapsedS(w) > 60 && !w.stopwatch.starts.length) once('stopwatch', 'info', 'p4.live.stopwatch');
  // C3 — suspensión básica.
  const cap = w.vessels.capsule;
  if (cap && liquidMl(cap) > 2) {
    const app = vesselAppearance(w, ctx, 'capsule');
    if (app && app.pinkBulk > 0.05 && speciesMol(cap, 'Mg(OH)2(s)') > 1e-7) once('mgBasic', 'info', 'p4.live.mgBasic', { ph: fmt(vesselPH(cap), 1) });
  }
  // Probeta reutilizada sin lavar (contaminación de la medida).
  for (const v of Object.values(w.vessels)) {
    if ((v.kind === 'CYL10' || v.kind === 'CYL25') && v.additions.length >= 2) {
      const reag = new Set(v.additions.map((a) => a.reagent).filter((r) => r && r !== 'water'));
      if (reag.size >= 2) once(`cylMixed:${v.id}`, 'warn', 'p4.live.cylMixed');
    }
  }
  // Mechero encendido sin uso prolongado y la estación de Mg lista.
  if (w.gas.room.coPpm > w.gas.params.coWarnPpm * 0.7 && !w.gas.room.extractionOn) once('coVent', 'warn', 'p3.live.coVent');
}
