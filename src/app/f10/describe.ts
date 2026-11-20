/**
 * Nombres y descripciones accesibles de F10: estado de cada aparato en palabras (viga en el estante, la cuña, el
 * pórtico o los apoyos, asentada o volcada; apoyos trabados o sueltos y filo firme o flojo; carga con el gancho abierto
 * o cerrado; dinamómetro en cero; mesada nivelada; probeta montada, mordazas, freno de la manivela y protector;
 * comparador axial o transversal, calibrado, en cero y con el cable en su presilla; celda, rango y registrador). Nunca
 * revela la lectura que el estudiante debe tomar del instrumento (ni pesos, ni posiciones, ni fuerzas, ni alargamientos).
 */
import type { F10World, SupportId } from '../../simulation/f10-world/types';
import { pressMovingF10, tippingF10, wedgeTiltF10 } from '../../simulation/f10-world/world';
import { t } from '../i18n';

export function f10NameOf(w: F10World, id: string): string {
  const k = `f10.obj.${id}`;
  if (t(k) !== k) return t(k);
  const o = w.objects[id];
  return o ? t(`f10.kind.${o.kind}`) : id;
}

export const f10NameTag = (w: F10World, id: string) => f10NameOf(w, id);

export function describeObjectF10(w: F10World, id: string): string {
  const o = w.objects[id];
  if (!o) return '';
  const parts: string[] = [f10NameOf(w, id)];
  const conn = (on: boolean) => (on ? t('f10.desc.connected') : t('f10.desc.disconnected'));
  const pr = w.press;
  switch (o.kind) {
    case 'beam': {
      const b = w.beam;
      parts.push(t(`f10.desc.beam.${b.where}`));
      if (b.where === 'supports') parts.push(b.seated ? t('f10.desc.seated') : t('f10.desc.unseated'));
      if (b.where === 'wedge') parts.push(t(`f10.desc.tilt.${wedgeTiltF10(w)}`));
      if (tippingF10(w) || b.tipped) parts.push(t('f10.desc.tipped'));
      if (b.hand) parts.push(t('f10.desc.hand'));
      if (w.damaged) parts.push(t('f10.desc.damaged'));
      break;
    }
    case 'support': {
      const s = w.supports[(id === 'supportA' ? 'A' : 'B') as SupportId];
      parts.push(s.clamped ? t('f10.desc.clamped') : t('f10.desc.unclamped'));
      if (s.loose) parts.push(t('f10.desc.knifeLoose'));
      parts.push(conn(w.cells.connected));
      parts.push(w.cells[id === 'supportA' ? 'A' : 'B'].tared ? t('f10.desc.zeroed') : t('f10.desc.notZeroed'));
      break;
    }
    case 'load': {
      const L = w.loads.load1;
      parts.push(t(`f10.desc.load.${L.where}`));
      parts.push(L.hookClosed ? t('f10.desc.hookClosed') : t('f10.desc.hookOpen'));
      break;
    }
    case 'dynamometer':
      parts.push(w.dyn.zeroed ? t('f10.desc.zeroed') : t('f10.desc.notZeroed'));
      parts.push(w.dyn.holding ? t('f10.desc.holding', { what: f10NameOf(w, w.dyn.holding === 'beam' ? 'beam01' : 'load1') }) : t('f10.desc.empty'));
      if (w.dyn.aimDeg >= 3) parts.push(t('f10.desc.oblique'));
      break;
    case 'level':
      parts.push(Math.abs(w.bench.tiltDeg) > 0.2 ? t('f10.desc.tilted') : t('f10.desc.levelled'));
      break;
    case 'press':
      parts.push(pressMovingF10(w) ? t('f10.desc.moving') : t('f10.desc.still'));
      parts.push(pr.specimen ? t('f10.desc.withSpecimen') : t('f10.desc.noSpecimen'));
      break;
    case 'specimen': {
      const sp = w.specimens[id];
      parts.push(pr.specimen === id ? t('f10.desc.inPress') : t('f10.desc.onRack'));
      if (sp?.yielded) parts.push(t('f10.desc.yielded'));
      break;
    }
    case 'grip': {
      const on = id === 'gripTop' ? pr.gripTop : pr.gripBottom;
      parts.push(on ? t('f10.desc.gripClosed') : t('f10.desc.gripOpen'));
      if (pr.specimen && pr.eccMm > 0.02) parts.push(t('f10.desc.misaligned'));
      break;
    }
    case 'crank':
      parts.push(pr.crankLocked ? t('f10.desc.crankLocked') : t('f10.desc.crankFree'));
      break;
    case 'shield':
      parts.push(pr.shieldClosed ? t('f10.desc.shieldClosed') : t('f10.desc.shieldOpen'));
      break;
    case 'loadCell':
      parts.push(conn(w.loadCell.connected));
      parts.push(w.loadCell.zeroed ? t('f10.desc.zeroed') : t('f10.desc.notZeroed'));
      parts.push(t('f10.desc.range', { n: w.params.loadCell.ranges[w.loadCell.rangeIdx] / 1000 }));
      break;
    case 'gauge': {
      const g = w.gauge;
      parts.push(g.mounted ? t(`f10.desc.gauge.${g.mounted}`) : t('f10.desc.gauge.off'));
      parts.push(conn(g.connected));
      parts.push(g.calibrated ? t('f10.desc.calibrated') : t('f10.desc.uncalibrated'));
      parts.push(g.zeroed ? t('f10.desc.zeroed') : t('f10.desc.notZeroed'));
      parts.push(g.cableRouted ? t('f10.desc.cableRouted') : t('f10.desc.cableLoose'));
      if (g.angleDeg >= 3) parts.push(t('f10.desc.tilted'));
      break;
    }
    case 'logger':
      parts.push(t('f10.desc.rate', { hz: w.logger.rateHz }));
      if (w.run && !w.run.done) parts.push(t('f10.desc.recording'));
      break;
  }
  return parts.join(' · ');
}
