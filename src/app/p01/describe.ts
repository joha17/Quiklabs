/**
 * Nombres y descripciones accesibles de la Práctica 1 (§15): volúmenes en palabras (en evaluación sin valores
 * exactos), estado de la balanza, menisco de la pipeta respecto de la marca, clavos, calibrador y termómetro. No
 * completa observaciones ni revela lo que el estudiante debe leer en el instrumento.
 */
import type { P01World } from '../../simulation/density-world/types';
import { fluidMl, pipetteAboveMarkMl } from '../../simulation/density-world/world';
import { t } from '../i18n';

const fmt = (v: number, d = 1) => v.toFixed(d).replace('.', ',');

export function p01NameOf(w: P01World, id: string): string {
  if (t(`p01.obj.${id}`) !== `p01.obj.${id}`) return t(`p01.obj.${id}`);
  const o = w.objects[id];
  return o ? t(`p01.kind.${o.kind}`) : id;
}

export function p01NameTag(w: P01World, id: string): string {
  if (t(`p01.tag.${id}`) !== `p01.tag.${id}`) return t(`p01.tag.${id}`);
  return p01NameOf(w, id);
}

/** Agua en palabras: aproximada en práctica; en evaluación solo «poca / media / casi lleno». */
export function waterWords(ml: number, capacity: number, mode: string): string {
  if (ml < 0.05) return t('p01.desc.empty');
  if (mode === 'EVALUATION') return ml / capacity < 0.25 ? t('p01.desc.little') : ml / capacity < 0.75 ? t('p01.desc.half') : t('p01.desc.full');
  return t('p01.desc.ml', { ml: fmt(ml, ml < 10 ? 1 : 0) });
}

export function describeObject(w: P01World, id: string, mode: string): string {
  const o = w.objects[id];
  if (!o) return '';
  const f = w.fluids[id];
  const nails = (where: string) => w.nails.filter((n) => n.where === where).length;
  switch (o.kind) {
    case 'balance': {
      const b = w.balance;
      if (!b.powered) return t('p01.desc.off');
      const parts = [b.stable ? t('p01.desc.stable') : t('p01.desc.unstable')];
      parts.push(b.panIds.length ? t('p01.desc.onPan', { o: b.panIds.map((x) => p01NameOf(w, x)).join(', ') }) : t('p01.desc.panEmpty'));
      if (b.levelErrorDeg > 0.5) parts.push(t('p01.desc.unlevel'));
      if (b.panWetG > 0.005) parts.push(t('p01.desc.panWet'));
      return parts.join(' · ');
    }
    case 'pipette': {
      const p = w.pipette;
      const parts = [p.fillerAttached ? (p.fillerContaminated ? t('p01.desc.fillerDirty') : t('p01.desc.filler')) : t('p01.desc.noFiller')];
      if (p.waterG > 0.3) {
        const a = pipetteAboveMarkMl(w);
        parts.push(Math.abs(a) <= 0.02 ? t('p01.desc.atMark') : a > 0 ? t('p01.desc.overMark') : t('p01.desc.belowMark'));
      } else parts.push(t('p01.desc.empty'));
      if (p.airMl > 0.01) parts.push(t('p01.desc.bubble'));
      if (p.externalDropG > 0.005) parts.push(t('p01.desc.dropOutside'));
      if (w.fluids[o.support]) parts.push(t('p01.desc.tipIn', { o: p01NameOf(w, o.support) }));
      return parts.join(' · ');
    }
    case 'cylinder': {
      const parts = [waterWords(fluidMl(f), f.capacityMl, mode)];
      if (nails('cylinder50')) parts.push(t('p01.desc.nails', { n: nails('cylinder50') }));
      if (w.cylinder.trappedAirMl > 0.05) parts.push(t('p01.desc.air'));
      if (w.timeS < w.cylinder.unsettledUntil) parts.push(t('p01.desc.moving'));
      if (o.support === 'hand' || Math.abs(o.pose.rotationRad) > 0.03) parts.push(t('p01.desc.tilted'));
      return parts.join(' · ');
    }
    case 'erlenmeyer':
    case 'reservoir':
    case 'waste': {
      const parts = [waterWords(fluidMl(f), f.capacityMl, mode)];
      if (f.wetG > 0.05 && f.waterG < 0.5) parts.push(t('p01.desc.wet'));
      if (o.damaged) parts.push(t('p01.desc.damaged'));
      if (o.support === 'iceBath01') parts.push(t('p01.desc.inBath'));
      if (f.waterG > 5 && f.tempC < 15) parts.push(t('p01.desc.coldTouch'));
      return parts.join(' · ');
    }
    case 'weighBoat':
    case 'nailsDish':
      return nails(id) ? t('p01.desc.nails', { n: nails(id) }) : t('p01.desc.empty');
    case 'thermometer': {
      const th = w.thermometer;
      return [t('p01.desc.tReads', { c: fmt(th.displayedC + th.biasC, 1) }), th.where === 'air' ? t('p01.desc.inAir') : t('p01.desc.probeIn', { o: p01NameOf(w, th.where) })].join(' · ');
    }
    case 'caliper': {
      const c = w.caliper;
      return c.target === 'none' ? t('p01.desc.caliperOpen') : t(`p01.desc.caliper_${c.target}`);
    }
    case 'solidCylinder':
      return o.support === 'watchGlass01' ? t('p01.desc.onGlass') : '';
    case 'spillTray':
      return w.fluids.spillTray01.waterG > 0.05 ? t('p01.desc.trayWater') : t('p01.desc.empty');
    default:
      return o.kind.startsWith('rec') ? t(`p01.recDesc.${o.kind}`) : '';
  }
}
