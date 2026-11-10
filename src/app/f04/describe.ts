/**
 * Nombres y descripciones accesibles de F04: estado de cada aparato en palabras (soporte anclado, lanzador con su
 * muesca y su protector, fotopuerta montada y conectada, plataforma calibrada, pantalla dentro de la pista, barrera,
 * ventilador). Nunca revela la lectura que el estudiante debe tomar del instrumento (ni el ángulo ni la altura).
 */
import type { F04World } from '../../simulation/f04-world/types';
import { ballFlying } from '../../simulation/f04-world/world';
import { t } from '../i18n';

export function f04NameOf(w: F04World, id: string): string {
  const k = `f04.obj.${id}`;
  if (t(k) !== k) return t(k);
  const o = w.objects[id];
  return o ? t(`f04.kind.${o.kind}`) : id;
}

export const f04NameTag = (w: F04World, id: string) => f04NameOf(w, id);

export function describeObjectF04(w: F04World, id: string): string {
  const o = w.objects[id];
  if (!o) return '';
  const parts: string[] = [f04NameOf(w, id)];
  const l = w.launcher;
  switch (o.kind) {
    case 'stand':
      parts.push(w.stand.anchored ? t('f04.desc.anchored') : t('f04.desc.free'));
      break;
    case 'launcher':
      parts.push(l.notch > 0 ? t('f04.desc.cocked', { n: l.notch }) : t('f04.desc.uncocked'));
      parts.push(l.loaded ? t('f04.desc.loaded') : t('f04.desc.empty'));
      if (l.capOn) parts.push(t('f04.desc.capOn'));
      if (l.zeroed) parts.push(t('f04.desc.zeroed'));
      if (ballFlying(w)) parts.push(t('f04.desc.flying'));
      break;
    case 'gate':
      parts.push(w.gate.mounted ? t('f04.desc.mounted') : t('f04.desc.unmounted'));
      parts.push(w.gate.connected ? t('f04.desc.connected') : t('f04.desc.disconnected'));
      break;
    case 'timer':
      parts.push(t('f04.desc.timer', { hz: w.timer.rateHz, r: t(`f04.desc.range.${w.timer.range}`) }));
      break;
    case 'platform':
      parts.push(w.platform.connected ? t('f04.desc.connected') : t('f04.desc.disconnected'));
      parts.push(w.platform.calibrated ? t('f04.desc.calibrated') : t('f04.desc.uncalibrated'));
      break;
    case 'screen':
      parts.push(w.screen.inLane ? t('f04.desc.inLane') : t('f04.desc.outLane'));
      if (w.screen.marks.length) parts.push(t('f04.desc.marks', { n: w.screen.marks.length }));
      break;
    case 'barrier':
      parts.push(w.barrierClosed ? t('f04.desc.closed') : t('f04.desc.open'));
      break;
    case 'fan':
      parts.push(w.fan.speed ? t('f04.desc.fan', { n: w.fan.speed, d: t(`f04.desc.dir.${w.fan.dir}`) }) : t('f04.desc.off'));
      break;
    case 'ball':
      parts.push(t(`f04.desc.where.${o.support}`));
      if (w.balls[id]?.damaged) parts.push(t('f04.desc.damaged'));
      break;
    case 'plumb':
      if (w.plumbMark) parts.push(t('f04.desc.marked'));
      break;
  }
  return parts.join(' · ');
}
