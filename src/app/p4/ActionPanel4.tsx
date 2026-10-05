import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useP4 } from './store';
import { describeObject, p4NameOf } from './describe';
import { HoldButton } from './ui';
import { valveWords } from '../p3/describe';
import type { ValveId } from '../../simulation/flame-world/commands';
import { liquidMl } from '../../simulation/reaction-world/world';
import { DROPPER_BOTTLES, TUBE_LABELS } from '../../practices/practice-04/definition';

/** Control continuo de una válvula del mechero (posición física en palabras; % salvo en evaluación). */
function ValveControl4({ valve, label }: { valve: ValveId; label: string }) {
  const { t } = useTranslation();
  const rt = useP4((s) => s.runtime);
  const stage = useP4((s) => s.stage);
  const mode = useP4((s) => s.settings.mode);
  if (!rt) return null;
  const b = rt.world.gas.burner;
  const v = valve === 'TABLE' ? b.tableGasValve : valve === 'NEEDLE' ? b.needleGasValve : b.airCollar;
  const set = (x: number) => {
    stage?.controller.setValve(valve, x);
    useP4.getState().bump();
  };
  const id = `p4valve-${valve}`;
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

export function ActionPanel4() {
  const { t } = useTranslation();
  useP4((s) => s.version);
  const rt = useP4((s) => s.runtime);
  const stage = useP4((s) => s.stage);
  const sel = useP4((s) => s.selected);
  const held = useP4((s) => s.held);
  const dispatch = useP4((s) => s.dispatch);
  const toast = useP4((s) => s.toast);
  const mode = useP4((s) => s.settings.mode);
  const demo = useP4((s) => !!s.demo);
  const nudge = useRef<number | null>(null);
  if (!rt) return null;
  const w = rt.world;
  const ctl = stage?.controller;
  const id = held ?? sel;
  const o = id ? w.objects[id] : undefined;
  const g = id ? w.gas.objects[id] : undefined;
  const kind = id === 'hose' ? 'hose' : o?.kind ?? g?.kind;
  const v = id ? w.vessels[id] : undefined;

  const startNudge = (fn: () => void) => {
    if (nudge.current) window.clearInterval(nudge.current);
    fn();
    nudge.current = window.setInterval(fn, 90);
  };
  const stopNudge = () => {
    if (nudge.current) window.clearInterval(nudge.current);
    nudge.current = null;
  };
  const run = (r: { ok: boolean; code?: string }) => {
    if (!r.ok && r.code) {
      const k = `p4.cmd.${r.code}`;
      toast('warn', t(k) !== k ? t(k) : t('p4.cmd.FAILED'));
    }
  };
  const inspect = (target: string) => {
    dispatch({ type: 'inspect', target });
    stage?.focusObject(target, 4);
  };
  const buttons: React.ReactNode[] = [];
  const add = (key: string, node: React.ReactNode) => buttons.push(<span key={key}>{node}</span>);
  const docked = !!ctl?.pourDock && ctl.pourDock.sourceId === id;

  if (id) {
    if (held) {
      add('rel', <button className="btn primary" onClick={() => ctl?.release()}>{t('act.release')}</button>);
      if (kind && !['burner', 'bottle', 'cylinder', 'beaker', 'tube', 'capsule', 'washBottle', 'dropperBottle'].includes(kind)) {
        add('up', <HoldButton onStart={() => startNudge(() => ctl?.nudgeHeight(0.5))} onStop={stopNudge}>▲ {t('p3.act.raise')}</HoldButton>);
        add('down', <HoldButton onStart={() => startNudge(() => ctl?.nudgeHeight(-0.5))} onStop={stopNudge}>▼ {t('p3.act.lower')}</HoldButton>);
      }
      add('esc', <button className="btn ghost" onClick={() => ctl?.cancel()}>{t('p3.act.cancel')}</button>);
    } else if (o?.movable || g?.movable) {
      if (!o?.support.startsWith('disposed:')) add('grab', <button className="btn" onClick={() => { if (ctl?.beginDrag(id, true)) toast('info', t('p3.hint.keyboardHold')); document.querySelector<HTMLElement>('.canvas-host')?.focus(); }}>{t('act.grabKeyboard')}</button>);
    }
    // ── Recipientes ──
    if (v && ['BOTTLE', 'CYL10', 'CYL25', 'BEAKER100', 'TUBE', 'CAPSULE'].includes(v.kind)) {
      if (held === id) {
        add('pour', <HoldButton className={docked ? 'primary' : ''} onStart={() => ctl?.primaryDown()} onStop={() => ctl?.primaryUp()}>🫗 {t('p4.act.pour')}</HoldButton>);
        add('tl', <HoldButton label={t('p4.act.tiltLeft')} onStart={() => startNudge(() => ctl?.nudgeTilt(-1, 2))} onStop={stopNudge}>⟲</HoldButton>);
        add('tr', <HoldButton label={t('p4.act.tiltRight')} onStart={() => startNudge(() => ctl?.nudgeTilt(1, 2))} onStop={stopNudge}>⟳</HoldButton>);
        if (!docked) add('dh', <small className="hint">{t('p4.act.pourHint')}</small>);
      }
      if (['CYL10', 'CYL25', 'BEAKER100', 'TUBE'].includes(v.kind)) add('eye', <button className="btn" onClick={() => stage?.camera?.eyeLevel(id)}>👁 {t('p4.act.eyeLevel')}</button>);
      if (v.kind !== 'BOTTLE') {
        add('stir', <HoldButton onStart={() => startNudge(() => ctl?.stirSelected(0.5))} onStop={stopNudge}>🌀 {t(v.kind === 'TUBE' ? 'p4.act.shake' : 'p4.act.stir')}</HoldButton>);
        add('insp', <button className="btn" onClick={() => inspect(id)}>{t('p4.act.inspect')}</button>);
        add('wash', <button className="btn ghost" onClick={() => run(dispatch({ type: 'washVessel', id }))}>🚿 {t('p4.act.wash')}</button>);
        add('dry', <button className="btn ghost" onClick={() => run(dispatch({ type: 'dryVessel', id }))}>{t('p4.act.dry')}</button>);
      }
      if (v.kind === 'TUBE') {
        add('label', (
          <span className="slider">
            <label htmlFor="p4label">{t('p4.act.label')}</label>
            <select id="p4label" value={v.label ?? ''} onChange={(e) => dispatch({ type: 'label', id, label: e.target.value || null })}>
              <option value="">—</option>
              {TUBE_LABELS.map((l) => <option key={l} value={l}>{t(`p4.label.${l}`)}</option>)}
            </select>
          </span>
        ));
      }
      if (v.broken) add('spare', <button className="btn ghost" onClick={() => run(dispatch({ type: 'requestSpare', kind: v.kind === 'TUBE' ? 'tube' : 'cyl10' }))}>{t('p4.act.spare')}</button>);
    }
    switch (kind) {
      case 'dropperBottle': {
        const d = DROPPER_BOTTLES[id];
        if (d && w.objects[d.dropper]?.support === `cap:${id}`) add('takeD', <button className="btn" onClick={() => { if (ctl?.beginDrag(d.dropper, true)) toast('info', t('p4.hint.dropper')); }}>{t('p4.act.takeDropper')}</button>);
        break;
      }
      case 'dropper':
        if (held === id) {
          const m = ctl?.held?.magnet;
          add('drop', <HoldButton className={m ? 'primary' : ''} onStart={() => ctl?.primaryDown()} onStop={() => ctl?.primaryUp()}>{m?.mode === 'ASPIRATE' ? `💧 ${t('p4.act.aspirate')}` : `💧 ${t('p4.act.oneDrop')}`}</HoldButton>);
          add('dc', <small className="hint">{t('p4.act.dropperContent', { ml: mode === 'EVALUATION' ? '—' : liquidMl(w.vessels[id]).toFixed(2).replace('.', ',') })}</small>);
        }
        break;
      case 'tubeTongs':
      case 'crucibleTongs':
        if (held === id) {
          const holding = w.tongs[id]?.holding;
          add('clamp', <button className={`btn ${ctl?.clampReady ? 'primary' : ''}`} onClick={() => ctl?.toggleClamp()}>{holding ? t('p3.act.unclamp') : t('p3.act.clamp')}</button>);
          if (!holding) add('cr', <small className={ctl?.clampReady ? 'ok' : 'hint'}>{ctl?.clampReady ? t('p3.act.clampReady') : t('p4.act.clampAim')}</small>);
        }
        break;
      case 'nail':
      case 'alStrip':
        add('insp', <button className="btn" onClick={() => inspect(id)}>{t('p4.act.inspectMetal')}</button>);
        break;
      case 'sandpaper':
        if (held === id) add('sand', <HoldButton className="primary" onStart={() => ctl?.primaryDown()} onStop={() => ctl?.primaryUp()}>{t('p4.act.sand')}</HoldButton>);
        break;
      case 'towel':
        if (held === id) add('wipe', <button className="btn primary" onClick={() => { ctl?.primaryDown(); ctl?.primaryUp(); }}>🧻 {t('p4.act.wipe')}</button>);
        break;
      case 'phPaper':
        if (held === id) add('ph', <button className="btn primary" onClick={() => { ctl?.primaryDown(); ctl?.primaryUp(); }}>{t('p4.act.ph')}</button>);
        break;
      case 'washBottle':
        if (held === id) add('sq', <HoldButton className="primary" onStart={() => ctl?.primaryDown()} onStop={() => ctl?.primaryUp()}>💦 {t('p4.act.squeeze')}</HoldButton>);
        break;
      case 'mgRibbon':
        add('new', <button className="btn ghost" onClick={() => run(dispatch({ type: 'newRibbon' }))}>{t('p4.act.newRibbon')}</button>);
        break;
      case 'mgDish':
        add('new', <button className="btn" onClick={() => run(dispatch({ type: 'newRibbon' }))}>{t('p4.act.newRibbon')}</button>);
        break;
      case 'shield':
        add('place', <button className="btn primary" onClick={() => ctl?.placeShield()}>🛡 {w.objects.shield?.support === 'stand' ? t('p4.act.shieldRemove') : t('p4.act.shieldPlace')}</button>);
        break;
      case 'rod':
        if (w.rod.broken) add('spare', <button className="btn" onClick={() => run(dispatch({ type: 'requestSpare', kind: 'rod' }))}>{t('p4.act.spare')}</button>);
        if (w.rod.vesselId && held !== id) add('stir', <HoldButton onStart={() => startNudge(() => dispatch({ type: 'setAgitation', id: w.rod.vesselId!, tool: 'ROD', intensity: 0.55 }))} onStop={stopNudge}>🌀 {t('p4.act.stir')}</HoldButton>);
        break;
      case 'burner':
        add('needle', <ValveControl4 valve="NEEDLE" label={t('p3.act.needle')} />);
        add('air', <ValveControl4 valve="AIR" label={t('p3.act.air')} />);
        add('insp', <button className="btn" onClick={() => inspect('burner')}>{t('p3.act.inspectBurner')}</button>);
        add('hose', <button className="btn" onClick={() => dispatch({ type: 'gas', cmd: { type: 'connectHose', connected: !w.gas.burner.hoseConnected } })}>{w.gas.burner.hoseConnected ? t('p3.act.disconnect') : t('p3.act.connect')}</button>);
        break;
      case 'gasTap':
        add('table', <ValveControl4 valve="TABLE" label={t('p3.act.table')} />);
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
        add('loc', <button className="btn" onClick={() => inspect(id === 'co_detector' ? 'co_detector' : id)}>{t('p3.act.locate')}</button>);
        break;
    }
    if (o || g || id === 'hose') add('focus', <button className="btn ghost" onClick={() => stage?.focusObject(id, 4)}>{t('act.inspect')}</button>);
  }

  const desc = id ? describeObject(w, id, mode) : '';
  return (
    <section id="actions" className={`actions${demo ? ' demo-locked' : ''}`} aria-label={t('p4.act.title')} aria-disabled={demo || undefined}>
      <div className="desc" id="action-desc" aria-live="polite">
        {id ? <><strong>{p4NameOf(w, id)}</strong>{desc ? ` — ${desc}` : ''}</> : t('p4.act.none')}
      </div>
      {buttons.length > 0 && <div className="row">{buttons}</div>}
    </section>
  );
}
