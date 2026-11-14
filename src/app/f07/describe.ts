/**
 * Nombres y descripciones accesibles de F07: estado de cada aparato en palabras (carro trabado, en marcha o quieto,
 * freno, ruedas, desalineación, paragolpes montado y su estado, topes amortiguados, fotopuertas sujetas y conectadas,
 * sensor de fuerza a cero y calibrado, cámara encendida, balanza tarada). Nunca revela la lectura que el estudiante
 * debe tomar del instrumento (ni la masa, ni el ancho de la bandera, ni la inclinación, ni la posición).
 */
import type { CartId, F07World } from '../../simulation/f07-world/types';
import { cartMovingF7 } from '../../simulation/f07-world/world';
import { t } from '../i18n';

export function f07NameOf(w: F07World, id: string): string {
  const k = `f07.obj.${id}`;
  if (t(k) !== k) return t(k);
  const o = w.objects[id];
  return o ? t(`f07.kind.${o.kind}`) : id;
}

export const f07NameTag = (w: F07World, id: string) => f07NameOf(w, id);

export function describeObjectF07(w: F07World, id: string): string {
  const o = w.objects[id];
  if (!o) return '';
  const parts: string[] = [f07NameOf(w, id)];
  switch (o.kind) {
    case 'cart': {
      const c = w.carts[id as CartId];
      parts.push(t(`f07.desc.where.${c.on}`));
      if (c.latched) parts.push(t('f07.desc.latched', { cm: Math.round(c.compression * 100) }));
      if (c.on === 'track') parts.push(cartMovingF7(w, id as CartId) ? t('f07.desc.moving') : t('f07.desc.still'));
      parts.push(c.brake ? t('f07.desc.brakeOn') : t('f07.desc.brakeOff'));
      if (c.wheelBind) parts.push(t('f07.desc.wheelBind'));
      if (Math.abs(c.offsetMm) > 0) parts.push(t('f07.desc.offCenter'));
      if (c.flagYawDeg > 2) parts.push(t('f07.desc.flagTilted'));
      if (c.damaged) parts.push(t('f07.desc.cartDamaged'));
      if (w.bumper.joined) parts.push(t('f07.desc.joined'));
      break;
    }
    case 'cartMass':
      parts.push(t(`f07.desc.where.${o.support}`));
      break;
    case 'bumperKit': {
      const b = w.bumper;
      parts.push(t(`f07.bumper.${b.type}`));
      if (b.type === 'velcro') parts.push(b.velcroFixed ? t('f07.desc.velcroFixed') : t('f07.desc.velcroLoose'));
      break;
    }
    case 'endStop':
      parts.push(w.track.endDampers ? t('f07.desc.dampersOn') : t('f07.desc.dampersOff'));
      break;
    case 'level':
      parts.push(t('f07.desc.screw'));
      break;
    case 'launcher': {
      const c = w.carts[id === 'launcherA' ? 'cartA' : 'cartB'];
      parts.push(c.latched ? t('f07.desc.cocked', { cm: Math.round(c.compression * 100) }) : t('f07.desc.free'));
      break;
    }
    case 'forceSensor': {
      const s = w.sensor;
      parts.push(s.connected ? t('f07.desc.connected') : t('f07.desc.disconnected'));
      if (s.zeroed) parts.push(t('f07.desc.zeroed'));
      parts.push(s.calibrated ? t('f07.desc.calibrated') : t('f07.desc.uncalibrated'));
      parts.push(t('f07.desc.range', { n: w.params.force.ranges[s.rangeIdx] }));
      if (Math.abs(s.angleDeg) >= 3) parts.push(t('f07.desc.tilted'));
      break;
    }
    case 'gate':
      parts.push(w.logger.gatesConnected ? t('f07.desc.connected') : t('f07.desc.disconnected'));
      parts.push(w.track.gatesClamped ? t('f07.desc.clamped') : t('f07.desc.unclamped'));
      break;
    case 'logger':
      parts.push(t('f07.desc.rate', { hz: w.logger.rateHz }));
      break;
    case 'camera':
      parts.push(w.logger.cameraOn ? t('f07.desc.connected') : t('f07.desc.disconnected'));
      break;
    case 'balance':
      parts.push(w.balance.tared ? t('f07.desc.tared') : t('f07.desc.untared'));
      if (w.balance.on) parts.push(t('f07.desc.panWith', { what: f07NameOf(w, w.balance.on) }));
      break;
  }
  return parts.join(' · ');
}
