/**
 * Nombres y descripciones accesibles de F101: estado de cada instrumento en palabras (abierto, cerrado, bloqueado,
 * pieza entre las caras, nivel de la probeta, anillo centrado o no). Nunca revela la lectura que el estudiante debe
 * tomar del instrumento.
 */
import type { F101World } from '../../simulation/f101-world/types';
import { hangingOn, ringOffsetMm, PULLEYS } from '../../simulation/f101-world/world';
import { t } from '../i18n';

export function f101NameOf(w: F101World, id: string): string {
  const k = `f101.obj.${id}`;
  if (t(k) !== k) return t(k);
  const o = w.objects[id];
  return o ? t(`f101.kind.${o.kind}`) : id;
}

export const f101NameTag = (w: F101World, id: string) => f101NameOf(w, id);

export function describeObjectF101(w: F101World, id: string): string {
  const o = w.objects[id];
  if (!o) return '';
  const name = f101NameOf(w, id);
  const parts: string[] = [name];
  switch (o.kind) {
    case 'caliper': {
      const c = w.caliper;
      parts.push(c.part ? t('f101.desc.holding', { o: f101NameOf(w, c.part.id) }) : c.jawMm < 0.05 ? t('f101.desc.closed') : t('f101.desc.open'));
      if (c.locked) parts.push(t('f101.desc.locked'));
      break;
    }
    case 'micrometer': {
      const m = w.micrometer;
      parts.push(m.part ? t('f101.desc.holding', { o: f101NameOf(w, m.part.id) }) : t('f101.desc.open'));
      if (m.locked) parts.push(t('f101.desc.locked'));
      if (m.facesDirty) parts.push(t('f101.desc.dirty'));
      break;
    }
    case 'balance':
      parts.push(!w.balance.powered ? t('f101.desc.off') : w.balance.stable ? t('f101.desc.stable') : t('f101.desc.unstable'));
      if (w.balance.panIds.length) parts.push(t('f101.desc.onPan', { o: w.balance.panIds.map((x) => f101NameOf(w, x)).join(', ') }));
      break;
    case 'gradCyl':
      if (w.gradCyl.parts.length) parts.push(t('f101.desc.inside', { o: w.gradCyl.parts.map((x) => f101NameOf(w, x)).join(', ') }));
      if (w.gradCyl.cracked) parts.push(t('f101.desc.cracked'));
      break;
    case 'forceTable': {
      const tb = w.table;
      parts.push(tb.pinIn ? t('f101.desc.pinIn') : t('f101.desc.pinOut'));
      if (!tb.pinIn) parts.push(ringOffsetMm(w) < 1.5 ? t('f101.desc.ringCentered') : t('f101.desc.ringOff'));
      const loaded = PULLEYS.filter((p) => hangingOn(w, p).hangerId).length;
      parts.push(t('f101.desc.loaded', { n: loaded }));
      break;
    }
    case 'pulley': {
      const p = w.table.pulleys[id];
      parts.push(p.seated ? t('f101.desc.seated') : t('f101.desc.loose'));
      if (hangingOn(w, id).hangerId && !p.threaded) parts.push(t('f101.desc.offWheel'));
      break;
    }
    case 'sensorBox': {
      const s = w.table.sensor;
      parts.push(s.connected ? t('f101.desc.connected', { r: s.rangeN, hz: s.rateHz }) : t('f101.desc.disconnected'));
      if (s.capture) parts.push(t('f101.desc.capturing'));
      break;
    }
    case 'dynamometer':
      parts.push(w.table.dyn.onRim ? t('f101.desc.mounted') : t('f101.desc.unmounted'));
      break;
  }
  return parts.join(' · ');
}
