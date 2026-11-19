/**
 * Nombres y descripciones accesibles de F05: estado de cada aparato en palabras (tablero bloqueado o suelto, base
 * sujeta, revestimiento, bloque sobre el tablero, el plato o la mesada, retenido por el pasador, cable enganchado,
 * célula de carga conectada, a cero y calibrada, compuertas conectadas, balanza tarada). Nunca revela la lectura que el
 * estudiante debe tomar del instrumento (ni la masa, ni el ángulo, ni la fuerza, ni la posición en la escala).
 */
import type { F05World } from '../../simulation/f05-world/types';
import { busyF5 } from '../../simulation/f05-world/world';
import { t } from '../i18n';

export function f05NameOf(w: F05World, id: string): string {
  const k = `f05.obj.${id}`;
  if (t(k) !== k) return t(k);
  const o = w.objects[id];
  return o ? t(`f05.kind.${o.kind}`) : id;
}

export const f05NameTag = (w: F05World, id: string) => f05NameOf(w, id);

export function describeObjectF05(w: F05World, id: string): string {
  const o = w.objects[id];
  if (!o) return '';
  const parts: string[] = [f05NameOf(w, id)];
  switch (o.kind) {
    case 'plane':
      parts.push(t(`f05.material.${w.surface.material}`));
      parts.push(w.plane.clamped ? t('f05.desc.clamped') : t('f05.desc.unclamped'));
      if (w.surface.worn[w.surface.material]) parts.push(t('f05.desc.worn'));
      break;
    case 'elevator':
      parts.push(w.plane.locked ? t('f05.desc.locked') : t('f05.desc.unlocked'));
      break;
    case 'block':
      parts.push(t(`f05.desc.where.${w.block.on}`));
      if (w.block.pinned) parts.push(t('f05.desc.pinned'));
      if (w.puller.attached) parts.push(t('f05.desc.attached'));
      if (w.block.on === 'plane') parts.push(busyF5(w) || Math.abs(w.block.v) > 1e-4 ? t('f05.desc.moving') : t('f05.desc.still'));
      if (w.block.flagBent) parts.push(t('f05.desc.flagBent'));
      break;
    case 'ballast':
    case 'strip':
      parts.push(t(`f05.desc.where.${o.support}`));
      break;
    case 'puller':
      parts.push(w.puller.driveMs > 0 ? t('f05.desc.running') : t('f05.desc.stopped'));
      parts.push(t('f05.desc.drive', { cm: (w.puller.driveMs * 100).toFixed(1).replace('.', ',') }));
      break;
    case 'loadCell': {
      const s = w.sensor;
      parts.push(s.connected ? t('f05.desc.connected') : t('f05.desc.disconnected'));
      if (s.zeroed) parts.push(t('f05.desc.zeroed'));
      parts.push(s.calibrated ? t('f05.desc.calibrated') : t('f05.desc.uncalibrated'));
      if (Math.abs(s.angleDeg) >= 3) parts.push(t('f05.desc.tilted'));
      break;
    }
    case 'spring':
      parts.push(w.puller.attached ? t('f05.desc.attached') : t('f05.desc.detached'));
      break;
    case 'catcher':
      parts.push(w.catcherOn ? t('f05.desc.on') : t('f05.desc.off'));
      break;
    case 'gate':
      parts.push(w.logger.gatesConnected ? t('f05.desc.connected') : t('f05.desc.disconnected'));
      break;
    case 'logger':
      parts.push(t('f05.desc.rate', { hz: w.logger.rateHz }));
      break;
    case 'balance':
      parts.push(w.balance.tared ? t('f05.desc.tared') : t('f05.desc.untared'));
      if (w.balance.on) parts.push(t('f05.desc.panWith', { what: f05NameOf(w, w.balance.on) }));
      break;
  }
  return parts.join(' · ');
}
