import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useP10 } from './store';
import { describeObject, p10NameOf } from './describe';
import { HoldButton } from './ui';
import { POURABLE } from '../../engine/gas/controller';
import { sensorStable } from '../../simulation/gas-world/boyle-rig';
import type { P10Command } from '../../simulation/gas-world/commands';

/** Entrada del punto de Boyle (§23.2): «Keep» y el volumen TOTAL que escribe el estudiante. */
function KeepControls() {
  const { t } = useTranslation();
  useP10((s) => s.version);
  const rt = useP10((s) => s.runtime)!;
  const dispatch = useP10((s) => s.dispatch);
  const toast = useP10((s) => s.toast);
  const [total, setTotal] = useState('');
  const w = rt.world;
  const s = w.syringe;
  const stable = sensorStable(w);
  const keep = () => {
    const v = Number(total.replace(',', '.'));
    if (!Number.isFinite(v) || v <= 0) {
      toast('warn', t('p10.act.totalMissing'));
      return;
    }
    const r = dispatch({ type: 'keepPoint', enteredTotalMl: v });
    if (!r.ok && r.code) toast('warn', t(`p10.cmd.${r.code}`));
    else setTotal('');
  };
  return (
    <span className="slider" role="group" aria-label={t('p10.act.keepGroup')}>
      <button className="btn small" aria-pressed={s.collecting} disabled={!s.connected} onClick={() => dispatch({ type: 'startCollection', on: !s.collecting })}>{s.collecting ? `⏹ ${t('p10.act.stopCollect')}` : `⏺ ${t('p10.act.startCollect')}`}</button>
      <label htmlFor="p10total">{t('p10.act.totalVolume')}</label>
      <input id="p10total" type="text" inputMode="decimal" value={total} placeholder="mL" style={{ width: '5rem' }} onChange={(e) => setTotal(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && keep()} />
      <button className={`btn small ${stable ? 'primary' : ''}`} disabled={!s.collecting} onClick={keep}>Keep</button>
      <small className="hint" aria-live="polite">{stable ? t('p10.act.stable') : t('p10.act.stabilizing')} · {t('p10.act.points', { n: w.points.length })}</small>
    </span>
  );
}

export function ActionPanel10() {
  const { t } = useTranslation();
  useP10((s) => s.version);
  const rt = useP10((s) => s.runtime);
  const stage = useP10((s) => s.stage);
  const sel = useP10((s) => s.selected);
  const held = useP10((s) => s.held);
  const dispatch = useP10((s) => s.dispatch);
  const toast = useP10((s) => s.toast);
  const mode = useP10((s) => s.settings.mode);
  const demo = useP10((s) => !!s.demo);
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
      const k = `p10.cmd.${r.code}`;
      toast('warn', t(k) !== k ? t(k) : t('p10.cmd.FAILED'));
    }
    return r;
  };
  const D = (c: P10Command) => run(dispatch(c));
  const inspect = (target: string) => {
    dispatch({ type: 'inspect', target });
    stage?.focusObject(target === 'hose' ? 'stopper' : target, 4);
  };
  const buttons: React.ReactNode[] = [];
  const add = (key: string, node: React.ReactNode) => buttons.push(<span key={key}>{node}</span>);
  /** Vertido mantenido (botón): inclina mientras se mantiene presionado. */
  const pourHold = (key: string, label: string, src: string, target: string | null) =>
    add(key, <HoldButton onStart={() => run(ctl?.pourDirect(src, target, null))} onStop={() => dispatch({ type: 'stopPour', sourceId: src })}>🫗 {label}</HoldButton>);
  const dropsHold = (key: string, target: string, n = 1) =>
    add(key, <HoldButton onStart={() => startNudge(() => D({ type: 'squeeze', targetId: target, drops: n }), 250)} onStop={stopNudge}>💧 {n === 1 ? t('p10.act.drop') : t('p10.act.squirt')}</HoldButton>);
  const eye = (target: 'burette' | 'cylinder' | 'flask' | 'pipette' | 'ruler' | 'balance') => add(`eye-${target}`, <button className="btn ghost" onClick={() => stage?.camera?.eyeLevel(target)}>👁 {t('p10.act.eyeLevel')}</button>);

  if (id && o) {
    if (held) {
      add('rel', <button className="btn primary" onClick={() => ctl?.release()}>{t('act.release')}</button>);
      add('up', <HoldButton onStart={() => startNudge(() => ctl?.nudgeHeight(0.6))} onStop={stopNudge}>▲ {t('p3.act.raise')}</HoldButton>);
      add('down', <HoldButton onStart={() => startNudge(() => ctl?.nudgeHeight(-0.6))} onStop={stopNudge}>▼ {t('p3.act.lower')}</HoldButton>);
      if (POURABLE.has(id)) {
        add('tilt', <HoldButton className={ctl?.dockTarget ? 'primary' : ''} onStart={() => ctl?.primaryDown()} onStop={() => ctl?.primaryUp()}>🫗 {t('p10.act.tilt')}</HoldButton>);
        add('dock', <small className="hint">{ctl?.dockTarget ? t('p10.act.over', { o: p10NameOf(w, ctl.dockTarget) }) : t('p10.act.noTarget')}</small>);
      }
      if (kind === 'washBottle') {
        add('drop', <HoldButton className="primary" onStart={() => ctl?.primaryDown()} onStop={() => ctl?.primaryUp()}>💧 {t('p10.act.drop')}</HoldButton>);
        add('dock', <small className="hint">{ctl?.dockTarget ? t('p10.act.over', { o: p10NameOf(w, ctl.dockTarget) }) : t('p10.act.noTarget')}</small>);
      }
      if (kind === 'spatula') {
        const m = ctl?.held?.magnet;
        add('spat', <button className={`btn ${m ? 'primary' : ''}`} onClick={() => { ctl?.primaryDown(); ctl?.primaryUp(); }}>{w.solids.spatulaG > 0.001 ? t('p10.act.tap') : t('p10.act.scoop')}</button>);
      }
      if (kind === 'burette') {
        add('inv', <button className="btn primary" onClick={() => ctl?.invertHere(true)}>🔄 {t('p10.act.invertSubmerged')}</button>);
        add('invAir', <button className="btn ghost" onClick={() => ctl?.invertHere(false)}>{t('p10.act.invertAir')}</button>);
      }
      if (kind === 'flask' && w.flask.stoppered) add('invF', <HoldButton onStart={() => startNudge(() => ctl?.invertFlask(), 700)} onStop={stopNudge}>🔄 {t('p10.act.invertFlask')}</HoldButton>);
      if (kind === 'erlenmeyer') add('swirl', <HoldButton onStart={() => startNudge(() => ctl?.swirlNow(0.35), 250)} onStop={stopNudge}>🌀 {t('p10.act.swirl')}</HoldButton>);
      add('esc', <button className="btn ghost" onClick={() => ctl?.cancel()}>{t('p3.act.cancel')}</button>);
    } else if (o.movable && !(id === 'burette' && w.burette.clamped)) {
      add('grab', <button className="btn" onClick={() => { if (ctl?.beginDrag(id, true)) toast('info', t('p3.hint.keyboardHold')); document.querySelector<HTMLElement>('.canvas-host')?.focus(); }}>{t('act.grabKeyboard')}</button>);
    }

    switch (kind) {
      case 'abalance': {
        const b = w.balance;
        add('doors', <button className="btn" aria-pressed={b.doorsOpen} onClick={() => ctl?.toggleDoors()}>{b.doorsOpen ? t('p10.act.closeDoors') : t('p10.act.openDoors')}</button>);
        add('tare', <button className="btn" onClick={() => ctl?.tare()}>→0← {t('p10.act.tare')}</button>);
        add('read', <button className={`btn ${b.stable && !b.doorsOpen ? 'primary' : ''}`} onClick={() => run(ctl?.readBalance())}>{t('p10.act.read')}</button>);
        add('level', <button className="btn ghost" onClick={() => D({ type: 'levelBalance' })}>{t('p10.act.level')}</button>);
        add('insp', <button className="btn ghost" onClick={() => inspect('abalance')}>{t('p10.act.inspect')}</button>);
        eye('balance');
        break;
      }
      case 'watchGlass':
        if (!held) {
          add('pan', o.support === 'pan'
            ? <button className="btn" onClick={() => run(ctl?.moveTo(id, 'bench'))}>{t('p10.act.offPan')}</button>
            : <button className="btn" onClick={() => run(ctl?.moveTo(id, 'pan'))}>⚖ {t('p10.act.toPan')}</button>);
        }
        add('add', <button className="btn" onClick={() => { if (w.solids.spatulaG < 0.001) D({ type: 'scoop', amountG: 0.15 }); D({ type: 'tapSpatula', targetId: 'watch_glass', fraction: 1 }); }}>➕ {t('p10.act.addBicarb')}</button>);
        add('tr', <button className="btn" onClick={() => D({ type: 'transferSolid', fromId: 'watch_glass', toId: 'beaker150', careful: true })}>{t('p10.act.transferSolid')}</button>);
        add('rinse', <button className="btn ghost" onClick={() => D({ type: 'rinseInto', sourceId: 'watch_glass', targetId: 'beaker150', ml: 5 })}>🚿 {t('p10.act.rinseGlass')}</button>);
        add('insp', <button className="btn ghost" onClick={() => inspect('watch_glass')}>{t('p10.act.inspect')}</button>);
        break;
      case 'bicarbJar':
      case 'spatula':
        add('scoop', <button className="btn" onClick={() => D({ type: 'scoop', amountG: 0.15 })}>{t('p10.act.scoop')}</button>);
        add('tap', <button className="btn" onClick={() => D({ type: 'tapSpatula', targetId: 'watch_glass', fraction: 0.5 })}>{t('p10.act.tapHalf')}</button>);
        add('ret', <button className="btn ghost" onClick={() => D({ type: 'returnSpatula' })}>{t('p10.act.discardSpatula')}</button>);
        break;
      case 'beaker150':
        pourHold('water', t('p10.act.addWaterFrom'), 'water_bottle', 'beaker150');
        add('dis', <HoldButton onStart={() => startNudge(() => D({ type: 'swirl', id: 'beaker150', intensity: 0.5 }), 300)} onStop={stopNudge}>🌀 {t('p10.act.dissolve')}</HoldButton>);
        pourHold('toFlask', t('p10.act.pourToFlask'), 'beaker150', 'flask');
        add('rinse', <button className="btn ghost" onClick={() => D({ type: 'rinseInto', sourceId: 'beaker150', targetId: 'flask', ml: 8 })}>🚿 {t('p10.act.rinseBeaker')}</button>);
        break;
      case 'funnel':
        if (!held) add('place', o.support === 'funnel:flask'
          ? <button className="btn" onClick={() => run(ctl?.moveTo(id, 'bench'))}>{t('p10.act.removeFunnel')}</button>
          : <button className="btn" onClick={() => run(ctl?.moveTo(id, 'flask'))}>{t('p10.act.funnelOnFlask')}</button>);
        add('rinse', <button className="btn ghost" onClick={() => D({ type: 'rinseInto', sourceId: 'funnel', targetId: 'flask', ml: 3 })}>🚿 {t('p10.act.rinseFunnel')}</button>);
        break;
      case 'flask':
        pourHold('water', t('p10.act.addWaterFrom'), 'water_bottle', 'flask');
        dropsHold('drop', 'flask', 1);
        dropsHold('squirt', 'flask', 10);
        add('read', <button className="btn" onClick={() => run(ctl?.readVolume('flask'))}>{t('p10.act.readMark')}</button>);
        eye('flask');
        add('stop', <button className="btn" aria-pressed={w.flask.stoppered} onClick={() => D({ type: 'stopperFlask', on: !w.flask.stoppered })}>{w.flask.stoppered ? t('p10.act.unstopper') : t('p10.act.stopper')}</button>);
        add('inv', <HoldButton onStart={() => startNudge(() => ctl?.invertFlask(), 700)} onStop={stopNudge}>🔄 {t('p10.act.invertFlask')}</HoldButton>);
        add('n', <small className="hint">{t('p10.act.inversions', { n: w.flask.inversions })}</small>);
        break;
      case 'pipette':
      case 'propipette': {
        const p = w.pipette;
        add('prop', <button className="btn" aria-pressed={p.propipette} onClick={() => D({ type: 'attachPropipette', on: !p.propipette })}>{p.propipette ? t('p10.act.propipetteOff') : t('p10.act.propipetteOn')}</button>);
        if (!held) add('toF', <button className="btn" onClick={() => run(ctl?.moveTo('pipette', 'flask'))}>{t('p10.act.pipetteToFlask')}</button>);
        add('cond', <button className="btn" onClick={() => D({ type: 'conditionPipette' })}>{t('p10.act.condition')}</button>);
        add('asp', <button className="btn" onClick={() => D({ type: 'aspirate', ml: w.params.pipetteMl + 1 })}>⬆ {t('p10.act.aspirate')}</button>);
        add('adj', <button className="btn" onClick={() => run(ctl?.adjustPipette())}>{t('p10.act.adjust')}</button>);
        eye('pipette');
        if (!held) add('toE', <button className="btn" onClick={() => run(ctl?.moveTo('pipette', 'erlenmeyer'))}>{t('p10.act.pipetteToErlen')}</button>);
        add('del', <button className="btn primary" onClick={() => D({ type: 'deliverPipette', targetId: 'erlenmeyer', blow: false })}>⬇ {t('p10.act.deliver')}</button>);
        add('blow', <button className="btn ghost" onClick={() => D({ type: 'deliverPipette', targetId: 'erlenmeyer', blow: true })}>{t('p10.act.blow')}</button>);
        break;
      }
      case 'cylinder':
        pourHold('vin', t('p10.act.vinegarIn'), 'vinegar_bottle', 'cylinder');
        add('read', <button className="btn" onClick={() => run(ctl?.readVolume('cylinder'))}>{t('p10.act.readCylinder')}</button>);
        eye('cylinder');
        add('add', <button className="btn primary" onClick={() => D({ type: 'addVinegar' })}>{t('p10.act.addVinegar')}</button>);
        break;
      case 'vinegarBottle':
        pourHold('vin', t('p10.act.vinegarIn'), 'vinegar_bottle', 'cylinder');
        break;
      case 'erlenmeyer':
      case 'stopper': {
        const r = w.reactor;
        const c = w.connections;
        add('hose', !c.c_stopper.connectedTo
          ? <button className="btn" onClick={() => D({ type: 'connect', id: 'c_stopper', secured: true })}>🔗 {t('p10.act.connectStopper')}</button>
          : !c.c_stopper.secured ? <button className="btn" onClick={() => D({ type: 'secure', id: 'c_stopper' })}>{t('p10.act.secure')}</button> : <small className="hint">{t('p10.act.hoseOk')}</small>);
        add('stop', <button className={`btn ${r.acidAddedAt !== null && !r.stoppered ? 'primary' : ''}`} onClick={() => D({ type: 'insertStopper', on: !r.stoppered })}>{r.stoppered ? t('p10.act.removeStopper') : t('p10.act.insertStopper')}</button>);
        add('leak', <button className="btn" onClick={() => D({ type: 'leakTest' })}>{t('p10.act.leakTest')}</button>);
        if (kind === 'erlenmeyer') {
          add('vin', <button className="btn" onClick={() => D({ type: 'addVinegar' })}>{t('p10.act.addVinegar')}</button>);
          add('swirl', <HoldButton onStart={() => startNudge(() => ctl?.swirlNow(0.35), 250)} onStop={stopNudge}>🌀 {t('p10.act.swirl')}</HoldButton>);
          add('empty', <button className="btn ghost" onClick={() => D({ type: 'emptyReactor' })}>{t('p10.act.emptyReactor')}</button>);
        }
        add('insp', <button className="btn ghost" onClick={() => inspect('hose')}>{t('p10.act.inspectHose')}</button>);
        if (Object.values(c).some((x) => x.kinkFraction > 0)) add('unkink', <button className="btn ghost" onClick={() => { D({ type: 'kink', id: 'c_stopper', fraction: 0 }); D({ type: 'kink', id: 'c_hose_u', fraction: 0 }); }}>{t('p10.act.straighten')}</button>);
        break;
      }
      case 'burette': {
        const b = w.burette;
        if (!b.inverted) {
          add('fill', <button className="btn" onClick={() => D({ type: 'fillBurette', ml: 100 })}>{t('p10.act.fillBurette')}</button>);
          add('fillP', <button className="btn ghost" onClick={() => D({ type: 'fillBurette', ml: 5 })}>{t('p10.act.fillMore')}</button>);
          // Sin arrastrar: la bureta se lleva sobre el baño y se invierte con la boca bajo el agua.
          add('invPanel', <button className="btn primary" onClick={() => ctl?.invertHere(true, true)}>🔄 {t('p10.act.invertSubmerged')}</button>);
          add('insp', <button className="btn ghost" onClick={() => inspect('burette')}>{t('p10.act.inspect')}</button>);
        } else {
          if (!b.clamped) add('clamp', <button className="btn primary" onClick={() => run(ctl?.clampBurette())}>{t('p10.act.clamp')}</button>);
          add('cock', <HoldButton onStart={() => D({ type: 'setStopcock', open: true })} onStop={() => D({ type: 'setStopcock', open: false })}>{t('p10.act.stopcock')}</HoldButton>);
          add('depth', (
            <span className="slider">
              <label htmlFor="p10bd">{t('p10.act.mouthHeight')}</label>
              <input id="p10bd" type="range" min={0} max={5} step={0.1} value={b.mouthAboveFloorCm} onChange={(e) => D({ type: 'setBuretteDepth', mouthAboveFloorCm: Number(e.target.value) })} />
              <span className="readout">{b.mouthAboveFloorCm.toFixed(1).replace('.', ',')} cm</span>
            </span>
          ));
          add('read', <button className="btn" onClick={() => run(ctl?.readVolume('burette'))}>{t('p10.act.readBurette')}</button>);
          eye('burette');
          add('h', <button className="btn" onClick={() => run(ctl?.measureHeight())}>📏 {t('p10.act.measureHeight')}</button>);
        }
        break;
      }
      case 'uTube': {
        const c = w.connections;
        if (!held && o.support !== 'burette') add('place', <button className="btn" onClick={() => run(ctl?.moveTo(id, 'bath'))}>{t('p10.act.tipInBurette')}</button>);
        add('hose', !c.c_hose_u.connectedTo
          ? <button className="btn" onClick={() => D({ type: 'connect', id: 'c_hose_u', secured: true })}>🔗 {t('p10.act.connectU')}</button>
          : !c.c_hose_u.secured ? <button className="btn" onClick={() => D({ type: 'secure', id: 'c_hose_u' })}>{t('p10.act.secure')}</button> : <small className="hint">{t('p10.act.hoseOk')}</small>);
        break;
      }
      case 'beaker600':
        if (id === 'beaker600') pourHold('fill', t('p10.act.fillBath'), 'tap_jug', 'beaker600');
        break;
      case 'waterBottle':
        if (id === 'tap_jug') pourHold('fill', t('p10.act.fillBath'), 'tap_jug', 'beaker600');
        break;
      case 'thermometer':
        if (!held) {
          add('bath', <button className="btn" onClick={() => run(ctl?.moveTo(id, 'bath'))}>{t('p10.act.thermoBath')}</button>);
          add('erl', <button className="btn ghost" onClick={() => run(ctl?.moveTo(id, 'erlenmeyer'))}>{t('p10.act.thermoErlen')}</button>);
        }
        add('read', <button className="btn" onClick={() => run(ctl?.readThermometer())}>🌡 {t('p10.act.readTemp')}</button>);
        add('insp', <button className="btn ghost" onClick={() => inspect('thermometer')}>{t('p10.act.inspect')}</button>);
        break;
      case 'barometer':
        add('local', <button className="btn" onClick={() => run(ctl?.readBarometer('LOCAL'))}>{t('p10.act.baroLocal')}</button>);
        add('weather', <button className="btn ghost" onClick={() => run(ctl?.readBarometer('WEATHER_SEA_LEVEL'))}>{t('p10.act.baroWeather')}</button>);
        break;
      case 'ruler':
        if (!held) add('place', <button className="btn" onClick={() => run(ctl?.moveTo(id, 'bath'))}>{t('p10.act.rulerPlace')}</button>);
        add('h', <button className="btn" onClick={() => run(ctl?.measureHeight())}>📏 {t('p10.act.measureHeight')}</button>);
        eye('ruler');
        break;
      case 'syringe':
      case 'sensor':
      case 'datalogger': {
        const s = w.syringe;
        add('plunger', (
          <span className="slider">
            <label htmlFor="p10pl">{t('p10.act.plunger')}</label>
            <HoldButton label={t('p10.act.plungerIn')} onStart={() => startNudge(() => ctl?.setPlunger(s.targetMl - 0.1))} onStop={stopNudge}>−</HoldButton>
            <input id="p10pl" type="range" min={2} max={21} step={0.1} value={s.targetMl} onChange={(e) => ctl?.setPlunger(Number(e.target.value))} aria-valuetext={`${s.markMl.toFixed(1)} mL`} />
            <HoldButton label={t('p10.act.plungerOut')} onStart={() => startNudge(() => ctl?.setPlunger(s.targetMl + 0.1))} onStop={stopNudge}>+</HoldButton>
            <span className="readout">{mode === 'EVALUATION' ? '' : `${s.markMl.toFixed(1).replace('.', ',')} mL`}</span>
          </span>
        ));
        if (s.held) add('free', <button className="btn ghost" onClick={() => ctl?.setPlunger(s.markMl, false)}>{t('p10.act.releasePlunger')}</button>);
        add('conn', <button className="btn" aria-pressed={s.connected} onClick={() => (s.connected ? D({ type: 'connectSyringe', on: false }) : run(ctl?.moveTo('syringe', 'sensor')))}>{s.connected ? t('p10.act.disconnect') : t('p10.act.connectSyringe')}</button>);
        add('valve', <button className="btn ghost" aria-pressed={s.valve === 'VENT'} onClick={() => D({ type: 'setValve', valve: s.valve === 'VENT' ? 'TO_SYRINGE' : 'VENT' })}>{t(`p10.act.valve_${s.valve}`)}</button>);
        add('chk', <button className="btn ghost" onClick={() => inspect('sensor')}>{t('p10.act.checkAmbient')}</button>);
        add('insp', <button className="btn ghost" onClick={() => inspect('syringe')}>{t('p10.act.inspect')}</button>);
        add('keep', <KeepControls />);
        break;
      }
    }
    add('focus', <button className="btn ghost" onClick={() => stage?.focusObject(id, 4)}>{t('act.inspect')}</button>);
  }

  const desc = id ? describeObject(w, id, mode) : '';
  return (
    <section id="actions" className={`actions${demo ? ' demo-locked' : ''}`} aria-label={t('p10.act.title')} aria-disabled={demo || undefined}>
      <div className="desc" id="action-desc" aria-live="polite">
        {id ? <><strong>{p10NameOf(w, id)}</strong>{desc ? ` — ${desc}` : ''}</> : t('p10.act.none')}
      </div>
      {/* La fila siempre ocupa su lugar: si apareciera al tomar un objeto, la escena 3D se encogería bajo el puntero. */}
      <div className="row">{buttons}</div>
    </section>
  );
}
