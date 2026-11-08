import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useF102 } from './store';
import { describeObjectF102 } from './describe';
import { HoldButton } from './ui';
import type { F102Command } from '../../simulation/f102-world/commands';
import { FILTERS, cartMoving, filterStack } from '../../simulation/f102-world/world';
import { RACK_POS, TRAY_POS, rackSlot } from '../../practices/practice-f102/definition';
import { GEOF102 } from '../../simulation/f102-world/geometry';
import { eyeTargetFor } from './LensF102';

/**
 * Panel de acciones de F102: alternativa accesible a cada gesto con el ratón. Ejecuta EXACTAMENTE los mismos comandos
 * del dominio que el controlador (correr la base de una compuerta centímetro a centímetro, girar el tornillo del pie
 * vuelta a vuelta, subir la prensa del electroimán, soltar el carro quieto o con un empujón); no es un atajo
 * científico: no hay «medir g» ni «nivelar automáticamente».
 */
export function ActionPanelF102() {
  const { t } = useTranslation();
  useF102((s) => s.version);
  const rt = useF102((s) => s.runtime);
  const stage = useF102((s) => s.stage);
  const sel = useF102((s) => s.selected);
  const held = useF102((s) => s.held);
  const dispatch = useF102((s) => s.dispatch);
  const toast = useF102((s) => s.toast);
  const demo = useF102((s) => !!s.demo);
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
      const k = `f102.cmd.${r.code}`;
      toast('warn', t(k) !== k ? t(k) : t('f102.cmd.FAILED'));
    }
    return r;
  };
  const D = (c: F102Command) => run(dispatch(c));
  const buttons: React.ReactNode[] = [];
  const add = (key: string, node: React.ReactNode) => buttons.push(<span key={key}>{node}</span>);
  const btn = (key: string, label: string, fn: () => unknown, cls = 'btn') => add(key, <button className={cls} onClick={() => run(fn() as never)}>{label}</button>);
  const hold = (key: string, label: string, fn: () => void, ms = 120) => add(key, <HoldButton onStart={() => startNudge(fn, ms)} onStop={stopNudge}>{label}</HoldButton>);
  const eye = (target = id) => btn('eye', `👁 ${t('f102.act.eyeLevel')}`, () => stage?.camera?.eyeLevel(eyeTargetFor(target)), 'btn ghost');
  const toBench = (oid: string, x: number, y: number, support = 'bench', z = 0) => D({ type: 'setPose', id: oid, pose: { x, y, z, rotationRad: 0 }, support });

  if (id && o) {
    switch (o.kind) {
      case 'track':
        hold('footUp', `⟳ ${t('f102.act.footUp')}`, () => void D({ type: 'turnFootScrew', turns: 1 }), 300);
        hold('footDown', `⟲ ${t('f102.act.footDown')}`, () => void D({ type: 'turnFootScrew', turns: -1 }), 300);
        eye('track01');
        break;
      case 'inclinometer':
        btn('onTrack', t(o.support === 'track01' ? 'f102.act.inclOff' : 'f102.act.inclOn'), () => D({ type: 'placeInclinometer', where: o.support === 'track01' ? 'bench' : 'track' }));
        btn('zero', t('f102.act.zero'), () => D({ type: 'zeroInclinometer' }));
        btn('read', `🔍 ${t('f102.act.read')}`, () => ctl?.readInclinometer(), 'btn primary');
        break;
      case 'cart': {
        const moving = cartMoving(w);
        if (w.cart.held) {
          hold('back', `◀ ${t('f102.act.cartBack')}`, () => void D({ type: 'holdCart', sCm: w.cart.s * 100 - 1 }));
          hold('fwd', `▶ ${t('f102.act.cartFwd')}`, () => void D({ type: 'holdCart', sCm: w.cart.s * 100 + 1 }));
          btn('toPlunger', t('f102.act.toPlunger'), () => D({ type: 'holdCart', sCm: 0 }));
          btn('release', `✋ ${t('f102.act.release')}`, () => D({ type: 'releaseCart', pushMs: 0 }), 'btn primary');
          btn('push', t('f102.act.push'), () => D({ type: 'releaseCart', pushMs: 0.3 }), 'btn ghost');
        } else {
          btn('catch', `✊ ${t(moving ? 'f102.act.catch' : 'f102.act.hold')}`, () => D({ type: 'holdCart', sCm: w.cart.s * 100 }), 'btn primary');
        }
        btn('flag', `📏 ${t('f102.act.readFlag')}`, () => ctl?.readRuler('flag'));
        btn('hook', t(w.string.attached ? 'f102.act.unhook' : 'f102.act.hook'), () => D({ type: 'attachString', on: !w.string.attached }));
        if (w.cart.flagBent) btn('flagNew', t('f102.act.replaceFlag'), () => D({ type: 'replaceFlag' }));
        for (const b of ['bar1', 'bar2']) btn(`bar-${b}`, t(w.cart.bars.includes(b) ? 'f102.act.barOff' : 'f102.act.barOn', { o: t(`f102.obj.${b}`) }), () => D({ type: 'loadBar', barId: b, on: !w.cart.bars.includes(b) }), 'btn ghost');
        break;
      }
      case 'launcher':
        for (const n of [1, 2, 3]) btn(`cock${n}`, t('f102.act.cock', { n }), () => D({ type: 'cockLauncher', notchCm: n }));
        btn('latch', `🔓 ${t('f102.act.latch')}`, () => D({ type: 'pullLatch' }), 'btn primary');
        break;
      case 'gate': {
        const g = w.gates[id];
        hold('gBack', `◀ ${t('f102.act.gateBack')}`, () => void D({ type: 'setGatePos', gateId: id, sCm: Math.round(w.gates[id].s * 100) - 1 }));
        hold('gFwd', `▶ ${t('f102.act.gateFwd')}`, () => void D({ type: 'setGatePos', gateId: id, sCm: Math.round(w.gates[id].s * 100) + 1 }));
        btn('yaw0', t('f102.act.align'), () => D({ type: 'setGateYaw', gateId: id, yawDeg: 0 }));
        hold('yawL', '↺', () => void D({ type: 'setGateYaw', gateId: id, yawDeg: w.gates[id].yawDeg - 1 }), 200);
        hold('yawR', '↻', () => void D({ type: 'setGateYaw', gateId: id, yawDeg: w.gates[id].yawDeg + 1 }), 200);
        btn('plug', t(w.gateTimer.connected[id] ? 'f102.act.unplug' : 'f102.act.plug'), () => D({ type: 'connectGate', gateId: id, on: !w.gateTimer.connected[id] }));
        btn('idx', `📏 ${t('f102.act.readIndex')}`, () => ctl?.readRuler(id as 'gate1' | 'gate2', 'index'));
        btn('edge', t('f102.act.readEdge'), () => ctl?.readRuler(id as 'gate1' | 'gate2', 'edge'), 'btn ghost');
        void g;
        eye('track01');
        break;
      }
      case 'gateTimer':
        btn('arm', t('f102.act.arm'), () => D({ type: 'armGateTimer' }));
        btn('read', `🔍 ${t('f102.act.read')}`, () => ctl?.readGateTimer(), 'btn primary');
        break;
      case 'pulley':
        btn('seat', t(w.string.onWheel ? 'f102.act.unseat' : 'f102.act.seat'), () => D({ type: 'seatString', on: !w.string.onWheel }));
        break;
      case 'hanger': {
        const hung = o.support === 'string' || o.support === 'floor';
        btn('hang', t(hung ? 'f102.act.unhang' : 'f102.act.hang'), () => (hung ? D({ type: 'hangHanger', on: false }) : D({ type: 'hangHanger', on: true })), 'btn primary');
        break;
      }
      case 'slotMass': {
        const on = o.support === 'hanger01';
        const i = Object.keys(w.objects).filter((k) => w.objects[k].kind === 'slotMass').indexOf(id);
        btn('load', t(on ? 'f102.act.unload' : 'f102.act.load'), () => (on ? D({ type: 'loadMass', massId: id, on: false }) : D({ type: 'loadMass', massId: id, on: true })));
        if (!on && o.support !== 'rack') btn('rack', t('f102.act.toRack'), () => toBench(id, rackSlot(i).x, rackSlot(i).y, 'rack', rackSlot(i).z), 'btn ghost');
        break;
      }
      case 'cartBar': {
        const on = o.support === 'cart01';
        btn('bar', t(on ? 'f102.act.barOff' : 'f102.act.barOn', { o: t(`f102.obj.${id}`) }), () => D({ type: 'loadBar', barId: id, on: !on }));
        break;
      }
      case 'tapeTimer':
        btn('attach', t(w.tape.attached ? 'f102.act.tapeOff' : 'f102.act.tapeOn'), () => D({ type: 'attachTape', on: !w.tape.attached }));
        btn('tension', t('f102.act.tension'), () => D({ type: 'tensionTape' }));
        btn('run', w.tape.running ? `⏹ ${t('f102.act.stop')}` : `⏺ ${t('f102.act.start')}`, () => ctl?.toggleTape(), 'btn primary');
        break;
      case 'tower':
        btn('scale', `📏 ${t('f102.act.readScale')}`, () => ctl?.readTowerScale(), 'btn primary');
        eye('tower01');
        break;
      case 'magnet': {
        const m = w.magnet;
        btn('clamp', t(m.clampTight ? 'f102.act.loosen' : 'f102.act.tighten'), () => D({ type: 'tightenClamp', on: !m.clampTight }));
        hold('up', `▲ ${t('f102.act.up')}`, () => void D({ type: 'setMagnetHeight', hCm: w.magnet.h * 100 + 1 }));
        hold('down', `▼ ${t('f102.act.down')}`, () => void D({ type: 'setMagnetHeight', hCm: w.magnet.h * 100 - 1 }));
        btn('sw', t(m.on ? 'f102.act.magnetOff' : 'f102.act.magnetOn'), () => D({ type: 'switchMagnet', on: !m.on }), 'btn primary');
        btn('arm', t(m.armIn ? 'f102.act.armOut' : 'f102.act.armIn'), () => D({ type: 'swingMagnetArm', armIn: !m.armIn }));
        btn('scale', `📏 ${t('f102.act.readScale')}`, () => ctl?.readTowerScale());
        if (m.holding) btn('take', t('f102.act.takeOff'), () => D({ type: 'pickUpBody', id: m.holding! }), 'btn ghost');
        eye('tower01');
        break;
      }
      case 'photocell':
        btn('cap', t(w.photocellCapped ? 'f102.act.uncap' : 'f102.act.capOn'), () => D({ type: 'capPhotocell', on: !w.photocellCapped }));
        btn('arm', t('f102.act.armFall'), () => D({ type: 'armFallTimer' }));
        btn('read', `🔍 ${t('f102.act.read')}`, () => ctl?.readFallTimer(), 'btn primary');
        break;
      case 'pad':
        btn('center', t('f102.act.padCenter'), () => toBench(id, GEOF102.tower.x, GEOF102.tower.y, 'base', GEOF102.tower.baseH));
        btn('aside', t('f102.act.padAside'), () => toBench(id, GEOF102.tower.x + 26, 46), 'btn ghost');
        break;
      case 'sphere':
      case 'filter': {
        const isF = o.kind === 'filter';
        const base = isF ? filterStack(w, id)[0] : id;
        const bo = w.objects[base];
        if (bo.support === 'magnet01') btn('take', t('f102.act.takeOff'), () => D({ type: 'pickUpBody', id: base }));
        else if (bo.support !== 'air') {
          btn('mag', `🧲 ${t('f102.act.toMagnet')}`, () => D({ type: 'attachToMagnet', id: base, offsetMm: 0 }), 'btn primary');
          btn('magOff', t('f102.act.toMagnetOff'), () => D({ type: 'attachToMagnet', id: base, offsetMm: 5 }), 'btn ghost');
          for (const hCm of [60, 90, 120]) btn(`drop${hCm}`, t('f102.act.dropHand', { h: hCm }), () => D({ type: 'dropByHand', id: base, heightCm: hCm, offsetMm: 0, pushMs: 0 }));
          if (bo.support === 'pad01' || bo.support === 'base' || bo.support === 'hand') {
            if (isF) btn('bench', t('f102.act.toBench'), () => toBench(id, 300, 46), 'btn ghost');
            else btn('tray', t('f102.act.toTray'), () => toBench(id, TRAY_POS.x, TRAY_POS.y, 'tray', GEOF102.tray.h), 'btn ghost');
          }
        }
        if (isF) {
          const st = filterStack(w, id);
          const free = FILTERS.filter((f) => !st.includes(f) && w.objects[f].support !== 'air' && w.objects[f].support !== 'magnet01');
          for (const f of free.slice(0, 3)) btn(`stack-${f}`, t('f102.act.stackOn', { o: t(`f102.obj.${f}`) }), () => D({ type: 'stackFilter', filterId: id, onto: f, offsetMm: 0 }));
          if (st.length > 1 && st[0] !== id) btn('unstack', t('f102.act.unstack'), () => D({ type: 'stackFilter', filterId: id, onto: null, offsetMm: 0 }), 'btn ghost');
          if (!w.filters[id].crumpled) btn('crumple', t('f102.act.crumple'), () => D({ type: 'crumpleFilter', filterId: id }), 'btn ghost');
        }
        break;
      }
      case 'motionSensor': {
        const s = w.motion;
        btn('plug', t(s.connected ? 'f102.act.unplug' : 'f102.act.plug'), () => D({ type: 'connectMotion', on: !s.connected }));
        btn('range', t('f102.act.range', { r: t(`f102.desc.range.${s.range === 'near' ? 'far' : 'near'}`) }), () => D({ type: 'setMotionRange', range: s.range === 'near' ? 'far' : 'near' }));
        btn('rate', t('f102.act.rate', { hz: s.rateHz === 10 ? 50 : 10 }), () => D({ type: 'setMotionRate', hz: s.rateHz === 10 ? 50 : 10 }));
        btn('level', t('f102.act.aimLevel'), () => D({ type: 'aimMotion', aimDeg: 0 }));
        btn('cal', t('f102.act.calibrate'), () => D({ type: 'calibrateMotion' }));
        btn('rec', s.capture ? `⏹ ${t('f102.act.stop')}` : `⏺ ${t('f102.act.start')}`, () => ctl?.toggleMotion(), 'btn primary');
        break;
      }
      case 'massRack':
        btn('rack', t('f102.act.toRackAll'), () => {
          let r: { ok: boolean; code?: string } | undefined | void;
          Object.keys(w.objects).filter((k) => w.objects[k].kind === 'slotMass' && w.objects[k].support === 'bench').forEach((k, i) => (r = D({ type: 'setPose', id: k, pose: rackSlot(i), support: 'rack' })));
          void RACK_POS;
          return r;
        }, 'btn ghost');
        break;
      case 'returnTray':
        btn('close', `✅ ${t('f102.act.closeStation')}`, () => D({ type: 'closeStation' }), 'btn primary');
        break;
    }
    btn('insp', `🔍 ${t('f102.act.inspect')}`, () => {
      D({ type: 'inspect', target: id });
      stage?.focusObject(id, 4);
    }, 'btn ghost');
  }
  if (w.safety.block) btn('ack', `⚠ ${t('f102.act.acknowledge')}`, () => D({ type: 'acknowledge' }), 'btn primary');

  const desc = id ? describeObjectF102(w, id) : '';
  return (
    <section id="actions" className={`actions${demo ? ' demo-locked' : ''}`} aria-label={t('f102.act.title')} aria-disabled={demo || undefined}>
      <div className="desc" id="action-desc" aria-live="polite">{id ? desc : t('f102.act.none')}</div>
      <div className="row">{buttons}</div>
    </section>
  );
}
