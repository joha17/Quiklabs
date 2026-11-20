import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useF10 } from './store';
import { describeObjectF10 } from './describe';
import { HoldButton } from './ui';
import type { F10Command } from '../../simulation/f10-world/commands';
import type { TapeTarget } from '../../simulation/f10-world/commands';
import type { BeamPlace, SupportId } from '../../simulation/f10-world/types';
import { busyF10, tippingF10 } from '../../simulation/f10-world/world';
import { eyeTargetFor } from './LensF10';

const fmt = (v: number, d: number) => (Number.isFinite(v) ? v.toFixed(d).replace('.', ',') : '—');

/**
 * Panel de acciones de F10: alternativa accesible a cada gesto con el ratón. Ejecuta EXACTAMENTE los mismos comandos
 * del dominio que el controlador (los apoyos y la carga de a 1 cm, la viga sobre la cuña de a 2 mm, la manivela con el
 * paso elegido, el dinamómetro y el comparador de a 1°); no es un atajo científico: no hay «medir R» ni «calcular E».
 */
export function ActionPanelF10() {
  const { t } = useTranslation();
  useF10((s) => s.version);
  const rt = useF10((s) => s.runtime);
  const stage = useF10((s) => s.stage);
  const sel = useF10((s) => s.selected);
  const held = useF10((s) => s.held);
  const dispatch = useF10((s) => s.dispatch);
  const toast = useF10((s) => s.toast);
  const demo = useF10((s) => !!s.demo);
  const setSettings = useF10((s) => s.setSettings);
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
      const k = `f10.cmd.${r.code}`;
      toast('warn', t(k) !== k ? t(k) : t('f10.cmd.FAILED'));
    }
    return r;
  };
  const D = (c: F10Command) => run(dispatch(c));
  const buttons: React.ReactNode[] = [];
  const add = (key: string, node: React.ReactNode) => buttons.push(<span key={key}>{node}</span>);
  const btn = (key: string, label: string, fn: () => unknown, cls = 'btn') => add(key, <button className={cls} onClick={() => run(fn() as never)}>{label}</button>);
  const hold = (key: string, label: string, fn: () => void, ms = 120) => add(key, <HoldButton onStart={() => startNudge(fn, ms)} onStop={stopNudge}>{label}</HoldButton>);
  const eye = (target = id) => btn('eye', `👁 ${t('f10.act.eyeLevel')}`, () => stage?.camera?.eyeLevel(eyeTargetFor(target)), 'btn ghost');
  const lens = (target: string, label: string) => btn(`lens${target}`, `📈 ${label}`, () => setSettings({ lens: target }), 'btn ghost');
  const busy = busyF10(w);
  const tipping = tippingF10(w);
  const b = w.beam;
  const L = w.loads.load1;
  const pr = w.press;
  const get = () => useF10.getState().runtime!.world;
  const tape = (tg: TapeTarget) => btn(`tape${tg}`, `📏 ${t('f10.act.tapeOf', { m: t(`f10.tape.${tg}`) })}`, () => ctl?.readTape(tg) ?? D({ type: 'readTape', target: tg, viewDeg: 0 }));
  const beamTo = (where: BeamPlace, cls = 'btn') => btn(`beam${where}`, t(`f10.act.beamTo.${where}`), () => D({ type: 'placeBeam', where }), cls);
  const hookBtn = () => btn('hook', t(L.hookClosed ? 'f10.act.hookOpen' : 'f10.act.hookClose'), () => D({ type: 'closeHook', id: 'load1', on: !L.hookClosed }), L.hookClosed ? 'btn ghost' : 'btn primary');
  const shieldBtn = () => btn('shield', t(pr.shieldClosed ? 'f10.act.shieldOpen' : 'f10.act.shieldClose'), () => D({ type: 'setShield', closed: !pr.shieldClosed }), pr.shieldClosed ? 'btn ghost' : 'btn primary');
  const crankBtns = () => {
    const step = ctl?.crankStep ?? 0.02;
    hold('up', `▲ ${t('f10.act.crankUp', { mm: fmt(pr.target, 3) })}`, () => void D({ type: 'setCrank', mm: get().press.target + step }), 250);
    hold('down', `▼ ${t('f10.act.crankDown')}`, () => void D({ type: 'setCrank', mm: Math.max(0, get().press.target - step) }), 250);
    if (ctl) for (const st of [0.005, 0.02, 0.1]) btn(`step${st}`, t('f10.act.step', { mm: fmt(st, 3) }), () => { ctl.crankStep = st; useF10.getState().bump(); }, Math.abs(step - st) < 1e-9 ? 'btn primary' : 'btn ghost');
    btn('lock', t(pr.crankLocked ? 'f10.act.crankFree' : 'f10.act.crankLock'), () => D({ type: 'lockCrank', on: !pr.crankLocked }), 'btn ghost');
    if (w.params.quickRelease) btn('release', `⚠ ${t('f10.act.release')}`, () => D({ type: 'releaseCrank' }), 'btn ghost');
  };
  const pressRead = () => {
    btn('readF', `🔍 ${t('f10.act.readLoadCell')}`, () => ctl?.readPress('readLoadCell') ?? D({ type: 'readLoadCell' }), 'btn primary');
    btn('readG', `🔍 ${t('f10.act.readGauge')}`, () => ctl?.readPress('readGauge') ?? D({ type: 'readGauge' }), 'btn primary');
  };

  if (id && o) {
    switch (o.kind) {
      case 'rail':
        tape('supA');
        tape('supB');
        break;
      case 'support': {
        const sid: SupportId = id === 'supportA' ? 'A' : 'B';
        const sp = w.supports[sid];
        if (!sp.clamped && !tipping) {
          hold('right', `⟶ ${t('f10.act.supRight', { cm: fmt(sp.s, 1) })}`, () => void D({ type: 'setSupport', id: sid, sCm: get().supports[sid].s + 1 }), 150);
          hold('left', `⟵ ${t('f10.act.supLeft')}`, () => void D({ type: 'setSupport', id: sid, sCm: get().supports[sid].s - 1 }), 150);
        }
        btn('clamp', t(sp.clamped ? 'f10.act.unclamp' : 'f10.act.clamp'), () => D({ type: 'clampSupport', id: sid, on: !sp.clamped }), sp.clamped ? 'btn ghost' : 'btn primary');
        if (sp.loose) btn('knife', t('f10.act.knife'), () => D({ type: 'tightenKnife', id: sid }), 'btn primary');
        btn('cell', `🔍 ${t('f10.act.readCell')}`, () => ctl?.readCell(sid) ?? D({ type: 'readCell', id: sid }), 'btn primary');
        btn('zeroCells', t('f10.act.zeroCells'), () => D({ type: 'zeroCells' }));
        tape(sid === 'A' ? 'supA' : 'supB');
        eye(id);
        break;
      }
      case 'beam':
        if (b.tipped && !tipping) btn('reset', t('f10.act.resetBeam'), () => D({ type: 'resetBeam' }), 'btn primary');
        if (w.damaged) btn('repair', `🔧 ${t('f10.act.repair')}`, () => D({ type: 'repairBeam' }), 'btn primary');
        if (b.where === 'supports' && !b.tipped) {
          if (!b.seated) btn('seat', t('f10.act.seat'), () => D({ type: 'seatBeam' }), 'btn primary');
          btn('hand', t(b.hand ? 'f10.act.handOff' : 'f10.act.handOn'), () => D({ type: 'steadyBeam', on: !b.hand }), 'btn ghost');
        }
        if (b.where === 'wedge') {
          hold('wr', `⟶ ${t('f10.act.wedgeRight', { cm: fmt(b.wedgeS, 1) })}`, () => void D({ type: 'slideOnWedge', sCm: get().beam.wedgeS + 0.2 }), 150);
          hold('wl', `⟵ ${t('f10.act.wedgeLeft')}`, () => void D({ type: 'slideOnWedge', sCm: get().beam.wedgeS - 0.2 }), 150);
          tape('cg');
        }
        if (!b.tipped && L.where !== 'beam') for (const where of ['supports', 'wedge', 'gantry', 'rack'] as const) if (b.where !== where) beamTo(where, 'btn ghost');
        break;
      case 'load':
        hookBtn();
        if (L.where === 'rack') {
          if (b.where === 'supports' && !b.tipped) for (const s of [30, 60, 90]) btn(`hang${s}`, t('f10.act.hangAt', { cm: s }), () => D({ type: 'hangLoad', id: 'load1', sCm: s }));
          btn('dyn', t('f10.act.onDyn'), () => D({ type: 'hangOnDyn', id: 'load1' }), 'btn ghost');
        } else if (L.where === 'beam') {
          if (!tipping) {
            hold('right', `⟶ ${t('f10.act.loadRight', { cm: fmt(L.s, 1) })}`, () => void D({ type: 'moveLoad', id: 'load1', sCm: get().loads.load1.s + 1 }), 150);
            hold('left', `⟵ ${t('f10.act.loadLeft')}`, () => void D({ type: 'moveLoad', id: 'load1', sCm: get().loads.load1.s - 1 }), 150);
          }
          btn('unhang', t('f10.act.unhang'), () => D({ type: 'unhangLoad', id: 'load1' }), 'btn ghost');
          tape('load1');
        } else if (L.where === 'gantry') btn('offDyn', t('f10.act.offDyn'), () => D({ type: 'unhangDyn' }), 'btn primary');
        else btn('recover', t('f10.act.recover'), () => D({ type: 'recoverLoad', id: 'load1' }), 'btn primary');
        break;
      case 'gantry':
      case 'dynamometer':
        btn('zero', t('f10.act.zero'), () => D({ type: 'zeroDyn' }));
        hold('aimR', `↗ ${t('f10.act.aimUp', { deg: fmt(w.dyn.aimDeg, 0) })}`, () => void D({ type: 'aimDyn', deg: get().dyn.aimDeg + 1 }), 200);
        hold('aimL', `↖ ${t('f10.act.aimDown')}`, () => void D({ type: 'aimDyn', deg: get().dyn.aimDeg - 1 }), 200);
        if (!w.dyn.holding) {
          if (!b.tipped && L.where !== 'beam' && b.where !== 'gantry') btn('hangBeam', t('f10.act.hangBeam'), () => D({ type: 'hangOnDyn', id: 'beam' }));
          if (L.where === 'rack') btn('hangLoad', t('f10.act.onDyn'), () => D({ type: 'hangOnDyn', id: 'load1' }));
        } else btn('offDyn', t('f10.act.offDyn'), () => D({ type: 'unhangDyn' }), 'btn ghost');
        btn('read', `🔍 ${t('f10.act.readDyn')}`, () => ctl?.readDyn() ?? D({ type: 'readDyn', viewDeg: 0 }), 'btn primary');
        eye('dyn01');
        break;
      case 'wedge':
        if (b.where !== 'wedge' && !b.tipped && L.where !== 'beam') beamTo('wedge', 'btn primary');
        if (b.where === 'wedge') tape('cg');
        break;
      case 'level':
        btn('level', t('f10.act.level'), () => D({ type: 'levelBench' }), 'btn primary');
        eye('level01');
        break;
      case 'tape':
        for (const tg of ['supA', 'supB', 'load1', 'cg', 'L0'] as const) tape(tg);
        eye('tape01');
        break;
      case 'caliper':
        for (const sp of ['spec1', 'spec2']) btn(`cal${sp}`, `🔍 ${t('f10.act.caliperOf', { m: t(`f10.obj.${sp}`) })}`, () => ctl?.readCaliper(sp) ?? D({ type: 'readCaliper', id: sp }), 'btn primary');
        eye('caliper01');
        break;
      case 'rack':
        btn('close', `✅ ${t('f10.act.closeStation')}`, () => D({ type: 'closeStation' }), 'btn primary');
        break;
      case 'specimen':
        if (pr.specimen === id) btn('remove', t('f10.act.removeSpecimen'), () => D({ type: 'removeSpecimen' }), 'btn ghost');
        else if (!pr.specimen) btn('install', t('f10.act.installSpecimen'), () => D({ type: 'installSpecimen', id }), 'btn primary');
        btn('cal', `🔍 ${t('f10.act.caliper')}`, () => ctl?.readCaliper(id) ?? D({ type: 'readCaliper', id }));
        if (pr.specimen === id) tape('L0');
        break;
      case 'press':
      case 'crank':
        crankBtns();
        shieldBtn();
        pressRead();
        lens('logger01', t('f10.act.graph'));
        break;
      case 'grip':
        for (const g of ['bottom', 'top'] as const) {
          const on = g === 'top' ? pr.gripTop : pr.gripBottom;
          btn(`grip${g}`, t(on ? `f10.act.gripOpen.${g}` : `f10.act.gripClose.${g}`), () => D({ type: 'clampGrip', grip: g, on: !on }), on ? 'btn ghost' : 'btn primary');
        }
        btn('align', t('f10.act.align'), () => D({ type: 'alignGrips' }));
        break;
      case 'shield':
        shieldBtn();
        break;
      case 'loadCell': {
        const c = w.loadCell;
        const ranges = w.params.loadCell.ranges;
        btn('zero', t('f10.act.zero'), () => D({ type: 'zeroLoadCell' }));
        btn('range', t('f10.act.range', { n: ranges[(c.rangeIdx + 1) % ranges.length] / 1000 }), () => D({ type: 'setCellRange', n: (c.rangeIdx + 1) % ranges.length }));
        btn('read', `🔍 ${t('f10.act.readLoadCell')}`, () => ctl?.readPress('readLoadCell') ?? D({ type: 'readLoadCell' }), 'btn primary');
        break;
      }
      case 'gauge': {
        const g = w.gauge;
        for (const ax of ['axial', 'transverse', null] as const) if (g.mounted !== ax) btn(`mount${ax}`, t(`f10.act.mount.${ax ?? 'off'}`), () => D({ type: 'mountGauge', axis: ax }), ax === 'axial' ? 'btn primary' : 'btn ghost');
        if (g.mounted) {
          hold('tiltR', `↻ ${t('f10.act.tiltUp', { deg: fmt(g.angleDeg, 0) })}`, () => void D({ type: 'tiltGauge', deg: get().gauge.angleDeg + 1 }), 200);
          hold('tiltL', `↺ ${t('f10.act.tiltDown')}`, () => void D({ type: 'tiltGauge', deg: get().gauge.angleDeg - 1 }), 200);
        }
        btn('cal', t('f10.act.calibrate'), () => D({ type: 'calibrateGauge' }));
        btn('zero', t('f10.act.zero'), () => D({ type: 'zeroGauge' }));
        btn('clip', t(g.cableRouted ? 'f10.act.cableLoose' : 'f10.act.cableRoute'), () => D({ type: 'routeCable', on: !g.cableRouted }), g.cableRouted ? 'btn ghost' : 'btn primary');
        btn('read', `🔍 ${t('f10.act.readGauge')}`, () => ctl?.readPress('readGauge') ?? D({ type: 'readGauge' }), 'btn primary');
        eye('gauge01');
        break;
      }
      case 'logger': {
        const rates = w.params.rates;
        const next = rates[(rates.indexOf(w.logger.rateHz) + 1) % rates.length];
        btn('rate', t('f10.act.rate', { hz: next }), () => D({ type: 'setRate', hz: next }));
        for (const ch of ['cells', 'press', 'gauge'] as const) {
          const on = ch === 'cells' ? w.cells.connected : ch === 'press' ? w.loadCell.connected : w.gauge.connected;
          btn(`ch${ch}`, t(on ? 'f10.act.chOff' : 'f10.act.chOn', { ch: t(`f10.channel.${ch}`) }), () => D({ type: 'connect', channel: ch, on: !on }), 'btn ghost');
        }
        const rec = !!w.run && !w.run.done;
        btn('log', rec ? `■ ${t('f10.act.stopLog')}` : `⏺ ${t('f10.act.startLog')}`, () => D({ type: rec ? 'stopLog' : 'startLog' }), 'btn primary');
        btn('curve', `📈 ${t('f10.act.readCurve')}`, () => ctl?.readPress('readCurve') ?? D({ type: 'readCurve' }), 'btn primary');
        lens('logger01', t('f10.act.graph'));
        eye('logger01');
        break;
      }
    }
    btn('insp', `🔍 ${t('f10.act.inspect')}`, () => {
      D({ type: 'inspect', target: id });
      stage?.focusObject(id, 4);
    }, 'btn ghost');
  }
  if (w.safety.block) btn('ack', `⚠ ${t('f10.act.acknowledge')}`, () => D({ type: 'acknowledge' }), 'btn primary');
  if (busy && id && o && !['press', 'crank', 'logger'].includes(o.kind)) {
    // Con un ensayo grabando, detener el registro siempre a mano.
    btn('quickStop', `■ ${t('f10.act.stopLog')}`, () => D({ type: 'stopLog' }), 'btn ghost');
  }

  const desc = id ? describeObjectF10(w, id) : '';
  return (
    <section id="actions" className={`actions${demo ? ' demo-locked' : ''}`} aria-label={t('f10.act.title')} aria-disabled={demo || undefined}>
      <div className="desc" id="action-desc" aria-live="polite">{id ? desc : t('f10.act.none')}</div>
      <div className="row">{buttons}</div>
    </section>
  );
}
