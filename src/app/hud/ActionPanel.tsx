import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useLab } from '../store';
import { describeObject, nameOf } from '../describe';
import { balanceReading } from '../../simulation/world/world';
import { liquidVolumeMl } from '../../simulation/solutions/mixture';
import { SUBSTANCES } from '../../practices/practice-02/substances';
import { VESSEL_DIM } from '../../engine/physics/dimensions';
import { SPARE_KINDS, type SpareKind } from '../../simulation/world/commands';

/** Botón de acción continua mientras se mantiene pulsado (ratón, táctil o teclado). */
function HoldButton(props: { onStart: () => void; onStop: () => void; children: React.ReactNode; className?: string; disabled?: boolean }) {
  const active = useRef(false);
  const start = () => {
    if (active.current || props.disabled) return;
    active.current = true;
    props.onStart();
  };
  const stop = () => {
    if (!active.current) return;
    active.current = false;
    props.onStop();
  };
  useEffect(() => () => stop(), []);
  return (
    <button
      className={`btn ${props.className ?? ''}`}
      disabled={props.disabled}
      onPointerDown={(e) => { e.preventDefault(); (e.target as HTMLElement).setPointerCapture?.(e.pointerId); start(); }}
      onPointerUp={stop}
      onPointerCancel={stop}
      onKeyDown={(e) => { if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) { e.preventDefault(); start(); } }}
      onKeyUp={(e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); stop(); } }}
      onBlur={stop}
    >
      {props.children}
    </button>
  );
}

export function ActionPanel() {
  const { t } = useTranslation();
  useLab((s) => s.version);
  const rt = useLab((s) => s.runtime);
  const stage = useLab((s) => s.stage);
  const sel = useLab((s) => s.selected);
  const held = useLab((s) => s.held);
  const dispatch = useLab((s) => s.dispatch);
  const setModal = useLab((s) => s.setModal);
  const levelView = useLab((s) => s.levelView);
  const toast = useLab((s) => s.toast);
  const tiltTimer = useRef<number | null>(null);
  const demo = useLab((s) => !!s.demo);

  if (!rt) return null;
  const w = rt.world;
  const ctl = stage?.controller;
  const id = held ?? sel;
  const v = id ? w.vessels[id] : undefined;
  const p = id ? w.props[id] : undefined;

  const tiltStart = (dir: number) => {
    if (tiltTimer.current) window.clearInterval(tiltTimer.current);
    tiltTimer.current = window.setInterval(() => ctl?.nudgeTilt(dir, 4), 80);
  };
  const tiltStop = () => {
    if (tiltTimer.current) window.clearInterval(tiltTimer.current);
    tiltTimer.current = null;
  };
  /** Material de reposición del estante; queda registrado en el intento. */
  const requestSpare = (kind: SpareKind) => {
    const r = dispatch({ type: 'requestSpare', kind });
    if (r.ok && r.id) {
      useLab.getState().select(r.id);
      stage?.focusObject(r.id);
    } else if (r.code) toast('warn', t(`cmd.${r.code}`));
  };
  const agitate = (on: boolean) => {
    if (!id) return;
    if (id === 'rod' && w.devices.rod.vesselId) {
      dispatch({ type: 'setAgitation', vesselId: w.devices.rod.vesselId, intensity: on ? 0.6 : 0, tool: on ? 'ROD' : 'NONE' });
    } else if (v) {
      dispatch({ type: 'setAgitation', vesselId: v.id, intensity: on ? 0.6 : 0, tool: on ? (v.type === 'TEST_TUBE' ? 'SHAKE' : 'SWIRL') : 'NONE' });
    }
  };

  const buttons: React.ReactNode[] = [];
  const add = (key: string, node: React.ReactNode) => buttons.push(<span key={key}>{node}</span>);

  if (id) {
    const tiltable = v ? VESSEL_DIM[v.type].tiltable : false;
    if (ctl?.held) {
      add('release', <button className="btn primary" onClick={() => ctl.release()}>{t('act.release')}</button>);
      if (tiltable) {
        add('tl', <HoldButton onStart={() => tiltStart(-1)} onStop={tiltStop}>{t('act.tiltLeft')}</HoldButton>);
        add('tr', <HoldButton onStart={() => tiltStart(1)} onStop={tiltStop}>{t('act.tiltRight')}</HoldButton>);
        // Acoplado a un receptor: verter manteniendo pulsado (equivale al clic derecho / P).
        add('pour', <HoldButton onStart={() => ctl.pourButtonDown()} onStop={() => ctl.secondaryUp()}>🫗 {t('act.pourHold')}</HoldButton>);
      }
    } else if (!(p && (p.kind === 'tray' || p.kind === 'tongs')) && v?.integrity !== 0 && !(p?.kind === 'rod' && w.devices.rod.integrity === 0)) {
      add('grab', <button className="btn" onClick={() => { if (ctl?.beginDrag(id, true)) toast('info', t('hint.keyboardHold')); document.querySelector<HTMLElement>('.canvas-host')?.focus(); }}>{t('act.grabKeyboard')}</button>);
    }
    if (v && v.integrity === 1 && ['TEST_TUBE', 'BEAKER', 'GRADUATED_CYLINDER', 'PORCELAIN_DISH', 'VIAL'].includes(v.type)) {
      add('agit', <HoldButton onStart={() => agitate(true)} onStop={() => agitate(false)}>{t('act.agitate')}</HoldButton>);
    }
    if (v || p) add('insp', <button className="btn" onClick={() => stage?.focusObject(id, 4)}>{t('act.inspect')}</button>);

    if (v?.type === 'TEST_TUBE') {
      add('label', <button className="btn" onClick={() => setModal({ kind: 'label', id: v.id })}>{t('act.label')}</button>);
      add('fan', <button className="btn" onClick={() => ctl?.fan(v.id)}>👋 {t('act.fan')}</button>);
      add('sniff', <button className="btn ghost" onClick={() => ctl?.sniff(v.id)}>{t('act.sniff')}</button>);
    }
    if (v?.type === 'GRADUATED_CYLINDER') {
      // Paralaje real: depende de la altura de la cámara respecto del menisco (§7).
      const lv = liquidVolumeMl(v.mix, SUBSTANCES);
      const bias = levelView ? 0 : lv > 0.05 ? stage?.parallaxMl(v.id) ?? 0.2 : 0;
      const reading = Math.max(0, Math.round(lv / 0.2) * 0.2 + bias);
      add('men', <span className="slider">{t('act.meniscus')}: <span className="readout">{reading.toFixed(1).replace('.', ',')} mL</span> <small>{bias === 0 ? t('act.meniscusLevel') : t('act.meniscusParallax')}</small></span>);
      if (!levelView) add('eye', <button className="btn" onClick={() => useLab.getState().setLevelView(true)}>👁 {t('hud.level')}</button>);
    }
    if (v?.type === 'PORCELAIN_DISH' && v.cover !== 'NONE') {
      add('uncover', <button className="btn" onClick={() => dispatch({ type: 'cover', vesselId: v.id, mode: 'NONE' })}>{t('act.uncover')}</button>);
    }
    if (v?.type === 'FILTER_PAPER') {
      add('fold', <button className="btn" disabled={v.support === 'funnel'} onClick={() => setModal({ kind: 'fold', id: v.id })}>{t('act.fold')}</button>);
      add('tear', <button className="btn ghost" onClick={() => dispatch({ type: 'tearPaper', paperId: v.id })}>{t('act.tear')}</button>);
    }
    if (v?.type === 'FUNNEL') {
      const drip = (v.funnel?.dripRateMlPerS ?? 0) > 0.003;
      add('drip', <span>{t('act.drip')}: <strong>{drip ? t('act.dripOn') : t('act.dripOff')}</strong></span>);
    }
    if (v?.type === 'WASH_BOTTLE') {
      add('sq', <HoldButton className="primary" onStart={() => ctl?.startSqueeze(false)} onStop={() => ctl?.stopSqueeze()}>💧 {t('act.squeeze')}</HoldButton>);
      add('sqs', <HoldButton onStart={() => ctl?.startSqueeze(true)} onStop={() => ctl?.stopSqueeze()}>{t('act.squeezeSlow')}</HoldButton>);
    }
    if (v?.type === 'DROPPER') {
      add('drop', <button className="btn primary" onClick={() => ctl?.dropFrom(v.id)}>💧 {t('act.drop')}</button>);
    }
    if (v?.type === 'SPATULA') {
      add('clean', <button className="btn" onClick={() => ctl?.cleanTool(v.id)}>{t('act.clean')}</button>);
    }
    if (v && v.integrity === 0) {
      if (v.support !== 'glass_waste') add('sweep', <button className="btn" onClick={() => dispatch({ type: 'sweepShards', id: v.id })}>🧹 {t('act.sweep')}</button>);
      if ((SPARE_KINDS as string[]).includes(v.type)) add('spare', <button className="btn primary" onClick={() => requestSpare(v.type as SpareKind)}>{t('act.replace')}</button>);
    }
    if (p?.kind === 'hotplate') {
      const hp = w.devices.hotplate;
      add('pw', (
        <span className="slider">
          <label htmlFor="power">{t('act.power')}</label>
          <input id="power" type="range" min={0} max={100} step={5} value={hp.powerPct} onChange={(e) => dispatch({ type: 'setHotplatePower', pct: Number(e.target.value) })} />
          <span className="readout">{hp.powerPct} %</span>
          <span>{t('act.plate')}: <strong className={hp.plateTempC > 50 ? 'bad' : 'ok'}>{hp.plateTempC > 50 ? t('act.plateHot') : t('act.plateCool')}</strong></span>
        </span>
      ));
    }
    if (p?.kind === 'balance') {
      const r = balanceReading(w);
      add('bal', <span className="slider">{t('act.balance')}: <span className="readout">{r === null ? 'OL' : `${r.toFixed(2).replace('.', ',')} g`}</span></span>);
      add('tare', <button className="btn" onClick={() => ctl?.tare()}>{t('act.tare')}</button>);
    }
    if (p?.kind === 'rod') {
      if (w.devices.rod.integrity === 0) {
        add('sweep', <button className="btn" onClick={() => dispatch({ type: 'sweepShards', id: 'rod' })}>🧹 {t('act.sweep')}</button>);
        add('spare', <button className="btn primary" onClick={() => requestSpare('ROD')}>{t('act.replace')}</button>);
      }
      if (w.devices.rod.vesselId) {
        add('agit', <HoldButton onStart={() => agitate(true)} onStop={() => agitate(false)}>{t('act.agitate')}</HoldButton>);
        add('scrape', <button className="btn" onClick={() => ctl?.scrape(w.devices.rod.vesselId!)}>{t('act.scrape')}</button>);
        add('rmrod', <button className="btn ghost" onClick={() => { dispatch({ type: 'insertRod', vesselId: null }); const pr = w.props.rod; stage?.controller.placeOnBench('rod', true, pr.pose.x + 6, pr.pose.y - 6); }}>{t('act.removeRod')}</button>);
      }
    }
    if (p?.kind === 'probe' && w.devices.probe.vesselId) {
      const vid = w.devices.probe.vesselId;
      const bottom = w.devices.probe.touchingBottom;
      add('pb', <button className="btn" onClick={() => dispatch({ type: 'insertProbe', vesselId: vid, touchingBottom: !bottom })}>{bottom ? t('act.probeUp') : t('act.probeBottom')}</button>);
      add('rmp', <button className="btn ghost" onClick={() => { dispatch({ type: 'insertProbe', vesselId: null, touchingBottom: false }); const pr = w.props.probe; stage?.controller.placeOnBench('probe', true, pr.pose.x + 6, pr.pose.y - 6); }}>{t('act.removeProbe')}</button>);
    }
    if (p?.kind === 'stand') {
      const h = w.devices.stand.ringHeightCm;
      add('ring', (
        <span className="slider">
          <label htmlFor="ring">{t('act.ring')}</label>
          <input id="ring" type="range" min={6} max={30} step={0.5} value={h} onChange={(e) => dispatch({ type: 'setRingHeight', cm: Number(e.target.value) })} />
          <span className="readout">{h.toFixed(1)} cm</span>
        </span>
      ));
    }
    if (p?.kind === 'tongs') {
      add('tg', <button className="btn" aria-pressed={w.devices.hand.mode === 'TONGS'} onClick={() => ctl?.toggleTongs()}>{w.devices.hand.mode === 'TONGS' ? t('hud.hand') : t('hud.tongs')}</button>);
    }
  }
  if (w.bench.spillMl > 0.05) add('spill', <button className="btn" onClick={() => dispatch({ type: 'cleanSpill' })}>🧻 {t('act.cleanSpill')}</button>);

  return (
    <section id="actions" className={`actions${demo ? ' demo-locked' : ''}`} aria-label="Acciones" aria-disabled={demo || undefined}>
      <div className="desc" id="action-desc" aria-live="polite">
        {id ? <><strong>{nameOf(w, id)}</strong> — {describeObject(w, id).split(': ').slice(1).join(': ')}</> : t('act.none')}
      </div>
      {buttons.length > 0 && <div className="row">{buttons}</div>}
    </section>
  );
}
