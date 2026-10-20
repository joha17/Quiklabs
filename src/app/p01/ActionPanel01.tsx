import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useP01 } from './store';
import { describeObject, p01NameOf } from './describe';
import { HoldButton } from './ui';
import { POURABLE } from '../../engine/density/controller';
import type { P01Command } from '../../simulation/density-world/commands';

/**
 * Panel de acciones de la Práctica 1 (§14.1): alternativa accesible a cada gesto. Ejecuta EXACTAMENTE los mismos
 * comandos del dominio que el controlador; no es un atajo científico (no hay «verter 25 mL» ni «completar etapa»).
 */
export function ActionPanel01() {
  const { t } = useTranslation();
  useP01((s) => s.version);
  const rt = useP01((s) => s.runtime);
  const stage = useP01((s) => s.stage);
  const sel = useP01((s) => s.selected);
  const held = useP01((s) => s.held);
  const dispatch = useP01((s) => s.dispatch);
  const toast = useP01((s) => s.toast);
  const mode = useP01((s) => s.settings.mode);
  const demo = useP01((s) => !!s.demo);
  const nudge = useRef<number | null>(null);
  const [cal, setCal] = useState({ target: 'diameter' as 'empty' | 'diameter' | 'height', orientationDeg: 0, angleDeg: 0, force01: 0.4 });
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
      const k = `p01.cmd.${r.code}`;
      toast('warn', t(k) !== k ? t(k) : t('p01.cmd.FAILED'));
    }
    return r;
  };
  const D = (c: P01Command) => run(dispatch(c));
  const inspect = (target: string) => {
    D({ type: 'inspect', target });
    stage?.focusObject(target, 4);
  };
  const buttons: React.ReactNode[] = [];
  const add = (key: string, node: React.ReactNode) => buttons.push(<span key={key}>{node}</span>);
  const pourHold = (key: string, label: string, src: string, target: string | null) =>
    add(key, <HoldButton onStart={() => ctl?.pourDirect(src, target)} onStop={() => D({ type: 'stopPour', sourceId: src })}>🫗 {label}</HoldButton>);
  const dropsHold = (key: string, target: string, n = 1) =>
    add(key, <HoldButton onStart={() => startNudge(() => D({ type: 'squeeze', targetId: target, drops: n }), 250)} onStop={stopNudge}>💧 {n === 1 ? t('p01.act.drop') : t('p01.act.squirt')}</HoldButton>);
  const eye = (target: 'cylinder50' | 'pipette25' | 'balance' | 'thermometer01' | 'caliper01') => add(`eye-${target}`, <button className="btn ghost" onClick={() => stage?.camera?.eyeLevel(target)}>👁 {t('p01.act.eyeLevel')}</button>);
  const toPan = (oid: string) => add('pan', w.objects[oid].support === 'pan'
    ? <button className="btn" onClick={() => run(ctl?.moveTo(oid, 'bench'))}>{t('p01.act.offPan')}</button>
    : <button className="btn" onClick={() => run(ctl?.moveTo(oid, 'pan'))}>⚖ {t('p01.act.toPan')}</button>);
  const pip = w.pipette;
  const pipetteControls = () => {
    add('asp', <HoldButton onStart={() => D({ type: 'setAspirate', suction01: 0.6 })} onStop={() => D({ type: 'setAspirate', suction01: 0 })}>⬆ {t('p01.act.aspirate')}</HoldButton>);
    add('rel', <HoldButton onStart={() => D({ type: 'setPipetteRelease', release01: 1 })} onStop={() => D({ type: 'setPipetteRelease', release01: 0 })}>⬇ {t('p01.act.release')}</HoldButton>);
    add('adj', <button className="btn" onClick={() => ctl?.adjustMeniscus()}>{t('p01.act.adjust')}</button>);
    eye('pipette25');
    add('wipe', <button className="btn" onClick={() => D({ type: 'wipeTip', method: 'outside' })}>🧻 {t('p01.act.wipeOutside')}</button>);
    add('wick', <button className="btn ghost" onClick={() => D({ type: 'wipeTip', method: 'orifice' })}>{t('p01.act.wipeOrifice')}</button>);
    add('read', <button className="btn ghost" onClick={() => ctl?.readVolume('pipette25')}>{t('p01.act.readPipette')}</button>);
    add('blow', <button className="btn ghost" onClick={() => D({ type: 'blowOut' })}>{t('p01.act.blow')}</button>);
  };

  if (id && o) {
    if (held) {
      add('relH', <button className="btn primary" onClick={() => ctl?.release()}>{t('act.release')}</button>);
      add('up', <HoldButton onStart={() => startNudge(() => ctl?.nudgeHeight(0.6))} onStop={stopNudge}>▲ {t('p3.act.raise')}</HoldButton>);
      add('down', <HoldButton onStart={() => startNudge(() => ctl?.nudgeHeight(-0.6))} onStop={stopNudge}>▼ {t('p3.act.lower')}</HoldButton>);
      if (POURABLE.has(id)) {
        add('tilt', <HoldButton className={ctl?.dockTarget ? 'primary' : ''} onStart={() => ctl?.primaryDown()} onStop={() => ctl?.primaryUp()}>🫗 {t('p01.act.tilt')}</HoldButton>);
        add('dock', <small className="hint">{ctl?.dockTarget ? t('p01.act.over', { o: p01NameOf(w, ctl.dockTarget) }) : t('p01.act.noTarget')}</small>);
      }
      if (kind === 'washBottle') {
        add('drop', <HoldButton className="primary" onStart={() => ctl?.primaryDown()} onStop={() => ctl?.primaryUp()}>💧 {t('p01.act.drop')}</HoldButton>);
        add('dock', <small className="hint">{ctl?.dockTarget ? t('p01.act.over', { o: p01NameOf(w, ctl.dockTarget) }) : t('p01.act.noTarget')}</small>);
      }
      if (kind === 'pipette') {
        add('tiltL', <button className="btn small" aria-label={t('p01.act.tiltLeft')} onClick={() => ctl?.tiltHeld(-0.08)}>⟲</button>);
        add('tiltR', <button className="btn small" aria-label={t('p01.act.tiltRight')} onClick={() => ctl?.tiltHeld(0.08)}>⟳</button>);
        add('tip', <small className="hint">{w.fluids[o.support] ? t('p01.act.tipIn', { o: p01NameOf(w, o.support) }) : ctl?.dockTarget ? t('p01.act.lowerInto', { o: p01NameOf(w, ctl.dockTarget) }) : t('p01.act.tipAir')}</small>);
      }
      if (kind === 'weighBoat' && w.nails.some((n) => n.where === 'weighBoat01')) {
        add('n1', <button className="btn primary" onClick={() => ctl?.nailsIntoCylinder(true)}>{t('p01.act.nailOne')}</button>);
        add('nAll', <button className="btn ghost" onClick={() => ctl?.nailsIntoCylinder(false)}>{t('p01.act.nailsAll')}</button>);
      }
      add('esc', <button className="btn ghost" onClick={() => ctl?.cancel()}>{t('p3.act.cancel')}</button>);
    } else if (o.movable) {
      add('grab', <button className="btn" onClick={() => { if (ctl?.beginDrag(id, true)) toast('info', t('p3.hint.keyboardHold')); document.querySelector<HTMLElement>('.canvas-host')?.focus(); }}>{t('act.grabKeyboard')}</button>);
    }

    switch (kind) {
      case 'balance': {
        const b = w.balance;
        add('power', <button className="btn" aria-pressed={b.powered} onClick={() => D({ type: 'powerBalance', on: !b.powered })}>⏻ {b.powered ? t('p01.act.powerOff') : t('p01.act.powerOn')}</button>);
        add('level', <button className="btn ghost" onClick={() => D({ type: 'levelBalance' })}>{t('p01.act.level')}</button>);
        add('tare', <button className="btn" onClick={() => ctl?.tare()}>→0← {t('p01.act.tare')}</button>);
        add('readB', <button className={`btn ${b.powered && b.stable ? 'primary' : ''}`} onClick={() => ctl?.readBalance()}>{t('p01.act.read')}</button>);
        eye('balance');
        break;
      }
      case 'pipette':
        add('fill', <button className="btn" aria-pressed={pip.fillerAttached} onClick={() => D({ type: 'attachFiller', on: !pip.fillerAttached })}>{pip.fillerAttached ? t('p01.act.fillerOff') : t('p01.act.fillerOn')}</button>);
        if (!held) {
          for (const dst of ['waterRoom01', 'waterCold01', 'erlenmeyer150', 'waste01']) add(`to-${dst}`, <button className="btn ghost" onClick={() => run(ctl?.moveTo('pipette25', dst))}>{t('p01.act.pipetteTo', { o: p01NameOf(w, dst) })}</button>);
        }
        pipetteControls();
        add('rinse', <button className="btn ghost" onClick={() => D({ type: 'rinsePipette' })}>{t('p01.act.rinse')}</button>);
        break;
      case 'filler':
        add('att', <button className="btn" aria-pressed={pip.fillerAttached} onClick={() => D({ type: 'attachFiller', on: !pip.fillerAttached })}>{pip.fillerAttached ? t('p01.act.fillerOff') : t('p01.act.fillerOn')}</button>);
        if (pip.fillerContaminated) add('clean', <button className="btn danger" onClick={() => D({ type: 'cleanObject', objectId: 'pipetteFiller', action: 'clean' })}>🧽 {t('p01.safety.cleanFiller')}</button>);
        break;
      case 'erlenmeyer':
        if (!held) toPan(id);
        if (id === 'erlenmeyer150') {
          add('empty', <button className="btn ghost" onClick={() => D({ type: 'emptyInto', sourceId: id, targetId: 'waste01' })}>{t('p01.act.empty')}</button>);
          add('dry', <button className="btn ghost" onClick={() => D({ type: 'cleanObject', objectId: id, action: 'dry' })}>{t('p01.act.dry')}</button>);
          add('readE', <button className="btn ghost" onClick={() => ctl?.readVolume('erlenmeyer150')}>{t('p01.act.readErlen')}</button>);
        }
        break;
      case 'reservoir':
        if (id === 'waterCold01' && !held) add('bath', o.support === 'iceBath01'
          ? <button className="btn" onClick={() => run(ctl?.moveTo(id, 'bench'))}>{t('p01.act.outOfBath')}</button>
          : <button className="btn primary" onClick={() => run(ctl?.moveTo(id, 'bath'))}>🧊 {t('p01.act.intoBath')}</button>);
        pourHold('toCyl', t('p01.act.pourInto', { o: p01NameOf(w, 'cylinder50') }), id, 'cylinder50');
        break;
      case 'cylinder':
        pourHold('fill', t('p01.act.fillFrom', { o: p01NameOf(w, 'waterRoom01') }), 'waterRoom01', 'cylinder50');
        dropsHold('drop', 'cylinder50', 1);
        add('readC', <button className="btn" onClick={() => ctl?.readVolume('cylinder50')}>{t('p01.act.readCylinder')}</button>);
        eye('cylinder50');
        add('tap', <button className="btn ghost" onClick={() => D({ type: 'tapCylinder' })}>{t('p01.act.tap')}</button>);
        add('emptyC', <button className="btn ghost" onClick={() => D({ type: 'emptyInto', sourceId: 'cylinder50', targetId: 'waste01' })}>{t('p01.act.empty')}</button>);
        if (!held && o.support === 'bench') add('tray', <button className="btn ghost" onClick={() => run(ctl?.moveTo(id, 'tray'))}>{t('p01.act.onTray')}</button>);
        break;
      case 'washBottle':
        dropsHold('dC', 'cylinder50', 1);
        dropsHold('sC', 'cylinder50', 10);
        break;
      case 'thermometer': {
        const th = w.thermometer;
        if (!held) for (const dst of ['erlenmeyer150', 'cylinder50', 'waterCold01', 'waterRoom01']) add(`th-${dst}`, <button className="btn ghost" onClick={() => run(ctl?.moveTo('thermometer01', dst))}>{t('p01.act.thermoInto', { o: p01NameOf(w, dst) })}</button>);
        if (th.where !== 'air') {
          add('depth', (
            <span className="slider">
              <label htmlFor="p01depth">{t('p01.act.depth')}</label>
              <input id="p01depth" type="range" min={0} max={8} step={0.1} value={th.depthCm} onChange={(e) => D({ type: 'setThermometerInsertion', depthCm: Number(e.target.value), touchingWall: th.touchingWall })} />
              <span className="readout">{th.depthCm.toFixed(1).replace('.', ',')} cm</span>
            </span>
          ));
          add('wall', <button className="btn ghost" aria-pressed={th.touchingWall} onClick={() => D({ type: 'setThermometerInsertion', depthCm: th.depthCm, touchingWall: !th.touchingWall })}>{th.touchingWall ? t('p01.act.offWall') : t('p01.act.onWall')}</button>);
        }
        add('readT', <button className="btn" onClick={() => ctl?.readThermometer()}>🌡 {t('p01.act.readTemp')}</button>);
        eye('thermometer01');
        break;
      }
      case 'nailsDish':
        add('toBoat', <button className="btn primary" onClick={() => D({ type: 'transferNails', from: 'nailsBatch01', to: 'weighBoat01', count: 6, gentle: true, tool: 'tongs' })}>{t('p01.act.nailsToBoat')}</button>);
        add('hand', <button className="btn ghost" onClick={() => D({ type: 'transferNails', from: 'nailsBatch01', to: 'weighBoat01', count: 6, gentle: true, tool: 'hand' })}>{t('p01.act.nailsByHand')}</button>);
        if (!held) toPan(id);
        break;
      case 'weighBoat':
        if (!held) toPan(id);
        if (!held && w.nails.some((n) => n.where === 'weighBoat01')) {
          add('n1', <button className="btn" onClick={() => D({ type: 'transferNails', from: 'weighBoat01', to: 'cylinder50', count: 1, gentle: true, tool: 'tongs' })}>{t('p01.act.nailOne')}</button>);
          add('nAll', <button className="btn ghost" onClick={() => D({ type: 'transferNails', from: 'weighBoat01', to: 'cylinder50', count: 6, gentle: false, tool: 'tongs' })}>{t('p01.act.nailsAll')}</button>);
        }
        if (w.nails.some((n) => n.where === 'cylinder50')) add('back', <button className="btn ghost" onClick={() => D({ type: 'transferNails', from: 'cylinder50', to: 'weighBoat01', count: 6, gentle: true, tool: 'tongs' })}>{t('p01.act.nailsBack')}</button>);
        add('dryB', <button className="btn ghost" onClick={() => D({ type: 'cleanObject', objectId: id, action: 'dry' })}>{t('p01.act.dry')}</button>);
        break;
      case 'watchGlass':
        if (!held) toPan(id);
        add('dryG', <button className="btn ghost" onClick={() => D({ type: 'cleanObject', objectId: id, action: 'dry' })}>{t('p01.act.dry')}</button>);
        add('washG', <button className="btn ghost" onClick={() => D({ type: 'cleanObject', objectId: id, action: 'wash' })}>{t('p01.act.wash')}</button>);
        break;
      case 'solidCylinder':
        if (!held) add('onGlass', o.support === 'watchGlass01'
          ? <button className="btn" onClick={() => run(ctl?.moveTo(id, 'bench'))}>{t('p01.act.offGlass')}</button>
          : <button className="btn" onClick={() => run(ctl?.moveTo(id, 'watchGlass'))}>{t('p01.act.onGlass')}</button>);
        break;
      case 'caliper': {
        const set = (p: Partial<typeof cal>) => {
          const n = { ...cal, ...p };
          setCal(n);
          D({ type: 'setCaliper', target: n.target, angleDeg: n.angleDeg, force01: n.force01, orientationDeg: n.orientationDeg });
        };
        add('target', (
          <span className="slider" role="group" aria-label={t('p01.act.caliperTarget')}>
            {(['empty', 'diameter', 'height'] as const).map((k) => <button key={k} className="btn small" aria-pressed={cal.target === k} onClick={() => set({ target: k })}>{t(`p01.act.cal_${k}`)}</button>)}
          </span>
        ));
        add('orient', (
          <span className="slider">
            <label htmlFor="p01orient">{t('p01.act.orientation')}</label>
            <input id="p01orient" type="range" min={0} max={180} step={15} value={cal.orientationDeg} onChange={(e) => set({ orientationDeg: Number(e.target.value) })} />
            <span className="readout">{cal.orientationDeg}°</span>
          </span>
        ));
        add('angle', (
          <span className="slider">
            <label htmlFor="p01angle">{t('p01.act.alignment')}</label>
            <input id="p01angle" type="range" min={-15} max={15} step={1} value={cal.angleDeg} onChange={(e) => set({ angleDeg: Number(e.target.value) })} />
            <span className="readout">{cal.angleDeg}°</span>
          </span>
        ));
        add('force', (
          <span className="slider">
            <label htmlFor="p01force">{t('p01.act.force')}</label>
            <input id="p01force" type="range" min={0.1} max={1} step={0.05} value={cal.force01} onChange={(e) => set({ force01: Number(e.target.value) })} />
          </span>
        ));
        add('close', <button className="btn" onClick={() => set({})}>{t('p01.act.closeJaws')}</button>);
        add('readK', <button className="btn primary" onClick={() => ctl?.readCaliper()}>📏 {t('p01.act.readCaliper')}</button>);
        eye('caliper01');
        break;
      }
      case 'spillTray':
        add('emptyT', <button className="btn" onClick={() => D({ type: 'cleanSpill', where: 'tray' })}>{t('p01.safety.emptyTray')}</button>);
        break;
    }
    add('insp', <button className="btn ghost" onClick={() => inspect(id)}>🔍 {t('p01.act.inspect')}</button>);
    add('focus', <button className="btn ghost" onClick={() => stage?.focusObject(id, 4)}>{t('act.inspect')}</button>);
  }

  const desc = id ? describeObject(w, id, mode) : '';
  return (
    <section id="actions" className={`actions${demo ? ' demo-locked' : ''}`} aria-label={t('p01.act.title')} aria-disabled={demo || undefined}>
      <div className="desc" id="action-desc" aria-live="polite">
        {id ? <><strong>{p01NameOf(w, id)}</strong>{desc ? ` — ${desc}` : ''}</> : t('p01.act.none')}
      </div>
      <div className="row">{buttons}</div>
    </section>
  );
}
