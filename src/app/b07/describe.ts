/**
 * Nombres y descripciones accesibles de B07 (§14.2): lo OBSERVABLE de cada objeto y el estado operativo de los
 * instrumentos («Objetivo 10X enclavado; enfoque aún borroso», «Pinza abierta»). Nunca nombra las estructuras que se
 * evalúan; en Evaluación tampoco da cifras internas (separación, error de foco).
 */
import type { MicroWorld as OpticalWorld } from '../../simulation/micro-world/types';
import { gapLow, microscopeView } from '../../simulation/optical-world/world';
import { t } from '../i18n';

const fmt = (v: number, d = 1) => v.toFixed(d).replace('.', ',');
const has = (k: string) => t(k) !== k;

export function b07NameOf(w: OpticalWorld, id: string): string {
  if (has(`b07.obj.${id}`)) return t(`b07.obj.${id}`);
  const o = w.objects[id];
  if (o?.kind === 'fixedSlide') return w.slides[id]?.label ?? t('b07.kind.fixedSlide');
  return o ? t(`b07.kind.${o.kind}`) : id;
}

export function b07NameTag(w: OpticalWorld, id: string): string {
  return b07NameOf(w, id);
}

/** Nitidez en palabras (sin cifras en Evaluación). */
export const focusWords = (s: number) => t(s >= 0.85 ? 'b07.desc.sharp' : s >= 0.6 ? 'b07.desc.almostSharp' : s >= 0.2 ? 'b07.desc.blurry' : 'b07.desc.veryBlurry');

export function microscopeStatus(w: OpticalWorld, mode: string): string {
  const v = microscopeView(w);
  const m = w.microscope;
  const parts = [
    v.locked ? t('b07.desc.objective', { x: v.objectiveX, mag: v.magnification }) : t('b07.desc.turretBetween'),
    t(m.clipOpen ? 'b07.desc.clipOpen' : 'b07.desc.clipClosed'),
    m.power ? t('b07.desc.lightPct', { pct: Math.round(m.light01 * 100) }) : t('b07.desc.lightOff'),
  ];
  if (v.slideId) {
    parts.push(t('b07.desc.onStage', { o: b07NameOf(w, v.slideId) }));
    if (v.locked) parts.push(focusWords(v.sharpness01));
    if (gapLow(w)) parts.push(t('b07.desc.gapLow'));
    else if (mode === 'DEBUG') parts.push(`gap ${fmt(v.gapMm, 2)} mm`);
  } else parts.push(t('b07.desc.stageEmpty'));
  return parts.join(' · ');
}

export function describeObject(w: OpticalWorld, id: string, mode: string): string {
  const o = w.objects[id];
  if (!o) return '';
  if (id === 'mic') return microscopeStatus(w, mode);
  const parts: string[] = [];
  const m = w.micro;
  const s = w.slides[id];
  if (s) {
    if (s.faceDown) parts.push(t('b07.desc.faceDown'));
    const sm = m.smears[id];
    if (sm) {
      parts.push(t('b07.desc.smearOf', { plate: m.plates[sm.plateId].label }));
      parts.push(sm.phases.length ? t('b07.desc.phases', { list: sm.phases.map((p) => t(`b07.phase.${p}`)).join(', ') }) : t('b07.desc.unstained'));
      if (sm.phases.length && !sm.rinsed[sm.phases.length - 1]) parts.push(t('b07.desc.needsRinse'));
    }
    if (w.div.brokenSlides.includes(id)) parts.push(t('b07.desc.broken'));
    if (o.support === 'stage') parts.push(t(w.microscope.clampedSlideId === id ? 'b07.desc.clamped' : 'b07.desc.unclamped'));
    if (o.support.startsWith('case:')) parts.push(t('b07.desc.inSlot', { s: o.support.slice(5) }));
  }
  const p = m.plates[id];
  if (p) parts.push(t(p.restricted ? 'b07.desc.plateRestricted' : p.control ? 'b07.desc.plateControl' : p.assigned ? 'b07.desc.plateAssigned' : 'b07.desc.plateOther'));
  if (id === 'loop') parts.push(m.loop ? t('b07.desc.loopLoaded', { plate: m.plates[m.loop.plateId].label }) : t('b07.desc.empty'));
  if (o.kind === 'stainBottle') parts.push(m.bottles[id] > 1 ? t('b07.desc.plenty') : m.bottles[id] > 0.05 ? t('b07.desc.little') : t('b07.desc.emptyDropper'));
  if (o.kind === 'mediaJar') parts.push(t(m.inspected.includes(id) ? 'b07.desc.cardRead' : 'b07.desc.cardUnread'));
  if (o.kind === 'autoclaveMock' || o.kind === 'burnerMock') parts.push(t('b07.desc.mock'));
  if (id === 'case') parts.push(t(w.slideCase.open ? 'b07.desc.caseOpen' : 'b07.desc.caseClosed'));
  if (id === 'glassBin' && w.shards > 0) parts.push(t('b07.desc.shardsPending'));
  return parts.join(' · ');
}
