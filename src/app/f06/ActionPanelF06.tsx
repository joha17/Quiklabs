import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useF06 } from './store';
import { describeObjectF06 } from './describe';
import { HoldButton } from './ui';
import type { F06Command, TrackGate } from '../../simulation/f06-world/commands';
import { CART_MASSES, SLOTS, SPRINGS, bobMovingF6, busyF6, cartMovingF6 } from '../../simulation/f06-world/world';
import { maxAmplitudeDeg } from '../../simulation/f06-world/geometry';
import { DAMPER_C, PAD_N } from '../../engine/f06/controller';
import { eyeTargetFor } from './LensF06';

/**
 * Panel de acciones de F06: alternativa accesible a cada gesto con el ratón. Ejecuta EXACTAMENTE los mismos comandos
 * del dominio que el controlador (el trinquete muesca a muesca, la columna centímetro a centímetro, la compuerta de a
 * un centímetro, la esfera de a un grado, cada pesa a su lugar); no es un atajo científico: no hay «medir k» ni
 * «calcular la energía».
 */
export function ActionPanelF06() {
  const { t } = useTranslation();
  useF06((s) => s.version);
  const rt = useF06((s) => s.runtime);
  const stage = useF06((s) => s.stage);
  const sel = useF06((s) => s.selected);
  const held = useF06((s) => s.held);
  const dispatch = useF06((s) => s.dispatch);
  const toast = useF06((s) => s.toast);
  const demo = useF06((s) => !!s.demo);
  const setSettings = useF06((s) => s.setSettings);
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
      const k = `f06.cmd.${r.code}`;
      toast('warn', t(k) !== k ? t(k) : t('f06.cmd.FAILED'));
    }
    return r;
  };
  const D = (c: F06Command) => run(dispatch(c));
  const buttons: React.ReactNode[] = [];
  const add = (key: string, node: React.ReactNode) => buttons.push(<span key={key}>{node}</span>);
  const btn = (key: string, label: string, fn: () => unknown, cls = 'btn') => add(key, <button className={cls} onClick={() => run(fn() as never)}>{label}</button>);
  const hold = (key: string, label: string, fn: () => void, ms = 120) => add(key, <HoldButton onStart={() => startNudge(fn, ms)} onStop={stopNudge}>{label}</HoldButton>);
  const eye = (target = id) => btn('eye', `👁 ${t('f06.act.eyeLevel')}`, () => stage?.camera?.eyeLevel(eyeTargetFor(target)), 'btn ghost');
  const lens = (target: string, label: string) => btn(`lens${target}`, `📈 ${label}`, () => setSettings({ lens: target }), 'btn ghost');
  const busy = busyF6(w);
  const weigh = (what: string) => btn(`weigh${what}`, t('f06.act.weigh'), () => D({ type: 'placeOnBalance', id: what }));
  const offBalance = () => btn('off', t('f06.act.offBalance'), () => D({ type: 'removeFromBalance' }), 'btn primary');

  if (id && o) {
    switch (o.kind) {
      case 'stand':
        SPRINGS.filter((sp) => w.springs[sp].at !== 'stand').forEach((sp) => btn(`mount${sp}`, t('f06.act.mountStand', { s: t(`f06.obj.${sp}`) }), () => D({ type: 'mountSpring', id: sp, at: 'stand' })));
        btn('hanger', t(w.stand.hangerOn ? 'f06.act.unhang' : 'f06.act.hang'), () => D({ type: 'hangHanger', on: !w.stand.hangerOn }), w.stand.hangerOn ? 'btn ghost' : 'btn primary');
        break;
      case 'ruler':
        btn('align', t('f06.act.alignRuler'), () => D({ type: 'alignRuler' }));
        btn('read', `🔍 ${t('f06.act.readRuler')}`, () => ctl?.readRuler() ?? D({ type: 'readRuler', viewDeg: 0 }), 'btn primary');
        eye('ruler01');
        break;
      case 'spring': {
        const at = w.springs[id].at;
        (['stand', 'launcher', 'rack'] as const).filter((p) => p !== at).forEach((p) => btn(`to${p}`, t(`f06.act.springTo.${p}`), () => D({ type: 'mountSpring', id, at: p }), p === 'rack' ? 'btn ghost' : 'btn'));
        if (at === 'launcher') btn('secure', t(w.track.springSecured ? 'f06.act.unsecure' : 'f06.act.secure'), () => D({ type: 'secureSpring', on: !w.track.springSecured }), w.track.springSecured ? 'btn ghost' : 'btn primary');
        break;
      }
      case 'hanger':
        if (o.support === 'balance') offBalance();
        else {
          btn('hang', t(w.stand.hangerOn ? 'f06.act.unhang' : 'f06.act.hang'), () => D({ type: 'hangHanger', on: !w.stand.hangerOn }), 'btn primary');
          if (!w.stand.hangerOn) weigh('hanger01');
        }
        break;
      case 'slotMass':
        if (o.support === 'balance') offBalance();
        else {
          btn('hang', t(o.support === 'hanger' ? 'f06.act.unhangMass' : 'f06.act.hangMass'), () => D({ type: 'hangMass', id, on: o.support !== 'hanger' }), 'btn primary');
          if (o.support === 'rack') weigh(id);
        }
        break;
      case 'cartMass':
        if (o.support === 'balance') offBalance();
        else {
          btn('load', t(o.support === 'cart' ? 'f06.act.unloadCart' : 'f06.act.loadCart'), () => D({ type: 'loadCart', id, on: o.support !== 'cart' }), 'btn primary');
          if (o.support === 'rack') weigh(id);
        }
        break;
      case 'massRack':
        SLOTS.filter((m) => w.objects[m].support === 'hanger').forEach((m) => btn(`back${m}`, t('f06.act.massBack', { m: t(`f06.obj.${m}`) }), () => D({ type: 'hangMass', id: m, on: false })));
        CART_MASSES.filter((m) => w.objects[m].support === 'cart').forEach((m) => btn(`back${m}`, t('f06.act.massBack', { m: t(`f06.obj.${m}`) }), () => D({ type: 'loadCart', id: m, on: false })));
        btn('close', `✅ ${t('f06.act.closeStation')}`, () => D({ type: 'closeStation' }), 'btn primary');
        break;
      case 'cart': {
        const c = w.cart;
        if (c.on === 'balance') {
          offBalance();
          break;
        }
        const moving = busy || cartMovingF6(w);
        if (!moving && !c.held) {
          hold('comp', `◀ ${t('f06.act.compress')}`, () => void D({ type: 'compress', x: w.cart.compression + 0.01 }), 250);
          if (c.compression > 0) hold('decomp', `▶ ${t('f06.act.decompress')}`, () => void D({ type: 'compress', x: Math.max(0, w.cart.compression - 0.01) }), 250);
        }
        if (c.latched) btn('fire', `🚀 ${t('f06.act.release')}`, () => ctl?.release() ?? D({ type: 'releaseCart', pushMs: 0 }), 'btn primary');
        if (c.latched) btn('push', t('f06.act.releasePush'), () => D({ type: 'releaseCart', pushMs: 0.3 }), 'btn ghost');
        btn('return', `↩ ${t('f06.act.returnCart')}`, () => D({ type: 'returnCart' }));
        if (!moving && !c.latched && !c.held) weigh('cart01');
        if (c.damaged) btn('repair', `🔧 ${t('f06.act.repair')}`, () => D({ type: 'repairCart' }), 'btn primary');
        eye('cart01');
        break;
      }
      case 'launcher':
        if (w.cart.latched) btn('fire', `🚀 ${t('f06.act.release')}`, () => ctl?.release() ?? D({ type: 'releaseCart', pushMs: 0 }), 'btn primary');
        if (SPRINGS.some((sp) => w.springs[sp].at === 'launcher')) btn('secure', t(w.track.springSecured ? 'f06.act.unsecure' : 'f06.act.secure'), () => D({ type: 'secureSpring', on: !w.track.springSecured }));
        eye('launcher01');
        break;
      case 'track':
        hold('hUp', `▲ ${t('f06.act.raise')}`, () => void D({ type: 'setHeight', m: w.track.h + 0.01 }), 200);
        hold('hDown', `▼ ${t('f06.act.lower')}`, () => void D({ type: 'setHeight', m: w.track.h - 0.01 }), 200);
        btn('clamp', t(w.track.clamped ? 'f06.act.unclamp' : 'f06.act.clamp'), () => D({ type: 'clampTrack', on: !w.track.clamped }), w.track.clamped ? 'btn ghost' : 'btn primary');
        break;
      case 'brake':
        btn('brake', t(w.track.brakeOn ? 'f06.act.brakeOff' : 'f06.act.brakeOn'), () => D({ type: 'setBrake', on: !w.track.brakeOn }), w.track.brakeOn ? 'btn ghost' : 'btn primary');
        break;
      case 'pad':
        btn('pad', t(w.track.frictionN > 0 ? 'f06.act.padOff' : 'f06.act.padOn'), () => D({ type: 'setFriction', n: w.track.frictionN > 0 ? 0 : PAD_N }), 'btn primary');
        break;
      case 'damper':
        btn('damper', t(w.track.damperC > 0 ? 'f06.act.damperOff' : 'f06.act.damperOn'), () => D({ type: 'setDamper', c: w.track.damperC > 0 ? 0 : DAMPER_C }), 'btn primary');
        break;
      case 'gauge':
        btn('read', `🔍 ${t('f06.act.readHeight')}`, () => ctl?.readHeight('launcher') ?? D({ type: 'readHeight', ref: 'launcher', viewDeg: 0 }), 'btn primary');
        btn('readBench', t('f06.act.readHeightBench'), () => ctl?.readHeight('bench') ?? D({ type: 'readHeight', ref: 'bench', viewDeg: 0 }), 'btn ghost');
        eye('gauge01');
        break;
      case 'gate': {
        if (id === 'gate3') {
          btn('read', `🔍 ${t('f06.act.readPendulum')}`, () => ctl?.readPendulum() ?? D({ type: 'readPendulum' }), 'btn primary');
          break;
        }
        const gid = id as TrackGate;
        const g = w.gates[gid];
        hold('gUp', `▶ ${t('f06.act.gateUp')}`, () => void D({ type: 'moveGate', id: gid, s: g.s + 0.01 }));
        hold('gDown', `◀ ${t('f06.act.gateDown')}`, () => void D({ type: 'moveGate', id: gid, s: g.s - 0.01 }));
        btn('read', `🔍 ${t('f06.act.readGates')}`, () => D({ type: 'readGates' }), 'btn primary');
        break;
      }
      case 'forceSensor': {
        const s = w.sensor;
        const ranges = w.params.force.ranges;
        btn('plug', t(s.connected ? 'f06.act.unplug' : 'f06.act.plug'), () => D({ type: 'connect', channel: 'force', on: !s.connected }));
        btn('zero', t('f06.act.zero'), () => D({ type: 'zeroSensor' }));
        btn('cal', t('f06.act.calibrate'), () => D({ type: 'calibrateSensor' }));
        btn('range', t('f06.act.range', { n: ranges[(s.rangeIdx + 1) % ranges.length] }), () => D({ type: 'setRange', n: (s.rangeIdx + 1) % ranges.length }));
        hold('tiltUp', `▲ ${t('f06.act.tiltUp')}`, () => void D({ type: 'mountSensor', angleDeg: w.sensor.angleDeg + 1 }), 200);
        hold('tiltDown', `▼ ${t('f06.act.tiltDown')}`, () => void D({ type: 'mountSensor', angleDeg: w.sensor.angleDeg - 1 }), 200);
        break;
      }
      case 'posSensor':
        btn('plug', t(w.logger.posConnected ? 'f06.act.unplug' : 'f06.act.plug'), () => D({ type: 'connect', channel: 'position', on: !w.logger.posConnected }), 'btn primary');
        break;
      case 'angleSensor':
        btn('plug', t(w.logger.angleConnected ? 'f06.act.unplug' : 'f06.act.plug'), () => D({ type: 'connect', channel: 'angle', on: !w.logger.angleConnected }));
        btn('read', `🔍 ${t('f06.act.readPendulum')}`, () => ctl?.readPendulum() ?? D({ type: 'readPendulum' }), 'btn primary');
        break;
      case 'logger': {
        const rates = w.params.rates;
        const next = rates[(rates.indexOf(w.logger.rateHz) + 1) % rates.length];
        btn('rate', t('f06.act.rate', { hz: next }), () => D({ type: 'setRate', hz: next }));
        btn('force', t(w.sensor.connected ? 'f06.act.forceOff' : 'f06.act.forceOn'), () => D({ type: 'connect', channel: 'force', on: !w.sensor.connected }));
        btn('pos', t(w.logger.posConnected ? 'f06.act.posOff' : 'f06.act.posOn'), () => D({ type: 'connect', channel: 'position', on: !w.logger.posConnected }));
        btn('gates', t(w.logger.gatesConnected ? 'f06.act.gatesOff' : 'f06.act.gatesOn'), () => D({ type: 'connect', channel: 'gates', on: !w.logger.gatesConnected }));
        btn('angle', t(w.logger.angleConnected ? 'f06.act.angleOff' : 'f06.act.angleOn'), () => D({ type: 'connect', channel: 'angle', on: !w.logger.angleConnected }));
        btn('sync', t(w.logger.synced ? 'f06.act.unsync' : 'f06.act.sync'), () => D({ type: 'syncChannels', on: !w.logger.synced }));
        btn('readL', `🔍 ${t('f06.act.readLaunch')}`, () => ctl?.readLaunch() ?? D({ type: 'readLaunch' }), 'btn primary');
        btn('readG', `🔍 ${t('f06.act.readGates')}`, () => D({ type: 'readGates' }), 'btn primary');
        lens('logger01', t('f06.act.graph'));
        eye('logger01');
        break;
      }
      case 'pendulum': {
        const p = w.pend;
        const lim = maxAmplitudeDeg(p.L);
        if (!bobMovingF6(w) || p.held) {
          hold('lUp', `▲ ${t('f06.act.shorter')}`, () => void D({ type: 'setLength', m: w.pend.L - 0.01 }), 200);
          hold('lDown', `▼ ${t('f06.act.longer')}`, () => void D({ type: 'setLength', m: w.pend.L + 0.01 }), 200);
          hold('aUp', `↗ ${t('f06.act.angleUp')}`, () => void D({ type: 'holdBob', deg: Math.min(lim, (w.pend.held ? w.pend.thetaDeg : 0) + 1) }), 150);
          if (p.held) hold('aDown', `↙ ${t('f06.act.angleDown')}`, () => void D({ type: 'holdBob', deg: Math.max(0, w.pend.thetaDeg - 1) }), 150);
        }
        if (p.held) btn('release', `▶ ${t('f06.act.releaseBob')}`, () => D({ type: 'releaseBob', lateralMs: 0 }), 'btn primary');
        if (bobMovingF6(w) && !p.held) btn('stop', `⏹ ${t('f06.act.stopBob')}`, () => D({ type: 'stopBob' }));
        btn('scale', `🔍 ${t('f06.act.readPendScale')}`, () => ctl?.readPendScale() ?? D({ type: 'readPendScale', viewDeg: 0 }));
        btn('read', `🔍 ${t('f06.act.readPendulum')}`, () => ctl?.readPendulum() ?? D({ type: 'readPendulum' }), 'btn primary');
        eye('pendScale');
        break;
      }
      case 'balance':
        btn('tare', t('f06.act.tare'), () => D({ type: 'tareBalance' }));
        btn('read', `🔍 ${t('f06.act.readBalance')}`, () => ctl?.readBalance() ?? D({ type: 'readBalance' }), 'btn primary');
        if (w.balance.on) btn('off', t('f06.act.offBalance'), () => D({ type: 'removeFromBalance' }));
        eye('balance01');
        break;
    }
    btn('insp', `🔍 ${t('f06.act.inspect')}`, () => {
      D({ type: 'inspect', target: id });
      stage?.focusObject(id, 4);
    }, 'btn ghost');
  }
  if (w.safety.block) btn('ack', `⚠ ${t('f06.act.acknowledge')}`, () => D({ type: 'acknowledge' }), 'btn primary');

  const desc = id ? describeObjectF06(w, id) : '';
  return (
    <section id="actions" className={`actions${demo ? ' demo-locked' : ''}`} aria-label={t('f06.act.title')} aria-disabled={demo || undefined}>
      <div className="desc" id="action-desc" aria-live="polite">{id ? desc : t('f06.act.none')}</div>
      <div className="row">{buttons}</div>
    </section>
  );
}
