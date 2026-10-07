import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useP5 } from './store';
import { describeObject, p5NameOf } from './describe';
import { HoldButton } from './ui';
import { valveWords } from '../p3/describe';
import type { ValveId } from '../../simulation/flame-world/commands';
import type { ScoopAmount } from '../../engine/stoich/controller';
import { tubeTempC } from '../../simulation/stoich-world/world';

/** Control continuo de una válvula del mechero (posición física en palabras; % salvo en evaluación). */
function ValveControl5({ valve, label }: { valve: ValveId; label: string }) {
  const { t } = useTranslation();
  const rt = useP5((s) => s.runtime);
  const stage = useP5((s) => s.stage);
  const mode = useP5((s) => s.settings.mode);
  if (!rt) return null;
  const b = rt.world.gas.burner;
  const v = valve === 'TABLE' ? b.tableGasValve : valve === 'NEEDLE' ? b.needleGasValve : b.airCollar;
  const set = (x: number) => {
    stage?.controller.setValve(valve, x);
    useP5.getState().bump();
  };
  const id = `p5valve-${valve}`;
  return (
    <span className="slider">
      <label htmlFor={id}>{label}</label>
      <HoldButton label={t('p3.act.valveLess', { v: label })} onStart={() => set(v - 0.02)} onStop={() => undefined}>−</HoldButton>
      <input id={id} type="range" min={0} max={1} step={0.01} value={v} aria-valuetext={valveWords(v)} onChange={(e) => set(Number(e.target.value))} />
      <HoldButton label={t('p3.act.valveMore', { v: label })} onStart={() => set(v + 0.02)} onStop={() => undefined}>+</HoldButton>
      <span className="readout">{mode === 'EVALUATION' ? valveWords(v) : `${Math.round(v * 100)} %`}</span>
      <button className="btn small ghost" onClick={() => set(0)}>{t('p3.act.close')}</button>
    </span>
  );
}

const YAWS = [0, 90, 180, 270];

export function ActionPanel5() {
  const { t } = useTranslation();
  useP5((s) => s.version);
  const rt = useP5((s) => s.runtime);
  const stage = useP5((s) => s.stage);
  const sel = useP5((s) => s.selected);
  const held = useP5((s) => s.held);
  const dispatch = useP5((s) => s.dispatch);
  const toast = useP5((s) => s.toast);
  const mode = useP5((s) => s.settings.mode);
  const demo = useP5((s) => !!s.demo);
  const irReading = useP5((s) => s.irReading);
  const nudge = useRef<number | null>(null);
  if (!rt) return null;
  const w = rt.world;
  const ctl = stage?.controller;
  const id = held ?? sel;
  const o = id ? w.objects[id] : undefined;
  const g = id ? w.gas.objects[id] : undefined;
  const kind = id === 'hose' ? 'hose' : o?.kind ?? g?.kind;

  const startNudge = (fn: () => void) => {
    if (nudge.current) window.clearInterval(nudge.current);
    fn();
    nudge.current = window.setInterval(fn, 90);
  };
  const stopNudge = () => {
    if (nudge.current) window.clearInterval(nudge.current);
    nudge.current = null;
  };
  const run = (r: { ok: boolean; code?: string } | undefined) => {
    if (r && !r.ok && r.code) {
      const k = `p5.cmd.${r.code}`;
      toast('warn', t(k) !== k ? t(k) : t('p4.cmd.FAILED'));
    }
  };
  const inspect = (target: string) => {
    dispatch({ type: 'inspect', target });
    stage?.focusObject(target, 4);
  };
  const buttons: React.ReactNode[] = [];
  const add = (key: string, node: React.ReactNode) => buttons.push(<span key={key}>{node}</span>);
  const tube = w.objects.tube;
  const hot = tubeTempC(w.tube) > 55;
  const amountSel = (
    <span className="slider">
      <label htmlFor="p5amount">{t('p5.act.amount')}</label>
      <select id="p5amount" value={ctl?.scoopAmount ?? 'small'} onChange={(e) => { if (ctl) ctl.scoopAmount = e.target.value as ScoopAmount; useP5.getState().bump(); }}>
        {(['tip', 'small', 'level'] as const).map((a) => <option key={a} value={a}>{t(`p5.amount.${a}`)}</option>)}
      </select>
    </span>
  );

  if (id) {
    if (held) {
      add('rel', <button className="btn primary" onClick={() => ctl?.release()}>{t('act.release')}</button>);
      if (kind !== 'burner') {
        add('up', <HoldButton onStart={() => startNudge(() => ctl?.nudgeHeight(0.5))} onStop={stopNudge}>▲ {t('p3.act.raise')}</HoldButton>);
        add('down', <HoldButton onStart={() => startNudge(() => ctl?.nudgeHeight(-0.5))} onStop={stopNudge}>▼ {t('p3.act.lower')}</HoldButton>);
      }
      add('esc', <button className="btn ghost" onClick={() => ctl?.cancel()}>{t('p3.act.cancel')}</button>);
    } else if ((o?.movable || g?.movable) && !(id === 'tube' && tube.support === 'tongs')) {
      add('grab', <button className="btn" onClick={() => { if (ctl?.beginDrag(id, true)) toast('info', t('p3.hint.keyboardHold')); document.querySelector<HTMLElement>('.canvas-host')?.focus(); }}>{t('act.grabKeyboard')}</button>);
    }
    switch (kind) {
      case 'balance': {
        const b = w.balance;
        add('r0', (
          <span className="slider">
            <label htmlFor="p5r0">{t('p5.act.r100')}</label>
            <select id="p5r0" value={b.riders[0]} onChange={(e) => dispatch({ type: 'setRider', beam: 0, valueG: Number(e.target.value) })}>
              {[0, 100, 200, 300, 400, 500].map((v) => <option key={v} value={v}>{v} g</option>)}
            </select>
          </span>
        ));
        add('r1', (
          <span className="slider">
            <label htmlFor="p5r1">{t('p5.act.r10')}</label>
            <select id="p5r1" value={b.riders[1]} onChange={(e) => dispatch({ type: 'setRider', beam: 1, valueG: Number(e.target.value) })}>
              {[0, 10, 20, 30, 40, 50, 60, 70, 80, 90].map((v) => <option key={v} value={v}>{v} g</option>)}
            </select>
          </span>
        ));
        add('r2', (
          <span className="slider">
            <label htmlFor="p5r2">{t('p5.act.r1')}</label>
            <HoldButton label={t('p5.act.r1Less')} onStart={() => startNudge(() => ctl?.nudgeRider(2, -0.05))} onStop={stopNudge}>−</HoldButton>
            <input id="p5r2" type="range" min={0} max={10} step={0.05} value={b.riders[2]} onChange={(e) => dispatch({ type: 'setRider', beam: 2, valueG: Number(e.target.value) })} />
            <HoldButton label={t('p5.act.r1More')} onStart={() => startNudge(() => ctl?.nudgeRider(2, 0.05))} onStop={stopNudge}>+</HoldButton>
            <span className="readout">{b.riders[2].toFixed(2).replace('.', ',')} g</span>
          </span>
        ));
        add('read', <button className="btn primary" onClick={() => ctl?.readBalance()}>📏 {t('p5.act.read')}</button>);
        add('screw', (
          <span className="slider">
            <span>{t('p5.act.zeroScrew')}</span>
            <HoldButton label={t('p5.act.screwLess')} onStart={() => startNudge(() => dispatch({ type: 'turnZeroScrew', deltaG: -0.01 }))} onStop={stopNudge}>⟲</HoldButton>
            <HoldButton label={t('p5.act.screwMore')} onStart={() => startNudge(() => dispatch({ type: 'turnZeroScrew', deltaG: 0.01 }))} onStop={stopNudge}>⟳</HoldButton>
          </span>
        ));
        add('level', <button className="btn" onClick={() => dispatch({ type: 'levelBalance' })}>{t('p5.act.level')}</button>);
        add('clean', <button className="btn ghost" onClick={() => run(dispatch({ type: 'cleanPan' }))}>🧹 {t('p5.act.cleanPan')}</button>);
        add('draft', <button className="btn ghost" aria-pressed={b.airCurrent < 0.1} onClick={() => dispatch({ type: 'shieldDraft', on: b.airCurrent >= 0.1 })}>{b.airCurrent < 0.1 ? t('p5.act.draftOff') : t('p5.act.draftOn')}</button>);
        add('eye', <button className="btn" onClick={() => stage?.camera?.eyeLevel()}>👁 {t('p5.act.eyeLevel')}</button>);
        add('insp', <button className="btn ghost" onClick={() => inspect('balance')}>{t('p5.act.inspect')}</button>);
        break;
      }
      case 'tube': {
        if (tube.support !== 'pan') add('toPan', <button className="btn" onClick={() => run(ctl?.moveTube('pan', hot))}>⚖ {t('p5.act.toPan')}</button>);
        if (tube.support !== 'clamp') add('toClamp', <button className="btn" onClick={() => run(ctl?.moveTube('clamp', hot))}>🔩 {t('p5.act.toClamp')}</button>);
        if (tube.support !== 'rack') add('toRack', <button className="btn" onClick={() => run(ctl?.moveTube('rack', true))}>🧱 {t('p5.act.toRackTongs')}</button>);
        if (tube.support !== 'hand' && tube.support !== 'tongs') add('take', <button className="btn" onClick={() => run(ctl?.moveTube('hand', false))}>✋ {t('p5.act.takeHand')}</button>);
        if (tube.support === 'hand' || tube.support === 'tongs') {
          add('tap', <HoldButton className="primary" onStart={() => startNudge(() => run(ctl?.tap(0.5)))} onStop={stopNudge}>👆 {t('p5.act.tap')}</HoldButton>);
          add('tapHard', <button className="btn ghost" onClick={() => run(ctl?.tap(1))}>{t('p5.act.tapHard')}</button>);
        }
        add('stopper', <button className="btn ghost" onClick={() => dispatch({ type: 'stopper', on: !w.tube.stoppered })}>{w.tube.stoppered ? t('p5.act.unstopper') : t('p5.act.stopper')}</button>);
        add('insp', <button className="btn" onClick={() => inspect('tube')}>{t('p5.act.inspectTube')}</button>);
        add('dry', <button className="btn ghost" onClick={() => run(dispatch({ type: 'dryTube' }))}>{t('p5.act.dry')}</button>);
        add('ir', <button className="btn" onClick={() => ctl?.measureIR()}>🌡 {t('p5.act.ir')}{irReading !== null ? ` · ${irReading} °C` : ''}</button>);
        add('dispose', <button className="btn ghost" onClick={() => run(dispatch({ type: 'disposeResidue' }))}>🗑 {t('p5.act.dispose')}</button>);
        break;
      }
      case 'spatula': {
        const s = w.spatulas[id];
        add('amount', amountSel);
        for (const bt of Object.values(w.bottles)) {
          if (bt.open) add(`sc-${bt.id}`, <button className="btn" onClick={() => run(ctl?.spatulaDirect(id, 'scoop', bt.id))}>🥄 {t('p5.act.scoop', { r: p5NameOf(w, bt.id) })}</button>);
        }
        if (s && s.loadMol.KClO3 + s.loadMol.MnO2 > 0) {
          add('tip', <button className="btn primary" onClick={() => run(ctl?.spatulaDirect(id, 'tip'))}>{t('p5.act.tipAll')}</button>);
          add('tipH', <button className="btn" onClick={() => run(ctl?.spatulaDirect(id, 'tipHalf'))}>{t('p5.act.tipHalf')}</button>);
        }
        add('wipe', <button className="btn ghost" onClick={() => ctl?.wipeSpatula(id)}>🧻 {t('p5.act.wipe')}</button>);
        add('insp', <button className="btn ghost" onClick={() => inspect(id)}>{t('p5.act.inspect')}</button>);
        break;
      }
      case 'bottle': {
        const bt = w.bottles[id];
        add('open', <button className="btn" onClick={() => ctl?.toggleBottle(id)}>{bt?.open ? t('p5.act.close') : t('p5.act.open')}</button>);
        break;
      }
      case 'stand': {
        const c = w.clamp;
        add('angle', (
          <span className="slider">
            <label htmlFor="p5angle">{t('p5.act.angle')}</label>
            <input id="p5angle" type="range" min={0} max={80} step={1} value={c.angleDeg} onChange={(e) => dispatch({ type: 'setClamp', angleDeg: Number(e.target.value) })} />
            <span className="readout">{Math.round(c.angleDeg)}°</span>
          </span>
        ));
        add('yaw', (
          <span className="slider">
            <label htmlFor="p5yaw">{t('p5.act.mouth')}</label>
            <select id="p5yaw" value={YAWS.includes(Math.round(c.mouthYawDeg)) ? Math.round(c.mouthYawDeg) : 0} onChange={(e) => dispatch({ type: 'setClamp', mouthYawDeg: Number(e.target.value) })}>
              {YAWS.map((y) => <option key={y} value={y}>{t(`p5.yaw.${y}`)}</option>)}
            </select>
          </span>
        ));
        add('height', (
          <span className="slider">
            <label htmlFor="p5h">{t('p5.act.height')}</label>
            <input id="p5h" type="range" min={12} max={45} step={0.5} value={c.heightCm} onChange={(e) => dispatch({ type: 'setClamp', heightCm: Number(e.target.value) })} />
            <span className="readout">{c.heightCm.toFixed(1).replace('.', ',')} cm</span>
          </span>
        ));
        add('grip', (
          <span className="slider">
            <label htmlFor="p5grip">{t('p5.act.grip')}</label>
            <input id="p5grip" type="range" min={0} max={1} step={0.05} value={c.grip} aria-valuetext={c.grip < 0.25 ? t('p5.desc.gripLoose') : c.grip > 0.8 ? t('p5.desc.gripTight') : t('p5.desc.gripOk')} onChange={(e) => dispatch({ type: 'setClamp', grip: Number(e.target.value) })} />
          </span>
        ));
        add('gripAt', (
          <span className="slider">
            <label htmlFor="p5gat">{t('p5.act.gripAt')}</label>
            <input id="p5gat" type="range" min={0.3} max={0.9} step={0.02} value={c.gripAt} onChange={(e) => dispatch({ type: 'setClamp', gripAt: Number(e.target.value) })} />
          </span>
        ));
        add('nut', <button className={`btn ${c.nutTight ? '' : 'primary'}`} onClick={() => dispatch({ type: 'setClamp', nutTight: !c.nutTight })}>{c.nutTight ? t('p5.act.nutLoosen') : t('p5.act.nutTighten')}</button>);
        add('shield', <button className="btn" onClick={() => ctl?.placeShield()}>🛡 {w.safety.shieldPlaced ? t('p5.act.shieldRemove') : t('p5.act.shieldPlace')}</button>);
        break;
      }
      case 'shield':
        add('place', <button className="btn primary" onClick={() => ctl?.placeShield()}>🛡 {w.safety.shieldPlaced ? t('p5.act.shieldRemove') : t('p5.act.shieldPlace')}</button>);
        break;
      case 'tubeTongs':
        if (held === id) add('clamp', <button className={`btn ${ctl?.clampReady ? 'primary' : ''}`} onClick={() => ctl?.toggleTongs()}>{tube.support === 'tongs' ? t('p3.act.unclamp') : t('p3.act.clamp')}</button>);
        if (held === id && tube.support !== 'tongs') add('cr', <small className={ctl?.clampReady ? 'ok' : 'hint'}>{ctl?.clampReady ? t('p3.act.clampReady') : t('p5.act.tongsAim')}</small>);
        break;
      case 'irThermometer':
        add('ir', <button className="btn primary" onClick={() => ctl?.measureIR()}>🌡 {t('p5.act.ir')}{irReading !== null ? ` · ${irReading} °C` : ''}</button>);
        break;
      case 'brush': {
        add('pan', <button className="btn" onClick={() => run(dispatch({ type: 'cleanPan' }))}>🧹 {t('p5.act.cleanPan')}</button>);
        const open = w.spills.filter((s) => !s.cleaned);
        if (open.length) add('spills', <button className="btn" onClick={() => { for (const s of open) dispatch({ type: 'cleanSpill', spillId: s.id }); }}>🧹 {t('p5.act.cleanSpills', { n: open.length })}</button>);
        break;
      }
      case 'washBottle':
        add('water', <button className="btn ghost" onClick={() => run(dispatch({ type: 'waterOnTube' }))}>💦 {t('p5.act.waterOnTube')}</button>);
        break;
      case 'waste':
        add('dispose', <button className="btn primary" onClick={() => run(dispatch({ type: 'disposeResidue' }))}>🗑 {t('p5.act.dispose')}</button>);
        break;
      case 'pestle':
        add('grind', <button className="btn ghost" onClick={() => run(dispatch({ type: 'grind' }))}>{t('p5.act.grind')}</button>);
        break;
      case 'burner':
        add('needle', <ValveControl5 valve="NEEDLE" label={t('p3.act.needle')} />);
        add('air', <ValveControl5 valve="AIR" label={t('p3.act.air')} />);
        add('under', <button className="btn" onClick={() => ctl?.burnerUnderSample()}>🔥 {t('p5.act.underSample')}</button>);
        add('sweepL', <HoldButton label={t('p5.act.sweepLeft')} onStart={() => startNudge(() => ctl?.sweepBurner(-0.15))} onStop={stopNudge}>◀</HoldButton>);
        add('sweepR', <HoldButton label={t('p5.act.sweepRight')} onStart={() => startNudge(() => ctl?.sweepBurner(0.15))} onStop={stopNudge}>▶</HoldButton>);
        add('away', <button className="btn ghost" onClick={() => ctl?.burnerAway()}>{t('p5.act.burnerAway')}</button>);
        add('insp', <button className="btn" onClick={() => inspect('burner')}>{t('p3.act.inspectBurner')}</button>);
        add('hose', <button className="btn" onClick={() => dispatch({ type: 'gas', cmd: { type: 'connectHose', connected: !w.gas.burner.hoseConnected } })}>{w.gas.burner.hoseConnected ? t('p3.act.disconnect') : t('p3.act.connect')}</button>);
        break;
      case 'gasTap':
        add('table', <ValveControl5 valve="TABLE" label={t('p3.act.table')} />);
        break;
      case 'hose':
        add('insp', <button className="btn" onClick={() => inspect('hose')}>{t('p3.act.inspectHose')}</button>);
        add('conn', <button className="btn" onClick={() => dispatch({ type: 'gas', cmd: { type: 'connectHose', connected: !w.gas.burner.hoseConnected } })}>{w.gas.burner.hoseConnected ? t('p3.act.disconnect') : t('p3.act.connect')}</button>);
        break;
      case 'lighter':
        if (held === id) add('spark', <HoldButton className="primary" onStart={() => ctl?.primaryDown()} onStop={() => ctl?.primaryUp()}>🔥 {t('p3.act.spark')}</HoldButton>);
        break;
      case 'extractor':
        add('ext', <button className="btn" aria-pressed={w.gas.room.extractionOn} onClick={() => dispatch({ type: 'gas', cmd: { type: 'setExtraction', on: !w.gas.room.extractionOn } })}>🌀 {w.gas.room.extractionOn ? t('p3.act.extractOff') : t('p3.act.extractOn')}</button>);
        add('loc', <button className="btn ghost" onClick={() => inspect('extractor')}>{t('p3.act.locate')}</button>);
        break;
      case 'emergencyStop':
        add('stop', <button className="btn danger" onClick={() => dispatch({ type: 'gas', cmd: { type: 'emergencyShutoff' } })}>⛔ {t('p3.safety.shutoff')}</button>);
        add('rest', <button className="btn ghost" onClick={() => run(dispatch({ type: 'gas', cmd: { type: 'restoreSupply' } }))}>{t('p3.act.restore')}</button>);
        add('loc', <button className="btn ghost" onClick={() => inspect('estop')}>{t('p3.act.locate')}</button>);
        break;
      case 'extinguisher':
      case 'blanket':
      case 'coDetector':
        add('loc', <button className="btn" onClick={() => inspect(id)}>{t('p3.act.locate')}</button>);
        break;
    }
    if (o || g || id === 'hose') add('focus', <button className="btn ghost" onClick={() => stage?.focusObject(id, 4)}>{t('act.inspect')}</button>);
  }

  const desc = id ? describeObject(w, id, mode) : '';
  return (
    <section id="actions" className={`actions${demo ? ' demo-locked' : ''}`} aria-label={t('p5.act.title')} aria-disabled={demo || undefined}>
      <div className="desc" id="action-desc" aria-live="polite">
        {id ? <><strong>{p5NameOf(w, id)}</strong>{desc ? ` — ${desc}` : ''}</> : t('p5.act.none')}
      </div>
      {/* La fila siempre ocupa su lugar: si apareciera al tomar un objeto, la escena 3D se encogería bajo el puntero. */}
      <div className="row">{buttons}</div>
    </section>
  );
}
