import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useF101 } from './store';
import { describeObjectF101, f101NameOf } from './describe';
import { HoldButton } from './ui';
import type { F101Command } from '../../simulation/f101-world/commands';
import { HANGERS, PULLEYS } from '../../simulation/f101-world/world';
import { eyeTargetFor } from './LensF101';

const PARTS = ['metalCyl01', 'steelBall01', 'gaugeBlock01'];

/**
 * Panel de acciones de F101: alternativa accesible a cada gesto con el ratón. Ejecuta EXACTAMENTE los mismos comandos
 * del dominio que el controlador (acercar el cursor milímetro a milímetro, girar el tambor, mover una polea grado a
 * grado); no es un atajo científico: no hay «medir el diámetro» ni «equilibrar».
 */
export function ActionPanelF101() {
  const { t } = useTranslation();
  useF101((s) => s.version);
  const rt = useF101((s) => s.runtime);
  const stage = useF101((s) => s.stage);
  const sel = useF101((s) => s.selected);
  const held = useF101((s) => s.held);
  const dispatch = useF101((s) => s.dispatch);
  const toast = useF101((s) => s.toast);
  const demo = useF101((s) => !!s.demo);
  const nudge = useRef<number | null>(null);
  if (!rt) return null;
  const w = rt.world;
  const ctl = stage?.controller;
  const id = held ?? sel;
  const o = id ? w.objects[id] : undefined;

  const startNudge = (fn: () => void, ms = 90) => {
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
      const k = `f101.cmd.${r.code}`;
      toast('warn', t(k) !== k ? t(k) : t('f101.cmd.FAILED'));
    }
    return r;
  };
  const D = (c: F101Command) => run(dispatch(c));
  const buttons: React.ReactNode[] = [];
  const add = (key: string, node: React.ReactNode) => buttons.push(<span key={key}>{node}</span>);
  const btn = (key: string, label: string, fn: () => unknown, cls = 'btn') => add(key, <button className={cls} onClick={() => run(fn() as never)}>{label}</button>);
  const hold = (key: string, label: string, fn: () => void, ms = 90) => add(key, <HoldButton onStart={() => startNudge(fn, ms)} onStop={stopNudge}>{label}</HoldButton>);
  const eye = (target = id) => btn('eye', `👁 ${t('f101.act.eyeLevel')}`, () => stage?.camera?.eyeLevel(eyeTargetFor(target)), 'btn ghost');

  if (id && o) {
    switch (o.kind) {
      case 'metalCyl':
      case 'steelBall':
      case 'gaugeBlock': {
        const inside = o.support === 'gradCyl01';
        if (o.kind === 'metalCyl') {
          btn('calD', `📏 ${t('f101.act.toCaliperD')}`, () => ctl?.moveTo(id, 'caliper', { lying: false }));
          btn('calH', `📏 ${t('f101.act.toCaliperH')}`, () => ctl?.moveTo(id, 'caliper', { lying: true }));
        } else btn('cal', `📏 ${t('f101.act.toCaliper')}`, () => ctl?.moveTo(id, 'caliper'));
        if (o.kind !== 'metalCyl') btn('mic', `🔩 ${t('f101.act.toMicrometer')}`, () => ctl?.moveTo(id, 'micrometer'));
        btn('pan', `⚖ ${t('f101.act.toPan')}`, () => ctl?.moveTo(id, w.objects[id].support === 'pan' ? 'bench' : 'pan'));
        if (o.kind !== 'gaugeBlock') {
          if (inside) btn('out', t('f101.act.retrieve'), () => ctl?.moveTo(id, 'dish'));
          else {
            btn('lower', `🫙 ${t('f101.act.lowerInto')}`, () => ctl?.moveTo(id, 'cylinder', { heightCm: 0.5 }));
            btn('drop', t('f101.act.dropInto'), () => ctl?.moveTo(id, 'cylinder', { heightCm: 15 }), 'btn ghost');
          }
          if (w.parts[id]?.wetG > 0) btn('dry', `🧻 ${t('f101.act.dry')}`, () => D({ type: 'dryPart', partId: id }));
        }
        btn('ruler', t('f101.act.readRuler'), () => ctl?.readRuler(id), 'btn ghost');
        btn('back', t('f101.act.toBench'), () => ctl?.moveTo(id, 'tray'), 'btn ghost');
        break;
      }
      case 'caliper': {
        const c = w.caliper;
        hold('open', `⟷ ${t('f101.act.open')}`, () => D({ type: 'setCaliperSlide', targetMm: useF101.getState().runtime!.world.caliper.jawMm + 0.5 }));
        hold('close', `→← ${t('f101.act.close')}`, () => D({ type: 'setCaliperSlide', targetMm: useF101.getState().runtime!.world.caliper.jawMm - 0.1 }), 120);
        btn('rel', t('f101.act.releaseThumb'), () => D({ type: 'releaseCaliper' }));
        btn('lock', c.locked ? t('f101.act.unlock') : t('f101.act.lock'), () => D({ type: 'lockCaliper', on: !c.locked }));
        btn('read', `📏 ${t('f101.act.read')}`, () => ctl?.readCaliper(), 'btn primary');
        eye();
        if (c.part) btn('take', t('f101.act.takeOut'), () => ctl?.moveTo(c.part!.id, 'tray'), 'btn ghost');
        add('force', <span className="readout" aria-live="polite">{t('f101.act.force', { n: c.forceN.toFixed(1).replace('.', ',') })}</span>);
        break;
      }
      case 'micrometer': {
        const m = w.micrometer;
        hold('open', `↺ ${t('f101.act.thimbleOpen')}`, () => D({ type: 'turnMicrometer', deltaDeg: 72, via: 'thimble' }));
        hold('close', `↻ ${t('f101.act.thimbleClose')}`, () => D({ type: 'turnMicrometer', deltaDeg: -36, via: 'thimble' }), 120);
        hold('ratchet', `↻ ${t('f101.act.ratchet')}`, () => D({ type: 'turnMicrometer', deltaDeg: -18, via: 'ratchet' }), 120);
        btn('clean', `🧻 ${t('f101.act.cleanFaces')}`, () => D({ type: 'cleanFaces' }));
        btn('lock', m.locked ? t('f101.act.unlock') : t('f101.act.lock'), () => D({ type: 'lockMicrometer', on: !m.locked }));
        btn('read', `🔩 ${t('f101.act.read')}`, () => ctl?.readMicrometer(), 'btn primary');
        eye();
        if (m.part) btn('take', t('f101.act.takeOut'), () => ctl?.moveTo(m.part!.id, 'tray'), 'btn ghost');
        break;
      }
      case 'ruler':
        btn('read', t('f101.act.read'), () => ctl?.readRuler(), 'btn primary');
        eye();
        break;
      case 'balance': {
        const b = w.balance;
        btn('pow', b.powered ? t('f101.act.powerOff') : t('f101.act.powerOn'), () => D({ type: 'powerBalance', on: !b.powered }));
        btn('lvl', t('f101.act.level'), () => D({ type: 'levelBalance' }));
        btn('tare', t('f101.act.tare'), () => ctl?.tare());
        btn('read', `⚖ ${t('f101.act.read')}`, () => ctl?.readBalance(), 'btn primary');
        eye('balance01');
        break;
      }
      case 'dish':
        btn('pan', `⚖ ${t('f101.act.toPan')}`, () => ctl?.moveTo(id, w.objects[id].support === 'pan' ? 'bench' : 'pan'));
        break;
      case 'gradCyl':
        eye();
        btn('read', `🫙 ${t('f101.act.read')}`, () => ctl?.readVolume(), 'btn primary');
        btn('tap', t('f101.act.tapCyl'), () => D({ type: 'tapCylinder' }));
        if (w.gradCyl.cracked) btn('repl', t('f101.act.replace'), () => D({ type: 'replaceCylinder' }));
        if (w.water.benchMl > 0.02) btn('wipe', `🧻 ${t('f101.act.wipe')}`, () => D({ type: 'wipeBench' }));
        for (const p of w.gradCyl.parts) btn(`out-${p}`, t('f101.act.retrieveX', { o: f101NameOf(w, p) }), () => ctl?.moveTo(p, 'dish'), 'btn ghost');
        break;
      case 'forceTable': {
        const tb = w.table;
        btn('pin', tb.pinIn ? t('f101.act.pinOut') : t('f101.act.pinIn'), () => ctl?.togglePin(), 'btn primary');
        btn('lvl', t('f101.act.levelTable'), () => D({ type: 'levelTable' }));
        btn('tap', t('f101.act.tapTable'), () => D({ type: 'tapTable' }));
        for (const [k, dx, dy, lab] of [['l', -0.2, 0, '←'], ['r', 0.2, 0, '→'], ['u', 0, 0.2, '↑'], ['d', 0, -0.2, '↓']] as const)
          btn(`n${k}`, lab, () => D({ type: 'nudgeRing', dxCm: dx, dyCm: dy }), 'btn small');
        btn('rec', `📐 ${t('f101.act.record')}`, () => ctl?.recordEquilibrium(), 'btn primary');
        eye();
        break;
      }
      case 'pulley': {
        const p = w.table.pulleys[id];
        hold('ccw', '⟲ 1°', () => D({ type: 'setPulleyAngle', pulleyId: id, angleDeg: useF101.getState().runtime!.world.table.pulleys[id].angleDeg + 1 }), 160);
        hold('cw', '⟳ 1°', () => D({ type: 'setPulleyAngle', pulleyId: id, angleDeg: useF101.getState().runtime!.world.table.pulleys[id].angleDeg - 1 }), 160);
        add('ang', <span className="readout">{t('f101.act.angleApprox', { a: Math.round(p.angleDeg) })}</span>);
        btn('seat', p.seated ? t('f101.act.loosen') : t('f101.act.tighten'), () => D({ type: 'seatPulley', pulleyId: id, on: !p.seated }));
        btn('thr', p.threaded ? t('f101.act.unthread') : t('f101.act.thread'), () => D({ type: 'threadString', pulleyId: id, on: !p.threaded }));
        break;
      }
      case 'hanger':
        for (const p of PULLEYS) btn(`h-${p}`, t('f101.act.hangOn', { p: f101NameOf(w, p) }), () => ctl?.moveTo(id, p));
        btn('rack', t('f101.act.toRack'), () => ctl?.moveTo(id, 'rack'), 'btn ghost');
        break;
      case 'slotMass':
        for (const h of HANGERS) btn(`m-${h}`, t('f101.act.loadOn', { h: f101NameOf(w, h) }), () => ctl?.moveTo(id, h));
        btn('rack', t('f101.act.toRack'), () => ctl?.moveTo(id, 'rack'), 'btn ghost');
        break;
      case 'dynamometer': {
        const d = w.table.dyn;
        if (!d.onRim) {
          const free = [0, 45, 90, 135, 180, 225, 270, 315].find((a) => PULLEYS.every((pid) => Math.abs(((a - w.table.pulleys[pid].angleDeg + 540) % 360) - 180) >= 12)) ?? 0;
          btn('mount', t('f101.act.mount', { a: free }), () => D({ type: 'mountDynamometer', on: true, angleDeg: free }));
        } else {
          hold('tens+', `➕ ${t('f101.act.tension')}`, () => D({ type: 'setDynTension', mm: useF101.getState().runtime!.world.table.dyn.tensionMm + 1 }), 120);
          hold('tens-', `➖ ${t('f101.act.tension')}`, () => D({ type: 'setDynTension', mm: useF101.getState().runtime!.world.table.dyn.tensionMm - 1 }), 120);
          hold('ang+', '⟲ 1°', () => D({ type: 'setDynAngle', angleDeg: useF101.getState().runtime!.world.table.dyn.angleDeg + 1 }), 160);
          hold('ang-', '⟳ 1°', () => D({ type: 'setDynAngle', angleDeg: useF101.getState().runtime!.world.table.dyn.angleDeg - 1 }), 160);
          btn('align', t('f101.act.align'), () => D({ type: 'alignDynamometer', alignDeg: 0 }));
          btn('read', t('f101.act.read'), () => ctl?.readDynamometer(), 'btn primary');
          btn('unmount', t('f101.act.unmount'), () => D({ type: 'mountDynamometer', on: false, angleDeg: d.angleDeg }), 'btn ghost');
        }
        btn('zero', t('f101.act.zeroDyn'), () => D({ type: 'zeroDynamometer' }));
        eye();
        break;
      }
      case 'sensorBox': {
        const s = w.table.sensor;
        btn('conn', s.connected ? t('f101.act.disconnect') : t('f101.act.connect'), () => D({ type: 'connectSensor', on: !s.connected }));
        btn('range', t('f101.act.range', { r: s.rangeN === 2 ? 10 : 2 }), () => D({ type: 'setSensorRange', rangeN: s.rangeN === 2 ? 10 : 2 }));
        btn('rate', t('f101.act.rate', { hz: s.rateHz === 5 ? 50 : 5 }), () => D({ type: 'setSensorRate', hz: s.rateHz === 5 ? 50 : 5 }));
        btn('cal', t('f101.act.calibrate'), () => D({ type: 'calibrateSensor' }));
        btn('cap', s.capture ? `⏹ ${t('f101.act.stopCapture')}` : `⏺ ${t('f101.act.startCapture')}`, () => ctl?.toggleCapture(), 'btn primary');
        break;
      }
      case 'tissue':
        btn('clean', `🧻 ${t('f101.act.cleanFaces')}`, () => D({ type: 'cleanFaces' }));
        if (w.water.benchMl > 0.02) btn('wipe', `🧻 ${t('f101.act.wipe')}`, () => D({ type: 'wipeBench' }));
        for (const p of PARTS) if (w.parts[p]?.wetG > 0) btn(`dry-${p}`, t('f101.act.dryX', { o: f101NameOf(w, p) }), () => D({ type: 'dryPart', partId: p }));
        break;
      case 'level':
        btn('lvlT', t('f101.act.levelTable'), () => D({ type: 'levelTable' }));
        btn('lvlB', t('f101.act.level'), () => D({ type: 'levelBalance' }));
        break;
      case 'returnTray':
        btn('close', `✅ ${t('f101.act.closeStation')}`, () => D({ type: 'closeStation' }), 'btn primary');
        break;
    }
    btn('insp', `🔍 ${t('f101.act.inspect')}`, () => {
      D({ type: 'inspect', target: id });
      stage?.focusObject(id, 4);
    }, 'btn ghost');
  }
  if (w.safety.block) btn('ack', `⚠ ${t('f101.act.acknowledge')}`, () => D({ type: 'acknowledge' }), 'btn primary');

  const desc = id ? describeObjectF101(w, id) : '';
  return (
    <section id="actions" className={`actions${demo ? ' demo-locked' : ''}`} aria-label={t('f101.act.title')} aria-disabled={demo || undefined}>
      <div className="desc" id="action-desc" aria-live="polite">{id ? desc : t('f101.act.none')}</div>
      <div className="row">{buttons}</div>
    </section>
  );
}
