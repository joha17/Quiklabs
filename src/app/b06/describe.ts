/**
 * Nombres y descripciones accesibles de B06 (§14.2): lo OBSERVABLE de cada objeto y el estado operativo de los
 * instrumentos («Objetivo 10X enclavado; enfoque aún borroso», «Pinza abierta»). Nunca nombra las estructuras que se
 * evalúan; en Evaluación tampoco da cifras internas (separación, error de foco).
 */
import type { DivWorld as OpticalWorld } from '../../simulation/div-world/types';
import { gapLow, microscopeView, stereoView } from '../../simulation/optical-world/world';
import { t } from '../i18n';

const fmt = (v: number, d = 1) => v.toFixed(d).replace('.', ',');
const has = (k: string) => t(k) !== k;

export function b06NameOf(w: OpticalWorld, id: string): string {
  if (has(`b06.obj.${id}`)) return t(`b06.obj.${id}`);
  const o = w.objects[id];
  if (o?.kind === 'fixedSlide') return w.slides[id]?.label ?? t('b06.kind.fixedSlide');
  return o ? t(`b06.kind.${o.kind}`) : id;
}

export function b06NameTag(w: OpticalWorld, id: string): string {
  return b06NameOf(w, id);
}

/** Nitidez en palabras (sin cifras en Evaluación). */
export const focusWords = (s: number) => t(s >= 0.85 ? 'b06.desc.sharp' : s >= 0.6 ? 'b06.desc.almostSharp' : s >= 0.2 ? 'b06.desc.blurry' : 'b06.desc.veryBlurry');

export function microscopeStatus(w: OpticalWorld, mode: string): string {
  const v = microscopeView(w);
  const m = w.microscope;
  const parts = [
    v.locked ? t('b06.desc.objective', { x: v.objectiveX, mag: v.magnification }) : t('b06.desc.turretBetween'),
    t(m.clipOpen ? 'b06.desc.clipOpen' : 'b06.desc.clipClosed'),
    m.power ? t('b06.desc.lightPct', { pct: Math.round(m.light01 * 100) }) : t('b06.desc.lightOff'),
  ];
  if (v.slideId) {
    parts.push(t('b06.desc.onStage', { o: b06NameOf(w, v.slideId) }));
    if (v.locked) parts.push(focusWords(v.sharpness01));
    if (gapLow(w)) parts.push(t('b06.desc.gapLow'));
    else if (mode === 'DEBUG') parts.push(`gap ${fmt(v.gapMm, 2)} mm`);
  } else parts.push(t('b06.desc.stageEmpty'));
  return parts.join(' · ');
}

export function stereoStatus(w: OpticalWorld): string {
  const v = stereoView(w);
  const s = w.stereo;
  return [
    t('b06.desc.zoom', { z: fmt(s.zoomX), mag: fmt(v.magnification, 0) }),
    s.power ? t('b06.desc.stereoLight', { i: Math.round(s.incident01 * 100), tr: Math.round(s.transmitted01 * 100) }) : t('b06.desc.lightOff'),
    v.sampleId ? t('b06.desc.onBase', { o: b06NameOf(w, v.sampleId) }) : t('b06.desc.baseEmpty'),
    v.sampleId ? focusWords(v.sharpness01) : '',
    t(s.channelMode === 'stereo-pair' ? 'b06.desc.pair' : 'b06.desc.mono'),
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
    if (s.kind === 'blank' && s.dirty01 > 0.2 && w.evidence[`residueSeen:${id}`]) parts.push(t('b06.desc.residue'));
    if (s.faceDown) parts.push(t('b06.desc.faceDown'));
    const m = w.mounts[id];
    const zones = m?.cell?.zones ?? [];
    if (zones.length) parts.push(t('b06.desc.zones', { n: zones.length, list: zones.map((z) => t(`b06.specimen.${z.kind}`)).join(', ') }));
    else if (m?.specimenId) parts.push(t('b06.desc.specimen'));
    if (zones.some((z) => z.premade)) parts.push(t('b06.desc.premade'));
    if (m && m.waterMl > 0.003) parts.push(t('b06.desc.liquid', { n: m.waterMl > w.params.mount.excessMl ? t('b06.desc.much') : t('b06.desc.drop') }));
    const stains = Object.entries(m?.cell?.stainMl ?? {}).filter(([, v]) => (v ?? 0) > 0.001).map(([k]) => t(`b06.reagent.${k}`));
    if (stains.length) parts.push(t('b06.desc.stains', { list: stains.join(', ') }));
    else if (m?.reagentId) parts.push(t('b06.desc.reagent'));
    if (m?.coverId) parts.push(t(m.bubbleFraction > 0.15 ? 'b06.desc.coverBubbles' : 'b06.desc.cover'));
    if (m?.broken) parts.push(t('b06.desc.broken'));
    if (m?.floating) parts.push(t('b06.desc.floating'));
    if (o.support === 'stage') parts.push(t(w.microscope.clampedSlideId === id ? 'b06.desc.clamped' : 'b06.desc.unclamped'));
    if (o.support.startsWith('case:')) parts.push(t('b06.desc.inSlot', { s: o.support.slice(5) }));
  }
  if (id === 'fc') {
    const h = w.forceps.holding;
    parts.push(h ? t(`b06.desc.holding_${h.kind}`) : t('b06.desc.empty'));
    if (w.forceps.dirty01 > 0.3) parts.push(t('b06.desc.dirtyTool'));
  }
  const cell = w.cell;
  const src = cell.sources[id];
  if (src) parts.push(t(cell.assigned.includes(src.kind) ? 'b06.desc.assigned' : 'b06.desc.notAssigned'));
  if (id === 'board') parts.push(cell.board ? t('b06.desc.boardFragment', { kind: t(`b06.specimen.${cell.board.kind}`) }) : t('b06.desc.boardEmpty'));
  if (id === 'fc' && cell.held.fc) parts.push(t('b06.desc.holdingTissue', { kind: t(`b06.specimen.${cell.held.fc.kind}`) }));
  if (id === 'sp') parts.push(cell.held.sp ? t('b06.desc.holdingTissue', { kind: t(`b06.specimen.${cell.held.sp.kind}`) }) : t('b06.desc.empty'));
  if ((id === 'sc' || id === 'sp' || id === 'fc') && cell.toolResidue[id]) parts.push(t('b06.desc.residueOf', { kind: t(`b06.specimen.${cell.toolResidue[id]}`) }));
  if (cell.swabs[id]) parts.push(t(`b06.desc.swab_${cell.swabs[id].state}`));
  if (w.dispensers[id]) parts.push(t('b06.desc.dropperLeft', { n: w.dispensers[id].ml > 1 ? t('b06.desc.plenty') : w.dispensers[id].ml > 0.05 ? t('b06.desc.little') : t('b06.desc.emptyDropper') }));
  if (id === 'el') parts.push(t('b06.desc.leaves', { n: w.dish.leaves }));
  if (id === 'case') parts.push(t(w.slideCase.open ? 'b06.desc.caseOpen' : 'b06.desc.caseClosed'));
  if (w.stereoSamples[id]) parts.push(t(o.support === 'stereoBase' ? 'b06.desc.onStereo' : o.support === 'sampleTray' ? 'b06.desc.inTray' : 'b06.desc.loose'));
  if (id === 'glassBin' && w.shards > 0) parts.push(t('b06.desc.shardsPending'));
  return parts.join(' · ');
}
