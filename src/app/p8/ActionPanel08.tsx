import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useP08 } from './store';
import { describeObject, p08NameOf } from './describe';
import { HoldButton } from './ui';
import type { P08Command } from '../../simulation/organic-world/commands';
import { SPOTS, isPourable, supportPoint } from '../../engine/organic/layout';

/**
 * Panel de acciones de la Práctica 8 (§14.1, §15.1): alternativa accesible a cada gesto. Despacha EXACTAMENTE los
 * mismos comandos del dominio que el controlador (apoyos, vertidos, gotero, espátula, llave del embudo, equipos). No hay
 * «reaccionar», «separar» ni «secar»: el dominio decide (§5.2).
 */
export function ActionPanel08() {
  const { t } = useTranslation();
  useP08((s) => s.version);
  const rt = useP08((s) => s.runtime);
  const stage = useP08((s) => s.stage);
  const sel = useP08((s) => s.selected);
  const held = useP08((s) => s.held);
  const dispatch = useP08((s) => s.dispatch);
  const toast = useP08((s) => s.toast);
  const mode = useP08((s) => s.settings.mode);
  const demo = useP08((s) => !!s.demo);
  const nudge = useRef<number | null>(null);
  const [target, setTarget] = useState<Record<string, string>>({});
  if (!rt) return null;
  const w = rt.world;
  const ctl = stage?.controller;
  const id = held ?? sel;
  const o = id ? w.objects[id] : undefined;
  const kind = o?.kind;

  const startNudge = (fn: () => void, ms = 90) => {
    if (nudge.current) window.clearInterval(nudge.current);
    fn();
    nudge.current = window.setInterval(fn, ms);
  };
  const stopNudge = () => {
    if (nudge.current) window.clearInterval(nudge.current);
    nudge.current = null;
  };
  const run = (r: { ok: boolean; code?: string } | undefined) => {
    if (r && !r.ok && r.code) {
      const k = `p8.cmd.${r.code}`;
      toast('warn', t(k) !== k ? t(k) : t('p8.cmd.FAILED'));
    }
    return r;
  };
  const D = (c: P08Command) => run(dispatch(c));
  const buttons: React.ReactNode[] = [];
  const add = (key: string, node: React.ReactNode) => buttons.push(<span key={key}>{node}</span>);
  const name = (x: string) => p08NameOf(w, x);
  const eye = (x: string) => add(`eye-${x}`, <button className="btn ghost" onClick={() => stage?.camera?.eyeLevel(x)}>👁 {t('p8.act.eyeLevel')}</button>);
  /** Selector de destino recordado por tipo de acción. */
  const pick = (key: string, options: string[], labelKey: string) => {
    const value = target[key] && options.includes(target[key]) ? target[key] : options[0] ?? '';
    add(`sel-${key}`, (
      <label className="slider">
        <span>{t(labelKey)}</span>
        <select aria-label={t(labelKey)} value={value} onChange={(e) => setTarget({ ...target, [key]: e.target.value })}>
          {options.map((x) => <option key={x} value={x}>{x === 'bench' ? t('p8.where.bench') : name(x)}</option>)}
        </select>
      </label>
    ));
    return value;
  };
  const vessels = (pred: (vid: string) => boolean = () => true) => Object.keys(w.vessels).filter((v) => v !== id && w.objects[v] && pred(v));
  const receivers = vessels((v) => !v.startsWith('jar') && !v.startsWith('bt') && v !== 'washBottle' && v !== 'fracHead' && w.objects[v].kind !== 'filterPaper');
  const pourTargets = [...receivers, ...(w.objects.buchner ? ['buchner'] : [])];
  const wastes = ['wasteAq', 'wasteOrg', 'wasteAcid', 'wasteSolid'];

  if (id && o) {
    if (o.movable && !held) add('take', <button className="btn ghost" onClick={() => ctl?.beginDrag(id, true)}>{t('p8.act.takeKeyboard')}</button>);
    if (held) {
      add('drop', <button className="btn primary" onClick={() => ctl?.release()}>{t('p8.act.release')}</button>);
      add('up', <HoldButton onStart={() => startNudge(() => ctl?.nudgeHeight(0.5))} onStop={stopNudge}>▲ {t('p8.act.up')}</HoldButton>);
      add('down', <HoldButton onStart={() => startNudge(() => ctl?.nudgeHeight(-0.5))} onStop={stopNudge}>▼ {t('p8.act.down')}</HoldButton>);
      add('cancel', <button className="btn ghost" onClick={() => ctl?.cancel()}>{t('p8.act.cancel')}</button>);
    }
    const v = w.vessels[id];
    // ── Recipientes ──
    if (v) {
      if (v.capped !== undefined) add('cap', <button className="btn" aria-pressed={!v.capped} onClick={() => D({ type: 'setCap', vesselId: id, capped: !v.capped })}>{v.capped ? t('p8.act.uncap') : t('p8.act.capOn')}</button>);
      if (isPourable(w, id)) {
        const dst = pick('pour', pourTargets, 'p8.act.pourTarget');
        // Mientras se mantiene, la inclinación se reajusta al nivel que va quedando (igual que la mano en la escena).
        if (dst) {
          add('pour', <HoldButton onStart={() => startNudge(() => ctl?.pourDirect(id, dst, true), 200)} onStop={() => { stopNudge(); D({ type: 'stopPour', sourceId: id }); }}>🫗 {t('p8.act.pour')}</HoldButton>);
          add('pourSlow', <HoldButton onStart={() => startNudge(() => ctl?.pourDirect(id, dst, false), 200)} onStop={() => { stopNudge(); D({ type: 'stopPour', sourceId: id }); }}>{t('p8.act.pourSlow')}</HoldButton>);
        }
      }
      if (o.kind === 'cylinder') {
        eye(id);
        add('vol', <button className="btn" onClick={() => ctl?.readVolume(id)}>{t('p8.act.readVolume')}</button>);
      }
      if (held === id && o.kind !== 'sepFunnel' && o.kind !== 'roundFlask') add('swirl', <HoldButton onStart={() => ctl?.shakeDown()} onStop={() => ctl?.shakeUp()}>🔄 {t('p8.act.swirl')}</HoldButton>);
      if (o.movable && !['bottle', 'jar', 'washBottle'].includes(o.kind)) {
        const dst = pick('empty', [...receivers.filter((x) => !wastes.includes(x)), ...wastes, ...(w.objects.buchner ? ['buchner'] : [])], 'p8.act.emptyTarget');
        if (dst) add('empty', <button className="btn ghost" onClick={() => D({ type: 'dispose', vesselId: id, targetId: dst })}>{t('p8.act.emptyInto')}</button>);
      }
      if (o.movable && o.kind !== 'sepFunnel') {
        add('pan', o.support === 'pan'
          ? <button className="btn" onClick={() => run(ctl?.moveTo(id, 'bench'))}>{t('p8.act.offPan')}</button>
          : <button className="btn" onClick={() => run(ctl?.moveTo(id, 'pan'))}>⚖ {t('p8.act.toPan')}</button>);
      }
      for (const spot of SPOTS[o.kind] ?? []) {
        if (o.support !== spot && supportPoint(w, spot)) add(`spot-${spot}`, <button className="btn ghost" onClick={() => run(ctl?.moveTo(id, spot))}>{t(`p8.spot.${spot.replace(':', '_')}`)}</button>);
      }
      if (o.kind === 'roundFlask' && o.movable) add('sample', <button className="btn ghost" onClick={() => D({ type: 'takeSample', sourceId: id })}>🧪 {t('p8.act.takeSample')}</button>);
      if (['vial', 'filterPaper'].includes(o.kind)) add('sample', <button className="btn" onClick={() => D({ type: 'takeSample', sourceId: id })}>🧪 {t('p8.act.takeSample')}</button>);
    }
    switch (kind) {
      case 'balance': {
        const b = w.balance;
        add('power', <button className="btn" aria-pressed={b.powered} onClick={() => D({ type: 'powerBalance', on: !b.powered })}>⏻ {b.powered ? t('p8.act.powerOff') : t('p8.act.powerOn')}</button>);
        add('tare', <button className="btn" onClick={() => ctl?.tare()}>→0← {t('p8.act.tare')}</button>);
        add('readB', <button className={`btn ${b.powered && b.stable ? 'primary' : ''}`} onClick={() => ctl?.readBalance()}>{t('p8.act.read')}</button>);
        eye('balance01');
        break;
      }
      case 'dropper': {
        const into = pick('dip', vessels((x) => x !== 'washBottle'), 'p8.act.dipIn');
        if (into) add('dip', <button className="btn" onClick={() => run(ctl?.moveTo(id, into))}>{t('p8.act.putIn')}</button>);
        add('asp', <HoldButton onStart={() => D({ type: 'setDropper', dropperId: id, squeeze01: -1 })} onStop={() => D({ type: 'setDropper', dropperId: id, squeeze01: 0 })}>⬆ {t('p8.act.aspirate')}</HoldButton>);
        add('rel', <HoldButton onStart={() => D({ type: 'setDropper', dropperId: id, squeeze01: 1 })} onStop={() => D({ type: 'setDropper', dropperId: id, squeeze01: 0 })}>⬇ {t('p8.act.dispense')}</HoldButton>);
        add('clean', <button className="btn ghost" onClick={() => D({ type: 'cleanTool', toolId: id })}>🧽 {t('p8.act.clean')}</button>);
        add('out', <button className="btn ghost" onClick={() => run(ctl?.moveTo(id, 'bench'))}>{t('p8.act.toBench')}</button>);
        break;
      }
      case 'spatula': {
        const into = pick('spat', vessels((x) => x.startsWith('jar') || receivers.includes(x) || w.objects[x]?.kind === 'watchGlass'), 'p8.act.dipIn');
        if (into) add('dip', <button className="btn" onClick={() => run(ctl?.moveTo(id, into))}>{t('p8.act.putIn')}</button>);
        add('act', <button className="btn primary" onClick={() => ctl?.spatulaAction()}>{t('p8.act.spatula')}</button>);
        add('clean', <button className="btn ghost" onClick={() => D({ type: 'cleanTool', toolId: 'spatula' })}>🧽 {t('p8.act.clean')}</button>);
        add('out', <button className="btn ghost" onClick={() => run(ctl?.moveTo(id, 'bench'))}>{t('p8.act.toBench')}</button>);
        break;
      }
      case 'thermometer': {
        const into = pick('th', ['rf', 'bath01', 'ice01', ...receivers.filter((x) => x !== 'rf')].filter((x) => w.objects[x]), 'p8.act.dipIn');
        if (into) add('dip', <button className="btn" onClick={() => run(ctl?.moveTo(id, into))}>{t('p8.act.putIn')}</button>);
        add('readT', <button className="btn primary" onClick={() => ctl?.readThermometer()}>{t('p8.act.read')}</button>);
        add('out', <button className="btn ghost" onClick={() => run(ctl?.moveTo(id, 'bench'))}>{t('p8.act.toBench')}</button>);
        eye('th01');
        break;
      }
      case 'washBottle': {
        const dst = pick('wash', pourTargets, 'p8.act.washTarget');
        if (dst) {
          add('drop', <HoldButton onStart={() => startNudge(() => D({ type: 'squeezeWash', targetId: dst, ml: 0.5 }), 300)} onStop={stopNudge}>💧 {t('p8.act.drop')}</HoldButton>);
          add('jet', <HoldButton onStart={() => startNudge(() => D({ type: 'squeezeWash', targetId: dst, ml: 4 }), 300)} onStop={stopNudge}>{t('p8.act.jet')}</HoldButton>);
        }
        break;
      }
      case 'plate': {
        const pl = w.plate;
        add('power', <button className="btn" aria-pressed={pl.on} onClick={() => D({ type: 'setPlate', on: !pl.on, setpointC: pl.setpointC })}>⏻ {pl.on ? t('p8.act.powerOff') : t('p8.act.powerOn')}</button>);
        add('sp', (
          <label className="slider">
            <span>{t('p8.act.setpoint')}</span>
            <input aria-label={t('p8.act.setpoint')} type="range" min={20} max={100} step={5} value={pl.setpointC} onChange={(e) => D({ type: 'setPlate', on: pl.on, setpointC: Number(e.target.value) })} />
            <output>{Math.round(pl.setpointC)} °C</output>
          </label>
        ));
        add('stir', (
          <label className="slider">
            <span>{t('p8.act.stirLevel')}</span>
            <input aria-label={t('p8.act.stirLevel')} type="range" min={0} max={1} step={0.05} value={pl.stir01} onChange={(e) => D({ type: 'setMagneticStir', level01: Number(e.target.value) })} />
            <output>{Math.round(pl.stir01 * 100)} %</output>
          </label>
        ));
        eye('plate01');
        break;
      }
      case 'condenser': {
        add('water', <button className="btn" aria-pressed={w.reflux.waterOn} onClick={() => D({ type: 'setCondenserWater', on: !w.reflux.waterOn })}>🚰 {w.reflux.waterOn ? t('p8.act.waterOff') : t('p8.act.waterOn')}</button>);
        if (o.support !== 'rf') add('mount', <button className="btn primary" onClick={() => run(ctl?.moveTo(id, 'rf'))}>{t('p8.act.mountCondenser')}</button>);
        else add('unmount', <button className="btn ghost" onClick={() => run(ctl?.moveTo(id, 'bench'))}>{t('p8.act.unmountCondenser')}</button>);
        break;
      }
      case 'sepFunnel': {
        const f = w.vessels.sf;
        add('stopper', <button className="btn" aria-pressed={!!f.stoppered} onClick={() => D({ type: 'setStopper', on: !f.stoppered })}>{f.stoppered ? t('p8.act.unstopper') : t('p8.act.stopper')}</button>);
        add('shake', <HoldButton onStart={() => { if (o.support !== 'hand') run(dispatch({ type: 'setPose', id, pose: { ...o.pose }, support: 'hand' })); D({ type: 'shakeFunnel', on: true }); }} onStop={() => { D({ type: 'shakeFunnel', on: false }); run(ctl?.moveTo(id, 'ring01')); }}>🔄 {t('p8.act.shakeFunnel')}</HoldButton>);
        add('vent', <button className="btn" onClick={() => D({ type: 'vent' })}>💨 {t('p8.act.vent')}</button>);
        add('swirl', <HoldButton onStart={() => D({ type: 'setStir', vesselId: id, motion01: 0.5 })} onStop={() => D({ type: 'setStir', vesselId: id, motion01: 0 })}>{t('p8.act.swirl')}</HoldButton>);
        const rec = pick('valve', [...receivers.filter((x) => x !== 'sf')], 'p8.act.receiver');
        const open = (f.valve01 ?? 0) > 0.05;
        if (rec) {
          add('valve', <button className={`btn ${open ? 'primary' : ''}`} aria-pressed={open} onClick={() => D({ type: 'setValve', opening01: open ? 0 : 1, receiverId: open ? null : rec })}>{open ? t('p8.act.valveClose') : t('p8.act.valveOpen')}</button>);
          add('valveSlow', <button className="btn ghost" onClick={() => D({ type: 'setValve', opening01: open ? 0 : 0.25, receiverId: open ? null : rec })}>{t('p8.act.valveDrip')}</button>);
        }
        eye(id);
        break;
      }
      case 'buchner':
        add('seal', <button className="btn" aria-pressed={w.filtration.sealed} onClick={() => D({ type: 'sealBuchner', on: !w.filtration.sealed })}>{w.filtration.sealed ? t('p8.act.unseal') : t('p8.act.seal')}</button>);
        add('vac', <button className="btn" aria-pressed={w.filtration.vacuum} onClick={() => D({ type: 'setVacuum', on: !w.filtration.vacuum })}>{w.filtration.vacuum ? t('p8.act.vacuumOff') : t('p8.act.vacuumOn')}</button>);
        break;
      case 'vacuumPump':
        add('vac', <button className="btn" aria-pressed={w.filtration.vacuum} onClick={() => D({ type: 'setVacuum', on: !w.filtration.vacuum })}>{w.filtration.vacuum ? t('p8.act.vacuumOff') : t('p8.act.vacuumOn')}</button>);
        break;
      case 'oven':
        add('oven', <button className="btn" aria-pressed={w.oven.on} onClick={() => D({ type: 'setOven', on: !w.oven.on })}>⏻ {w.oven.on ? t('p8.act.powerOff') : t('p8.act.powerOn')}</button>);
        break;
      case 'fractionModule': {
        const fr = w.fractions;
        add('lo', (
          <label className="slider">
            <span>{t('p8.act.cutLo')}</span>
            <input aria-label={t('p8.act.cutLo')} type="number" min={40} max={260} step={1} value={fr.cutLoC} onChange={(e) => D({ type: 'setFractionCut', loC: Number(e.target.value), hiC: Math.max(fr.cutHiC, Number(e.target.value) + 1) })} />
          </label>
        ));
        add('hi', (
          <label className="slider">
            <span>{t('p8.act.cutHi')}</span>
            <input aria-label={t('p8.act.cutHi')} type="number" min={41} max={270} step={1} value={fr.cutHiC} onChange={(e) => D({ type: 'setFractionCut', loC: Math.min(fr.cutLoC, Number(e.target.value) - 1), hiC: Number(e.target.value) })} />
          </label>
        ));
        add('run', <button className="btn primary" onClick={() => D({ type: 'runFractions' })}>▶ {t('p8.act.runFractions')}</button>);
        eye('frac01');
        break;
      }
      case 'analyzer':
        add('pur', <button className="btn primary" onClick={() => D({ type: 'requestAnalysis', method: 'purity' })}>{t('p8.act.analyzePurity')}</button>);
        if (w.route !== 'ASA') add('den', <button className="btn" onClick={() => D({ type: 'requestAnalysis', method: 'density' })}>{t('p8.act.analyzeDensity')}</button>);
        eye('analyzer01');
        break;
      case 'mpApparatus':
        add('mp', <button className="btn primary" onClick={() => D({ type: 'requestAnalysis', method: 'mp' })}>{t('p8.act.analyzeMp')}</button>);
        eye('mp01');
        break;
      case 'burner':
        add('ign', <button className="btn danger" onClick={() => D({ type: 'setBurner', on: true })}>🔥 {t('p8.act.ignite')}</button>);
        break;
    }
    add('insp', <button className="btn ghost" onClick={() => { D({ type: 'inspect', target: id }); stage?.focusObject(id, 4); }}>🔍 {t('p8.act.inspect')}</button>);
  }

  const desc = id ? describeObject(w, id, mode) : '';
  return (
    <section id="actions" className={`actions${demo ? ' demo-locked' : ''}`} aria-label={t('p8.act.title')} aria-disabled={demo || undefined}>
      <div className="desc" id="action-desc" aria-live="polite">
        {id ? <><strong>{name(id)}</strong>{desc ? ` — ${desc}` : ''}</> : t('p8.act.none')}
      </div>
      <div className="row">{buttons}</div>
    </section>
  );
}
