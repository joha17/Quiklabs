/**
 * Nombres y descripciones accesibles de B01 (§14.2): lo OBSERVABLE de cada objeto y el estado operativo de los
 * instrumentos («Objetivo 10X enclavado; enfoque aún borroso», «Pinza abierta»). Nunca nombra las estructuras que se
 * evalúan; en Evaluación tampoco da cifras internas (separación, error de foco).
 */
import type { OpticalWorld } from '../../simulation/optical-world/types';
import { gapLow, microscopeView, stereoView } from '../../simulation/optical-world/world';
import { t } from '../i18n';

const fmt = (v: number, d = 1) => v.toFixed(d).replace('.', ',');
const has = (k: string) => t(k) !== k;

export function b01NameOf(w: OpticalWorld, id: string): string {
  if (has(`b01.obj.${id}`)) return t(`b01.obj.${id}`);
  const o = w.objects[id];
  if (o?.kind === 'fixedSlide') return w.slides[id]?.label ?? t('b01.kind.fixedSlide');
  return o ? t(`b01.kind.${o.kind}`) : id;
}

export function b01NameTag(w: OpticalWorld, id: string): string {
  return b01NameOf(w, id);
}

/** Nitidez en palabras (sin cifras en Evaluación). */
export const focusWords = (s: number) => t(s >= 0.85 ? 'b01.desc.sharp' : s >= 0.6 ? 'b01.desc.almostSharp' : s >= 0.2 ? 'b01.desc.blurry' : 'b01.desc.veryBlurry');

export function microscopeStatus(w: OpticalWorld, mode: string): string {
  const v = microscopeView(w);
  const m = w.microscope;
  const parts = [
    v.locked ? t('b01.desc.objective', { x: v.objectiveX, mag: v.magnification }) : t('b01.desc.turretBetween'),
    t(m.clipOpen ? 'b01.desc.clipOpen' : 'b01.desc.clipClosed'),
    m.power ? t('b01.desc.lightPct', { pct: Math.round(m.light01 * 100) }) : t('b01.desc.lightOff'),
  ];
  if (v.slideId) {
    parts.push(t('b01.desc.onStage', { o: b01NameOf(w, v.slideId) }));
    if (v.locked) parts.push(focusWords(v.sharpness01));
    if (gapLow(w)) parts.push(t('b01.desc.gapLow'));
    else if (mode === 'DEBUG') parts.push(`gap ${fmt(v.gapMm, 2)} mm`);
  } else parts.push(t('b01.desc.stageEmpty'));
  return parts.join(' · ');
}

export function stereoStatus(w: OpticalWorld): string {
  const v = stereoView(w);
  const s = w.stereo;
  return [
    t('b01.desc.zoom', { z: fmt(s.zoomX), mag: fmt(v.magnification, 0) }),
    s.power ? t('b01.desc.stereoLight', { i: Math.round(s.incident01 * 100), tr: Math.round(s.transmitted01 * 100) }) : t('b01.desc.lightOff'),
    v.sampleId ? t('b01.desc.onBase', { o: b01NameOf(w, v.sampleId) }) : t('b01.desc.baseEmpty'),
    v.sampleId ? focusWords(v.sharpness01) : '',
    t(s.channelMode === 'stereo-pair' ? 'b01.desc.pair' : 'b01.desc.mono'),
  ].filter(Boolean).join(' · ');
}

export function describeObject(w: OpticalWorld, id: string, mode: string): string {
  const o = w.objects[id];
  if (!o) return '';
  if (id === 'mic') return microscopeStatus(w, mode);
  if (id === 'ste') return stereoStatus(w);
  const parts: string[] = [];
  const s = w.slides[id];
  if (s) {
    if (s.kind === 'blank' && s.dirty01 > 0.2 && w.evidence[`residueSeen:${id}`]) parts.push(t('b01.desc.residue'));
    if (s.faceDown) parts.push(t('b01.desc.faceDown'));
    const m = w.mounts[id];
    if (m?.specimenId) parts.push(t('b01.desc.specimen'));
    if (m && m.waterMl > 0.003) parts.push(t('b01.desc.liquid', { n: m.waterMl > w.params.mount.excessMl ? t('b01.desc.much') : t('b01.desc.drop') }));
    if (m?.reagentId) parts.push(t('b01.desc.reagent'));
    if (m?.coverId) parts.push(t(m.bubbleFraction > 0.15 ? 'b01.desc.coverBubbles' : 'b01.desc.cover'));
    if (m?.broken) parts.push(t('b01.desc.broken'));
    if (m?.floating) parts.push(t('b01.desc.floating'));
    if (o.support === 'stage') parts.push(t(w.microscope.clampedSlideId === id ? 'b01.desc.clamped' : 'b01.desc.unclamped'));
    if (o.support.startsWith('case:')) parts.push(t('b01.desc.inSlot', { s: o.support.slice(5) }));
  }
  if (id === 'fc') {
    const h = w.forceps.holding;
    parts.push(h ? t(`b01.desc.holding_${h.kind}`) : t('b01.desc.empty'));
    if (w.forceps.dirty01 > 0.3) parts.push(t('b01.desc.dirtyTool'));
  }
  if (w.dispensers[id]) parts.push(t('b01.desc.dropperLeft', { n: w.dispensers[id].ml > 1 ? t('b01.desc.plenty') : w.dispensers[id].ml > 0.05 ? t('b01.desc.little') : t('b01.desc.emptyDropper') }));
  if (id === 'el') parts.push(t('b01.desc.leaves', { n: w.dish.leaves }));
  if (id === 'case') parts.push(t(w.slideCase.open ? 'b01.desc.caseOpen' : 'b01.desc.caseClosed'));
  if (w.stereoSamples[id]) parts.push(t(o.support === 'stereoBase' ? 'b01.desc.onStereo' : o.support === 'sampleTray' ? 'b01.desc.inTray' : 'b01.desc.loose'));
  if (id === 'glassBin' && w.shards > 0) parts.push(t('b01.desc.shardsPending'));
  return parts.join(' · ');
}
