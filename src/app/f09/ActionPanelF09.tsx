import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useF09 } from './store';
import { describeObjectF09 } from './describe';
import { HoldButton } from './ui';
import type { F09Command } from '../../simulation/f09-world/commands';
import type { SlideId } from '../../simulation/f09-world/types';
import { busyF9, spinningF9 } from '../../simulation/f09-world/world';
import { eyeTargetFor } from './LensF09';

const RPM = 60 / (2 * Math.PI);

/**
 * Panel de acciones de F09: alternativa accesible a cada gesto con el ratón. Ejecuta EXACTAMENTE los mismos comandos
 * del dominio que el controlador (la masa orbitante y las radiales de a 1 cm, la consigna del motor de a 5 rpm, la
 * fuerza del carro de a 0,1 N, la inclinación del cordón de a 1°); no es un atajo científico: no hay «medir F» ni
 * «calcular I».
 */
export function ActionPanelF09() {
  const { t } = useTranslation();
  useF09((s) => s.version);
  const rt = useF09((s) => s.runtime);
  const stage = useF09((s) => s.stage);
  const sel = useF09((s) => s.selected);
  const held = useF09((s) => s.held);
  const dispatch = useF09((s) => s.dispatch);
  const toast = useF09((s) => s.toast);
  const demo = useF09((s) => !!s.demo);
  const setSettings = useF09((s) => s.setSettings);
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
      const k = `f09.cmd.${r.code}`;
      toast('warn', t(k) !== k ? t(k) : t('f09.cmd.FAILED'));
    }
    return r;
  };
  const D = (c: F09Command) => run(dispatch(c));
  const buttons: React.ReactNode[] = [];
  const add = (key: string, node: React.ReactNode) => buttons.push(<span key={key}>{node}</span>);
  const btn = (key: string, label: string, fn: () => unknown, cls = 'btn') => add(key, <button className={cls} onClick={() => run(fn() as never)}>{label}</button>);
  const hold = (key: string, label: string, fn: () => void, ms = 120) => add(key, <HoldButton onStart={() => startNudge(fn, ms)} onStop={stopNudge}>{label}</HoldButton>);
  const eye = (target = id) => btn('eye', `👁 ${t('f09.act.eyeLevel')}`, () => stage?.camera?.eyeLevel(eyeTargetFor(target)), 'btn ghost');
  const lens = (target: string, label: string) => btn(`lens${target}`, `📈 ${label}`, () => setSettings({ lens: target }), 'btn ghost');
  const busy = busyF9(w);
  const weigh = (what: string) => btn(`weigh${what}`, t('f09.act.weigh'), () => D({ type: 'placeOnBalance', id: what }));
  const offBalance = () => btn('off', t('f09.act.offBalance'), () => D({ type: 'removeFromBalance' }), 'btn primary');
  const r = w.rotor;
  const d = w.drum;
  const still = !spinningF9(w);
  const guardBtn = () => btn('guard', t(w.base.guardClosed ? 'f09.act.guardOpen' : 'f09.act.guardClose'), () => D({ type: 'setGuard', closed: !w.base.guardClosed }), w.base.guardClosed ? 'btn ghost' : 'btn');
  const brakeBtns = () => {
    for (const lv of [0, 1, 2] as const) btn(`brake${lv}`, t(`f09.act.brake${lv}`), () => D({ type: 'setBrake', level: lv }), r.brake === lv ? 'btn primary' : 'btn ghost');
  };
  const readR = (tg: 'orbit01' | SlideId | 'arm', key = `r${tg}`) => btn(key, `🔍 ${t('f09.act.readRadiusOf', { m: t(`f09.radius.${tg}`) })}`, () => ctl?.readRadius(tg) ?? D({ type: 'readRadius', target: tg, ref: 'center', viewDeg: 0 }));
  const motorBtns = () => {
    const set = Math.round(w.motor.target * RPM);
    btn('clutch', t(w.motor.clutch ? 'f09.act.clutchOff' : 'f09.act.clutchOn'), () => D({ type: 'setClutch', on: !w.motor.clutch }), w.motor.clutch ? 'btn ghost' : 'btn primary');
    hold('rpmUp', `▲ ${t('f09.act.rpmUp', { rpm: set })}`, () => void D({ type: 'setMotor', rpm: Math.round(useF09.getState().runtime!.world.motor.target * RPM) + 5 }), 250);
    hold('rpmDown', `▼ ${t('f09.act.rpmDown')}`, () => void D({ type: 'setMotor', rpm: Math.max(0, Math.round(useF09.getState().runtime!.world.motor.target * RPM) - 5) }), 250);
    btn('rpm0', t('f09.act.rpmZero'), () => D({ type: 'setMotor', rpm: 0 }), 'btn ghost');
  };

  if (id && o) {
    switch (o.kind) {
      case 'base':
        btn('clamp', t(w.base.clamped ? 'f09.act.unclamp' : 'f09.act.clamp'), () => D({ type: 'clampBase', on: !w.base.clamped }), w.base.clamped ? 'btn ghost' : 'btn primary');
        btn('level', t('f09.act.level'), () => D({ type: 'levelAxis' }));
        break;
      case 'level':
        btn('level', t('f09.act.level'), () => D({ type: 'levelAxis' }), 'btn primary');
        eye('level01');
        break;
      case 'guard':
        guardBtn();
        brakeBtns();
        break;
      case 'hub':
      case 'brake':
        brakeBtns();
        guardBtn();
        btn('hand', t('f09.act.handBrake'), () => D({ type: 'handBrake' }), 'btn ghost');
        lens('logger01', t('f09.act.graph'));
        break;
      case 'guide':
        if (w.objects.orbit01.support === 'guide') btn('stop', t(w.orbit.stopLocked ? 'f09.act.stopUnlock' : 'f09.act.stopLock'), () => D({ type: 'lockStop', on: !w.orbit.stopLocked }), w.orbit.stopLocked ? 'btn ghost' : 'btn primary');
        if (w.damaged) btn('repair', `🔧 ${t('f09.act.repair')}`, () => D({ type: 'repairGuide' }), 'btn primary');
        break;
      case 'orbitMass':
        if (o.support === 'balance') offBalance();
        else if (w.orbit.off) btn('reseat', t('f09.act.reseat'), () => D({ type: 'reseatOrbit' }), 'btn primary');
        else if (o.support === 'guide') {
          if (!w.orbit.stopLocked && still && !busy) {
            hold('out', `⟶ ${t('f09.act.slideOut')}`, () => void D({ type: 'setOrbitRadius', rCm: Math.round(useF09.getState().runtime!.world.orbit.r * 100) + 1 }), 150);
            hold('in', `⟵ ${t('f09.act.slideIn')}`, () => void D({ type: 'setOrbitRadius', rCm: Math.round(useF09.getState().runtime!.world.orbit.r * 100) - 1 }), 150);
          }
          btn('stop', t(w.orbit.stopLocked ? 'f09.act.stopUnlock' : 'f09.act.stopLock'), () => D({ type: 'lockStop', on: !w.orbit.stopLocked }), w.orbit.stopLocked ? 'btn ghost' : 'btn primary');
          btn('cord', t('f09.act.tighten'), () => D({ type: 'tightenCord' }), w.orbit.slackM > 0 ? 'btn primary' : 'btn ghost');
          readR('orbit01');
          btn('edge', `🔍 ${t('f09.act.readEdge')}`, () => ctl?.readRadius('orbit01', 'edge') ?? D({ type: 'readRadius', target: 'orbit01', ref: 'edge', viewDeg: 0 }), 'btn ghost');
          btn('unmount', t('f09.act.unmount'), () => D({ type: 'mountOrbit', on: false }), 'btn ghost');
          weigh('orbit01');
          eye('ruler01');
        } else {
          btn('mount', t('f09.act.mount'), () => D({ type: 'mountOrbit', on: true }), 'btn primary');
          weigh('orbit01');
        }
        break;
      case 'radialMass': {
        const sid = id as SlideId;
        const sl = w.slides[sid];
        if (o.support === 'balance') offBalance();
        else {
          if (!sl.locked && still && !busy) {
            hold('out', `⟶ ${t('f09.act.slideOut')}`, () => void D({ type: 'setSlide', id: sid, rCm: Math.round(useF09.getState().runtime!.world.slides[sid].r * 100) + 1 }), 150);
            hold('in', `⟵ ${t('f09.act.slideIn')}`, () => void D({ type: 'setSlide', id: sid, rCm: Math.round(useF09.getState().runtime!.world.slides[sid].r * 100) - 1 }), 150);
          }
          btn('lock', t(sl.locked ? 'f09.act.unlock' : 'f09.act.lock'), () => D({ type: 'lockMass', id: sid, on: !sl.locked }), sl.locked ? 'btn ghost' : 'btn primary');
          readR(sid);
          weigh(sid);
        }
        eye('ruler01');
        break;
      }
      case 'radialRuler':
        for (const tg of ['orbit01', 'slide1', 'slide2', 'arm'] as const) readR(tg);
        eye('ruler01');
        break;
      case 'pullRing': {
        const to = ctl?.pullTo ?? 6;
        btn('pull', `⤓ ${t('f09.act.pullIn', { cm: to })}`, () => D({ type: 'pullIn', rCm: to }), 'btn primary');
        if (ctl) {
          btn('pullLess', t('f09.act.pullTo', { cm: Math.min(25, to + 1) }), () => { ctl.pullTo = Math.min(25, to + 1); useF09.getState().bump(); }, 'btn ghost');
          btn('pullMore', t('f09.act.pullTo', { cm: Math.max(5, to - 1) }), () => { ctl.pullTo = Math.max(5, to - 1); useF09.getState().bump(); }, 'btn ghost');
        }
        break;
      }
      case 'drum':
        if (still && !busy) {
          w.params.armRadii.forEach((x) => btn(`arm${x}`, t('f09.act.arm', { cm: Math.round(x * 100) }), () => D({ type: 'setArm', rCm: x * 100 }), Math.abs(x - d.armR) < 1e-9 ? 'btn primary' : 'btn ghost'));
          btn('wind', t('f09.act.wind', { n: d.turns + 1 }), () => D({ type: 'windCord', turns: d.turns + 1, dir: 1 }));
          btn('windRev', t('f09.act.windRev'), () => D({ type: 'windCord', turns: Math.max(1, d.turns), dir: -1 }), 'btn ghost');
          if (d.turns > 0) btn('unwind', t('f09.act.unwind'), () => D({ type: 'windCord', turns: 0, dir: 1 }), 'btn ghost');
        }
        readR('arm');
        break;
      case 'dynamometer':
        if (!d.pulling) {
          hold('fUp', `▲ ${t('f09.act.forceUp', { n: d.pullN.toFixed(1).replace('.', ',') })}`, () => void D({ type: 'setPull', forceN: useF09.getState().runtime!.world.drum.pullN + 0.1 }), 200);
          hold('fDown', `▼ ${t('f09.act.forceDown')}`, () => void D({ type: 'setPull', forceN: useF09.getState().runtime!.world.drum.pullN - 0.1 }), 200);
          hold('aimUp', `↗ ${t('f09.act.aimUp', { deg: d.aimDeg.toFixed(0) })}`, () => void D({ type: 'aimDyn', deg: useF09.getState().runtime!.world.drum.aimDeg + 1 }), 200);
          hold('aimDown', `↘ ${t('f09.act.aimDown')}`, () => void D({ type: 'aimDyn', deg: useF09.getState().runtime!.world.drum.aimDeg - 1 }), 200);
          btn('zero', t('f09.act.zero'), () => D({ type: 'zeroDyn' }));
        }
        btn('pull', d.pulling ? `■ ${t('f09.act.stopPull')}` : `▶ ${t('f09.act.startPull')}`, () => ctl?.togglePull() ?? D({ type: d.pulling ? 'stopPull' : 'startPull' }), 'btn primary');
        btn('read', `🔍 ${t('f09.act.readDyn')}`, () => ctl?.readDyn() ?? D({ type: 'readDyn', viewDeg: 0 }));
        eye('dyn01');
        break;
      case 'motor':
        motorBtns();
        brakeBtns();
        eye('motor01');
        break;
      case 'forceSensor': {
        const f = w.force;
        const ranges = w.params.force.ranges;
        btn('plug', t(f.connected ? 'f09.act.unplug' : 'f09.act.plug'), () => D({ type: 'connect', channel: 'force', on: !f.connected }));
        btn('zero', t('f09.act.zero'), () => D({ type: 'zeroForce' }));
        btn('range', t('f09.act.range', { n: ranges[(f.rangeIdx + 1) % ranges.length] }), () => D({ type: 'setForceRange', n: (f.rangeIdx + 1) % ranges.length }));
        hold('tiltUp', `▲ ${t('f09.act.tiltUp')}`, () => void D({ type: 'mountForce', angleDeg: useF09.getState().runtime!.world.force.angleDeg + 1 }), 200);
        hold('tiltDown', `▼ ${t('f09.act.tiltDown')}`, () => void D({ type: 'mountForce', angleDeg: useF09.getState().runtime!.world.force.angleDeg - 1 }), 200);
        btn('read', `🔍 ${t('f09.act.readForce')}`, () => ctl?.readSensor('readForce') ?? D({ type: 'readForce' }), 'btn primary');
        break;
      }
      case 'gate':
        btn('plug', t(w.gate.connected ? 'f09.act.unplug' : 'f09.act.plug'), () => D({ type: 'connect', channel: 'gate', on: !w.gate.connected }));
        btn('clip', t(w.gate.cableRouted ? 'f09.act.cableLoose' : 'f09.act.cableRoute'), () => D({ type: 'routeCable', on: !w.gate.cableRouted }), w.gate.cableRouted ? 'btn ghost' : 'btn primary');
        for (const n of [1, 5, 10]) btn(`time${n}`, `⏱ ${t('f09.act.timeTurns', { n })}`, () => D({ type: 'timeTurns', turns: n }), n === 5 ? 'btn primary' : 'btn');
        btn('half', `⏱ ${t('f09.act.timeHalf')}`, () => D({ type: 'timeTurns', turns: 0.5 }), 'btn ghost');
        break;
      case 'encoder': {
        const e = w.encoder;
        btn('plug', t(e.connected ? 'f09.act.unplug' : 'f09.act.plug'), () => D({ type: 'connect', channel: 'encoder', on: !e.connected }));
        btn('cal', t('f09.act.calibrate'), () => D({ type: 'calibrateEncoder' }));
        btn('omega', `🔍 ${t('f09.act.readOmega')}`, () => D({ type: 'readOmega' }), 'btn primary');
        btn('read', `🔍 ${t('f09.act.readEncoder')}`, () => D({ type: 'readEncoder' }), 'btn primary');
        lens('logger01', t('f09.act.graph'));
        break;
      }
      case 'logger': {
        const rates = w.params.rates;
        const next = rates[(rates.indexOf(w.logger.rateHz) + 1) % rates.length];
        btn('rate', t('f09.act.rate', { hz: next }), () => D({ type: 'setRate', hz: next }));
        for (const ch of ['encoder', 'force', 'gate'] as const) {
          const on = ch === 'encoder' ? w.encoder.connected : ch === 'force' ? w.force.connected : w.gate.connected;
          btn(`ch${ch}`, t(on ? 'f09.act.chOff' : 'f09.act.chOn', { ch: t(`f09.channel.${ch}`) }), () => D({ type: 'connect', channel: ch, on: !on }), 'btn ghost');
        }
        btn('readF', `🔍 ${t('f09.act.readForce')}`, () => D({ type: 'readForce' }), 'btn primary');
        btn('readT', `⏱ ${t('f09.act.timeTurns', { n: 5 })}`, () => D({ type: 'timeTurns', turns: 5 }), 'btn primary');
        btn('readW', `🔍 ${t('f09.act.readOmega')}`, () => D({ type: 'readOmega' }), 'btn primary');
        btn('readE', `🔍 ${t('f09.act.readEncoder')}`, () => D({ type: 'readEncoder' }), 'btn primary');
        lens('logger01', t('f09.act.graph'));
        eye('logger01');
        break;
      }
      case 'massRack':
        btn('close', `✅ ${t('f09.act.closeStation')}`, () => D({ type: 'closeStation' }), 'btn primary');
        break;
      case 'balance':
        btn('tare', t('f09.act.tare'), () => D({ type: 'tareBalance' }));
        btn('read', `🔍 ${t('f09.act.readBalance')}`, () => ctl?.readBalance() ?? D({ type: 'readBalance' }), 'btn primary');
        if (w.balance.on) btn('off', t('f09.act.offBalance'), () => D({ type: 'removeFromBalance' }));
        for (const m of ['orbit01', 'slide1', 'slide2'] as const) if (!w.balance.on) btn(`w${m}`, t('f09.act.weighOf', { m: t(`f09.obj.${m}`) }), () => D({ type: 'placeOnBalance', id: m }), 'btn ghost');
        eye('balance01');
        break;
    }
    btn('insp', `🔍 ${t('f09.act.inspect')}`, () => {
      D({ type: 'inspect', target: id });
      stage?.focusObject(id, 4);
    }, 'btn ghost');
  }
  if (w.safety.block) btn('ack', `⚠ ${t('f09.act.acknowledge')}`, () => D({ type: 'acknowledge' }), 'btn primary');
  if (id && o && ['hub', 'motor', 'guard', 'brake'].includes(o.kind) === false && spinningF9(w)) {
    // Con la mesa girando, el freno y el motor siempre a mano.
    btn('quickBrake', `🛑 ${t('f09.act.brake2')}`, () => D({ type: 'setBrake', level: 2 }), 'btn ghost');
  }

  const desc = id ? describeObjectF09(w, id) : '';
  return (
    <section id="actions" className={`actions${demo ? ' demo-locked' : ''}`} aria-label={t('f09.act.title')} aria-disabled={demo || undefined}>
      <div className="desc" id="action-desc" aria-live="polite">{id ? desc : t('f09.act.none')}</div>
      <div className="row">{buttons}</div>
    </section>
  );
}
