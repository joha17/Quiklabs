/**
 * Nombres y descripciones accesibles de B02 (§14.2): lo OBSERVABLE de cada objeto y el estado operativo de los
 * instrumentos («Objetivo 10X enclavado; enfoque aún borroso», «Pinza abierta»). Nunca nombra las estructuras que se
 * evalúan; en Evaluación tampoco da cifras internas (separación, error de foco).
 */
import type { CellWorld as OpticalWorld } from '../../simulation/cell-world/types';
import { gapLow, microscopeView, stereoView } from '../../simulation/optical-world/world';
import { t } from '../i18n';

const fmt = (v: number, d = 1) => v.toFixed(d).replace('.', ',');
const has = (k: string) => t(k) !== k;

export function b02NameOf(w: OpticalWorld, id: string): string {
  if (has(`b02.obj.${id}`)) return t(`b02.obj.${id}`);
  const o = w.objects[id];
  if (o?.kind === 'fixedSlide') return w.slides[id]?.label ?? t('b02.kind.fixedSlide');
  return o ? t(`b02.kind.${o.kind}`) : id;
}

export function b02NameTag(w: OpticalWorld, id: string): string {
  return b02NameOf(w, id);
}

/** Nitidez en palabras (sin cifras en Evaluación). */
export const focusWords = (s: number) => t(s >= 0.85 ? 'b02.desc.sharp' : s >= 0.6 ? 'b02.desc.almostSharp' : s >= 0.2 ? 'b02.desc.blurry' : 'b02.desc.veryBlurry');

export function microscopeStatus(w: OpticalWorld, mode: string): string {
  const v = microscopeView(w);
  const m = w.microscope;
  const parts = [
    v.locked ? t('b02.desc.objective', { x: v.objectiveX, mag: v.magnification }) : t('b02.desc.turretBetween'),
    t(m.clipOpen ? 'b02.desc.clipOpen' : 'b02.desc.clipClosed'),
    m.power ? t('b02.desc.lightPct', { pct: Math.round(m.light01 * 100) }) : t('b02.desc.lightOff'),
  ];
  if (v.slideId) {
    parts.push(t('b02.desc.onStage', { o: b02NameOf(w, v.slideId) }));
    if (v.locked) parts.push(focusWords(v.sharpness01));
    if (gapLow(w)) parts.push(t('b02.desc.gapLow'));
    else if (mode === 'DEBUG') parts.push(`gap ${fmt(v.gapMm, 2)} mm`);
  } else parts.push(t('b02.desc.stageEmpty'));
  return parts.join(' · ');
}

export function stereoStatus(w: OpticalWorld): string {
  const v = stereoView(w);
  const s = w.stereo;
  return [
    t('b02.desc.zoom', { z: fmt(s.zoomX), mag: fmt(v.magnification, 0) }),
    s.power ? t('b02.desc.stereoLight', { i: Math.round(s.incident01 * 100), tr: Math.round(s.transmitted01 * 100) }) : t('b02.desc.lightOff'),
    v.sampleId ? t('b02.desc.onBase', { o: b02NameOf(w, v.sampleId) }) : t('b02.desc.baseEmpty'),
    v.sampleId ? focusWords(v.sharpness01) : '',
    t(s.channelMode === 'stereo-pair' ? 'b02.desc.pair' : 'b02.desc.mono'),
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
    if (s.kind === 'blank' && s.dirty01 > 0.2 && w.evidence[`residueSeen:${id}`]) parts.push(t('b02.desc.residue'));
    if (s.faceDown) parts.push(t('b02.desc.faceDown'));
    const m = w.mounts[id];
    const zones = m?.cell?.zones ?? [];
    if (zones.length) parts.push(t('b02.desc.zones', { n: zones.length, list: zones.map((z) => t(`b02.specimen.${z.kind}`)).join(', ') }));
    else if (m?.specimenId) parts.push(t('b02.desc.specimen'));
    if (zones.some((z) => z.premade)) parts.push(t('b02.desc.premade'));
    if (m && m.waterMl > 0.003) parts.push(t('b02.desc.liquid', { n: m.waterMl > w.params.mount.excessMl ? t('b02.desc.much') : t('b02.desc.drop') }));
    const stains = Object.entries(m?.cell?.stainMl ?? {}).filter(([, v]) => (v ?? 0) > 0.001).map(([k]) => t(`b02.reagent.${k}`));
    if (stains.length) parts.push(t('b02.desc.stains', { list: stains.join(', ') }));
    else if (m?.reagentId) parts.push(t('b02.desc.reagent'));
    if (m?.coverId) parts.push(t(m.bubbleFraction > 0.15 ? 'b02.desc.coverBubbles' : 'b02.desc.cover'));
    if (m?.broken) parts.push(t('b02.desc.broken'));
    if (m?.floating) parts.push(t('b02.desc.floating'));
    if (o.support === 'stage') parts.push(t(w.microscope.clampedSlideId === id ? 'b02.desc.clamped' : 'b02.desc.unclamped'));
    if (o.support.startsWith('case:')) parts.push(t('b02.desc.inSlot', { s: o.support.slice(5) }));
  }
  if (id === 'fc') {
    const h = w.forceps.holding;
    parts.push(h ? t(`b02.desc.holding_${h.kind}`) : t('b02.desc.empty'));
    if (w.forceps.dirty01 > 0.3) parts.push(t('b02.desc.dirtyTool'));
  }
  const cell = w.cell;
  const src = cell.sources[id];
  if (src) parts.push(t(cell.assigned.includes(src.kind) ? 'b02.desc.assigned' : 'b02.desc.notAssigned'));
  if (id === 'board') parts.push(cell.board ? t('b02.desc.boardFragment', { kind: t(`b02.specimen.${cell.board.kind}`) }) : t('b02.desc.boardEmpty'));
  if (id === 'fc' && cell.held.fc) parts.push(t('b02.desc.holdingTissue', { kind: t(`b02.specimen.${cell.held.fc.kind}`) }));
  if (id === 'sp') parts.push(cell.held.sp ? t('b02.desc.holdingTissue', { kind: t(`b02.specimen.${cell.held.sp.kind}`) }) : t('b02.desc.empty'));
  if ((id === 'sc' || id === 'sp' || id === 'fc') && cell.toolResidue[id]) parts.push(t('b02.desc.residueOf', { kind: t(`b02.specimen.${cell.toolResidue[id]}`) }));
  if (cell.swabs[id]) parts.push(t(`b02.desc.swab_${cell.swabs[id].state}`));
  if (w.dispensers[id]) parts.push(t('b02.desc.dropperLeft', { n: w.dispensers[id].ml > 1 ? t('b02.desc.plenty') : w.dispensers[id].ml > 0.05 ? t('b02.desc.little') : t('b02.desc.emptyDropper') }));
  if (id === 'el') parts.push(t('b02.desc.leaves', { n: w.dish.leaves }));
  if (id === 'case') parts.push(t(w.slideCase.open ? 'b02.desc.caseOpen' : 'b02.desc.caseClosed'));
  if (w.stereoSamples[id]) parts.push(t(o.support === 'stereoBase' ? 'b02.desc.onStereo' : o.support === 'sampleTray' ? 'b02.desc.inTray' : 'b02.desc.loose'));
  if (id === 'glassBin' && w.shards > 0) parts.push(t('b02.desc.shardsPending'));
  return parts.join(' · ');
}
