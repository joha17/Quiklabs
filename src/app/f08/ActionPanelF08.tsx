import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useF08 } from './store';
import { describeObjectF08 } from './describe';
import { HoldButton } from './ui';
import type { F08Command } from '../../simulation/f08-world/commands';
import type { DropId, SlideId, SolidId } from '../../simulation/f08-world/types';
import { DROPS, busyF8, spinningF8 } from '../../simulation/f08-world/world';
import { eyeTargetFor } from './LensF08';

/**
 * Panel de acciones de F08: alternativa accesible a cada gesto con el ratón. Ejecuta EXACTAMENTE los mismos comandos
 * del dominio que el controlador (la plataforma de a 1°, la masa corrediza de a 1 cm, la cuerda de a media vuelta, el
 * tope y la fotopuerta de a 0,5 cm); no es un atajo científico: no hay «medir I» ni «calcular α».
 */
export function ActionPanelF08() {
  const { t } = useTranslation();
  useF08((s) => s.version);
  const rt = useF08((s) => s.runtime);
  const stage = useF08((s) => s.stage);
  const sel = useF08((s) => s.selected);
  const held = useF08((s) => s.held);
  const dispatch = useF08((s) => s.dispatch);
  const toast = useF08((s) => s.toast);
  const demo = useF08((s) => !!s.demo);
  const setSettings = useF08((s) => s.setSettings);
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
      const k = `f08.cmd.${r.code}`;
      toast('warn', t(k) !== k ? t(k) : t('f08.cmd.FAILED'));
    }
    return r;
  };
  const D = (c: F08Command) => run(dispatch(c));
  const buttons: React.ReactNode[] = [];
  const add = (key: string, node: React.ReactNode) => buttons.push(<span key={key}>{node}</span>);
  const btn = (key: string, label: string, fn: () => unknown, cls = 'btn') => add(key, <button className={cls} onClick={() => run(fn() as never)}>{label}</button>);
  const hold = (key: string, label: string, fn: () => void, ms = 120) => add(key, <HoldButton onStart={() => startNudge(fn, ms)} onStop={stopNudge}>{label}</HoldButton>);
  const eye = (target = id) => btn('eye', `👁 ${t('f08.act.eyeLevel')}`, () => stage?.camera?.eyeLevel(eyeTargetFor(target)), 'btn ghost');
  const lens = (target: string, label: string) => btn(`lens${target}`, `📈 ${label}`, () => setSettings({ lens: target }), 'btn ghost');
  const busy = busyF8(w);
  const weigh = (what: string) => btn(`weigh${what}`, t('f08.act.weigh'), () => D({ type: 'placeOnBalance', id: what }));
  const offBalance = () => btn('off', t('f08.act.offBalance'), () => D({ type: 'removeFromBalance' }), 'btn primary');
  const r = w.rotor;
  const s = w.string;
  const still = !spinningF8(w);
  const guardBtn = () => btn('guard', t(w.base.guardClosed ? 'f08.act.guardOpen' : 'f08.act.guardClose'), () => D({ type: 'setGuard', closed: !w.base.guardClosed }), w.base.guardClosed ? 'btn ghost' : 'btn');
  const brakeBtn = () => btn('brake', t(r.brake ? 'f08.act.brakeOff' : 'f08.act.brakeOn'), () => D({ type: 'setBrake', on: !r.brake }), r.brake ? 'btn' : 'btn ghost');
  const releaseBtn = () => {
    if (s.mass && s.held) btn('release', `⬇ ${t('f08.act.release')}`, () => ctl?.release() ?? D({ type: 'release' }), 'btn primary');
  };

  if (id && o) {
    switch (o.kind) {
      case 'base':
        btn('clamp', t(w.base.clamped ? 'f08.act.unclamp' : 'f08.act.clamp'), () => D({ type: 'clampBase', on: !w.base.clamped }), w.base.clamped ? 'btn ghost' : 'btn primary');
        btn('scale', `🔍 ${t('f08.act.readScale')}`, () => ctl?.readScale() ?? D({ type: 'readScale', viewDeg: 0 }), 'btn primary');
        hold('cw', `↻ ${t('f08.act.turnPlus')}`, () => void D({ type: 'turnByHand', deg: 1 }), 120);
        hold('ccw', `↺ ${t('f08.act.turnMinus')}`, () => void D({ type: 'turnByHand', deg: -1 }), 120);
        eye('base01');
        break;
      case 'guard':
        guardBtn();
        brakeBtn();
        break;
      case 'hub':
        brakeBtn();
        guardBtn();
        if (still && !busy) {
          hold('cw', `↻ ${t('f08.act.turnPlus')}`, () => void D({ type: 'turnByHand', deg: 1 }), 120);
          hold('ccw', `↺ ${t('f08.act.turnMinus')}`, () => void D({ type: 'turnByHand', deg: -1 }), 120);
          btn('spin', `🌀 ${t('f08.act.spin')}`, () => D({ type: 'spinByHand', omega: 6 }), 'btn ghost');
        }
        btn('touch', t(r.touch ? 'f08.act.untouch' : 'f08.act.touch'), () => D({ type: 'touchHub', on: !r.touch }), 'btn ghost');
        if (r.solid) {
          btn('remove', t('f08.act.removeSolid'), () => D({ type: 'removeSolid' }));
          if (r.ecc > 0) btn('center', t('f08.act.center'), () => D({ type: 'centerSolid' }), 'btn primary');
        }
        releaseBtn();
        lens('logger01', t('f08.act.graph'));
        break;
      case 'solid': {
        const sid = id as SolidId;
        if (o.support === 'balance') offBalance();
        else if (o.support === 'hub') {
          btn('remove', t('f08.act.removeSolid'), () => D({ type: 'removeSolid' }));
          if (r.ecc > 0) btn('center', t('f08.act.center'), () => D({ type: 'centerSolid' }), 'btn primary');
        } else {
          const holes = sid === 'disc01' ? w.params.holes : [0];
          for (const hh of holes) btn(`mount${hh}`, t('f08.act.mount', { cm: Math.round(hh * 100) }), () => D({ type: 'mountSolid', id: sid, hole: hh }), 'btn primary');
          weigh(sid);
          if (sid !== 'bar01') btn('caliper', `📏 ${t('f08.act.measure')}`, () => D({ type: 'measure', target: sid as 'disc01' | 'ring01' }));
          if (sid === 'disc01') btn('hole', `📏 ${t('f08.act.measureHole')}`, () => D({ type: 'measure', target: 'hole' }), 'btn ghost');
        }
        if (w.damaged[sid]) btn('repair', `🔧 ${t('f08.act.repair')}`, () => D({ type: 'repairSolid', id: sid }), 'btn primary');
        break;
      }
      case 'slideMass': {
        const sid = id as SlideId;
        const sl = w.slides[sid];
        if (o.support === 'balance') offBalance();
        else {
          if (!sl.locked) {
            hold('out', `⟶ ${t('f08.act.slideOut')}`, () => void D({ type: 'slideMass', id: sid, rCm: Math.round(w.slides[sid].r * 100) + 1 }), 150);
            hold('in', `⟵ ${t('f08.act.slideIn')}`, () => void D({ type: 'slideMass', id: sid, rCm: Math.round(w.slides[sid].r * 100) - 1 }), 150);
          }
          btn('lock', t(sl.locked ? 'f08.act.unlock' : 'f08.act.lock'), () => D({ type: 'lockMass', id: sid, on: !sl.locked }), sl.locked ? 'btn ghost' : 'btn primary');
          btn('ruler', `🔍 ${t('f08.act.readRadius')}`, () => ctl?.readRadius(sid) ?? D({ type: 'readRadius', id: sid, viewDeg: 0 }));
          if (w.objects.bar01.support === 'rack') weigh(sid);
        }
        eye(sid);
        break;
      }
      case 'radialRuler':
        for (const sid of ['slide1', 'slide2'] as const) btn(`r${sid}`, `🔍 ${t('f08.act.readRadiusOf', { m: t(`f08.obj.${sid}`) })}`, () => ctl?.readRadius(sid) ?? D({ type: 'readRadius', id: sid, viewDeg: 0 }));
        eye('ruler01');
        break;
      case 'pulley':
        btn('align', t('f08.act.alignPulley'), () => D({ type: 'alignPulley' }), 'btn primary');
        if (!s.mass && still) {
          btn('wind', t('f08.act.wind', { n: s.turns + 0.5 }), () => D({ type: 'windString', turns: s.turns + 0.5 }));
          if (s.turns > 0) btn('unwind', t('f08.act.unwind'), () => D({ type: 'windString', turns: Math.max(0, s.turns - 0.5) }), 'btn ghost');
          w.params.drumRadii.filter((x) => x !== s.drumR).forEach((x) => btn(`drum${x}`, t('f08.act.drum', { cm: (x * 100).toFixed(1).replace('.', ',') }), () => D({ type: 'setDrum', rCm: x * 100 }), 'btn ghost'));
          btn('caliper', `📏 ${t('f08.act.measureDrum')}`, () => D({ type: 'measure', target: 'drum' }), 'btn ghost');
        }
        releaseBtn();
        break;
      case 'dropMass': {
        const did = id as DropId;
        if (o.support === 'balance') offBalance();
        else if (o.support === 'hook') {
          btn('unhook', t('f08.act.unhook'), () => D({ type: 'hangMass', id: did, on: false }));
          releaseBtn();
        } else {
          btn('hang', t('f08.act.hang'), () => D({ type: 'hangMass', id: did, on: true }), 'btn primary');
          weigh(did);
          btn('flag', `📏 ${t('f08.act.measureFlag')}`, () => D({ type: 'measure', target: 'flag' }), 'btn ghost');
        }
        break;
      }
      case 'massRack':
        DROPS.filter((m) => w.objects[m].support === 'hook').forEach((m) => btn(`back${m}`, t('f08.act.massBack', { m: t(`f08.obj.${m}`) }), () => D({ type: 'hangMass', id: m, on: false })));
        btn('close', `✅ ${t('f08.act.closeStation')}`, () => D({ type: 'closeStation' }), 'btn primary');
        break;
      case 'solidRack':
        if (r.solid) btn('remove', t('f08.act.removeSolid'), () => D({ type: 'removeSolid' }));
        btn('close', `✅ ${t('f08.act.closeStation')}`, () => D({ type: 'closeStation' }), 'btn primary');
        break;
      case 'dropColumn':
      case 'catch': {
        const c = w.column;
        btn('catch', t(c.catchOn ? 'f08.act.catchOff' : 'f08.act.catchOn'), () => D({ type: 'setCatch', on: !c.catchOn, zCm: c.catchZ }), c.catchOn ? 'btn ghost' : 'btn primary');
        hold('cUp', `▲ ${t('f08.act.catchUp')}`, () => void D({ type: 'setCatch', on: w.column.catchOn, zCm: w.column.catchZ + 0.5 }), 150);
        hold('cDown', `▼ ${t('f08.act.catchDown')}`, () => void D({ type: 'setCatch', on: w.column.catchOn, zCm: w.column.catchZ - 0.5 }), 150);
        eye('column01');
        break;
      }
      case 'gate':
        hold('gUp', `▲ ${t('f08.act.gateUp')}`, () => void D({ type: 'moveGate', zCm: w.column.gateZ + 0.5 }), 150);
        hold('gDown', `▼ ${t('f08.act.gateDown')}`, () => void D({ type: 'moveGate', zCm: w.column.gateZ - 0.5 }), 150);
        btn('plug', t(w.logger.gateConnected ? 'f08.act.unplug' : 'f08.act.plug'), () => D({ type: 'connect', channel: 'gate', on: !w.logger.gateConnected }));
        btn('read', `🔍 ${t('f08.act.readGate')}`, () => D({ type: 'readGate' }), 'btn primary');
        break;
      case 'encoder': {
        const e = w.encoder;
        btn('plug', t(e.connected ? 'f08.act.unplug' : 'f08.act.plug'), () => D({ type: 'connect', channel: 'encoder', on: !e.connected }));
        btn('cal', t('f08.act.calibrate'), () => D({ type: 'calibrateEncoder' }));
        btn('zero', t('f08.act.zero'), () => D({ type: 'zeroEncoder' }));
        btn('dir', t('f08.act.dir'), () => D({ type: 'setEncoderDir', dir: -e.dir }), 'btn ghost');
        btn('angle', `🔍 ${t('f08.act.readAngle')}`, () => D({ type: 'readEncoderAngle' }));
        btn('read', `🔍 ${t('f08.act.readEncoder')}`, () => D({ type: 'readEncoder' }), 'btn primary');
        lens('logger01', t('f08.act.graph'));
        break;
      }
      case 'tensionSensor': {
        const ts = w.tension;
        btn('plug', t(ts.connected ? 'f08.act.unplug' : 'f08.act.plug'), () => D({ type: 'connect', channel: 'tension', on: !ts.connected }));
        btn('zero', t('f08.act.zero'), () => D({ type: 'zeroTension' }));
        hold('tiltUp', `▲ ${t('f08.act.tiltUp')}`, () => void D({ type: 'mountTension', angleDeg: w.tension.angleDeg + 1 }), 200);
        hold('tiltDown', `▼ ${t('f08.act.tiltDown')}`, () => void D({ type: 'mountTension', angleDeg: w.tension.angleDeg - 1 }), 200);
        btn('read', `🔍 ${t('f08.act.readTension')}`, () => D({ type: 'readTension' }), 'btn primary');
        break;
      }
      case 'tach': {
        const ranges = w.params.tach.ranges;
        btn('plug', t(w.tach.connected ? 'f08.act.unplug' : 'f08.act.plug'), () => D({ type: 'connect', channel: 'tach', on: !w.tach.connected }));
        btn('range', t('f08.act.range', { n: ranges[(w.tach.rangeIdx + 1) % ranges.length] }), () => D({ type: 'setTachRange', n: (w.tach.rangeIdx + 1) % ranges.length }));
        btn('read', `🔍 ${t('f08.act.readTach')}`, () => D({ type: 'readTach' }), 'btn primary');
        break;
      }
      case 'logger': {
        const rates = w.params.rates;
        const next = rates[(rates.indexOf(w.logger.rateHz) + 1) % rates.length];
        btn('rate', t('f08.act.rate', { hz: next }), () => D({ type: 'setRate', hz: next }));
        for (const ch of ['encoder', 'tension', 'tach', 'gate'] as const) {
          const on = ch === 'encoder' ? w.encoder.connected : ch === 'tension' ? w.tension.connected : ch === 'tach' ? w.tach.connected : w.logger.gateConnected;
          btn(`ch${ch}`, t(on ? 'f08.act.chOff' : 'f08.act.chOn', { ch: t(`f08.channel.${ch}`) }), () => D({ type: 'connect', channel: ch, on: !on }), 'btn ghost');
        }
        btn('readE', `🔍 ${t('f08.act.readEncoder')}`, () => D({ type: 'readEncoder' }), 'btn primary');
        lens('logger01', t('f08.act.graph'));
        eye('logger01');
        break;
      }
      case 'caliper':
        for (const tg of ['disc01', 'ring01', 'drum', 'flag', 'hole'] as const) btn(`cal${tg}`, `📏 ${t(`f08.act.caliper.${tg}`)}`, () => D({ type: 'measure', target: tg }));
        break;
      case 'balance':
        btn('tare', t('f08.act.tare'), () => D({ type: 'tareBalance' }));
        btn('read', `🔍 ${t('f08.act.readBalance')}`, () => ctl?.readBalance() ?? D({ type: 'readBalance' }), 'btn primary');
        if (w.balance.on) btn('off', t('f08.act.offBalance'), () => D({ type: 'removeFromBalance' }));
        eye('balance01');
        break;
    }
    btn('insp', `🔍 ${t('f08.act.inspect')}`, () => {
      D({ type: 'inspect', target: id });
      stage?.focusObject(id, 4);
    }, 'btn ghost');
  }
  if (w.safety.block) btn('ack', `⚠ ${t('f08.act.acknowledge')}`, () => D({ type: 'acknowledge' }), 'btn primary');

  const desc = id ? describeObjectF08(w, id) : '';
  return (
    <section id="actions" className={`actions${demo ? ' demo-locked' : ''}`} aria-label={t('f08.act.title')} aria-disabled={demo || undefined}>
      <div className="desc" id="action-desc" aria-live="polite">{id ? desc : t('f08.act.none')}</div>
      <div className="row">{buttons}</div>
    </section>
  );
}
