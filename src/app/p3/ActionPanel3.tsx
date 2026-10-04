import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useP3 } from './store';
import { describeObject, p3NameOf, valveWords } from './describe';
import { HoldButton } from './ui';
import type { ValveId } from '../../simulation/flame-world/commands';
import { activeEmitters, emitterSpectrum, flameBaseSpectrum } from '../../simulation/flame-world/world';
import { addScaled, applyFilter, colorRegion, emptySpectrum } from '../../simulation/spectroscopy/spectrum';
import { CTX3 } from '../../practices/practice-03';
import { holderSlotPose, SOLUTION_ROWS, type SolutionRow } from '../../practices/practice-03/definition';
import { SpectrumChart } from './SpectrumChart';

/** Control continuo de una válvula: posición física en palabras (siempre) y porcentaje (salvo en evaluación). */
function ValveControl({ valve, label }: { valve: ValveId; label: string }) {
  const { t } = useTranslation();
  const rt = useP3((s) => s.runtime);
  const stage = useP3((s) => s.stage);
  const mode = useP3((s) => s.settings.mode);
  if (!rt) return null;
  const b = rt.world.burner;
  const v = valve === 'TABLE' ? b.tableGasValve : valve === 'NEEDLE' ? b.needleGasValve : b.airCollar;
  const set = (x: number) => {
    stage?.controller.setValve(valve, x);
    // Redibujo inmediato: el control refleja la nueva posición sin esperar al refresco periódico.
    useP3.getState().bump();
  };
  const id = `valve-${valve}`;
  return (
    <span className="slider">
      <label htmlFor={id}>{label}</label>
      <HoldButton label={t('p3.act.valveLess', { v: label })} onStart={() => set(v - 0.02)} onStop={() => undefined}>−</HoldButton>
      <input id={id} type="range" min={0} max={1} step={0.01} value={v} aria-valuetext={valveWords(v)} onChange={(e) => set(Number(e.target.value))} />
      <HoldButton label={t('p3.act.valveMore', { v: label })} onStart={() => set(v + 0.02)} onStop={() => undefined}>+</HoldButton>
      <span className="readout">{mode === 'EVALUATION' ? valveWords(v) : `${Math.round(v * 100)} %`}</span>
      {mode !== 'EVALUATION' && <small>{valveWords(v)}</small>}
      <button className="btn small ghost" onClick={() => set(0)}>{t('p3.act.close')}</button>
    </span>
  );
}

export function ActionPanel3() {
  const { t } = useTranslation();
  useP3((s) => s.version);
  const rt = useP3((s) => s.runtime);
  const stage = useP3((s) => s.stage);
  const sel = useP3((s) => s.selected);
  const held = useP3((s) => s.held);
  const dispatch = useP3((s) => s.dispatch);
  const toast = useP3((s) => s.toast);
  const nb = useP3((s) => s.notebook);
  const colorAid = useP3((s) => s.settings.colorAid);
  const nudge = useRef<number | null>(null);
  const demo = useP3((s) => !!s.demo);
  if (!rt) return null;
  const w = rt.world;
  const ctl = stage?.controller;
  const id = held ?? sel;
  const o = id ? w.objects[id] : undefined;
  const kind = id === 'hose' ? 'hose' : o?.kind;

  const startNudge = (dz: number) => {
    if (nudge.current) window.clearInterval(nudge.current);
    ctl?.nudgeHeight(dz);
    nudge.current = window.setInterval(() => ctl?.nudgeHeight(dz), 90);
  };
  const stopNudge = () => {
    if (nudge.current) window.clearInterval(nudge.current);
    nudge.current = null;
  };
  const inspect = (target: string) => {
    dispatch({ type: 'inspect', target });
    stage?.focusObject(target, 4);
  };
  const buttons: React.ReactNode[] = [];
  const add = (key: string, node: React.ReactNode) => buttons.push(<span key={key}>{node}</span>);

  if (id) {
    if (held) {
      add('rel', <button className="btn primary" onClick={() => ctl?.release()}>{t('act.release')}</button>);
      if (kind !== 'burner' && kind !== 'atomizer') {
        add('up', <HoldButton onStart={() => startNudge(0.5)} onStop={stopNudge}>▲ {t('p3.act.raise')}</HoldButton>);
        add('down', <HoldButton onStart={() => startNudge(-0.5)} onStop={stopNudge}>▼ {t('p3.act.lower')}</HoldButton>);
      }
      add('esc', <button className="btn ghost" onClick={() => ctl?.cancel()}>{t('p3.act.cancel')}</button>);
      if (kind === 'loop' || kind === 'atomizer') add('glassG', <button className="btn" aria-pressed={w.objects.glass?.support === 'stand'} onClick={() => ctl?.alignGlass()}>🔵 {t('p3.act.glassToggle')}</button>);
    } else if (o?.movable) {
      add('grab', <button className="btn" onClick={() => { if (ctl?.beginDrag(id, true)) toast('info', t('p3.hint.keyboardHold')); document.querySelector<HTMLElement>('.canvas-host')?.focus(); }}>{t('act.grabKeyboard')}</button>);
    }
    switch (kind) {
      case 'burner':
        add('needle', <ValveControl valve="NEEDLE" label={t('p3.act.needle')} />);
        add('air', <ValveControl valve="AIR" label={t('p3.act.air')} />);
        add('insp', <button className="btn" onClick={() => inspect('burner')}>{t('p3.act.inspectBurner')}</button>);
        add('hose', <button className="btn" onClick={() => dispatch({ type: 'connectHose', connected: !w.burner.hoseConnected })}>{w.burner.hoseConnected ? t('p3.act.disconnect') : t('p3.act.connect')}</button>);
        break;
      case 'gasTap':
        add('table', <ValveControl valve="TABLE" label={t('p3.act.table')} />);
        break;
      case 'hose':
        add('insp', <button className="btn" onClick={() => inspect('hose')}>{t('p3.act.inspectHose')}</button>);
        add('conn', <button className="btn" onClick={() => dispatch({ type: 'connectHose', connected: !w.burner.hoseConnected })}>{w.burner.hoseConnected ? t('p3.act.disconnect') : t('p3.act.connect')}</button>);
        add('soap', <button className="btn" onClick={() => dispatch({ type: 'soapTest' })}>🫧 {t('p3.act.soap')}</button>);
        add('repl', <button className="btn ghost" onClick={() => { const r = dispatch({ type: 'replaceHose' }); if (!r.ok && r.code) toast('warn', t(`p3.cmd.${r.code}`)); }}>{t('p3.act.replaceHose')}</button>);
        add('lift', <HoldButton onStart={() => dispatch({ type: 'setHoseMid', ...w.hose.mid, z: w.hose.mid.z + 1 })} onStop={() => undefined}>▲</HoldButton>);
        add('drop', <HoldButton onStart={() => dispatch({ type: 'setHoseMid', ...w.hose.mid, z: w.hose.mid.z - 1 })} onStop={() => undefined}>▼</HoldButton>);
        break;
      case 'lighter':
        if (held) add('spark', <HoldButton className="primary" onStart={() => ctl?.primaryDown()} onStop={() => ctl?.primaryUp()}>🔥 {t('p3.act.spark')}</HoldButton>);
        break;
      case 'tongs':
        if (held) add('clamp', <button className={`btn ${ctl?.clampReady ? 'primary' : ''}`} onClick={() => ctl?.toggleClamp()}>{w.tongs.tongs?.holding ? t('p3.act.unclamp') : t('p3.act.clamp')}</button>);
        if (held && !w.tongs.tongs?.holding) add('cr', <small className={ctl?.clampReady ? 'ok' : 'hint'}>{ctl?.clampReady ? t('p3.act.clampReady') : t('p3.act.clampAim')}</small>);
        break;
      case 'capsule':
        add('wipe', <button className="btn" onClick={() => dispatch({ type: 'wipeCapsule' })}>🧽 {t('p3.act.wipe')}</button>);
        break;
      case 'cloth':
        if (held) add('wipe', <button className="btn" onClick={() => ctl?.primaryDown()}>🧽 {t('p3.act.wipe')}</button>);
        break;
      case 'soapBottle':
        add('soap', <button className="btn" onClick={() => dispatch({ type: 'soapTest' })}>🫧 {t('p3.act.soap')}</button>);
        break;
      case 'loop': {
        const l = w.loops[id];
        const slot = l?.assignedSolutionId ? SOLUTION_ROWS.indexOf(l.assignedSolutionId as SolutionRow) : 0;
        if (!held) add('home', <button className="btn" onClick={() => dispatch({ type: 'setPose', id, pose: holderSlotPose(Math.max(0, slot)), support: `holder:${Math.max(0, slot)}` })}>{t('p3.act.toHolder')}</button>);
        add('spare', <button className="btn ghost" onClick={() => { const r = dispatch({ type: 'requestSpareLoop', solutionId: l?.assignedSolutionId ?? 'shared' }); if (r.id) useP3.getState().select(r.id); }}>{t('p3.act.spareLoop')}</button>);
        // Apoyo de visión cromática: espectro y región SOLO después de registrar la observación (§24).
        if (colorAid && l?.lastContact && nb.table33[l.lastContact as SolutionRow]?.noFilter && l.emission > 0) {
          const base = flameBaseSpectrum(w, CTX3);
          const s = emptySpectrum();
          addScaled(s, base, 1);
          addScaled(s, emitterSpectrum(l.emissionRates, CTX3, w.params.emissionScale), 1);
          const em = activeEmitters(w, CTX3).find((e) => e.id === id);
          add('spec', (
            <span className="spec-aid">
              <SpectrumChart raw={s} filtered={applyFilter(s, CTX3.cobalt, w.glass.cleanliness)} />
              {em && <strong>{t('p3.spec.region', { r: t(`p3.color.${colorRegion(em.noFilter.rgb)}`) })}</strong>}
            </span>
          ));
        }
        break;
      }
      case 'tube':
        add('insp', <button className="btn" onClick={() => inspect(id)}>{t('p3.act.observeSolution')}</button>);
        break;
      case 'glass':
        add('align', <button className="btn primary" onClick={() => ctl?.alignGlass()}>🔵 {t('p3.act.alignGlass')}</button>);
        add('clean', <button className="btn ghost" onClick={() => dispatch({ type: 'cleanGlass' })}>{t('p3.act.cleanGlass')}</button>);
        add('al', <small>{t('p3.act.alignment', { p: Math.round(w.glass.alignment * 100) })}</small>);
        break;
      case 'hclVial':
        add('hcl', <button className="btn" onClick={() => { const r = dispatch({ type: 'setHcl', open: !w.hcl.open }); if (!r.ok && r.code) toast('warn', t(`p3.cmd.${r.code}`)); }}>{w.hcl.open ? t('p3.act.hclClose') : t('p3.act.hclOpen')}</button>);
        break;
      case 'extractor':
        add('ext', <button className="btn" aria-pressed={w.room.extractionOn} onClick={() => dispatch({ type: 'setExtraction', on: !w.room.extractionOn })}>🌀 {w.room.extractionOn ? t('p3.act.extractOff') : t('p3.act.extractOn')}</button>);
        add('loc', <button className="btn ghost" onClick={() => inspect('extractor')}>{t('p3.act.locate')}</button>);
        break;
      case 'emergencyStop':
        add('stop', <button className="btn danger" onClick={() => dispatch({ type: 'emergencyShutoff' })}>⛔ {t('p3.safety.shutoff')}</button>);
        add('rest', <button className="btn ghost" onClick={() => { const r = dispatch({ type: 'restoreSupply' }); if (!r.ok && r.code) toast('warn', t(`p3.cmd.${r.code}`)); }}>{t('p3.act.restore')}</button>);
        add('loc', <button className="btn ghost" onClick={() => inspect('estop')}>{t('p3.act.locate')}</button>);
        break;
      case 'extinguisher':
        add('loc', <button className="btn" onClick={() => inspect('extinguisher')}>{t('p3.act.locate')}</button>);
        add('use', <button className="btn ghost" onClick={() => dispatch({ type: 'useExtinguisher' })}>{t('p3.act.extinguisher')}</button>);
        break;
      case 'blanket':
        add('loc', <button className="btn" onClick={() => inspect('blanket')}>{t('p3.act.locate')}</button>);
        add('use', <button className="btn ghost" onClick={() => dispatch({ type: 'useBlanket' })}>{t('p3.act.blanket')}</button>);
        break;
      case 'coDetector':
        add('loc', <button className="btn" onClick={() => inspect('co_detector')}>{t('p3.act.locate')}</button>);
        break;
      case 'atomizer':
        if (held) {
          const a = w.atomizers[id];
          add('l', <HoldButton onStart={() => dispatch({ type: 'setAtomizerYaw', id, yawRad: (a?.yawRad ?? 0) + 0.1 })} onStop={() => undefined}>⟲</HoldButton>);
          add('r', <HoldButton onStart={() => dispatch({ type: 'setAtomizerYaw', id, yawRad: (a?.yawRad ?? 0) - 0.1 })} onStop={() => undefined}>⟳</HoldButton>);
          add('spray', <button className="btn primary" onClick={() => { ctl?.primaryDown(); ctl?.primaryUp(); }}>💨 {t('p3.act.spray')}</button>);
        }
        break;
    }
    if (o || id === 'hose') add('focus', <button className="btn ghost" onClick={() => stage?.focusObject(id, 4)}>{t('act.inspect')}</button>);
  }

  const desc = id ? describeObject(w, id) : '';
  return (
    <section id="actions" className={`actions${demo ? ' demo-locked' : ''}`} aria-label={t('p3.act.title')} aria-disabled={demo || undefined}>
      <div className="desc" id="action-desc" aria-live="polite">
        {id ? <><strong>{p3NameOf(w, id)}</strong>{desc ? ` — ${desc}` : ''}</> : t('p3.act.none')}
      </div>
      {buttons.length > 0 && <div className="row">{buttons}</div>}
    </section>
  );
}
