import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useF11 } from './store';
import { describeObjectF11 } from './describe';
import { HoldButton } from './ui';
import type { F11Command } from '../../simulation/f11-world/commands';
import type { FloatId } from '../../simulation/f11-world/types';
import { busyF11 } from '../../simulation/f11-world/world';
import { eyeTargetFor } from './LensF11';

const fmt = (v: number, d: number) => (Number.isFinite(v) ? v.toFixed(d).replace('.', ',') : '—');

/**
 * Panel de acciones de F11: alternativa accesible a cada gesto con el ratón. Ejecuta EXACTAMENTE los mismos comandos
 * del dominio que el controlador (la guía de a 1 cm, la sonda y el brazo del soporte con el paso elegido, el
 * dinamómetro de a 1°); no es un atajo científico: no hay «medir ρ» ni «calcular el empuje».
 */
export function ActionPanelF11() {
  const { t } = useTranslation();
  useF11((s) => s.version);
  const rt = useF11((s) => s.runtime);
  const stage = useF11((s) => s.stage);
  const sel = useF11((s) => s.selected);
  const held = useF11((s) => s.held);
  const dispatch = useF11((s) => s.dispatch);
  const toast = useF11((s) => s.toast);
  const demo = useF11((s) => !!s.demo);
  const setSettings = useF11((s) => s.setSettings);
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
      const k = `f11.cmd.${r.code}`;
      toast('warn', t(k) !== k ? t(k) : t('f11.cmd.FAILED'));
    }
    return r;
  };
  const D = (c: F11Command) => run(dispatch(c));
  const buttons: React.ReactNode[] = [];
  const add = (key: string, node: React.ReactNode) => buttons.push(<span key={key}>{node}</span>);
  const btn = (key: string, label: string, fn: () => unknown, cls = 'btn') => add(key, <button className={cls} onClick={() => run(fn() as never)}>{label}</button>);
  const hold = (key: string, label: string, fn: () => void, ms = 120) => add(key, <HoldButton onStart={() => startNudge(fn, ms)} onStop={stopNudge}>{label}</HoldButton>);
  const eye = (target = id) => btn('eye', `👁 ${t('f11.act.eyeLevel')}`, () => stage?.camera?.eyeLevel(eyeTargetFor(target)), 'btn ghost');
  const lens = (target: string, label: string) => btn(`lens${target}`, `📈 ${label}`, () => setSettings({ lens: target }), 'btn ghost');
  const busy = busyF11(w);
  const get = () => useF11.getState().runtime!.world;
  const pr = w.probe;
  const read = (key: string, label: string, viaCtl: (() => unknown) | undefined, c: F11Command) => btn(key, `🔍 ${label}`, () => viaCtl?.() ?? D(c), 'btn primary');
  const floatBtns = (fid: FloatId) => {
    const f = w.floats[fid];
    if (f.where === 'rack') {
      for (const x of [15, 30, 45]) btn(`rel${x}`, t('f11.act.release', { cm: x }), () => D({ type: 'releaseObject', id: fid, xCm: x }));
      btn('bal', t('f11.act.toBalance'), () => D({ type: 'placeOnBalance', item: fid }), 'btn ghost');
      if (fid === 'alu1') btn('hangB', t('f11.act.hangBlock'), () => D({ type: 'hangBlock' }), 'btn ghost');
      if (fid === 'bottle1') {
        const bs = w.params.ballasts;
        const next = bs[(bs.indexOf(f.ballastG) + 1) % bs.length];
        btn('ballast', t('f11.act.ballast', { g: next }), () => D({ type: 'setBallast', grams: next }));
      }
    } else if (f.where === 'tank') {
      if (f.tethered) btn('untie', t('f11.act.untie'), () => D({ type: 'untieThread', id: fid }), 'btn primary');
      if (fid !== 'alu1') read('draft', t('f11.act.readDraft'), ctl ? () => ctl.readDraft(fid) : undefined, { type: 'readDraft', id: fid, viewDeg: 0 });
      btn('recover', t('f11.act.recover'), () => D({ type: 'recoverObject', id: fid }), 'btn ghost');
      if (fid !== 'alu1') {
        if (ctl && sel === fid) ctl.lastFloat = fid;
        eye(fid);
      }
    } else if (f.where === 'balance') {
      read('bal', t('f11.act.readBalance'), ctl ? () => ctl.readBalance() : undefined, { type: 'readBalance' });
      btn('clear', t('f11.act.clearBalance'), () => D({ type: 'clearBalance' }), 'btn ghost');
    } else if (f.where === 'dyn') {
      read('dyn', t('f11.act.readDyn'), ctl ? () => ctl.readDyn() : undefined, { type: 'readDyn', viewDeg: 0 });
      btn('unhang', t('f11.act.unhangBlock'), () => D({ type: 'unhangBlock' }), 'btn ghost');
    } else btn('recover', t('f11.act.recover'), () => D({ type: 'recoverObject', id: fid }), 'btn primary');
  };
  const probeZ = () => {
    hold('pDown', `▼ ${t('f11.act.probeDown', { cm: fmt(pr.z, 1) })}`, () => void D({ type: 'setProbeZ', zCm: Math.max(0, get().probe.z - (ctl?.zStep ?? 1)) }), 200);
    hold('pUp', `▲ ${t('f11.act.probeUp')}`, () => void D({ type: 'setProbeZ', zCm: Math.min(44, get().probe.z + (ctl?.zStep ?? 1)) }), 200);
    if (ctl) for (const st of [0.1, 1, 5]) btn(`step${st}`, t('f11.act.step', { cm: fmt(st, 1) }), () => { ctl.zStep = st; useF11.getState().bump(); }, Math.abs(ctl.zStep - st) < 1e-9 ? 'btn primary' : 'btn ghost');
  };

  if (id && o) {
    switch (o.kind) {
      case 'tank':
      case 'scale':
        read('level', t('f11.act.readLevel'), ctl ? () => ctl.readLevel() : undefined, { type: 'readLevel', viewDeg: 0 });
        eye('scale01');
        break;
      case 'tap':
        btn('tap', t(w.valves.tap ? 'f11.act.tapOff' : 'f11.act.tapOn'), () => D({ type: 'setTap', on: !w.valves.tap }), w.valves.tap ? 'btn primary' : 'btn');
        break;
      case 'reservoir':
      case 'pump':
        btn('pump', t(w.valves.pump ? 'f11.act.pumpOff' : 'f11.act.pumpOn'), () => D({ type: 'setPump', on: !w.valves.pump }), w.valves.pump ? 'btn primary' : 'btn');
        btn('fillCyl', t('f11.act.fillCylinder'), () => D({ type: 'fillCylinder' }), 'btn ghost');
        break;
      case 'drain':
      case 'waste':
        btn('drain', t(w.valves.drain ? 'f11.act.drainOff' : 'f11.act.drainOn'), () => D({ type: 'setDrain', on: !w.valves.drain }), w.valves.drain ? 'btn primary' : 'btn');
        break;
      case 'agitator':
        btn('agit', t(w.valves.agitator ? 'f11.act.agitatorOff' : 'f11.act.agitatorOn'), () => D({ type: 'setAgitator', on: !w.valves.agitator }));
        break;
      case 'guide':
      case 'ruler':
        if (!pr.locked) {
          hold('gL', `⟵ ${t('f11.act.guideLeft', { cm: fmt(pr.gx, 1) })}`, () => void D({ type: 'setGuide', xCm: get().probe.gx - 1 }), 150);
          hold('gR', `⟶ ${t('f11.act.guideRight')}`, () => void D({ type: 'setGuide', xCm: get().probe.gx + 1 }), 150);
        }
        btn('lock', t(pr.locked ? 'f11.act.unlock' : 'f11.act.lock'), () => D({ type: 'lockGuide', on: !pr.locked }), pr.locked ? 'btn ghost' : 'btn primary');
        if (pr.mount === 'guide') probeZ();
        read('ruler', t('f11.act.readRuler'), ctl ? () => ctl.readRuler() : undefined, { type: 'readRuler', viewDeg: 0 });
        eye('ruler01');
        break;
      case 'probe':
      case 'holder':
        btn('mount', t(pr.mount === 'guide' ? 'f11.act.toHolder' : 'f11.act.toGuide'), () => D({ type: 'mountProbe', where: pr.mount === 'guide' ? 'holder' : 'guide' }), pr.mount === 'guide' ? 'btn ghost' : 'btn primary');
        if (pr.mount === 'guide') {
          probeZ();
          btn('purge', t('f11.act.purge'), () => D({ type: 'purgeProbe' }));
        } else btn('cal', t('f11.act.calibrate'), () => D({ type: 'calibrateProbe' }));
        read('probe', t('f11.act.readProbe'), ctl ? () => ctl.readProbe() : undefined, { type: 'readProbe' });
        break;
      case 'logger': {
        const rates = w.params.rates;
        const next = rates[(rates.indexOf(w.logger.rateHz) + 1) % rates.length];
        btn('port', t(pr.connected ? 'f11.act.disconnect' : 'f11.act.connect'), () => D({ type: 'connectProbe', on: !pr.connected }), pr.connected ? 'btn ghost' : 'btn primary');
        btn('rate', t('f11.act.rate', { hz: next }), () => D({ type: 'setRate', hz: next }));
        const nr = (pr.rangeIdx + 1) % w.params.probe.ranges.length;
        btn('range', t('f11.act.range', { n: w.params.probe.ranges[nr] }), () => D({ type: 'setRange', idx: nr }));
        btn('zero', t('f11.act.zero'), () => D({ type: 'zeroProbe' }));
        btn('series', t('f11.act.newSeries'), () => D({ type: 'newSeries' }));
        read('probe', t('f11.act.readProbe'), ctl ? () => ctl.readProbe() : undefined, { type: 'readProbe' });
        lens('logger01', t('f11.act.screen'));
        eye('logger01');
        break;
      }
      case 'floater':
      case 'bottle':
      case 'block':
        floatBtns(id as FloatId);
        break;
      case 'ballast': {
        const bs = w.params.ballasts;
        const next = bs[(bs.indexOf(w.floats.bottle1.ballastG) + 1) % bs.length];
        btn('ballast', t('f11.act.ballast', { g: next }), () => D({ type: 'setBallast', grams: next }));
        break;
      }
      case 'rack':
        btn('close', `✅ ${t('f11.act.closeStation')}`, () => D({ type: 'closeStation' }), 'btn primary');
        break;
      case 'balance':
        btn('tare', t('f11.act.tare'), () => D({ type: 'tareBalance' }));
        if (w.balance.on) btn('clear', t('f11.act.clearBalance'), () => D({ type: 'clearBalance' }), 'btn ghost');
        read('bal', t('f11.act.readBalance'), ctl ? () => ctl.readBalance() : undefined, { type: 'readBalance' });
        eye('balance01');
        break;
      case 'cylinder':
        if (w.cyl.where !== 'balance') btn('toBal', t('f11.act.toBalance'), () => D({ type: 'placeOnBalance', item: 'cyl' }), 'btn ghost');
        btn(w.cyl.vol > 0 ? 'empty' : 'fill', t(w.cyl.vol > 0 ? 'f11.act.emptyCylinder' : 'f11.act.fillCylinder'), () => D({ type: w.cyl.vol > 0 ? 'emptyCylinder' : 'fillCylinder' }));
        read('cyl', t('f11.act.readCylinder'), ctl ? () => ctl.readCylinder() : undefined, { type: 'readCylinder', viewDeg: 0 });
        eye('cyl01');
        break;
      case 'can':
        btn('prime', t('f11.act.prime'), () => D({ type: 'primeCan' }), 'btn primary');
        break;
      case 'catch': {
        const c = w.can;
        if (c.catchAt !== 'spout') btn('spout', t('f11.act.catchToSpout'), () => D({ type: 'placeCatch', at: 'spout' }), 'btn primary');
        if (c.catchAt !== 'balance') btn('toBal', t('f11.act.toBalance'), () => D({ type: 'placeOnBalance', item: 'catch' }), 'btn ghost');
        if (c.catchAt !== 'rack') btn('rack', t('f11.act.catchToRack'), () => D({ type: 'placeCatch', at: 'rack' }), 'btn ghost');
        if (c.catchVol > 0 && c.catchAt !== 'spout') btn('empty', t('f11.act.emptyCatch'), () => D({ type: 'emptyCatch' }), 'btn ghost');
        break;
      }
      case 'stand':
        hold('sDown', `▼ ${t('f11.act.standDown', { cm: fmt(w.stand.target, 1) })}`, () => void D({ type: 'setStand', cm: Math.max(0, get().stand.target - (ctl?.zStep ?? 1)) }), 200);
        hold('sUp', `▲ ${t('f11.act.standUp')}`, () => void D({ type: 'setStand', cm: Math.min(w.params.stand.maxCm, get().stand.target + (ctl?.zStep ?? 1)) }), 200);
        btn('zeroS', t('f11.act.zeroStand'), () => D({ type: 'zeroStand' }));
        read('stand', t('f11.act.readStand'), ctl ? () => ctl.readStand() : undefined, { type: 'readStand', viewDeg: 0 });
        eye('stand01');
        break;
      case 'dynamometer':
        btn('zero', t('f11.act.zero'), () => D({ type: 'zeroDyn' }));
        hold('aimR', `↗ ${t('f11.act.aimUp', { deg: fmt(w.dyn.aimDeg, 0) })}`, () => void D({ type: 'aimDyn', deg: get().dyn.aimDeg + 1 }), 200);
        hold('aimL', `↖ ${t('f11.act.aimDown')}`, () => void D({ type: 'aimDyn', deg: get().dyn.aimDeg - 1 }), 200);
        if (w.dyn.holding) btn('unhang', t('f11.act.unhangBlock'), () => D({ type: 'unhangBlock' }), 'btn ghost');
        else if (w.floats.alu1.where === 'rack') btn('hangB', t('f11.act.hangBlock'), () => D({ type: 'hangBlock' }));
        read('dyn', t('f11.act.readDyn'), ctl ? () => ctl.readDyn() : undefined, { type: 'readDyn', viewDeg: 0 });
        eye('dyn01');
        break;
      case 'towel':
        btn('mop', t('f11.act.mop'), () => D({ type: 'mopSpill' }), 'btn primary');
        break;
    }
    btn('insp', `🔍 ${t('f11.act.inspect')}`, () => {
      D({ type: 'inspect', target: id });
      stage?.focusObject(id, 4);
    }, 'btn ghost');
  }
  if (w.safety.block) btn('ack', `⚠ ${t('f11.act.acknowledge')}`, () => D({ type: 'acknowledge' }), 'btn primary');
  if (busy && (w.valves.tap || w.valves.pump || w.valves.drain)) {
    // Con un flujo abierto, cerrarlo siempre a mano.
    btn('stopFlow', `■ ${t('f11.act.stopFlow')}`, () => {
      if (get().valves.tap) D({ type: 'setTap', on: false });
      if (get().valves.pump) D({ type: 'setPump', on: false });
      if (get().valves.drain) D({ type: 'setDrain', on: false });
    }, 'btn ghost');
  }

  const desc = id ? describeObjectF11(w, id) : '';
  return (
    <section id="actions" className={`actions${demo ? ' demo-locked' : ''}`} aria-label={t('f11.act.title')} aria-disabled={demo || undefined}>
      <div className="desc" id="action-desc" aria-live="polite">{id ? desc : t('f11.act.none')}</div>
      <div className="row">{buttons}</div>
    </section>
  );
}
