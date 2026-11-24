/**
 * Nombres y descripciones accesibles de F12: estado de cada aparato en palabras (juntas cerradas o abiertas, con o sin
 * empaquetadura; abrazaderas puestas; purga abierta o cerrada; tramo liso o rugoso; tapón en el conducto; bomba
 * encendida o detenida y su consigna; posición de la válvula; tomas tapadas o abiertas y qué sensor va a cada una;
 * registrador; vaso bajo el desviador o en la mesada; cronómetro en marcha). Nunca revela la lectura que el estudiante
 * debe tomar del instrumento (ni presiones, ni caudales, ni volúmenes, ni tiempos, ni diámetros).
 */
import type { F12World, JointId, PortId } from '../../simulation/f12-world/types';
import { airInLinesF12, flowingF12, leakingF12 } from '../../simulation/f12-world/world';
import { t } from '../i18n';

export function f12NameOf(w: F12World, id: string): string {
  const k = `f12.obj.${id}`;
  if (t(k) !== k) return t(k);
  const o = w.objects[id];
  return o ? t(`f12.kind.${o.kind}`) : id;
}

export const f12NameTag = (w: F12World, id: string) => f12NameOf(w, id);

export function describeObjectF12(w: F12World, id: string): string {
  const o = w.objects[id];
  if (!o) return '';
  const parts: string[] = [f12NameOf(w, id)];
  const c = w.circuit;
  switch (o.kind) {
    case 'sump':
      if (w.spill > 1) parts.push(t('f12.desc.spill'));
      break;
    case 'pump':
      parts.push(w.pump.on ? t('f12.desc.pumpOn', { pct: Math.round(w.pump.set * 100) }) : t('f12.desc.pumpOff', { pct: Math.round(w.pump.set * 100) }));
      if (flowingF12(w)) parts.push(t('f12.desc.flowing'));
      break;
    case 'meter':
      parts.push(flowingF12(w) ? t('f12.desc.flowing') : t('f12.desc.still'));
      break;
    case 'joint': {
      const j = id.replace('joint', '') as JointId;
      const s = c.joints[j];
      parts.push(s.connected ? t('f12.desc.jointClosed') : t('f12.desc.jointOpen'));
      parts.push(s.gasket ? (s.worn ? t('f12.desc.gasketWorn') : t('f12.desc.gasket')) : t('f12.desc.noGasket'));
      if (s.loose) parts.push(t('f12.desc.loose'));
      break;
    }
    case 'venturi':
      if (w.reversed) parts.push(t('f12.desc.reversed'));
      if (c.obstructed) parts.push(t('f12.desc.obstructed'));
      if (airInLinesF12(w)) parts.push(t('f12.desc.air'));
      break;
    case 'clamp':
      parts.push(c.clamped ? t('f12.desc.clamped') : t('f12.desc.unclamped'));
      break;
    case 'spool':
      parts.push(t(`f12.desc.spool.${c.spool}`));
      break;
    case 'tapPiece': {
      const port = Number(id.replace('tap', '')) as PortId;
      parts.push(w.ports[port].capped ? t('f12.desc.capped') : t('f12.desc.uncapped'));
      if (w.ports[port].probe === 'pitot') parts.push(t('f12.desc.pitot'));
      const s = ([1, 2, 3] as const).find((i) => w.sensors[i].port === port);
      parts.push(s ? t('f12.desc.sensorAt', { n: s }) : t('f12.desc.noSensor'));
      break;
    }
    case 'purge':
      parts.push(c.purgeOpen ? t('f12.desc.open') : t('f12.desc.closed'));
      break;
    case 'valve':
      parts.push(t('f12.desc.valvePos', { pos: w.valve.pos, n: w.params.K.valve.length - 1 }));
      break;
    case 'outlet':
      parts.push(t(`f12.desc.divert.${w.collect.diverter}`));
      break;
    case 'beaker':
      parts.push(t(`f12.desc.beaker.${w.collect.beakerAt}`));
      parts.push(w.collect.beakerVol > 5 ? t('f12.desc.wet') : t('f12.desc.empty'));
      break;
    case 'timer':
      parts.push(w.timer.running ? t('f12.desc.running') : t('f12.desc.stopped'));
      break;
    case 'panel':
      for (const i of [1, 2, 3] as const) {
        const s = w.sensors[i];
        parts.push(t('f12.desc.sensor', { n: i, port: s.port ?? '—' }) + (s.zeroed ? '' : ` (${t('f12.desc.notZeroed')})`) + (s.calibrated ? '' : ` (${t('f12.desc.uncalibrated')})`) + (s.damaged ? ` (${t('f12.desc.damaged')})` : ''));
      }
      break;
    case 'logger':
      parts.push(t('f12.desc.rate', { hz: w.logger.rateHz }));
      parts.push(t(`f12.desc.mode.${w.logger.mode}`));
      parts.push(t('f12.desc.range', { kPa: w.params.sensor.ranges[w.logger.rangeIdx] }));
      parts.push(t('f12.desc.series', { n: w.series.id, k: w.series.n }));
      break;
    case 'stopper':
      parts.push(w.stopper === 'pipe' ? t('f12.desc.inPipe') : t('f12.desc.onBench'));
      break;
    case 'towel':
      if (w.spill > 1) parts.push(t('f12.desc.spill'));
      break;
  }
  if ((o.kind === 'joint' || o.kind === 'sump') && leakingF12(w) && flowingF12(w)) parts.push(t('f12.desc.leaking'));
  return parts.join(' · ');
}
