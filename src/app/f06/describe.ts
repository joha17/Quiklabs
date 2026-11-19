/**
 * Nombres y descripciones accesibles de F06: estado de cada aparato en palabras (resorte montado y asegurado,
 * porta-pesas colgado y cuántas pesas lleva, carro trabado o en marcha, freno, abrazadera de la columna, sensores
 * conectados, a cero y calibrados, compuertas conectadas, péndulo sostenido o en reposo, balanza tarada). Nunca revela
 * la lectura que el estudiante debe tomar del instrumento (ni la masa, ni el alargamiento, ni la altura, ni el ángulo).
 */
import type { F06World } from '../../simulation/f06-world/types';
import { bobMovingF6, busyF6, cartMovingF6 } from '../../simulation/f06-world/world';
import { slotsOnHanger } from '../../simulation/f06-world/conservation';
import { t } from '../i18n';

export function f06NameOf(w: F06World, id: string): string {
  const k = `f06.obj.${id}`;
  if (t(k) !== k) return t(k);
  const o = w.objects[id];
  return o ? t(`f06.kind.${o.kind}`) : id;
}

export const f06NameTag = (w: F06World, id: string) => f06NameOf(w, id);

export function describeObjectF06(w: F06World, id: string): string {
  const o = w.objects[id];
  if (!o) return '';
  const parts: string[] = [f06NameOf(w, id)];
  switch (o.kind) {
    case 'spring': {
      const sp = w.springs[id];
      parts.push(t(`f06.place.${sp.at}`));
      if (sp.at === 'launcher') parts.push(w.track.springSecured ? t('f06.desc.secured') : t('f06.desc.unsecured'));
      if (sp.damaged) parts.push(t('f06.desc.damaged'));
      break;
    }
    case 'hanger':
      parts.push(w.stand.hangerOn ? t('f06.desc.hung', { n: slotsOnHanger(w) }) : t(`f06.desc.where.${o.support}`));
      break;
    case 'slotMass':
    case 'cartMass':
      parts.push(t(`f06.desc.where.${o.support}`));
      break;
    case 'ruler':
      parts.push(w.stand.rulerOffsetCm === 0 && !w.stand.zeroLoaded ? t('f06.desc.aligned') : t('f06.desc.notAligned'));
      break;
    case 'cart':
      parts.push(t(`f06.desc.where.${w.cart.on}`));
      if (w.cart.latched) parts.push(t('f06.desc.latched', { cm: Math.round(w.cart.compression * 100) }));
      if (w.cart.held) parts.push(t('f06.desc.braked'));
      if (w.cart.on === 'track') parts.push(busyF6(w) || cartMovingF6(w) ? t('f06.desc.moving') : t('f06.desc.still'));
      if (w.cart.damaged) parts.push(t('f06.desc.cartDamaged'));
      break;
    case 'track':
      parts.push(w.track.clamped ? t('f06.desc.clamped') : t('f06.desc.unclamped'));
      break;
    case 'brake':
      parts.push(w.track.brakeOn ? t('f06.desc.on') : t('f06.desc.off'));
      break;
    case 'pad':
      parts.push(w.track.frictionN > 0 ? t('f06.desc.padOn') : t('f06.desc.padOff'));
      break;
    case 'damper':
      parts.push(w.track.damperC > 0 ? t('f06.desc.on') : t('f06.desc.off'));
      break;
    case 'forceSensor': {
      const s = w.sensor;
      parts.push(s.connected ? t('f06.desc.connected') : t('f06.desc.disconnected'));
      if (s.zeroed) parts.push(t('f06.desc.zeroed'));
      parts.push(s.calibrated ? t('f06.desc.calibrated') : t('f06.desc.uncalibrated'));
      parts.push(t('f06.desc.range', { n: w.params.force.ranges[s.rangeIdx] }));
      if (Math.abs(s.angleDeg) >= 3) parts.push(t('f06.desc.tilted'));
      break;
    }
    case 'posSensor':
      parts.push(w.logger.posConnected ? t('f06.desc.connected') : t('f06.desc.disconnected'));
      break;
    case 'angleSensor':
      parts.push(w.logger.angleConnected ? t('f06.desc.connected') : t('f06.desc.disconnected'));
      break;
    case 'gate':
      parts.push(w.logger.gatesConnected ? t('f06.desc.connected') : t('f06.desc.disconnected'));
      break;
    case 'logger':
      parts.push(t('f06.desc.rate', { hz: w.logger.rateHz }));
      parts.push(w.logger.synced ? t('f06.desc.synced') : t('f06.desc.unsynced'));
      break;
    case 'pendulum':
      parts.push(w.pend.held ? t('f06.desc.bobHeld') : bobMovingF6(w) ? t('f06.desc.moving') : t('f06.desc.still'));
      break;
    case 'balance':
      parts.push(w.balance.tared ? t('f06.desc.tared') : t('f06.desc.untared'));
      if (w.balance.on) parts.push(t('f06.desc.panWith', { what: f06NameOf(w, w.balance.on) }));
      break;
  }
  return parts.join(' · ');
}
