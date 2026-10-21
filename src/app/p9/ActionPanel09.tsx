import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useP09 } from './store';
import { describeObject, p09NameOf } from './describe';
import { HoldButton } from './ui';
import type { P09Command } from '../../simulation/cation-analysis-world/commands';
import { isPourable, spotsFor, supportPoint } from '../../engine/cations/layout';

/**
 * Panel de acciones de la Práctica 9: alternativa accesible a cada gesto. Despacha EXACTAMENTE los mismos comandos del
 * dominio que el controlador (apoyos, vertidos y decantación, gotas, pipeta, asa, campana, llama virtual, centrífuga,
 * turbidímetro y cámara espectral). No hay «precipitar», «separar» ni «identificar»: el dominio decide.
 */
export function ActionPanel09() {
  const { t } = useTranslation();
  useP09((s) => s.version);
  const rt = useP09((s) => s.runtime);
  const stage = useP09((s) => s.stage);
  const sel = useP09((s) => s.selected);
  const held = useP09((s) => s.held);
  const dispatch = useP09((s) => s.dispatch);
  const toast = useP09((s) => s.toast);
  const mode = useP09((s) => s.settings.mode);
  const demo = useP09((s) => !!s.demo);
  const nudge = useRef<number | null>(null);
  const [target, setTarget] = useState<Record<string, string>>({});
  const [labelText, setLabelText] = useState('');
  const [drops, setDrops] = useState(1);
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
      const k = `p9.cmd.${r.code}`;
      toast('warn', t(k) !== k ? t(k) : t('p9.cmd.FAILED'));
    }
    return r;
  };
  const D = (c: P09Command) => run(dispatch(c));
  const buttons: React.ReactNode[] = [];
  const add = (key: string, node: React.ReactNode) => buttons.push(<span key={key}>{node}</span>);
  const name = (x: string) => p09NameOf(w, x);
  const eye = (x: string) => add(`eye-${x}`, <button className="btn ghost" onClick={() => stage?.camera?.eyeLevel(x)}>👁 {t('p9.act.eyeLevel')}</button>);
  /** Selector de destino recordado por tipo de acción. */
  const pick = (key: string, options: string[], labelKey: string) => {
    const value = target[key] && options.includes(target[key]) ? target[key] : options[0] ?? '';
    add(`sel-${key}`, (
      <label className="slider">
        <span>{t(labelKey)}</span>
        <select aria-label={t(labelKey)} value={value} onChange={(e) => setTarget({ ...target, [key]: e.target.value })}>
          {options.map((x) => <option key={x} value={x}>{name(x)}</option>)}
        </select>
      </label>
    ));
    return value;
  };
  const vessels = (pred: (vid: string) => boolean = () => true) => Object.keys(w.vessels).filter((v) => v !== id && w.objects[v] && pred(v));
  const tubes = vessels((v) => w.vessels[v].shape === 'tube');
  const receivers = vessels((v) => !v.startsWith('db') && !v.startsWith('ctl') && v !== 'smp1' && v !== 'washBottle' && v !== 'clean01');
  const wastes = ['wasteLiq', 'wasteSol'];
  const light = (pct: 100 | 45 | 20) => D({ type: 'setObservationLight', pct, scope: 'local' });

  if (id && o) {
    if (o.movable && !held) add('take', <button className="btn ghost" onClick={() => ctl?.beginDrag(id, true)}>{t('p9.act.takeKeyboard')}</button>);
    if (held) {
      add('drop', <button className="btn primary" onClick={() => ctl?.release()}>{t('p9.act.release')}</button>);
      add('up', <HoldButton onStart={() => startNudge(() => ctl?.nudgeHeight(0.5))} onStop={stopNudge}>▲ {t('p9.act.up')}</HoldButton>);
      add('down', <HoldButton onStart={() => startNudge(() => ctl?.nudgeHeight(-0.5))} onStop={stopNudge}>▼ {t('p9.act.down')}</HoldButton>);
      add('cancel', <button className="btn ghost" onClick={() => ctl?.cancel()}>{t('p9.act.cancel')}</button>);
    }
    const v = w.vessels[id];
    // ── Recipientes ──
    if (v) {
      if (v.capped !== undefined) add('cap', <button className="btn" aria-pressed={!v.capped} onClick={() => D({ type: 'setCap', vesselId: id, capped: !v.capped })}>{v.capped ? t('p9.act.uncap') : t('p9.act.capOn')}</button>);
      if (v.shape === 'tube') {
        add('label', (
          <label className="slider">
            <span>{t('p9.act.label')}</span>
            <input aria-label={t('p9.act.label')} type="text" maxLength={24} value={labelText} placeholder={v.label ?? ''} onChange={(e) => setLabelText(e.target.value)} />
            <button className="btn small" disabled={!labelText.trim()} onClick={() => { D({ type: 'setLabel', vesselId: id, label: labelText.trim() }); setLabelText(''); }}>{t('p9.act.writeLabel')}</button>
          </label>
        ));
        add('observe', <button className="btn" onClick={() => D({ type: 'observeTube', vesselId: id })}>👁 {t('p9.act.observeTube')}</button>);
        eye(id);
      }
      if (isPourable(w, id)) {
        const dst = pick('pour', [...receivers.filter((x) => !wastes.includes(x)), ...wastes], 'p9.act.pourTarget');
        // Mientras se mantiene, la inclinación se reajusta al nivel que va quedando (igual que la mano en la escena).
        if (dst) {
          add('decant', <HoldButton onStart={() => startNudge(() => ctl?.pourDirect(id, dst, false), 200)} onStop={() => { stopNudge(); D({ type: 'stopPour', sourceId: id }); }}>🫗 {t('p9.act.decant')}</HoldButton>);
          add('pour', <HoldButton onStart={() => startNudge(() => ctl?.pourDirect(id, dst, true), 200)} onStop={() => { stopNudge(); D({ type: 'stopPour', sourceId: id }); }}>{t('p9.act.pourFast')}</HoldButton>);
        }
      }
      if (o.kind === 'cylinder') {
        eye(id);
        add('vol', <button className="btn" onClick={() => ctl?.readVolume(id)}>{t('p9.act.readVolume')}</button>);
      }
      if (held === id) add('mix', <HoldButton onStart={() => ctl?.shakeDown()} onStop={() => ctl?.shakeUp()}>🔄 {t('p9.act.mix')}</HoldButton>);
      if (o.kind === 'dropperBottle') {
        const dst = pick('drops', tubes, 'p9.act.dropsInto');
        add('n', (
          <label className="slider">
            <span>{t('p9.act.dropsN')}</span>
            <input aria-label={t('p9.act.dropsN')} type="number" min={1} max={20} step={1} value={drops} onChange={(e) => setDrops(Math.max(1, Math.min(20, Math.round(Number(e.target.value) || 1))))} />
          </label>
        ));
        if (dst) add('drop', <button className="btn primary" onClick={() => D({ type: 'squeezeDropper', sourceId: id, targetId: dst, drops })}>💧 {t('p9.act.addDrops', { n: drops })}</button>);
      }
      if (o.movable && !['bottle', 'dropperBottle', 'washBottle'].includes(o.kind)) {
        const dst = pick('empty', wastes, 'p9.act.emptyTarget');
        if (dst) add('empty', <button className="btn ghost" onClick={() => D({ type: 'dispose', vesselId: id, targetId: dst })}>{t('p9.act.emptyInto')}</button>);
      }
      if (o.movable) {
        add('pan', o.support === 'pan'
          ? <button className="btn" onClick={() => run(ctl?.moveTo(id, 'bench'))}>{t('p9.act.offPan')}</button>
          : <button className="btn" onClick={() => run(ctl?.moveTo(id, 'pan'))}>⚖ {t('p9.act.toPan')}</button>);
      }
      if (o.kind === 'tube') {
        const free = (sp: string) => !Object.values(w.objects).some((x) => x.id !== id && x.support === sp);
        const rack = spotsFor('tube').filter((s) => s.startsWith('rack:') && free(s));
        const rotor = spotsFor('tube').filter((s) => s.startsWith('cf:') && free(s));
        if (!o.support.startsWith('rack:') && rack.length) add('toRack', <button className="btn ghost" onClick={() => run(ctl?.moveTo(id, rack[0]))}>{t('p9.act.toRack')}</button>);
        const slot = pick('rotor', rotor, 'p9.act.rotorSlot');
        if (slot && !o.support.startsWith('cf:')) add('toRotor', <button className="btn ghost" onClick={() => run(ctl?.moveTo(id, slot))}>{t('p9.act.toRotor')}</button>);
        if (o.support !== 'turb01' && free('turb01')) add('toTurb', <button className="btn ghost" onClick={() => run(ctl?.moveTo(id, 'turb01'))}>{t('p9.act.toTurb')}</button>);
      } else {
        for (const spot of spotsFor(o.kind)) {
          if (spot === 'pan' || o.support === spot || !supportPoint(w, spot)) continue;
          add(`spot-${spot}`, <button className="btn ghost" onClick={() => run(ctl?.moveTo(id, spot))}>{t(`p9.spot.${spot}`)}</button>);
        }
      }
      if (o.kind === 'watchGlass' || o.kind === 'refractoryCup') add('cleanS', <button className="btn ghost" onClick={() => D({ type: 'cleanSupport', supportId: id as 'wgFlame' | 'cupFlame' })}>🧽 {t('p9.act.cleanSupport')}</button>);
    }
    switch (kind) {
      case 'balance': {
        const b = w.balance;
        add('power', <button className="btn" aria-pressed={b.powered} onClick={() => D({ type: 'powerBalance', on: !b.powered })}>⏻ {b.powered ? t('p9.act.powerOff') : t('p9.act.powerOn')}</button>);
        add('tare', <button className="btn" onClick={() => D({ type: 'tare' })}>→0← {t('p9.act.tare')}</button>);
        add('readB', <button className={`btn ${b.powered && b.stable ? 'primary' : ''}`} onClick={() => ctl?.readBalance()}>{t('p9.act.read')}</button>);
        eye('balance01');
        break;
      }
      case 'pipette': {
        const into = pick('pip', vessels((x) => receivers.includes(x) || x.startsWith('ctl') || x === 'smp1' || x.startsWith('db')), 'p9.act.dipIn');
        if (into) add('dip', <button className="btn" onClick={() => run(ctl?.moveTo(id, into))}>{t('p9.act.putIn')}</button>);
        add('asp', <HoldButton onStart={() => D({ type: 'setPipette', squeeze01: -1 })} onStop={() => D({ type: 'setPipette', squeeze01: 0 })}>⬆ {t('p9.act.aspirate')}</HoldButton>);
        add('rel', <HoldButton onStart={() => D({ type: 'setPipette', squeeze01: 1 })} onStop={() => D({ type: 'setPipette', squeeze01: 0 })}>⬇ {t('p9.act.dispense')}</HoldButton>);
        add('out', <button className="btn ghost" onClick={() => run(ctl?.moveTo(id, 'bench'))}>{t('p9.act.toBench')}</button>);
        break;
      }
      case 'loop': {
        const into = pick('loop', vessels((x) => x.startsWith('ctl') || x === 'smp1' || w.vessels[x].shape === 'tube'), 'p9.act.dipIn');
        if (into) add('dip', <button className="btn" onClick={() => run(ctl?.moveTo(id, into))}>{t('p9.act.dipLoop')}</button>);
        if (o.support !== 'flame') add('flame', <button className="btn primary" onClick={() => run(ctl?.moveTo(id, 'flame'))}>🔥 {t('p9.act.loopToFlame')}</button>);
        if (o.support !== 'clean01') add('clean', <button className="btn ghost" onClick={() => run(ctl?.moveTo(id, 'clean01'))}>{t('p9.act.loopToClean')}</button>);
        else add('cleanNow', <button className="btn" onClick={() => D({ type: 'cleanSupport', supportId: 'loop01' })}>🧽 {t('p9.act.cleanLoop')}</button>);
        add('out', <button className="btn ghost" onClick={() => run(ctl?.moveTo(id, 'bench'))}>{t('p9.act.toBench')}</button>);
        break;
      }
      case 'washBottle': {
        const dst = pick('wash', receivers, 'p9.act.washTarget');
        if (dst) {
          add('drop', <HoldButton onStart={() => startNudge(() => D({ type: 'squeezeWash', targetId: dst, ml: 0.5 }), 300)} onStop={stopNudge}>💧 {t('p9.act.drop')}</HoldButton>);
          add('jet', <HoldButton onStart={() => startNudge(() => D({ type: 'squeezeWash', targetId: dst, ml: 2 }), 300)} onStop={stopNudge}>{t('p9.act.jet')}</HoldButton>);
        }
        break;
      }
      case 'hood':
      case 'emitter': {
        const hd = w.hood;
        add('fan', <button className="btn" aria-pressed={hd.fanOn} onClick={() => D({ type: 'setHoodFan', on: !hd.fanOn })}>🌀 {hd.fanOn ? t('p9.act.fanOff') : t('p9.act.fanOn')}</button>);
        add('sash', (
          <label className="slider">
            <span>{t('p9.act.sash')}</span>
            <input aria-label={t('p9.act.sash')} type="range" min={0} max={70} step={5} value={hd.sashCm} onChange={(e) => D({ type: 'setSash', heightCm: Number(e.target.value) })} />
            <output>{Math.round(hd.sashCm)} cm</output>
          </label>
        ));
        add('light', (
          <fieldset className="seg" aria-label={t('p9.act.localLight')}>
            <legend>{t('p9.act.localLight')}</legend>
            {([100, 45, 20] as const).map((p) => <button key={p} className="btn small" aria-pressed={hd.lightPct === p} onClick={() => light(p)}>{p} %</button>)}
          </fieldset>
        ));
        add('ign', w.flame.ignited
          ? <button className="btn" onClick={() => D({ type: 'setIgnition', on: false })}>⏻ {t('p9.act.extinguish')}</button>
          : <button className="btn danger" onClick={() => D({ type: 'setIgnition', on: true })}>🔥 {t('p9.act.ignite')}</button>);
        add('obs', <button className="btn primary" onClick={() => ctl?.observeFlame('whole')}>👁 {t('p9.act.observeFlame')}</button>);
        add('obsCore', <button className="btn ghost" onClick={() => ctl?.observeFlame('core')}>{t('p9.act.observeCore')}</button>);
        eye('emitter01');
        break;
      }
      case 'spectroCam': {
        const g = ctl?.gain ?? 1;
        add('gain', (
          <fieldset className="seg" aria-label={t('p9.act.gain')}>
            <legend>{t('p9.act.gain')}</legend>
            {([1, 4, 16] as const).map((x) => <button key={x} className="btn small" aria-pressed={g === x} onClick={() => { if (ctl) ctl.gain = x; useP09.getState().bump(); }}>×{x}</button>)}
          </fieldset>
        ));
        add('spec', <button className="btn primary" onClick={() => ctl?.readSpectrum()}>📈 {t('p9.act.readSpectrum')}</button>);
        break;
      }
      case 'centrifuge': {
        const c = w.centrifuge;
        add('lid', <button className="btn" aria-pressed={c.lidClosed} onClick={() => D({ type: 'setLid', closed: !c.lidClosed })}>{c.lidClosed ? t('p9.act.lidOpen') : t('p9.act.lidClose')}</button>);
        add('secs', (
          <label className="slider">
            <span>{t('p9.act.spinTime')}</span>
            <input aria-label={t('p9.act.spinTime')} type="range" min={10} max={180} step={10} defaultValue={ctl?.spinSeconds ?? 60} onChange={(e) => { if (ctl) ctl.spinSeconds = Number(e.target.value); useP09.getState().bump(); }} />
            <output>{ctl?.spinSeconds ?? 60} s</output>
          </label>
        ));
        add('spin', <button className="btn primary" onClick={() => D({ type: 'spin', seconds: ctl?.spinSeconds ?? 60 })}>▶ {t('p9.act.spin')}</button>);
        eye('cf01');
        break;
      }
      case 'turbidimeter':
        add('turb', <button className="btn primary" onClick={() => D({ type: 'readTurbidity' })}>{t('p9.act.readTurbidity')}</button>);
        eye('turb01');
        break;
    }
    add('insp', <button className="btn ghost" onClick={() => { D({ type: 'inspect', target: id }); stage?.focusObject(id, 4); }}>🔍 {t('p9.act.inspect')}</button>);
  }

  const desc = id ? describeObject(w, id, mode) : '';
  return (
    <section id="actions" className={`actions${demo ? ' demo-locked' : ''}`} aria-label={t('p9.act.title')} aria-disabled={demo || undefined}>
      <div className="desc" id="action-desc" aria-live="polite">
        {id ? <><strong>{name(id)}</strong>{desc ? ` — ${desc}` : ''}</> : t('p9.act.none')}
      </div>
      <div className="row">{buttons}</div>
    </section>
  );
}
