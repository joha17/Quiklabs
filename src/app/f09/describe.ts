/**
 * Nombres y descripciones accesibles de F09: estado de cada aparato en palabras (base sujeta, eje nivelado, guarda
 * abierta o cerrada, freno, mesa girando o quieta, masa orbitante en la guía con el tope trabado y el cordón tenso,
 * masas radiales bloqueadas, ranura del tambor y cordón enrollado, carro del dinamómetro tirando, motor acoplado,
 * sensores conectados, en cero y calibrados, balanza tarada). Nunca revela la lectura que el estudiante debe tomar del
 * instrumento (ni masas, ni radios, ni fuerzas, ni velocidades).
 */
import type { F09World, SlideId } from '../../simulation/f09-world/types';
import { spinningF9 } from '../../simulation/f09-world/world';
import { t } from '../i18n';

export function f09NameOf(w: F09World, id: string): string {
  const k = `f09.obj.${id}`;
  if (t(k) !== k) return t(k);
  const o = w.objects[id];
  return o ? t(`f09.kind.${o.kind}`) : id;
}

export const f09NameTag = (w: F09World, id: string) => f09NameOf(w, id);

export function describeObjectF09(w: F09World, id: string): string {
  const o = w.objects[id];
  if (!o) return '';
  const parts: string[] = [f09NameOf(w, id)];
  const r = w.rotor;
  const conn = (on: boolean) => (on ? t('f09.desc.connected') : t('f09.desc.disconnected'));
  switch (o.kind) {
    case 'base':
      parts.push(w.base.clamped ? t('f09.desc.clamped') : t('f09.desc.unclamped'));
      break;
    case 'level':
      parts.push(r.tiltDeg > 0.5 ? t('f09.desc.tilted') : t('f09.desc.levelled'));
      break;
    case 'guard':
      parts.push(w.base.guardClosed ? t('f09.desc.guardClosed') : t('f09.desc.guardOpen'));
      break;
    case 'hub':
      parts.push(spinningF9(w) ? t('f09.desc.spinning') : t('f09.desc.still'));
      parts.push(t(`f09.desc.brake${r.brake}`));
      if (r.tripped) parts.push(t('f09.desc.tripped'));
      break;
    case 'brake':
      parts.push(t(`f09.desc.brake${r.brake}`));
      break;
    case 'guide':
      parts.push(w.orbit.stopLocked ? t('f09.desc.stopLocked') : t('f09.desc.stopFree'));
      if (w.damaged) parts.push(t('f09.desc.damaged'));
      break;
    case 'orbitMass':
      parts.push(t(`f09.desc.where.${w.orbit.off ? 'off' : o.support}`));
      if (o.support === 'guide' && w.orbit.slackM > 0) parts.push(t('f09.desc.slack'));
      break;
    case 'radialMass': {
      const sl = w.slides[id as SlideId];
      parts.push(t(`f09.desc.where.${o.support}`));
      parts.push(sl.locked ? t('f09.desc.locked') : t('f09.desc.loose'));
      break;
    }
    case 'pullRing':
      parts.push(w.pullTarget !== null ? t('f09.desc.pulling') : t('f09.desc.idle'));
      break;
    case 'drum':
      parts.push(t('f09.desc.arm', { cm: Math.round(w.drum.armR * 100) }));
      parts.push(w.drum.turns > 0 ? t('f09.desc.wound', { n: w.drum.turns }) : t('f09.desc.unwound'));
      break;
    case 'dynamometer':
      parts.push(w.drum.pulling ? t('f09.desc.pulling') : t('f09.desc.idle'));
      parts.push(w.dyn.zeroed ? t('f09.desc.zeroed') : t('f09.desc.notZeroed'));
      if (w.drum.aimDeg >= 3) parts.push(t('f09.desc.oblique'));
      break;
    case 'motor':
      parts.push(w.motor.clutch ? t('f09.desc.clutchOn') : t('f09.desc.clutchOff'));
      break;
    case 'forceSensor': {
      const f = w.force;
      parts.push(conn(f.connected));
      parts.push(f.zeroed ? t('f09.desc.zeroed') : t('f09.desc.notZeroed'));
      parts.push(t('f09.desc.range', { n: w.params.force.ranges[f.rangeIdx] }));
      if (f.angleDeg >= 3) parts.push(t('f09.desc.tilted'));
      break;
    }
    case 'gate':
      parts.push(conn(w.gate.connected));
      parts.push(w.gate.cableRouted ? t('f09.desc.cableRouted') : t('f09.desc.cableLoose'));
      break;
    case 'encoder':
      parts.push(conn(w.encoder.connected));
      parts.push(w.encoder.calibrated ? t('f09.desc.calibrated') : t('f09.desc.uncalibrated'));
      break;
    case 'logger':
      parts.push(t('f09.desc.rate', { hz: w.logger.rateHz }));
      break;
    case 'balance':
      parts.push(w.balance.tared ? t('f09.desc.tared') : t('f09.desc.untared'));
      if (w.balance.on) parts.push(t('f09.desc.panWith', { what: f09NameOf(w, w.balance.on) }));
      break;
  }
  return parts.join(' · ');
}
