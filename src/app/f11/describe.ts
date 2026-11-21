/**
 * Nombres y descripciones accesibles de F11: estado de cada aparato en palabras (canilla, bomba, desagüe y agitador
 * abiertos o cerrados, superficie en calma u ondulando; sonda en su porta-sonda o en la guía, trabada, conectada, en
 * cero, calibrada y con o sin burbuja; objetos en el estante, en la balanza, en el tanque —flotando, hundidos o
 * atados— o colgados del dinamómetro; balanza en cero o tarada; vaso de rebose cebado; colector bajo el pico; soporte
 * en movimiento o quieto). Nunca revela la lectura que el estudiante debe tomar del instrumento (ni presiones, ni
 * niveles, ni masas, ni fuerzas, ni volúmenes).
 */
import type { F11World, FloatId } from '../../simulation/f11-world/types';
import { canAreaF11, flowingF11, standMovingF11, wavesF11 } from '../../simulation/f11-world/world';
import { t } from '../i18n';

export function f11NameOf(w: F11World, id: string): string {
  const k = `f11.obj.${id}`;
  if (t(k) !== k) return t(k);
  const o = w.objects[id];
  return o ? t(`f11.kind.${o.kind}`) : id;
}

export const f11NameTag = (w: F11World, id: string) => f11NameOf(w, id);

export function describeObjectF11(w: F11World, id: string): string {
  const o = w.objects[id];
  if (!o) return '';
  const parts: string[] = [f11NameOf(w, id)];
  const onOff = (on: boolean) => (on ? t('f11.desc.open') : t('f11.desc.closed'));
  const zero = (on: boolean) => (on ? t('f11.desc.zeroed') : t('f11.desc.notZeroed'));
  const pr = w.probe;
  switch (o.kind) {
    case 'tank': {
      const v = w.tank.vol.A + w.tank.vol.B;
      parts.push(v < 1 ? t('f11.desc.tankEmpty') : w.tank.vol.B > 0.5 * v ? t('f11.desc.tankBrine') : t('f11.desc.tankWater'));
      if (wavesF11(w)) parts.push(t('f11.desc.waves'));
      else if (v > 1) parts.push(t('f11.desc.calm'));
      if (flowingF11(w)) parts.push(t('f11.desc.flowing'));
      if (w.spill.A + w.spill.B > 1) parts.push(t('f11.desc.spill'));
      break;
    }
    case 'tap':
      parts.push(onOff(w.valves.tap));
      break;
    case 'pump':
    case 'reservoir':
      parts.push(w.valves.pump ? t('f11.desc.pumping') : t('f11.desc.stopped'));
      break;
    case 'drain':
      parts.push(onOff(w.valves.drain));
      break;
    case 'agitator':
      parts.push(w.valves.agitator ? t('f11.desc.running') : t('f11.desc.stopped'));
      break;
    case 'guide':
      parts.push(pr.locked ? t('f11.desc.locked') : t('f11.desc.unlocked'));
      break;
    case 'probe':
      parts.push(pr.mount === 'guide' ? t('f11.desc.inGuide') : t('f11.desc.inHolder'));
      parts.push(pr.connected ? t('f11.desc.connected') : t('f11.desc.disconnected'));
      parts.push(pr.absolute ? t('f11.desc.absolute') : zero(pr.zeroed));
      parts.push(pr.calibrated ? t('f11.desc.calibrated') : t('f11.desc.uncalibrated'));
      if (pr.bubble && pr.mount === 'guide') parts.push(t('f11.desc.bubble'));
      if (pr.damaged) parts.push(t('f11.desc.damaged'));
      break;
    case 'logger':
      parts.push(t('f11.desc.rate', { hz: w.logger.rateHz }));
      parts.push(t('f11.desc.series', { n: w.series.id, k: w.series.n }));
      break;
    case 'floater':
    case 'bottle':
    case 'block': {
      const f = w.floats[id as FloatId];
      parts.push(t(`f11.desc.where.${f.where}`));
      if (f.where === 'tank') parts.push(f.tethered ? t('f11.desc.tethered') : f.sank ? t('f11.desc.sank') : t('f11.desc.floating'));
      if (id === 'bottle1') parts.push(t('f11.desc.ballast', { g: f.ballastG }));
      break;
    }
    case 'balance':
      parts.push(zero(w.balance.zeroed));
      if (w.balance.taredWith) parts.push(t('f11.desc.tared'));
      parts.push(w.balance.on ? t('f11.desc.loaded') : t('f11.desc.empty'));
      break;
    case 'cylinder':
      parts.push(w.cyl.vol > 0 ? t('f11.desc.full') : t('f11.desc.empty'));
      if (w.cyl.where === 'balance') parts.push(t('f11.desc.where.balance'));
      break;
    case 'can':
      parts.push(w.can.vol / canAreaF11(w) >= w.params.can.spoutCm - 0.05 ? t('f11.desc.primed') : t('f11.desc.unprimed'));
      break;
    case 'catch':
      parts.push(t(`f11.desc.catch.${w.can.catchAt}`));
      parts.push(w.can.catchVol > 0 ? t('f11.desc.wet') : t('f11.desc.empty'));
      break;
    case 'stand':
      parts.push(standMovingF11(w) ? t('f11.desc.moving') : t('f11.desc.still'));
      parts.push(zero(w.stand.ref !== null));
      break;
    case 'dynamometer':
      parts.push(zero(w.dyn.zeroed));
      parts.push(w.dyn.holding ? t('f11.desc.holding', { what: f11NameOf(w, 'alu1') }) : t('f11.desc.empty'));
      if (Math.abs(w.dyn.aimDeg) >= 3) parts.push(t('f11.desc.oblique'));
      break;
  }
  return parts.join(' · ');
}
