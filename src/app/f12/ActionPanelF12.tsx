import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useF12 } from './store';
import { describeObjectF12 } from './describe';
import { HoldButton } from './ui';
import type { F12Command } from '../../simulation/f12-world/commands';
import type { JointId, PortId, SensorId } from '../../simulation/f12-world/types';
import { busyF12 } from '../../simulation/f12-world/world';
import { eyeTargetFor } from './LensF12';

const fmt = (v: number, d: number) => (Number.isFinite(v) ? v.toFixed(d).replace('.', ',') : '—');
const JOINT_OF: Record<string, JointId> = { jointJ1: 'J1', jointJ2: 'J2', jointJ3: 'J3' };
const PORT_OF: Record<string, PortId> = { tap1: 1, tap2: 2, tap3: 3 };

/**
 * Panel de acciones de F12: alternativa accesible a cada gesto con el ratón. Ejecuta EXACTAMENTE los mismos comandos
 * del dominio que el controlador (la perilla de la bomba de a 0,01, la válvula de a una posición, el calibre de a 1°);
 * no es un atajo científico: no hay «medir el caudal teórico» ni «calcular Δp».
 */
export function ActionPanelF12() {
  const { t } = useTranslation();
  useF12((s) => s.version);
  const rt = useF12((s) => s.runtime);
  const stage = useF12((s) => s.stage);
  const sel = useF12((s) => s.selected);
  const held = useF12((s) => s.held);
  const dispatch = useF12((s) => s.dispatch);
  const toast = useF12((s) => s.toast);
  const demo = useF12((s) => !!s.demo);
  const setSettings = useF12((s) => s.setSettings);
  const bump = useF12((s) => s.bump);
  const nudge = useRef<number | null>(null);
  if (!rt) return null;
  const w = rt.world;
  const ctl = stage?.controller;
  const id = held ?? sel;
  const o = id ? w.objects[id] : undefined;

  const startNudge = (fn: () => void, ms = 120) => {
    if (nudge.current) window.clearInterval(nudge.current);
    fn();
    nudge.current = window.setInterval(fn, ms);
  };
  const stopNudge = () => {
    if (nudge.current) window.clearInterval(nudge.current);
    nudge.current = null;
  };
  const run = (r: { ok: boolean; code?: string } | undefined | void) => {
    if (r && !r.ok && r.code) {
      const k = `f12.cmd.${r.code}`;
      toast('warn', t(k) !== k ? t(k) : t('f12.cmd.FAILED'));
    }
    return r;
  };
  const D = (c: F12Command) => run(dispatch(c));
  const buttons: React.ReactNode[] = [];
  const add = (key: string, node: React.ReactNode) => buttons.push(<span key={key}>{node}</span>);
  const btn = (key: string, label: string, fn: () => unknown, cls = 'btn') => add(key, <button className={cls} onClick={() => run(fn() as never)}>{label}</button>);
  const hold = (key: string, label: string, fn: () => void, ms = 120) => add(key, <HoldButton onStart={() => startNudge(fn, ms)} onStop={stopNudge}>{label}</HoldButton>);
  const eye = (target = id) => btn('eye', `👁 ${t('f12.act.eyeLevel')}`, () => stage?.camera?.eyeLevel(eyeTargetFor(target)), 'btn ghost');
  const lens = (target: string, label: string) => btn(`lens${target}`, `📈 ${label}`, () => setSettings({ lens: target }), 'btn ghost');
  const busy = busyF12(w);
  const get = () => useF12.getState().runtime!.world;
  const read = (key: string, label: string, viaCtl: (() => unknown) | undefined, c: F12Command) => btn(key, `🔍 ${label}`, () => viaCtl?.() ?? D(c), 'btn primary');
  const nValve = w.params.K.valve.length - 1;
  const valveTo = (d: 1 | -1) => (ctl ? ctl.valveStep(d) : D({ type: 'setValve', pos: Math.max(0, Math.min(nValve, get().valve.pos + d)) }));
  const speedTo = (v: number) => {
    const value = Math.max(0, Math.min(1, Math.round(v * 100) / 100));
    return ctl ? ctl.speedTo(value) : D({ type: 'setSpeed', value });
  };
  const nextPort = (i: SensorId): PortId | null => {
    const order: Array<PortId | null> = [1, 2, 3, null];
    let k = (order.indexOf(w.sensors[i].port) + 1) % order.length;
    for (let n = 0; n < 4; n++, k = (k + 1) % order.length) {
      const p = order[k];
      if (p === null || !([1, 2, 3] as const).some((j) => j !== i && w.sensors[j].port === p)) break;
    }
    return order[k];
  };
  const cal = ctl?.caliper ?? { section: 'D1' as const, face: 'inner' as const, tiltDeg: 0 };

  if (id && o) {
    if (JOINT_OF[id]) {
      const j = JOINT_OF[id];
      const js = w.circuit.joints[j];
      if (!js.connected) btn('gasket', t('f12.act.fitGasket'), () => D({ type: 'fitGasket', joint: j }), js.gasket && !js.worn ? 'btn ghost' : 'btn');
      btn('joint', t(js.connected ? 'f12.act.openJoint' : 'f12.act.closeJoint'), () => D({ type: 'connectJoint', joint: j, on: !js.connected }), js.connected ? 'btn ghost' : 'btn primary');
    } else if (PORT_OF[id]) {
      const p = PORT_OF[id];
      if (ctl) ctl.lastPort = p;
      btn('cap', t(w.ports[p].capped ? 'f12.act.uncap' : 'f12.act.cap'), () => D({ type: 'capPort', port: p, on: !w.ports[p].capped }), w.ports[p].capped ? 'btn primary' : 'btn ghost');
      btn('probe', t(w.ports[p].probe === 'pitot' ? 'f12.act.toStatic' : 'f12.act.toPitot'), () => D({ type: 'setProbe', port: p, kind: w.ports[p].probe === 'pitot' ? 'static' : 'pitot' }), 'btn ghost');
      read('height', t('f12.act.readHeight', { n: p }), ctl ? () => ctl.readHeight(p) : undefined, { type: 'readTapHeight', port: p, viewDeg: 0 });
      eye('ruler01');
    } else {
      switch (o.kind) {
        case 'sump':
          read('sump', t('f12.act.readSump'), ctl ? () => ctl.readSump() : undefined, { type: 'readSump', viewDeg: 0 });
          eye('sump01');
          break;
        case 'pump':
          btn('pump', t(w.pump.on ? 'f12.act.pumpOff' : 'f12.act.pumpOn'), () => D({ type: 'setPump', on: !w.pump.on }), w.pump.on ? 'btn primary' : 'btn');
          hold('sDown', `▼ ${t('f12.act.speedDown', { n: fmt(w.pump.set * 100, 0) })}`, () => void speedTo(get().pump.set - 0.01), 120);
          hold('sUp', `▲ ${t('f12.act.speedUp')}`, () => void speedTo(get().pump.set + 0.01), 120);
          break;
        case 'meter':
          read('flow', t('f12.act.readFlow'), ctl ? () => ctl.readFlow() : undefined, { type: 'readFlow' });
          eye('meter01');
          break;
        case 'venturi':
        case 'clamp':
          btn('clamp', t(w.circuit.clamped ? 'f12.act.unclamp' : 'f12.act.clamp'), () => D({ type: 'clampVenturi', on: !w.circuit.clamped }), w.circuit.clamped ? 'btn ghost' : 'btn primary');
          if (w.stopper === 'pipe') btn('stopper', t('f12.act.removeStopper'), () => D({ type: 'removeStopper' }), 'btn primary');
          break;
        case 'spool':
        case 'spare':
          btn('swap', t('f12.act.swapSpool', { kind: t(`f12.spool.${w.circuit.spool === 'smooth' ? 'rough' : 'smooth'}`) }), () => D({ type: 'swapSpool', kind: w.circuit.spool === 'smooth' ? 'rough' : 'smooth' }));
          break;
        case 'purge':
          btn('purge', t(w.circuit.purgeOpen ? 'f12.act.purgeClose' : 'f12.act.purgeOpen'), () => D({ type: 'setPurge', open: !w.circuit.purgeOpen }), w.circuit.purgeOpen ? 'btn primary' : 'btn');
          break;
        case 'valve':
          btn('vClose', `◀ ${t('f12.act.valveClose', { n: w.valve.pos })}`, () => valveTo(-1));
          btn('vOpen', `▶ ${t('f12.act.valveOpen')}`, () => valveTo(1));
          break;
        case 'outlet':
          btn('div', t(w.collect.diverter === 'sump' ? 'f12.act.toBeaker' : 'f12.act.toSump'), () => D({ type: 'setDiverter', to: w.collect.diverter === 'sump' ? 'beaker' : 'sump' }), 'btn primary');
          break;
        case 'beaker':
          btn('move', t(w.collect.beakerAt === 'bench' ? 'f12.act.beakerToOutlet' : 'f12.act.beakerToBench'), () => D({ type: 'moveBeaker', to: w.collect.beakerAt === 'bench' ? 'outlet' : 'bench' }));
          if (w.collect.beakerAt === 'bench' && w.collect.beakerVol > 0) btn('empty', t('f12.act.emptyBeaker'), () => D({ type: 'emptyBeaker' }), 'btn ghost');
          read('beaker', t('f12.act.readBeaker'), ctl ? () => ctl.readBeaker() : undefined, { type: 'readBeaker', viewDeg: 0 });
          eye('beaker01');
          break;
        case 'timer':
          btn('tStart', t(w.timer.running ? 'f12.act.timerStop' : 'f12.act.timerStart'), () => D({ type: 'timer', action: w.timer.running ? 'stop' : 'start' }), 'btn primary');
          btn('tReset', t('f12.act.timerReset'), () => D({ type: 'timer', action: 'reset' }), 'btn ghost');
          read('timer', t('f12.act.readTimer'), ctl ? () => ctl.readTimer() : undefined, { type: 'readTimer' });
          break;
        case 'panel':
          for (const i of [1, 2, 3] as const) {
            const np = nextPort(i);
            btn(`s${i}`, t('f12.act.sensorTo', { n: i, port: np === null ? '—' : np }), () => D({ type: 'connectSensor', sensor: i, port: np }));
          }
          btn('cal', t('f12.act.calibrate'), () => D({ type: 'calibrateSensors' }));
          break;
        case 'logger': {
          const rates = w.params.rates;
          const next = rates[(rates.indexOf(w.logger.rateHz) + 1) % rates.length];
          btn('rate', t('f12.act.rate', { hz: next }), () => D({ type: 'setRate', hz: next }));
          const nr = (w.logger.rangeIdx + 1) % w.params.sensor.ranges.length;
          btn('range', t('f12.act.range', { n: w.params.sensor.ranges[nr] }), () => D({ type: 'setRange', idx: nr }));
          btn('mode', t(w.logger.mode === 'gauge' ? 'f12.act.toAbs' : 'f12.act.toGauge'), () => D({ type: 'setPressureMode', mode: w.logger.mode === 'gauge' ? 'abs' : 'gauge' }), 'btn ghost');
          btn('zero', t('f12.act.zero'), () => D({ type: 'zeroSensors' }));
          btn('series', t('f12.act.newSeries'), () => D({ type: 'newSeries' }));
          read('press', t('f12.act.readPressures'), ctl ? () => ctl.readPressures() : undefined, { type: 'readPressures' });
          lens('logger01', t('f12.act.screen'));
          break;
        }
        case 'ruler':
          for (const p of [1, 2, 3] as const) read(`h${p}`, t('f12.act.readHeight', { n: p }), ctl ? () => ctl.readHeight(p) : undefined, { type: 'readTapHeight', port: p, viewDeg: 0 });
          eye('ruler01');
          break;
        case 'gaskets':
          for (const j of ['J1', 'J2', 'J3'] as const) {
            if (!w.circuit.joints[j].connected) btn(`g${j}`, t('f12.act.gasketOn', { j }), () => D({ type: 'fitGasket', joint: j }));
          }
          break;
        case 'caliper':
        case 'sample':
          if (ctl) {
            btn('sec', t('f12.act.section', { s: cal.section }), () => { ctl.caliper.section = cal.section === 'D1' ? 'D2' : 'D1'; bump(); }, 'btn ghost');
            btn('face', t(cal.face === 'inner' ? 'f12.act.faceInner' : 'f12.act.faceOuter'), () => { ctl.caliper.face = cal.face === 'inner' ? 'outer' : 'inner'; bump(); }, 'btn ghost');
            hold('tiltUp', `↗ ${t('f12.act.tilt', { deg: fmt(cal.tiltDeg, 0) })}`, () => { ctl.caliper.tiltDeg = Math.min(30, ctl.caliper.tiltDeg + 1); bump(); }, 200);
            hold('tiltDown', `↘ ${t('f12.act.tiltDown')}`, () => { ctl.caliper.tiltDeg = Math.max(0, ctl.caliper.tiltDeg - 1); bump(); }, 200);
          }
          read('measure', t('f12.act.measure'), ctl ? () => ctl.measure() : undefined, { type: 'measureDiameter', section: cal.section, face: cal.face, tiltDeg: cal.tiltDeg });
          break;
        case 'pitot': {
          const p = ctl?.lastPort ?? 3;
          btn('pitot', t(w.ports[p].probe === 'pitot' ? 'f12.act.toStatic' : 'f12.act.toPitot'), () => D({ type: 'setProbe', port: p, kind: w.ports[p].probe === 'pitot' ? 'static' : 'pitot' }));
          break;
        }
        case 'stopper':
          btn('stopper', t(w.stopper === 'pipe' ? 'f12.act.removeStopper' : 'f12.act.insertStopper'), () => D({ type: w.stopper === 'pipe' ? 'removeStopper' : 'insertStopper' }), w.stopper === 'pipe' ? 'btn primary' : 'btn ghost');
          break;
        case 'towel':
          btn('mop', t('f12.act.mop'), () => D({ type: 'mopSpill' }), 'btn primary');
          break;
      }
    }
    btn('insp', `🔍 ${t('f12.act.inspect')}`, () => {
      D({ type: 'inspect', target: id });
      stage?.focusObject(id, 4);
    }, 'btn ghost');
  }
  btn('close', `✅ ${t('f12.act.closeStation')}`, () => D({ type: 'closeStation' }), 'btn ghost');
  if (w.safety.block) btn('ack', `⚠ ${t('f12.act.acknowledge')}`, () => D({ type: 'acknowledge' }), 'btn primary');
  if (busy && w.pump.on && o?.kind !== 'pump') btn('stopFlow', `■ ${t('f12.act.stopPump')}`, () => D({ type: 'setPump', on: false }), 'btn ghost');

  const desc = id ? describeObjectF12(w, id) : '';
  return (
    <section id="actions" className={`actions${demo ? ' demo-locked' : ''}`} aria-label={t('f12.act.title')} aria-disabled={demo || undefined}>
      <div className="desc" id="action-desc" aria-live="polite">{id ? desc : t('f12.act.none')}</div>
      <div className="row">{buttons}</div>
    </section>
  );
}
