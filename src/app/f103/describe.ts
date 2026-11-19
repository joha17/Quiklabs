/**
 * Nombres y descripciones accesibles de F103: estado de cada aparato en palabras (soporte anclado, lanzador con su
 * muesca y su protector, fotopuerta montada y conectada, plataforma calibrada, pantalla dentro de la pista, barrera,
 * ventilador). Nunca revela la lectura que el estudiante debe tomar del instrumento (ni el ángulo ni la altura).
 */
import type { F103World } from '../../simulation/f103-world/types';
import { ballFlying } from '../../simulation/f103-world/world';
import { t } from '../i18n';

export function f103NameOf(w: F103World, id: string): string {
  const k = `f103.obj.${id}`;
  if (t(k) !== k) return t(k);
  const o = w.objects[id];
  return o ? t(`f103.kind.${o.kind}`) : id;
}

export const f103NameTag = (w: F103World, id: string) => f103NameOf(w, id);

export function describeObjectF103(w: F103World, id: string): string {
  const o = w.objects[id];
  if (!o) return '';
  const parts: string[] = [f103NameOf(w, id)];
  const l = w.launcher;
  switch (o.kind) {
    case 'stand':
      parts.push(w.stand.anchored ? t('f103.desc.anchored') : t('f103.desc.free'));
      break;
    case 'launcher':
      parts.push(l.notch > 0 ? t('f103.desc.cocked', { n: l.notch }) : t('f103.desc.uncocked'));
      parts.push(l.loaded ? t('f103.desc.loaded') : t('f103.desc.empty'));
      if (l.capOn) parts.push(t('f103.desc.capOn'));
      if (l.zeroed) parts.push(t('f103.desc.zeroed'));
      if (ballFlying(w)) parts.push(t('f103.desc.flying'));
      break;
    case 'gate':
      parts.push(w.gate.mounted ? t('f103.desc.mounted') : t('f103.desc.unmounted'));
      parts.push(w.gate.connected ? t('f103.desc.connected') : t('f103.desc.disconnected'));
      break;
    case 'timer':
      parts.push(t('f103.desc.timer', { hz: w.timer.rateHz, r: t(`f103.desc.range.${w.timer.range}`) }));
      break;
    case 'platform':
      parts.push(w.platform.connected ? t('f103.desc.connected') : t('f103.desc.disconnected'));
      parts.push(w.platform.calibrated ? t('f103.desc.calibrated') : t('f103.desc.uncalibrated'));
      break;
    case 'screen':
      parts.push(w.screen.inLane ? t('f103.desc.inLane') : t('f103.desc.outLane'));
      if (w.screen.marks.length) parts.push(t('f103.desc.marks', { n: w.screen.marks.length }));
      break;
    case 'barrier':
      parts.push(w.barrierClosed ? t('f103.desc.closed') : t('f103.desc.open'));
      break;
    case 'fan':
      parts.push(w.fan.speed ? t('f103.desc.fan', { n: w.fan.speed, d: t(`f103.desc.dir.${w.fan.dir}`) }) : t('f103.desc.off'));
      break;
    case 'ball':
      parts.push(t(`f103.desc.where.${o.support}`));
      if (w.balls[id]?.damaged) parts.push(t('f103.desc.damaged'));
      break;
    case 'plumb':
      if (w.plumbMark) parts.push(t('f103.desc.marked'));
      break;
  }
  return parts.join(' · ');
}
