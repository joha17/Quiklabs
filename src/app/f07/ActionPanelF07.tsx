import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useF07 } from './store';
import { describeObjectF07 } from './describe';
import { HoldButton } from './ui';
import type { F07Command, TrackGate } from '../../simulation/f07-world/commands';
import type { BumperType, CartId } from '../../simulation/f07-world/types';
import { CART_MASSES, busyF7, cartMovingF7 } from '../../simulation/f07-world/world';
import { GEOF07 } from '../../simulation/f07-world/geometry';
import { eyeTargetFor } from './LensF07';

/**
 * Panel de acciones de F07: alternativa accesible a cada gesto con el ratón. Ejecuta EXACTAMENTE los mismos comandos
 * del dominio que el controlador (el émbolo muesca a muesca, el carro centímetro a centímetro, la compuerta de a un
 * centímetro, el tornillo de nivelación de a 0,05°, cada pesa a su carro); no es un atajo científico: no hay «medir Δp»
 * ni «calcular el impulso».
 */
export function ActionPanelF07() {
  const { t } = useTranslation();
  useF07((s) => s.version);
  const rt = useF07((s) => s.runtime);
  const stage = useF07((s) => s.stage);
  const sel = useF07((s) => s.selected);
  const held = useF07((s) => s.held);
  const dispatch = useF07((s) => s.dispatch);
  const toast = useF07((s) => s.toast);
  const demo = useF07((s) => !!s.demo);
  const setSettings = useF07((s) => s.setSettings);
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
      const k = `f07.cmd.${r.code}`;
      toast('warn', t(k) !== k ? t(k) : t('f07.cmd.FAILED'));
    }
    return r;
  };
  const D = (c: F07Command) => run(dispatch(c));
  const buttons: React.ReactNode[] = [];
  const add = (key: string, node: React.ReactNode) => buttons.push(<span key={key}>{node}</span>);
  const btn = (key: string, label: string, fn: () => unknown, cls = 'btn') => add(key, <button className={cls} onClick={() => run(fn() as never)}>{label}</button>);
  const hold = (key: string, label: string, fn: () => void, ms = 120) => add(key, <HoldButton onStart={() => startNudge(fn, ms)} onStop={stopNudge}>{label}</HoldButton>);
  const eye = (target = id) => btn('eye', `👁 ${t('f07.act.eyeLevel')}`, () => stage?.camera?.eyeLevel(eyeTargetFor(target)), 'btn ghost');
  const lens = (target: string, label: string) => btn(`lens${target}`, `📈 ${label}`, () => setSettings({ lens: target }), 'btn ghost');
  const busy = busyF7(w);
  const weigh = (what: string) => btn(`weigh${what}`, t('f07.act.weigh'), () => D({ type: 'placeOnBalance', id: what }));
  const offBalance = () => btn('off', t('f07.act.offBalance'), () => D({ type: 'removeFromBalance' }), 'btn primary');

  const cartBtns = (cid: CartId) => {
    const c = w.carts[cid];
    if (c.on === 'balance') {
      offBalance();
      return;
    }
    const moving = cartMovingF7(w, cid);
    const run = busy;
    if (!moving && !run) {
      hold('left', `◀ ${t('f07.act.cartLeft')}`, () => void D({ type: 'placeCart', cart: cid, s: w.carts[cid].s - 0.01 }), 150);
      hold('right', `▶ ${t('f07.act.cartRight')}`, () => void D({ type: 'placeCart', cart: cid, s: w.carts[cid].s + 0.01 }), 150);
      hold('cock', `⇤ ${t('f07.act.cock')}`, () => void D({ type: 'cock', cart: cid, cm: Math.round(w.carts[cid].compression * 100) + 1 }), 300);
      if (c.latched) hold('uncock', `⇥ ${t('f07.act.uncock')}`, () => void D({ type: 'cock', cart: cid, cm: Math.round(w.carts[cid].compression * 100) - 1 }), 300);
    }
    if (c.latched) btn('fire', `🚀 ${t('f07.act.release')}`, () => ctl?.release() ?? D({ type: 'release' }), 'btn primary');
    if (moving) {
      btn('stop', `✋ ${t('f07.act.stopCart')}`, () => D({ type: 'stopCart', cart: cid }));
      btn('push', t('f07.act.pushCart'), () => D({ type: 'pushCart', cart: cid, v: w.carts[cid].v + (cid === 'cartA' ? 0.2 : -0.2) }), 'btn ghost');
    } else if (!run && !c.latched) btn('push', t('f07.act.pushCart'), () => D({ type: 'pushCart', cart: cid, v: cid === 'cartA' ? 0.3 : -0.3 }), 'btn ghost');
    btn('brake', t(c.brake ? 'f07.act.brakeOff' : 'f07.act.brakeOn'), () => D({ type: 'setCartBrake', cart: cid, on: !c.brake }), c.brake ? 'btn' : 'btn ghost');
    if (!moving) {
      btn('wheel', t('f07.act.freeWheel'), () => D({ type: 'freeWheel', cart: cid }), 'btn ghost');
      btn('center', t('f07.act.center'), () => D({ type: 'centerCart', cart: cid }), 'btn ghost');
      btn('flag', t('f07.act.flag', { cm: c.flagW === 2 ? 3 : 2 }), () => D({ type: 'setFlag', cart: cid, cm: c.flagW === 2 ? 3 : 2 }), 'btn ghost');
      btn('alignFlag', t('f07.act.alignFlag'), () => D({ type: 'alignFlag', cart: cid }), 'btn ghost');
      btn('caliper', `📏 ${t('f07.act.measureFlag')}`, () => D({ type: 'measureFlag', cart: cid }));
      btn('pos', `🔍 ${t('f07.act.readPosition')}`, () => ctl?.readPosition(cid) ?? D({ type: 'readPosition', cart: cid, viewDeg: 0 }));
    }
    if (!moving && !run && !c.latched && !w.bumper.joined) weigh(cid);
    if (w.bumper.joined && !moving) btn('sep', t('f07.act.separate'), () => D({ type: 'separateCarts' }));
    if (c.damaged) btn('repair', `🔧 ${t('f07.act.repair')}`, () => D({ type: 'repairCart', cart: cid }), 'btn primary');
    eye(cid);
  };

  if (id && o) {
    switch (o.kind) {
      case 'cart':
        cartBtns(id as CartId);
        break;
      case 'cartMass':
        if (o.support === 'balance') offBalance();
        else {
          for (const cid of ['cartA', 'cartB'] as const) {
            if (o.support === cid) btn(`un${cid}`, t('f07.act.unloadCart', { c: t(`f07.obj.${cid}`) }), () => D({ type: 'loadCart', id, cart: cid, on: false }), 'btn primary');
            else if (o.support === 'rack') btn(`on${cid}`, t('f07.act.loadCart', { c: t(`f07.obj.${cid}`) }), () => D({ type: 'loadCart', id, cart: cid, on: true }), 'btn primary');
          }
          if (o.support === 'rack') weigh(id);
        }
        break;
      case 'massRack':
        CART_MASSES.filter((m) => w.objects[m].support === 'cartA' || w.objects[m].support === 'cartB').forEach((m) =>
          btn(`back${m}`, t('f07.act.massBack', { m: t(`f07.obj.${m}`) }), () => D({ type: 'loadCart', id: m, cart: w.objects[m].support as CartId, on: false })),
        );
        btn('close', `✅ ${t('f07.act.closeStation')}`, () => D({ type: 'closeStation' }), 'btn primary');
        break;
      case 'launcher': {
        const cid: CartId = id === 'launcherA' ? 'cartA' : 'cartB';
        if (!busy && !cartMovingF7(w)) hold('cock', `⇤ ${t('f07.act.cock')}`, () => void D({ type: 'cock', cart: cid, cm: Math.round(w.carts[cid].compression * 100) + 1 }), 300);
        if (w.carts.cartA.latched || w.carts.cartB.latched) btn('fire', `🚀 ${t('f07.act.release')}`, () => ctl?.release() ?? D({ type: 'release' }), 'btn primary');
        eye(id);
        break;
      }
      case 'endStop':
        btn('dampers', t(w.track.endDampers ? 'f07.act.dampersOff' : 'f07.act.dampersOn'), () => D({ type: 'setEndDampers', on: !w.track.endDampers }), w.track.endDampers ? 'btn ghost' : 'btn primary');
        break;
      case 'track':
      case 'level':
        hold('scrUp', `↻ ${t('f07.act.screwUp')}`, () => void D({ type: 'setLevelScrew', deg: w.track.screwDeg + 0.05 }), 200);
        hold('scrDown', `↺ ${t('f07.act.screwDown')}`, () => void D({ type: 'setLevelScrew', deg: w.track.screwDeg - 0.05 }), 200);
        btn('read', `🔍 ${t('f07.act.readLevel')}`, () => ctl?.readLevel() ?? D({ type: 'readLevel', viewDeg: 0 }), 'btn primary');
        btn('dampers', t(w.track.endDampers ? 'f07.act.dampersOff' : 'f07.act.dampersOn'), () => D({ type: 'setEndDampers', on: !w.track.endDampers }), 'btn ghost');
        eye('level01');
        break;
      case 'bumperKit': {
        const b = w.bumper;
        (['spring', 'magnet', 'velcro'] as BumperType[]).filter((x) => x !== b.type).forEach((x) => btn(`b${x}`, t('f07.act.bumper', { b: t(`f07.bumper.${x}`) }), () => D({ type: 'setBumper', bumper: x })));
        if (b.type === 'magnet') btn('flip', t('f07.act.flipMagnet'), () => D({ type: 'flipMagnet' }));
        if (b.type === 'velcro') btn('fix', t(b.velcroFixed ? 'f07.act.velcroLoose' : 'f07.act.velcroFix'), () => D({ type: 'fixVelcro', on: !b.velcroFixed }), b.velcroFixed ? 'btn ghost' : 'btn primary');
        if (b.joined) btn('sep', t('f07.act.separate'), () => D({ type: 'separateCarts' }));
        break;
      }
      case 'gate': {
        const gid = id as TrackGate;
        const g = w.gates[gid];
        hold('gUp', `▶ ${t('f07.act.gateUp')}`, () => void D({ type: 'moveGate', id: gid, s: g.s + 0.01 }));
        hold('gDown', `◀ ${t('f07.act.gateDown')}`, () => void D({ type: 'moveGate', id: gid, s: g.s - 0.01 }));
        btn('clamp', t(w.track.gatesClamped ? 'f07.act.unclamp' : 'f07.act.clamp'), () => D({ type: 'clampGates', on: !w.track.gatesClamped }), w.track.gatesClamped ? 'btn ghost' : 'btn primary');
        btn('plug', t(w.logger.gatesConnected ? 'f07.act.unplug' : 'f07.act.plug'), () => D({ type: 'connect', channel: 'gates', on: !w.logger.gatesConnected }));
        btn('read', `🔍 ${t('f07.act.readGates')}`, () => D({ type: 'readGates' }), 'btn primary');
        if (Math.abs(g.s - (gid === 'gateA' ? GEOF07.gate.sA : GEOF07.gate.sB)) > 0.005) btn('home', t('f07.act.gateHome'), () => D({ type: 'moveGate', id: gid, s: gid === 'gateA' ? GEOF07.gate.sA : GEOF07.gate.sB }), 'btn ghost');
        break;
      }
      case 'forceSensor': {
        const s = w.sensor;
        const ranges = w.params.force.ranges;
        btn('plug', t(s.connected ? 'f07.act.unplug' : 'f07.act.plug'), () => D({ type: 'connect', channel: 'force', on: !s.connected }));
        btn('zero', t('f07.act.zero'), () => D({ type: 'zeroSensor' }));
        btn('cal', t('f07.act.calibrate'), () => D({ type: 'calibrateSensor' }));
        btn('range', t('f07.act.range', { n: ranges[(s.rangeIdx + 1) % ranges.length] }), () => D({ type: 'setRange', n: (s.rangeIdx + 1) % ranges.length }));
        hold('tiltUp', `▲ ${t('f07.act.tiltUp')}`, () => void D({ type: 'mountSensor', angleDeg: w.sensor.angleDeg + 1 }), 200);
        hold('tiltDown', `▼ ${t('f07.act.tiltDown')}`, () => void D({ type: 'mountSensor', angleDeg: w.sensor.angleDeg - 1 }), 200);
        btn('read', `🔍 ${t('f07.act.readForce')}`, () => D({ type: 'readForce' }), 'btn primary');
        break;
      }
      case 'logger': {
        const rates = w.params.rates;
        const next = rates[(rates.indexOf(w.logger.rateHz) + 1) % rates.length];
        btn('rate', t('f07.act.rate', { hz: next }), () => D({ type: 'setRate', hz: next }));
        btn('force', t(w.sensor.connected ? 'f07.act.forceOff' : 'f07.act.forceOn'), () => D({ type: 'connect', channel: 'force', on: !w.sensor.connected }));
        btn('gates', t(w.logger.gatesConnected ? 'f07.act.gatesOff' : 'f07.act.gatesOn'), () => D({ type: 'connect', channel: 'gates', on: !w.logger.gatesConnected }));
        btn('readG', `🔍 ${t('f07.act.readGates')}`, () => D({ type: 'readGates' }), 'btn primary');
        btn('readF', `🔍 ${t('f07.act.readForce')}`, () => D({ type: 'readForce' }), 'btn primary');
        lens('logger01', t('f07.act.graph'));
        eye('logger01');
        break;
      }
      case 'camera':
        btn('plug', t(w.logger.cameraOn ? 'f07.act.cameraOff' : 'f07.act.cameraOn'), () => D({ type: 'connect', channel: 'camera', on: !w.logger.cameraOn }));
        btn('read', `🔍 ${t('f07.act.readMotion')}`, () => D({ type: 'readMotion' }), 'btn primary');
        lens('camera01', t('f07.act.graph'));
        break;
      case 'posRuler':
        for (const cid of ['cartA', 'cartB'] as const) btn(`pos${cid}`, `🔍 ${t('f07.act.readPositionOf', { c: t(`f07.obj.${cid}`) })}`, () => ctl?.readPosition(cid) ?? D({ type: 'readPosition', cart: cid, viewDeg: 0 }));
        eye('ruler01');
        break;
      case 'caliper':
        for (const cid of ['cartA', 'cartB'] as const) btn(`cal${cid}`, `📏 ${t('f07.act.measureFlagOf', { c: t(`f07.obj.${cid}`) })}`, () => D({ type: 'measureFlag', cart: cid }));
        break;
      case 'balance':
        btn('tare', t('f07.act.tare'), () => D({ type: 'tareBalance' }));
        btn('read', `🔍 ${t('f07.act.readBalance')}`, () => ctl?.readBalance() ?? D({ type: 'readBalance' }), 'btn primary');
        if (w.balance.on) btn('off', t('f07.act.offBalance'), () => D({ type: 'removeFromBalance' }));
        eye('balance01');
        break;
    }
    btn('insp', `🔍 ${t('f07.act.inspect')}`, () => {
      D({ type: 'inspect', target: id });
      stage?.focusObject(id, 4);
    }, 'btn ghost');
  }
  if (w.safety.block) btn('ack', `⚠ ${t('f07.act.acknowledge')}`, () => D({ type: 'acknowledge' }), 'btn primary');

  const desc = id ? describeObjectF07(w, id) : '';
  return (
    <section id="actions" className={`actions${demo ? ' demo-locked' : ''}`} aria-label={t('f07.act.title')} aria-disabled={demo || undefined}>
      <div className="desc" id="action-desc" aria-live="polite">{id ? desc : t('f07.act.none')}</div>
      <div className="row">{buttons}</div>
    </section>
  );
}
