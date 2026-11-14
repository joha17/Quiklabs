/**
 * Nombres y descripciones accesibles de F08: estado de cada aparato en palabras (base sujeta, guarda abierta o cerrada,
 * freno, rotor girando o quieto, sólido acoplado y su agujero, masas corredizas fijas o sueltas, cuerda enrollada, masa
 * colgada o sostenida, polea alineada, tope y fotopuerta, encoder calibrado y en cero, sensores conectados, balanza
 * tarada). Nunca revela la lectura que el estudiante debe tomar del instrumento (ni masas, ni diámetros, ni ángulos).
 */
import type { F08World, SlideId, SolidId } from '../../simulation/f08-world/types';
import { spinningF8 } from '../../simulation/f08-world/world';
import { t } from '../i18n';

export function f08NameOf(w: F08World, id: string): string {
  const k = `f08.obj.${id}`;
  if (t(k) !== k) return t(k);
  const o = w.objects[id];
  return o ? t(`f08.kind.${o.kind}`) : id;
}

export const f08NameTag = (w: F08World, id: string) => f08NameOf(w, id);

export function describeObjectF08(w: F08World, id: string): string {
  const o = w.objects[id];
  if (!o) return '';
  const parts: string[] = [f08NameOf(w, id)];
  const r = w.rotor;
  switch (o.kind) {
    case 'base':
      parts.push(w.base.clamped ? t('f08.desc.clamped') : t('f08.desc.unclamped'));
      break;
    case 'guard':
      parts.push(w.base.guardClosed ? t('f08.desc.guardClosed') : t('f08.desc.guardOpen'));
      break;
    case 'hub':
      parts.push(spinningF8(w) ? t('f08.desc.spinning') : t('f08.desc.still'));
      parts.push(r.brake ? t('f08.desc.brakeOn') : t('f08.desc.brakeOff'));
      if (r.tripped) parts.push(t('f08.desc.tripped'));
      if (r.touch) parts.push(t('f08.desc.touched'));
      parts.push(r.solid ? t('f08.desc.withSolid', { what: f08NameOf(w, r.solid) }) : t('f08.desc.empty'));
      break;
    case 'solid': {
      const sid = id as SolidId;
      parts.push(t(`f08.desc.where.${o.support}`));
      if (r.solid === sid && r.hole > 0) parts.push(t('f08.desc.offAxis'));
      if (r.solid === sid && r.ecc > 0.001) parts.push(t('f08.desc.play'));
      if (w.damaged[sid]) parts.push(t('f08.desc.damaged'));
      break;
    }
    case 'slideMass': {
      const sl = w.slides[id as SlideId];
      parts.push(sl.locked ? t('f08.desc.locked') : t('f08.desc.loose'));
      break;
    }
    case 'pulley':
      parts.push(Math.abs(w.string.pulleyDzCm) > 0.5 ? t('f08.desc.pulleyOff') : t('f08.desc.pulleyOk'));
      parts.push(w.string.turns > 0 ? t('f08.desc.wound', { n: w.string.turns }) : t('f08.desc.unwound'));
      break;
    case 'dropMass':
      parts.push(t(`f08.desc.where.${o.support}`));
      if (w.string.mass === id) parts.push(w.string.held ? t('f08.desc.held') : w.string.landed ? t('f08.desc.landed') : t('f08.desc.falling'));
      break;
    case 'catch':
      parts.push(w.column.catchOn ? t('f08.desc.catchOn') : t('f08.desc.catchOff'));
      break;
    case 'gate':
      parts.push(w.logger.gateConnected ? t('f08.desc.connected') : t('f08.desc.disconnected'));
      break;
    case 'encoder': {
      const e = w.encoder;
      parts.push(e.connected ? t('f08.desc.connected') : t('f08.desc.disconnected'));
      parts.push(e.calibrated ? t('f08.desc.calibrated') : t('f08.desc.uncalibrated'));
      if (e.zeroed) parts.push(t('f08.desc.zeroed'));
      break;
    }
    case 'tensionSensor': {
      const s = w.tension;
      parts.push(s.connected ? t('f08.desc.connected') : t('f08.desc.disconnected'));
      if (s.zeroed) parts.push(t('f08.desc.zeroed'));
      if (s.angleDeg >= 3) parts.push(t('f08.desc.tilted'));
      break;
    }
    case 'tach':
      parts.push(w.tach.connected ? t('f08.desc.connected') : t('f08.desc.disconnected'));
      parts.push(t('f08.desc.range', { n: w.params.tach.ranges[w.tach.rangeIdx] }));
      break;
    case 'logger':
      parts.push(t('f08.desc.rate', { hz: w.logger.rateHz }));
      break;
    case 'balance':
      parts.push(w.balance.tared ? t('f08.desc.tared') : t('f08.desc.untared'));
      if (w.balance.on) parts.push(t('f08.desc.panWith', { what: f08NameOf(w, w.balance.on) }));
      break;
  }
  return parts.join(' · ');
}
