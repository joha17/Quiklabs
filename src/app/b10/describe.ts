/**
 * Nombres y descripciones accesibles de B10 (§14.2): lo OBSERVABLE de cada objeto y el estado operativo de los
 * instrumentos («Objetivo 10X enclavado; enfoque aún borroso», «Pinza abierta»). Nunca nombra las estructuras que se
 * evalúan; en Evaluación tampoco da cifras internas (separación, error de foco).
 */
import type { AnimalWorld as OpticalWorld } from '../../simulation/animal-world/types';
import { gapLow, microscopeView, stereoView } from '../../simulation/optical-world/world';
import { t } from '../i18n';

const fmt = (v: number, d = 1) => v.toFixed(d).replace('.', ',');
const has = (k: string) => t(k) !== k;

export function b10NameOf(w: OpticalWorld, id: string): string {
  if (has(`b10.obj.${id}`)) return t(`b10.obj.${id}`);
  const o = w.objects[id];
  if (o?.kind === 'fixedSlide') return w.slides[id]?.label ?? t('b10.kind.fixedSlide');
  return o ? t(`b10.kind.${o.kind}`) : id;
}

export function b10NameTag(w: OpticalWorld, id: string): string {
  return b10NameOf(w, id);
}

/** Nitidez en palabras (sin cifras en Evaluación). */
export const focusWords = (s: number) => t(s >= 0.85 ? 'b10.desc.sharp' : s >= 0.6 ? 'b10.desc.almostSharp' : s >= 0.2 ? 'b10.desc.blurry' : 'b10.desc.veryBlurry');

export function microscopeStatus(w: OpticalWorld, mode: string): string {
  const v = microscopeView(w);
  const m = w.microscope;
  const parts = [
    v.locked ? t('b10.desc.objective', { x: v.objectiveX, mag: v.magnification }) : t('b10.desc.turretBetween'),
    t(m.clipOpen ? 'b10.desc.clipOpen' : 'b10.desc.clipClosed'),
    m.power ? t('b10.desc.lightPct', { pct: Math.round(m.light01 * 100) }) : t('b10.desc.lightOff'),
  ];
  if (v.slideId) {
    parts.push(t('b10.desc.onStage', { o: b10NameOf(w, v.slideId) }));
    if (v.locked) parts.push(focusWords(v.sharpness01));
    if (gapLow(w)) parts.push(t('b10.desc.gapLow'));
    else if (mode === 'DEBUG') parts.push(`gap ${fmt(v.gapMm, 2)} mm`);
  } else parts.push(t('b10.desc.stageEmpty'));
  return parts.join(' · ');
}

export function stereoStatus(w: OpticalWorld): string {
  const v = stereoView(w);
  const s = w.stereo;
  return [
    t('b10.desc.zoom', { z: fmt(s.zoomX), mag: fmt(v.magnification, 0) }),
    s.power ? t('b10.desc.stereoLight', { i: Math.round(s.incident01 * 100), tr: Math.round(s.transmitted01 * 100) }) : t('b10.desc.lightOff'),
    v.sampleId ? t('b10.desc.onBase', { o: b10NameOf(w, v.sampleId) }) : t('b10.desc.baseEmpty'),
    v.sampleId ? focusWords(v.sharpness01) : '',
    t(s.channelMode === 'stereo-pair' ? 'b10.desc.pair' : 'b10.desc.mono'),
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
    if (s.kind === 'blank' && s.dirty01 > 0.2 && w.evidence[`residueSeen:${id}`]) parts.push(t('b10.desc.residue'));
    if (s.faceDown) parts.push(t('b10.desc.faceDown'));
    const m = w.mounts[id];
    const zones = m?.cell?.zones ?? [];
    if (zones.length) parts.push(t('b10.desc.zones', { n: zones.length, list: zones.map((z) => t(`b10.specimen.${z.kind}`)).join(', ') }));
    else if (m?.specimenId) parts.push(t('b10.desc.specimen'));
    if (zones.some((z) => z.premade)) parts.push(t('b10.desc.premade'));
    if (m && m.waterMl > 0.003) parts.push(t('b10.desc.liquid', { n: m.waterMl > w.params.mount.excessMl ? t('b10.desc.much') : t('b10.desc.drop') }));
    const stains = Object.entries(m?.cell?.stainMl ?? {}).filter(([, v]) => (v ?? 0) > 0.001).map(([k]) => t(`b10.reagent.${k}`));
    if (stains.length) parts.push(t('b10.desc.stains', { list: stains.join(', ') }));
    else if (m?.reagentId) parts.push(t('b10.desc.reagent'));
    if (m?.coverId) parts.push(t(m.bubbleFraction > 0.15 ? 'b10.desc.coverBubbles' : 'b10.desc.cover'));
    if (m?.broken) parts.push(t('b10.desc.broken'));
    if (m?.floating) parts.push(t('b10.desc.floating'));
    if (o.support === 'stage') parts.push(t(w.microscope.clampedSlideId === id ? 'b10.desc.clamped' : 'b10.desc.unclamped'));
    if (o.support.startsWith('case:')) parts.push(t('b10.desc.inSlot', { s: o.support.slice(5) }));
  }
  if (id === 'fc') {
    const h = w.forceps.holding;
    parts.push(h ? t(`b10.desc.holding_${h.kind}`) : t('b10.desc.empty'));
    if (w.forceps.dirty01 > 0.3) parts.push(t('b10.desc.dirtyTool'));
  }
  const cell = w.cell;
  const src = cell.sources[id];
  if (src) parts.push(t(cell.assigned.includes(src.kind) ? 'b10.desc.assigned' : 'b10.desc.notAssigned'));
  if (id === 'board') parts.push(cell.board ? t('b10.desc.boardFragment', { kind: t(`b10.specimen.${cell.board.kind}`) }) : t('b10.desc.boardEmpty'));
  if (id === 'fc' && cell.held.fc) parts.push(t('b10.desc.holdingTissue', { kind: t(`b10.specimen.${cell.held.fc.kind}`) }));
  if (id === 'sp') parts.push(cell.held.sp ? t('b10.desc.holdingTissue', { kind: t(`b10.specimen.${cell.held.sp.kind}`) }) : t('b10.desc.empty'));
  if ((id === 'sc' || id === 'sp' || id === 'fc') && cell.toolResidue[id]) parts.push(t('b10.desc.residueOf', { kind: t(`b10.specimen.${cell.toolResidue[id]}`) }));
  if (cell.swabs[id]) parts.push(t(`b10.desc.swab_${cell.swabs[id].state}`));
  if (w.dispensers[id]) parts.push(t('b10.desc.dropperLeft', { n: w.dispensers[id].ml > 1 ? t('b10.desc.plenty') : w.dispensers[id].ml > 0.05 ? t('b10.desc.little') : t('b10.desc.emptyDropper') }));
  if (id === 'el') parts.push(t('b10.desc.leaves', { n: w.dish.leaves }));
  if (id === 'case') parts.push(t(w.slideCase.open ? 'b10.desc.caseOpen' : 'b10.desc.caseClosed'));
  if (w.stereoSamples[id]) parts.push(t(o.support === 'stereoBase' ? 'b10.desc.onStereo' : o.support === 'sampleTray' ? 'b10.desc.inTray' : 'b10.desc.loose'));
  if (id === 'glassBin' && w.shards > 0) parts.push(t('b10.desc.shardsPending'));
  return parts.join(' · ');
}
