/**
 * Nombres y descripciones accesibles de B08 (§15): lo OBSERVABLE de cada objeto (tapón, nivel, color, tapa abierta). Nunca
 * da el desplazamiento real ni el Rf: esos se leen con el ojo a la altura del menisco y con la regla.
 */
import type { PhotoWorld } from '../../simulation/photo-world/types';
import { btbColorOf } from '../../simulation/photo-world/world';
import { microscopeView } from '../../simulation/optical-world/world';
import { t } from '../i18n';

const has = (k: string) => t(k) !== k;

export function b08NameOf(w: PhotoWorld, id: string): string {
  const o = w.objects[id];
  if (o?.label) return o.label;
  if (has(`b08.obj.${id}`)) return t(`b08.obj.${id}`);
  return o ? t(`b08.kind.${o.kind}`) : id;
}

export const b08NameTag = b08NameOf;

export function microscopeStatus(w: PhotoWorld, _mode: string): string {
  const v = microscopeView(w);
  return v.locked ? t('b08.desc.objective', { x: v.objectiveX, mag: v.magnification }) : t('b08.desc.turretBetween');
}

export function describeObject(w: PhotoWorld, id: string, _mode: string): string {
  const o = w.objects[id];
  if (!o) return '';
  const m = w.photo;
  const parts: string[] = [];
  const g = m.tubes[id];
  if (g) {
    parts.push(g.mL ? t('b08.desc.volume', { ml: g.mL }) : t('b08.desc.empty'));
    parts.push(t(g.sprig ? 'b08.desc.withSprig' : 'b08.desc.noSprig'));
    if (g.label) parts.push(t(`b08.val.${g.label}`));
    if (g.bubble) parts.push(t('b08.desc.bubble'));
    parts.push(t(g.stopper01 >= 0.9 ? 'b08.desc.stopperOn' : g.stopper01 > 0 ? 'b08.desc.stopperLoose' : 'b08.desc.stopperOff'));
    if (g.capConnected) parts.push(t(g.plugCleared ? 'b08.desc.capClear' : 'b08.desc.capPlug'));
    if (m.covers[id] !== undefined) parts.push(t('b08.desc.covered'));
  }
  const b = m.btb[id];
  if (b) {
    parts.push(b.mL ? t('b08.desc.volume', { ml: b.mL }) : t('b08.desc.empty'));
    if (b.drops) parts.push(t('b08.desc.color', { c: t(`b08.val.${btbColorOf(w, id)}`) }));
    parts.push(t(b.sprig ? 'b08.desc.withSprig' : 'b08.desc.noSprig'));
    if (m.covers[id] !== undefined) parts.push(t('b08.desc.covered'));
  }
  if (m.sprigs[id]) parts.push(t(m.sprigs[id].damaged ? 'b08.desc.damaged' : 'b08.desc.healthy'));
  if (m.lamps[id]) parts.push(m.lamps[id].on ? t('b08.desc.lampOn', { p: m.lamps[id].powerPct }) : t('b08.desc.lampOff'));
  if (m.solvents[id]) parts.push(t(m.solvents[id].open ? 'b08.desc.open' : 'b08.desc.closed'));
  if (id === 'hood') parts.push(t(m.hood.on ? 'b08.desc.hoodOn' : 'b08.desc.hoodOff'));
  if (id === 'sep') parts.push(t(m.sep.closed ? 'b08.desc.closed' : 'b08.desc.open'));
  if (id === 'paper' && m.paper.cut) parts.push(t(m.paper.hung ? 'b08.desc.paperHung' : 'b08.desc.paperCut'));
  if (id === 'mic') {
    const v = microscopeView(w);
    parts.push(v.locked ? t('b08.desc.objective', { x: v.objectiveX, mag: v.magnification }) : t('b08.desc.turretBetween'));
  }
  if (id === 'case') parts.push(t(w.slideCase.open ? 'b08.desc.caseOpen' : 'b08.desc.caseClosed'));
  if (id === 'glassBin' && w.shards > 0) parts.push(t('b08.desc.shardsPending'));
  return parts.join(' · ');
}
