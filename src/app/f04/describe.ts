/**
 * Nombres y descripciones accesibles de F04: estado de cada aparato en palabras (carro retenido o en marcha, cordel por
 * la garganta o el eje, portapesas colgado, sostenido o en el suelo, freno, sensores conectados, a cero y calibrados,
 * compuertas conectadas, balanza tarada, pareja en reposo). Nunca revela la lectura que el estudiante debe tomar del
 * instrumento (ni la masa, ni la aceleración, ni la fuerza, ni la posición en la escala).
 */
import type { F04World } from '../../simulation/f04-world/types';
import { runningF4 } from '../../simulation/f04-world/world';
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
  const st = w.string;
  const sensor = (sid: keyof F04World['sensors']) => {
    const s = w.sensors[sid];
    parts.push(s.connected ? t('f04.desc.connected') : t('f04.desc.disconnected'));
    if (s.zeroed) parts.push(t('f04.desc.zeroed'));
    if (sid !== 'accel01') parts.push(s.calibrated ? t('f04.desc.calibrated') : t('f04.desc.uncalibrated'));
  };
  switch (o.kind) {
    case 'cart':
      parts.push(w.cart.on === 'balance' ? t('f04.desc.onBalance') : w.cart.latched ? t('f04.desc.latched') : runningF4(w) ? t('f04.desc.running') : t('f04.desc.stopped'));
      if (st.attached) parts.push(t('f04.desc.attached'));
      parts.push(w.logger.cableClipped ? t('f04.desc.clipped') : t('f04.desc.cableFree'));
      break;
    case 'pulley':
      parts.push(t(`f04.desc.path.${st.path}`));
      parts.push(st.clamped ? t('f04.desc.clamped') : t('f04.desc.loose'));
      break;
    case 'hanger':
      parts.push(t(`f04.desc.where.${o.support}`));
      if (st.hung) parts.push(st.held ? t('f04.desc.held') : st.landed ? t('f04.desc.landed') : st.slack > 1e-6 ? t('f04.desc.slack') : t('f04.desc.taut'));
      break;
    case 'slotMass':
      parts.push(t(`f04.desc.where.${o.support}`));
      break;
    case 'brake':
      parts.push(w.brake.on ? t('f04.desc.on') : t('f04.desc.off'));
      break;
    case 'forceSensor':
      sensor(id as 'forceA');
      if (Math.abs(w.sensors[id as 'forceA'].angleDeg) >= 3) parts.push(t('f04.desc.tilted'));
      break;
    case 'accelerometer':
      sensor('accel01');
      if (w.cart.shock) parts.push(t('f04.desc.shock'));
      break;
    case 'gate':
      parts.push(w.logger.gatesConnected ? t('f04.desc.connected') : t('f04.desc.disconnected'));
      break;
    case 'logger':
      parts.push(t('f04.desc.rate', { hz: w.logger.rateHz }));
      break;
    case 'balance':
      parts.push(w.balance.tared ? t('f04.desc.tared') : t('f04.desc.untared'));
      if (w.balance.on) parts.push(t('f04.desc.panWith', { what: f04NameOf(w, w.balance.on) }));
      break;
    case 'pairCart':
      parts.push(w.pair.active ? t('f04.desc.running') : t('f04.desc.stopped'));
      break;
  }
  return parts.join(' · ');
}
