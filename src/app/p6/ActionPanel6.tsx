import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useP6 } from './store';
import { describeObject, p6NameOf } from './describe';
import { HoldButton } from './ui';
import { bombInterlocks } from '../../simulation/calorimetry-world/bomb';
import { piecesAt } from '../../simulation/calorimetry-world/world';
import { BOMB_PROFILES, FOODS, type FoodId } from '../../simulation/calorimetry/materials';
import type { BombCommand, P6Command } from '../../simulation/calorimetry-world/commands';

/** Procedimiento de la bomba calorimétrica (§20.4): cada paso pasa por los enclavamientos del dominio. */
function BombControls() {
  const { t } = useTranslation();
  useP6((s) => s.version);
  const rt = useP6((s) => s.runtime)!;
  const dispatch = useP6((s) => s.dispatch);
  const toast = useP6((s) => s.toast);
  const [wire, setWire] = useState(10);
  const [contact, setContact] = useState<'OK' | 'NO_TOUCH' | 'CRUCIBLE'>('OK');
  const [bucket, setBucket] = useState(2000);
  const w = rt.world;
  const b = w.bomb;
  const run = (cmd: P6Command) => {
    const r = dispatch(cmd);
    if (!r.ok && r.code) toast('warn', t(`p6.lock.${r.code}`) !== `p6.lock.${r.code}` ? t(`p6.lock.${r.code}`) : t('p6.cmd.FAILED'));
  };
  const B = (cmd: BombCommand) => run({ type: 'bomb', cmd });
  const locks = b.profile ? bombInterlocks(w) : ['NO_PROFILE'];
  return (
    <div className="bomb-controls" role="group" aria-label={t('p6.bomb.title')}>
      <p className="hint" style={{ margin: 0 }}>{t('p6.bomb.scope')}</p>
      <div className="row">
        <span className="slider">
          <label htmlFor="p6profile">{t('p6.bomb.profile')}</label>
          <select id="p6profile" value={b.profile ?? ''} disabled={b.stage !== 'UNASSEMBLED'} onChange={(e) => e.target.value && B({ type: 'selectProfile', profile: e.target.value as 'GENERIC_A' | 'GENERIC_B' })}>
            <option value="">—</option>
            {Object.keys(BOMB_PROFILES).map((p) => <option key={p} value={p}>{t(`p6.profile.${p}`)}</option>)}
          </select>
        </span>
        {b.profile && <small className="hint">{t('p6.bomb.limits', { min: BOMB_PROFILES[b.profile].minAtm, max: BOMB_PROFILES[b.profile].maxAtm, e: Math.round(BOMB_PROFILES[b.profile].maxEnergyJ / 1000) })}</small>}
      </div>
      <div className="row">
        {(['vessel', 'seal', 'electrodes', 'valve'] as const).map((p) => (
          <button key={p} className="btn small" aria-pressed={b.inspected[p]} onClick={() => B({ type: 'inspect', part: p })}>{b.inspected[p] ? '✓ ' : ''}{t(`p6.bombPart.${p}`)}</button>
        ))}
        <button className="btn small" aria-pressed={b.energyEquivalent !== null} onClick={() => B({ type: 'loadCalibration' })}>{t('p6.bomb.calibration')}</button>
      </div>
      <div className="row">
        <span className="slider">
          <label htmlFor="p6food">{t('p6.bomb.food')}</label>
          <select id="p6food" value={b.food ?? ''} onChange={(e) => e.target.value && B({ type: 'selectFood', food: e.target.value as FoodId })}>
            <option value="">—</option>
            {Object.keys(FOODS).map((f) => <option key={f} value={f}>{t(`p6.food.${f}`)}</option>)}
          </select>
        </span>
        <button className="btn small" onClick={() => B({ type: 'weighSample', amount: 'target' })}>{t('p6.bomb.weigh')}</button>
        <button className="btn small ghost" onClick={() => B({ type: 'weighSample', amount: 'large' })}>{t('p6.bomb.weighLarge')}</button>
        <button className="btn small" onClick={() => B({ type: 'placeSample' })}>{t('p6.bomb.place')}</button>
      </div>
      <div className="row">
        <span className="slider">
          <label htmlFor="p6wire">{t('p6.bomb.wire')}</label>
          <input id="p6wire" type="number" min={2} max={15} step={0.5} value={wire} onChange={(e) => setWire(Number(e.target.value))} style={{ width: '4.5rem' }} />
          <span>cm</span>
        </span>
        <span className="slider">
          <label htmlFor="p6contact">{t('p6.bomb.contact')}</label>
          <select id="p6contact" value={contact} onChange={(e) => setContact(e.target.value as never)}>
            {(['OK', 'NO_TOUCH', 'CRUCIBLE'] as const).map((c) => <option key={c} value={c}>{t(`p6.contact.${c}`)}</option>)}
          </select>
        </span>
        <button className="btn small" onClick={() => B({ type: 'connectWire', lengthCm: wire, contact })}>{t('p6.bomb.connect')}</button>
        <button className="btn small" onClick={() => B({ type: 'seal' })}>{t('p6.bomb.seal')}</button>
        <button className="btn small" onClick={() => B({ type: 'leakTest' })}>{t('p6.bomb.leak')}</button>
      </div>
      <div className="row">
        <span className="slider">
          <span>{t('p6.bomb.oxygen')}</span>
          <button className="btn small" aria-label={t('p6.bomb.less')} onClick={() => B({ type: 'pressurize', deltaAtm: -1 })}>−</button>
          <span className="readout">{b.pressureAtm.toFixed(0)} atm</span>
          <button className="btn small" aria-label={t('p6.bomb.more')} onClick={() => B({ type: 'pressurize', deltaAtm: 1 })}>+</button>
          <button className="btn small" onClick={() => B({ type: 'pressurize', deltaAtm: 5 })}>+5</button>
        </span>
        <span className="slider">
          <label htmlFor="p6bucket">{t('p6.bomb.bucket')}</label>
          <input id="p6bucket" type="number" min={1500} max={2300} step={5} value={bucket} onChange={(e) => setBucket(Number(e.target.value))} style={{ width: '5.5rem' }} />
          <span>g</span>
          <button className="btn small" onClick={() => B({ type: 'fillBucket', waterG: bucket })}>{t('p6.bomb.fill')}</button>
        </span>
        <button className="btn small" onClick={() => B({ type: 'submerge' })}>{t('p6.bomb.submerge')}</button>
        <button className="btn small" onClick={() => B({ type: 'closeLid' })}>{t('p6.bomb.lid')}</button>
      </div>
      <div className="row">
        <button className="btn small" onClick={() => B({ type: 'arm' })}>{t('p6.bomb.arm')}</button>
        <button className="btn small danger" disabled={b.stage !== 'ARMED'} onClick={() => B({ type: 'ignite' })}>🔥 {t('p6.bomb.ignite')}</button>
        <button className="btn small" onClick={() => B({ type: 'depressurize' })}>{t('p6.bomb.vent')}</button>
        <button className="btn small" onClick={() => B({ type: 'open' })}>{t('p6.bomb.open')}</button>
        <button className="btn small ghost" onClick={() => B({ type: 'abort' })}>⏹ {t('p6.safety.bombAbort')}</button>
      </div>
      <p className="hint" aria-live="polite" style={{ margin: 0 }}>
        {t(`p6.bombStage.${b.stage}`)}{b.sampleReadingG !== null ? ` · ${t('p6.bomb.sample', { g: b.sampleReadingG.toFixed(4).replace('.', ',') })}` : ''}
        {locks.length && b.stage !== 'OPENED' ? ` · ${t('p6.bomb.pending')}: ${locks.map((l) => t(`p6.lock.${l}`)).join(', ')}` : ''}
        {b.stage === 'OPENED' ? ` · ${t('p6.bomb.residue', { r: t(`p6.residue.${b.residue}`) })}` : ''}
      </p>
    </div>
  );
}

export function ActionPanel6() {
  const { t } = useTranslation();
  useP6((s) => s.version);
  const rt = useP6((s) => s.runtime);
  const stage = useP6((s) => s.stage);
  const sel = useP6((s) => s.selected);
  const held = useP6((s) => s.held);
  const dispatch = useP6((s) => s.dispatch);
  const toast = useP6((s) => s.toast);
  const mode = useP6((s) => s.settings.mode);
  const demo = useP6((s) => !!s.demo);
  const nudge = useRef<number | null>(null);
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
      const k = `p6.cmd.${r.code}`;
      toast('warn', t(k) !== k ? t(k) : t('p6.cmd.FAILED'));
    }
  };
  const inspect = (target: string) => {
    dispatch({ type: 'inspect', target });
    stage?.focusObject(target, 4);
  };
  /** Vertido mantenido (botón): inclina mientras se mantiene presionado. */
  const pourHold = (key: string, label: string, src: string, target: string | null) =>
    add(key, <HoldButton onStart={() => run(ctl?.pourDirect(src, target, null))} onStop={() => dispatch({ type: 'stopPour', sourceId: src })}>🫗 {label}</HoldButton>);
  const buttons: React.ReactNode[] = [];
  const add = (key: string, node: React.ReactNode) => buttons.push(<span key={key}>{node}</span>);
  const tube = (tid: string) => w.objects[tid];
  const hotTube = (tid: string) => w.tubes[tid] && Math.max(w.tubes[tid].glassC, w.tubes[tid].metalC) > 55;
  const thermDepth = (tid: string) => (
    <span className="slider">
      <label htmlFor={`p6d-${tid}`}>{t('p6.act.depth')}</label>
      <input id={`p6d-${tid}`} type="range" min={0} max={1} step={0.05} value={w.thermos[tid].depth} onChange={(e) => ctl?.setThermoDepth(tid, Number(e.target.value))}
        aria-valuetext={w.thermos[tid].depth > 0.92 ? t('p6.desc.touchingBottom') : w.thermos[tid].depth < 0.15 ? t('p6.desc.bulbOut') : t('p6.desc.bulbOk')} />
    </span>
  );

  if (id && o) {
    if (held) {
      add('rel', <button className="btn primary" onClick={() => ctl?.release()}>{t('act.release')}</button>);
      add('up', <HoldButton onStart={() => startNudge(() => ctl?.nudgeHeight(0.5))} onStop={stopNudge}>▲ {t('p3.act.raise')}</HoldButton>);
      add('down', <HoldButton onStart={() => startNudge(() => ctl?.nudgeHeight(-0.5))} onStop={stopNudge}>▼ {t('p3.act.lower')}</HoldButton>);
      if (id === 'water_bottle' || id === 'cylinder' || id === 'beaker') {
        add('tilt', <HoldButton className={ctl?.dockTarget ? 'primary' : ''} onStart={() => ctl?.primaryDown()} onStop={() => ctl?.primaryUp()}>🫗 {t('p6.act.tilt')}</HoldButton>);
        add('dock', <small className="hint">{ctl?.dockTarget ? t('p6.act.over', { o: p6NameOf(w, ctl.dockTarget) }) : t('p6.act.noTarget')}</small>);
      }
      if (kind === 'washBottle') {
        add('drop', <HoldButton className="primary" onStart={() => ctl?.primaryDown()} onStop={() => ctl?.primaryUp()}>💧 {t('p6.act.drop')}</HoldButton>);
        add('dock', <small className="hint">{ctl?.dockTarget ? t('p6.act.over', { o: p6NameOf(w, ctl.dockTarget) }) : t('p6.act.noTarget')}</small>);
      }
      if (kind === 'spatula') {
        const m = ctl?.held?.magnet;
        add('spat', <button className={`btn ${m ? 'primary' : ''}`} onClick={() => { ctl?.primaryDown(); ctl?.primaryUp(); }}>{piecesAt(w, 'spatula').length ? t('p6.act.dropPiece') : t('p6.act.pickPiece')}</button>);
      }
      if (kind === 'tubeTongs') add('tongs', <button className={`btn ${ctl?.clampReady ? 'primary' : ''}`} onClick={() => { ctl?.primaryDown(); ctl?.primaryUp(); }}>{t('p6.act.tongs')}</button>);
      if (kind === 'tube') add('pourM', <button className="btn" onClick={() => { ctl?.primaryDown(); ctl?.primaryUp(); }}>{t('p6.act.pourMetal')}</button>);
      add('esc', <button className="btn ghost" onClick={() => ctl?.cancel()}>{t('p3.act.cancel')}</button>);
    } else if (o.movable && !(w.tubes[id] && o.support === 'tongs')) {
      add('grab', <button className="btn" onClick={() => { if (ctl?.beginDrag(id, true)) toast('info', t('p3.hint.keyboardHold')); document.querySelector<HTMLElement>('.canvas-host')?.focus(); }}>{t('act.grabKeyboard')}</button>);
    }
    switch (kind) {
      case 'balance': {
        const b = w.balance;
        add('r0', (
          <span className="slider">
            <label htmlFor="p6r0">{t('p5.act.r100')}</label>
            <select id="p6r0" value={b.riders[0]} onChange={(e) => dispatch({ type: 'setRider', beam: 0, valueG: Number(e.target.value) })}>
              {[0, 100, 200, 300, 400, 500].map((v) => <option key={v} value={v}>{v} g</option>)}
            </select>
          </span>
        ));
        add('r1', (
          <span className="slider">
            <label htmlFor="p6r1">{t('p5.act.r10')}</label>
            <select id="p6r1" value={b.riders[1]} onChange={(e) => dispatch({ type: 'setRider', beam: 1, valueG: Number(e.target.value) })}>
              {[0, 10, 20, 30, 40, 50, 60, 70, 80, 90].map((v) => <option key={v} value={v}>{v} g</option>)}
            </select>
          </span>
        ));
        add('r2', (
          <span className="slider">
            <label htmlFor="p6r2">{t('p5.act.r1')}</label>
            <HoldButton label={t('p5.act.r1Less')} onStart={() => startNudge(() => ctl?.nudgeRider(2, -0.05))} onStop={stopNudge}>−</HoldButton>
            <input id="p6r2" type="range" min={0} max={10} step={0.01} value={b.riders[2]} onChange={(e) => dispatch({ type: 'setRider', beam: 2, valueG: Number(e.target.value) })} />
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
        add('draft', <button className="btn ghost" aria-pressed={b.airCurrent < 0.1} onClick={() => dispatch({ type: 'shieldDraft', on: b.airCurrent >= 0.1 })}>{b.airCurrent < 0.1 ? t('p5.act.draftOff') : t('p5.act.draftOn')}</button>);
        add('eye', <button className="btn" onClick={() => stage?.camera?.eyeLevel('balance')}>👁 {t('p5.act.eyeLevel')}</button>);
        add('insp', <button className="btn ghost" onClick={() => inspect('balance')}>{t('p6.act.inspect')}</button>);
        break;
      }
      case 'cylinder': {
        if (!held) {
          add('pan', <button className="btn" onClick={() => run(ctl?.moveVessel('cylinder', o.support === 'pan' ? 'bench' : 'pan'))}>⚖ {o.support === 'pan' ? t('p6.act.toBench') : t('p6.act.toPan')}</button>);
          pourHold('fill', t('p6.act.fillFromBottle'), 'water_bottle', 'cylinder');
          add('d1', <button className="btn" onClick={() => run(dispatch({ type: 'squeeze', targetId: 'cylinder', drops: 1 }))}>💧 {t('p6.act.oneDrop')}</button>);
          add('d10', <button className="btn ghost" onClick={() => run(dispatch({ type: 'squeeze', targetId: 'cylinder', drops: 10 }))}>💧×10</button>);
          pourHold('toCup', t('p6.act.pourToCup'), 'cylinder', 'cup');
          pourHold('toSink', t('p6.act.pourToSink'), 'cylinder', 'sink');
        }
        add('eye', <button className="btn" onClick={() => stage?.camera?.eyeLevel('cylinder')}>👁 {t('p6.act.eyeMeniscus')}</button>);
        add('readV', <button className="btn primary" onClick={() => ctl?.readCylinder()}>📏 {t('p6.act.readCylinder')}</button>);
        add('dry', <button className="btn ghost" onClick={() => run(dispatch({ type: 'dry', id: 'cylinder' }))}>{t('p6.act.dry')}</button>);
        add('insp', <button className="btn ghost" onClick={() => inspect('cylinder')}>{t('p6.act.inspect')}</button>);
        break;
      }
      case 'waterBottle':
        if (!held) {
          pourHold('toBeaker', t('p6.act.pourToBeaker'), 'water_bottle', 'beaker');
          pourHold('toCyl', t('p6.act.pourToCylinder'), 'water_bottle', 'cylinder');
        }
        break;
      case 'washBottle':
        if (!held) {
          add('d1', <button className="btn" onClick={() => run(dispatch({ type: 'squeeze', targetId: 'cylinder', drops: 1 }))}>💧 {t('p6.act.dropCylinder')}</button>);
        }
        break;
      case 'beaker':
        if (!held) {
          add('plate', <button className="btn" onClick={() => run(ctl?.moveVessel('beaker', o.support === 'plate' ? 'bench' : 'plate'))}>{o.support === 'plate' ? t('p6.act.offPlate') : t('p6.act.onPlate')}</button>);
          pourHold('fill', t('p6.act.fillFromBottle'), 'water_bottle', 'beaker');
          add('insp', <button className="btn ghost" onClick={() => inspect('beaker')}>{t('p6.act.inspect')}</button>);
        }
        break;
      case 'cup':
        add('lid', <button className="btn primary" onClick={() => ctl?.toggleLid()}>{w.cal.lidClosed ? t('p6.act.openLid') : t('p6.act.closeLid')}</button>);
        add('stir', <HoldButton onStart={() => startNudge(() => ctl?.stir(0.6), 250)} onStop={stopNudge}>🌀 {t('p6.act.stir')}</HoldButton>);
        add('stirHard', <button className="btn ghost" onClick={() => ctl?.stir(1)}>{t('p6.act.stirHard')}</button>);
        add('readT', <button className="btn" onClick={() => ctl?.readThermometer('therm_cal', false)}>🌡 {t('p6.act.readT')}</button>);
        add('peak', <button className="btn" onClick={() => ctl?.readThermometer('therm_cal', true)}>⬆ {t('p6.act.peak')}</button>);
        add('empty', <button className="btn ghost" onClick={() => run(dispatch({ type: 'emptyCup' }))}>🗑 {t('p6.act.emptyCup')}</button>);
        add('dry', <button className="btn ghost" onClick={() => run(dispatch({ type: 'dry', id: 'cup' }))}>{t('p6.act.dry')}</button>);
        add('insp', <button className="btn ghost" onClick={() => inspect('cup')}>{t('p6.act.inspect')}</button>);
        break;
      case 'thermometer': {
        if (!held) {
          add('cup', <button className="btn" onClick={() => ctl?.moveInstrument(id, 'cup')}>{t('p6.act.toCup')}</button>);
          add('bath', <button className="btn" onClick={() => ctl?.moveInstrument(id, 'bath')}>{t('p6.act.toBath')}</button>);
          if (o.support !== 'bench') add('bench', <button className="btn ghost" onClick={() => ctl?.moveInstrument(id, 'bench')}>{t('p6.act.toBench')}</button>);
        }
        if (o.support === 'cup' || o.support === 'bath') add('depth', thermDepth(id));
        add('readT', <button className="btn primary" onClick={() => ctl?.readThermometer(id, false)}>🌡 {t('p6.act.readT')}</button>);
        if (id === 'therm_cal') add('peak', <button className="btn" onClick={() => ctl?.readThermometer(id, true)}>⬆ {t('p6.act.peak')}</button>);
        add('insp', <button className="btn ghost" onClick={() => inspect(id)}>{t('p6.act.inspect')}</button>);
        break;
      }
      case 'stirrer':
        if (!held) {
          if (o.support !== 'cup') add('cup', <button className="btn" onClick={() => ctl?.moveInstrument(id, 'cup')}>{t('p6.act.toCup')}</button>);
          else {
            add('stir', <HoldButton className="primary" onStart={() => startNudge(() => ctl?.stir(0.6), 250)} onStop={stopNudge}>🌀 {t('p6.act.stir')}</HoldButton>);
            add('bench', <button className="btn ghost" onClick={() => ctl?.moveInstrument(id, 'bench')}>{t('p6.act.toBench')}</button>);
          }
        }
        break;
      case 'tube': {
        const jar = id === 'tube_fe' ? 'jar_fe' : 'jar_x';
        const hot = hotTube(id);
        if (!held && o.support !== 'tongs') {
          add('pan', <button className="btn" onClick={() => run(ctl?.moveTube(id, 'pan', hot))}>⚖ {t('p6.act.toPan')}</button>);
          if (o.support !== 'rack') add('rack', <button className="btn" onClick={() => run(ctl?.moveTube(id, 'rack', true))}>{t('p6.act.toRackTongs')}</button>);
          if (o.support !== 'bath') add('bath', <button className="btn" onClick={() => run(ctl?.moveTube(id, 'bath', hot))}>♨ {t('p6.act.toBath')}</button>);
          add('pourM', <button className="btn primary" onClick={() => run(ctl?.moveTube(id, 'cupPour', true))}>{t('p6.act.pourMetalTongs')}</button>);
        }
        if (o.support === 'bath') {
          add('depth', (
            <span className="slider">
              <label htmlFor={`p6tb-${id}`}>{t('p6.act.tubeHeight')}</label>
              <input id={`p6tb-${id}`} type="range" min={0} max={8} step={0.2} value={w.tubes[id].bottomAboveFloorCm} onChange={(e) => ctl?.setTubeDepth(id, Number(e.target.value))} />
              <span className="readout">{w.tubes[id].bottomAboveFloorCm.toFixed(1).replace('.', ',')} cm</span>
            </span>
          ));
        }
        if (o.support === 'rack' || o.support === 'pan') {
          add('add', <button className="btn" onClick={() => { run(ctl?.spatulaDirect('pick', `jar:${jar}`)); run(ctl?.spatulaDirect('drop', `tube:${id}`)); }}>➕ {t('p6.act.addPiece')}</button>);
          add('rem', <button className="btn ghost" onClick={() => { run(ctl?.spatulaDirect('pick', `tube:${id}`)); run(ctl?.spatulaDirect('drop', `jar:${jar}`)); }}>➖ {t('p6.act.removePiece')}</button>);
        }
        add('dry', <button className="btn ghost" onClick={() => run(dispatch({ type: 'dry', id }))}>{t('p6.act.dry')}</button>);
        add('insp', <button className="btn ghost" onClick={() => inspect(id)}>{t('p6.act.inspect')}</button>);
        void tube;
        break;
      }
      case 'hotplate':
        add('knob', (
          <span className="slider">
            <label htmlFor="p6knob">{t('p6.act.knob')}</label>
            <HoldButton label={t('p6.act.knobLess')} onStart={() => startNudge(() => ctl?.setKnob(w.plate.knob - 0.02))} onStop={stopNudge}>−</HoldButton>
            <input id="p6knob" type="range" min={0} max={1} step={0.01} value={w.plate.knob} onChange={(e) => ctl?.setKnob(Number(e.target.value))} aria-valuetext={(w.plate.knob * 5).toFixed(1)} />
            <HoldButton label={t('p6.act.knobMore')} onStart={() => startNudge(() => ctl?.setKnob(w.plate.knob + 0.02))} onStop={stopNudge}>+</HoldButton>
            <span className="readout">{(w.plate.knob * 5).toFixed(1).replace('.', ',')}</span>
            <button className="btn small ghost" onClick={() => ctl?.setKnob(0)}>{t('p6.act.off')}</button>
          </span>
        ));
        break;
      case 'jar':
        add('fe', <button className="btn" onClick={() => { run(ctl?.spatulaDirect('pick', `jar:${id}`)); run(ctl?.spatulaDirect('drop', `tube:${id === 'jar_fe' ? 'tube_fe' : 'tube_x'}`)); }}>➕ {t('p6.act.addPieceTo', { tube: p6NameOf(w, id === 'jar_fe' ? 'tube_fe' : 'tube_x') })}</button>);
        break;
      case 'tubeTongs':
        break;
      case 'bomb':
      case 'bombUnit':
      case 'oxygen':
      case 'analyticBalance':
      case 'foodDish':
        if (w.params.bombEnabled) add('bomb', <BombControls />);
        break;
    }
    add('focus', <button className="btn ghost" onClick={() => stage?.focusObject(id, 4)}>{t('act.inspect')}</button>);
  }

  const desc = id ? describeObject(w, id, mode) : '';
  return (
    <section id="actions" className={`actions${demo ? ' demo-locked' : ''}`} aria-label={t('p6.act.title')} aria-disabled={demo || undefined}>
      <div className="desc" id="action-desc" aria-live="polite">
        {id ? <><strong>{p6NameOf(w, id)}</strong>{desc ? ` — ${desc}` : ''}</> : t('p6.act.none')}
      </div>
      {buttons.length > 0 && <div className="row">{buttons}</div>}
    </section>
  );
}
