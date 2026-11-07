/**
 * Nombres y descripciones accesibles de F102: estado de cada aparato en palabras (carro retenido o libre, émbolo
 * cargado, compuerta conectada o girada, cordel en la ranura, cinta tensa, electroimán encendido, tapa de la
 * fotocelda, sensor conectado). Nunca revela la lectura que el estudiante debe tomar del instrumento.
 */
import type { F102World } from '../../simulation/f102-world/types';
import { cartMoving, filterStack, hanging } from '../../simulation/f102-world/world';
import { t } from '../i18n';

export function f102NameOf(w: F102World, id: string): string {
  const k = `f102.obj.${id}`;
  if (t(k) !== k) return t(k);
  const o = w.objects[id];
  return o ? t(`f102.kind.${o.kind}`) : id;
}

export const f102NameTag = (w: F102World, id: string) => f102NameOf(w, id);

export function describeObjectF102(w: F102World, id: string): string {
  const o = w.objects[id];
  if (!o) return '';
  const parts: string[] = [f102NameOf(w, id)];
  switch (o.kind) {
    case 'cart':
      parts.push(w.cart.held ? t('f102.desc.held') : cartMoving(w) ? t('f102.desc.moving') : t('f102.desc.free'));
      if (w.cart.bars.length) parts.push(t('f102.desc.bars', { n: w.cart.bars.length }));
      if (w.cart.flagBent) parts.push(t('f102.desc.flagBent'));
      if (w.tape.attached) parts.push(w.tape.slack ? t('f102.desc.tapeSlack') : t('f102.desc.tapeTaut'));
      break;
    case 'launcher':
      parts.push(w.launcher.latched ? t('f102.desc.cocked', { n: w.launcher.notchCm }) : t('f102.desc.uncocked'));
      break;
    case 'gate': {
      const g = w.gates[id];
      parts.push(w.gateTimer.connected[id] ? t('f102.desc.connected') : t('f102.desc.disconnected'));
      if (Math.abs(g.yawDeg) > 3) parts.push(t('f102.desc.yawed'));
      break;
    }
    case 'gateTimer':
      parts.push(w.gateTimer.running ? t('f102.desc.armed') : t('f102.desc.idle'));
      break;
    case 'tapeTimer':
      parts.push(w.tape.running ? t('f102.desc.running') : t('f102.desc.idle'));
      break;
    case 'pulley':
      if (w.string.attached) parts.push(w.string.onWheel ? t('f102.desc.seated') : t('f102.desc.offWheel'));
      break;
    case 'hanger':
      parts.push(hanging(w) ? (w.string.landed ? t('f102.desc.onFloor') : t('f102.desc.hanging')) : t('f102.desc.onRack'));
      break;
    case 'inclinometer':
      parts.push(o.support === 'track01' ? t('f102.desc.onTrack') : t('f102.desc.onBench'));
      if (w.inclinometer.zeroed) parts.push(t('f102.desc.zeroed'));
      break;
    case 'magnet':
      parts.push(w.magnet.on ? t('f102.desc.on') : t('f102.desc.off'));
      if (w.magnet.holding) parts.push(t('f102.desc.holding', { o: f102NameOf(w, w.magnet.holding) }));
      if (!w.magnet.clampTight) parts.push(t('f102.desc.clampLoose'));
      if (!w.magnet.armIn) parts.push(t('f102.desc.armOut'));
      break;
    case 'photocell':
      parts.push(w.photocellCapped ? t('f102.desc.capped') : t('f102.desc.uncapped'));
      if (w.fallTimer.armed) parts.push(t('f102.desc.armed'));
      break;
    case 'motionSensor': {
      const s = w.motion;
      parts.push(s.connected ? t('f102.desc.motion', { r: t(`f102.desc.range.${s.range}`), hz: s.rateHz }) : t('f102.desc.disconnected'));
      if (s.capture) parts.push(t('f102.desc.capturing'));
      break;
    }
    case 'filter': {
      const st = filterStack(w, id);
      if (st.length > 1) parts.push(t('f102.desc.stack', { n: st.length }));
      if (w.filters[id].crumpled) parts.push(t('f102.desc.crumpled'));
      break;
    }
  }
  return parts.join(' · ');
}
