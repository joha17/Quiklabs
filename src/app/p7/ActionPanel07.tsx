import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useP07 } from './store';
import { describeObject, p07NameOf } from './describe';
import { HoldButton } from './ui';
import type { P07Command } from '../../simulation/bonding-world/commands';
import { isPourable, levelsZ } from '../../engine/bonding/layout';

/**
 * Panel de acciones de la Práctica 7 (§14.1, §15.1): alternativa accesible a cada gesto. Despacha EXACTAMENTE los
 * mismos comandos del dominio que el controlador (las herramientas se meten en un recipiente con la misma pose, las
 * puntas se apoyan sobre la muestra con la misma geometría). No hay «disolver» ni «conduce»: el dominio decide.
 */
export function ActionPanel07() {
  const { t } = useTranslation();
  useP07((s) => s.version);
  const rt = useP07((s) => s.runtime);
  const stage = useP07((s) => s.stage);
  const sel = useP07((s) => s.selected);
  const held = useP07((s) => s.held);
  const dispatch = useP07((s) => s.dispatch);
  const toast = useP07((s) => s.toast);
  const mode = useP07((s) => s.settings.mode);
  const demo = useP07((s) => !!s.demo);
  const nudge = useRef<number | null>(null);
  const [target, setTarget] = useState<Record<string, string>>({});
  const [label, setLabel] = useState('');
  const [depth, setDepth] = useState(2);
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
      const k = `p7.cmd.${r.code}`;
      toast('warn', t(k) !== k ? t(k) : t('p7.cmd.FAILED'));
    }
    return r;
  };
  const D = (c: P07Command) => run(dispatch(c));
  const buttons: React.ReactNode[] = [];
  const add = (key: string, node: React.ReactNode) => buttons.push(<span key={key}>{node}</span>);
  const name = (x: string) => p07NameOf(w, x);
  const eye = (x: string) => add(`eye-${x}`, <button className="btn ghost" onClick={() => stage?.camera?.eyeLevel(x)}>👁 {t('p7.act.eyeLevel')}</button>);
  /** Selector de destino recordado por tipo de acción. */
  const pick = (key: string, options: string[], labelKey: string) => {
    const value = target[key] && options.includes(target[key]) ? target[key] : options[0] ?? '';
    add(`sel-${key}`, (
      <label className="slider">
        <span>{t(labelKey)}</span>
        <select aria-label={t(labelKey)} value={value} onChange={(e) => setTarget({ ...target, [key]: e.target.value })}>
          {options.map((x) => <option key={x} value={x}>{x === 'bench' ? t('p7.where.bench') : name(x)}</option>)}
        </select>
      </label>
    ));
    return value;
  };
  const vessels = (pred: (vid: string) => boolean = () => true) => Object.keys(w.vessels).filter((v) => v !== id && w.objects[v] && pred(v));
  const receivers = vessels((v) => !v.startsWith('jar') && !v.startsWith('bt') && !v.startsWith('std') && !v.startsWith('unk') && v !== 'washBottle');
  const wastes = ['wasteAq', 'wasteOrg', 'wasteSolid'];

  if (id && o) {
    if (o.movable && !held) add('take', <button className="btn ghost" onClick={() => ctl?.beginDrag(id, true)}>{t('p7.act.takeKeyboard')}</button>);
    if (held) {
      add('drop', <button className="btn primary" onClick={() => ctl?.release()}>{t('p7.act.release')}</button>);
      add('up', <HoldButton onStart={() => startNudge(() => ctl?.nudgeHeight(0.5))} onStop={stopNudge}>▲ {t('p7.act.up')}</HoldButton>);
      add('down', <HoldButton onStart={() => startNudge(() => ctl?.nudgeHeight(-0.5))} onStop={stopNudge}>▼ {t('p7.act.down')}</HoldButton>);
      add('cancel', <button className="btn ghost" onClick={() => ctl?.cancel()}>{t('p7.act.cancel')}</button>);
    }
    const v = w.vessels[id];
    // ── Recipientes ──
    if (v) {
      if (v.capped !== undefined) add('cap', <button className="btn" aria-pressed={!v.capped} onClick={() => D({ type: 'setCap', vesselId: id, capped: !v.capped })}>{v.capped ? t('p7.act.uncap') : t('p7.act.capOn')}</button>);
      if (isPourable(w, id)) {
        const dst = pick('pour', receivers, 'p7.act.pourTarget');
        // Mientras se mantiene, la inclinación se reajusta al nivel que va quedando (igual que la mano en la escena).
        if (dst) {
          add('pour', <HoldButton onStart={() => startNudge(() => ctl?.pourDirect(id, dst, true), 200)} onStop={() => { stopNudge(); D({ type: 'stopPour', sourceId: id }); }}>🫗 {t('p7.act.pour')}</HoldButton>);
          add('pourSlow', <HoldButton onStart={() => startNudge(() => ctl?.pourDirect(id, dst, false), 200)} onStop={() => { stopNudge(); D({ type: 'stopPour', sourceId: id }); }}>{t('p7.act.pourSlow')}</HoldButton>);
        }
      }
      if (['cylinder10', 'beaker', 'flask', 'tube'].includes(o.kind)) {
        eye(id);
        if (o.kind !== 'tube') add('vol', <button className="btn" onClick={() => ctl?.readVolume(id)}>{t('p7.act.readVolume')}</button>);
      }
      if (['tube', 'beaker', 'flask'].includes(o.kind)) add('obs', <button className="btn" onClick={() => ctl?.observe(id)}>📝 {t('p7.act.observe')}</button>);
      if (held === id && ['tube', 'beaker', 'flask', 'cylinder10'].includes(o.kind)) {
        add('shake', <HoldButton onStart={() => ctl?.shakeDown()} onStop={() => ctl?.shakeUp()}>🔄 {t('p7.act.shake')}</HoldButton>);
      }
      if (o.kind === 'tube') {
        add('lbl', (
          <span className="slider">
            <input aria-label={t('p7.act.labelTube')} type="text" size={6} value={label} placeholder={o.label ?? 'M1-A'} onChange={(e) => setLabel(e.target.value)} />
            <button className="btn small" onClick={() => { D({ type: 'labelTube', tubeId: id, label }); setLabel(''); }}>{t('p7.act.labelTube')}</button>
          </span>
        ));
      }
      if (['watchGlass', 'tube', 'beaker', 'flask', 'cylinder10'].includes(o.kind)) {
        const dst = pick('empty', [...receivers, ...wastes], 'p7.act.emptyTarget');
        if (dst) add('empty', <button className="btn ghost" onClick={() => D({ type: 'dispose', vesselId: id, wasteId: dst })}>{t('p7.act.emptyInto')}</button>);
      }
      if (['watchGlass', 'beaker', 'tube', 'flask', 'cylinder10'].includes(o.kind)) {
        add('pan', o.support === 'pan'
          ? <button className="btn" onClick={() => run(ctl?.moveTo(id, 'bench'))}>{t('p7.act.offPan')}</button>
          : <button className="btn" onClick={() => run(ctl?.moveTo(id, 'pan'))}>⚖ {t('p7.act.toPan')}</button>);
      }
    }
    switch (kind) {
      case 'balance': {
        const b = w.balance;
        add('power', <button className="btn" aria-pressed={b.powered} onClick={() => D({ type: 'powerBalance', on: !b.powered })}>⏻ {b.powered ? t('p7.act.powerOff') : t('p7.act.powerOn')}</button>);
        add('tare', <button className="btn" onClick={() => ctl?.tare()}>→0← {t('p7.act.tare')}</button>);
        add('readB', <button className={`btn ${b.powered && b.stable ? 'primary' : ''}`} onClick={() => ctl?.readBalance()}>{t('p7.act.read')}</button>);
        eye('balance01');
        break;
      }
      case 'dropper': {
        const into = pick('dip', vessels(), 'p7.act.dipIn');
        if (into) add('dip', <button className="btn" onClick={() => run(ctl?.moveTo(id, into))}>{t('p7.act.putIn')}</button>);
        add('asp', <HoldButton onStart={() => D({ type: 'setDropper', dropperId: id, squeeze01: -1 })} onStop={() => D({ type: 'setDropper', dropperId: id, squeeze01: 0 })}>⬆ {t('p7.act.aspirate')}</HoldButton>);
        add('rel', <HoldButton onStart={() => D({ type: 'setDropper', dropperId: id, squeeze01: 1 })} onStop={() => D({ type: 'setDropper', dropperId: id, squeeze01: 0 })}>⬇ {t('p7.act.dispense')}</HoldButton>);
        add('readD', <button className="btn ghost" onClick={() => ctl?.readVolume(id)}>{t('p7.act.readVolume')}</button>);
        eye(id);
        add('clean', <button className="btn ghost" onClick={() => D({ type: 'cleanTool', toolId: id })}>🧽 {t('p7.act.clean')}</button>);
        add('out', <button className="btn ghost" onClick={() => run(ctl?.moveTo(id, 'bench'))}>{t('p7.act.toBench')}</button>);
        break;
      }
      case 'spatula': {
        const into = pick('spat', vessels((x) => x.startsWith('jar') || x.startsWith('unk') || x.startsWith('wg') || receivers.includes(x)), 'p7.act.dipIn');
        if (into) add('dip', <button className="btn" onClick={() => run(ctl?.moveTo(id, into))}>{t('p7.act.putIn')}</button>);
        add('act', <button className="btn primary" onClick={() => ctl?.spatulaAction()}>{t('p7.act.spatula')}</button>);
        add('clean', <button className="btn ghost" onClick={() => D({ type: 'cleanTool', toolId: 'spatula' })}>🧽 {t('p7.act.clean')}</button>);
        add('out', <button className="btn ghost" onClick={() => run(ctl?.moveTo(id, 'bench'))}>{t('p7.act.toBench')}</button>);
        break;
      }
      case 'stirRod': {
        const into = pick('stir', receivers, 'p7.act.dipIn');
        if (into) add('dip', <button className="btn" onClick={() => run(ctl?.moveTo(id, into))}>{t('p7.act.putIn')}</button>);
        const inV = w.vessels[o.support] ? o.support : null;
        if (inV) {
          add('stir', <HoldButton onStart={() => D({ type: 'setStir', vesselId: inV, motion01: 0.6 })} onStop={() => D({ type: 'setStir', vesselId: inV, motion01: 0 })}>🔄 {t('p7.act.stir')}</HoldButton>);
          add('stirF', <HoldButton onStart={() => D({ type: 'setStir', vesselId: inV, motion01: 1 })} onStop={() => D({ type: 'setStir', vesselId: inV, motion01: 0 })}>{t('p7.act.stirStrong')}</HoldButton>);
        }
        add('out', <button className="btn ghost" onClick={() => run(ctl?.moveTo(id, 'bench'))}>{t('p7.act.toBench')}</button>);
        break;
      }
      case 'washBottle': {
        const dst = pick('wash', receivers, 'p7.act.washTarget');
        if (dst) {
          add('drop', <HoldButton onStart={() => startNudge(() => D({ type: 'squeezeWash', targetId: dst, ml: 0.05 }), 250)} onStop={stopNudge}>💧 {t('p7.act.drop')}</HoldButton>);
          add('jet', <HoldButton onStart={() => startNudge(() => D({ type: 'squeezeWash', targetId: dst, ml: 2 }), 250)} onStop={stopNudge}>{t('p7.act.jet')}</HoldButton>);
        }
        break;
      }
      case 'detector': {
        const d = w.detector;
        add('power', <button className="btn" aria-pressed={d.powered} onClick={() => D({ type: 'powerDetector', on: !d.powered })}>⏻ {d.powered ? t('p7.act.powerOff') : t('p7.act.powerOn')}</button>);
        add('range', <button className="btn ghost" onClick={() => D({ type: 'setDetectorRange', range: d.range === 'LOW' ? 'HIGH' : 'LOW' })}>{t('p7.act.range', { r: d.range })}</button>);
        add('cable', <button className="btn ghost" aria-pressed={d.cablesOk} onClick={() => D({ type: 'setDetectorCables', connected: !d.cablesOk })}>{d.cablesOk ? t('p7.act.unplug') : t('p7.act.plug')}</button>);
        add('ctrl', <button className="btn" onClick={() => { run(ctl?.moveTo('tipA', 'det01')); run(ctl?.moveTo('tipB', 'det01')); }}>{t('p7.act.tipsOnPad')}</button>);
        add('readI', <button className="btn primary" onClick={() => ctl?.readDetector()}>{t('p7.act.read')}</button>);
        add('free', <button className="btn ghost" onClick={() => { run(ctl?.moveTo('tipA', 'bench')); run(ctl?.moveTo('tipB', 'bench')); }}>{t('p7.act.tipsAway')}</button>);
        eye('det01');
        break;
      }
      case 'tip': {
        const onto = pick('tip', [...Object.keys(w.specimens).filter((x) => w.objects[x]), 'det01'], 'p7.act.tipOnto');
        if (onto) add('on', <button className="btn" onClick={() => run(ctl?.moveTo(id, onto))}>{t('p7.act.rest')}</button>);
        add('lift', <button className="btn ghost" onClick={() => run(ctl?.moveTo(id, 'bench'))}>{t('p7.act.lift')}</button>);
        add('readI', <button className="btn primary" onClick={() => ctl?.readDetector()}>{t('p7.act.read')}</button>);
        break;
      }
      case 'specimen': {
        const sp = w.specimens[id];
        add('both', <button className="btn primary" onClick={() => { run(ctl?.moveTo('tipA', id)); run(ctl?.moveTo('tipB', id)); }}>{t('p7.act.bothTips')}</button>);
        add('a', <button className="btn ghost" onClick={() => run(ctl?.moveTo('tipA', id))}>{t('p7.act.tipA')}</button>);
        add('b', <button className="btn ghost" onClick={() => run(ctl?.moveTo('tipB', id))}>{t('p7.act.tipB')}</button>);
        if (sp.material === 'graphite') add('rot', <button className="btn" onClick={() => D({ type: 'rotateSpecimen', specimenId: id })}>{sp.orientation === 'flat' ? t('p7.act.toEdge') : t('p7.act.toFlat')}</button>);
        add('wet', <button className="btn ghost" onClick={() => D({ type: 'wetSpecimen', specimenId: id })}>💧 {t('p7.act.wet')}</button>);
        add('dry', <button className="btn ghost" onClick={() => D({ type: 'drySpecimen', specimenId: id })}>🧻 {t('p7.act.dry')}</button>);
        add('readI', <button className="btn" onClick={() => ctl?.readDetector()}>{t('p7.act.read')}</button>);
        break;
      }
      case 'meter': {
        const m = w.meter;
        add('power', <button className="btn" aria-pressed={m.powered} onClick={() => D({ type: 'powerMeter', on: !m.powered })}>⏻ {m.powered ? t('p7.act.powerOff') : t('p7.act.powerOn')}</button>);
        add('range', <button className="btn ghost" onClick={() => D({ type: 'setMeterRange', range: m.range === 'LOW' ? 'MID' : m.range === 'MID' ? 'HIGH' : 'LOW' })}>{t('p7.act.range', { r: m.range })}</button>);
        add('atc', <button className="btn ghost" aria-pressed={m.atc} onClick={() => D({ type: 'setAtc', on: !m.atc })}>{t('p7.act.atc')}</button>);
        add('std', (
          <label className="slider">
            <span>{t('p7.act.standard')}</span>
            <select aria-label={t('p7.act.standard')} value={m.standardSetting} onChange={(e) => D({ type: 'setStandard', value: Number(e.target.value) === 12880 ? 12880 : 1413 })}>
              <option value={1413}>1413 µS/cm</option>
              <option value={12880}>12,88 mS/cm</option>
            </select>
          </label>
        ));
        add('cal', <button className="btn" onClick={() => ctl?.calibrate()}>{t('p7.act.calibrate')}</button>);
        add('readK', <button className={`btn ${m.stable ? 'primary' : ''}`} onClick={() => ctl?.readConductivity()}>{t('p7.act.read')}</button>);
        eye('cond01');
        break;
      }
      case 'probe': {
        const into = pick('probe', vessels((x) => !x.startsWith('jar') && x !== 'washBottle' && !x.startsWith('bt')), 'p7.act.dipIn');
        add('depth', (
          <label className="slider">
            <span>{t('p7.act.depth')}</span>
            <input aria-label={t('p7.act.depth')} type="range" min={0.5} max={5} step={0.1} value={depth} onChange={(e) => setDepth(Number(e.target.value))} />
            <output>{depth.toFixed(1).replace('.', ',')} cm</output>
          </label>
        ));
        if (into) {
          // La profundidad elegida fija la altura de la punta bajo la superficie: el mismo hecho geométrico que arrastrar.
          add('dip', <button className="btn primary" onClick={() => {
            const lv = levelsZ(w, w.vessels[into]);
            // Sin tocar el fondo: la punta queda al menos 1,5 mm sobre él aunque la profundidad pedida sea mayor.
            run(ctl?.moveTo(id, into, Math.max(lv.floor + 0.15, lv.surface - depth)));
          }}>{t('p7.act.immerse')}</button>);
        }
        add('out', <button className="btn ghost" onClick={() => { run(ctl?.moveTo(id, 'bench')); }}>{t('p7.act.withdraw')}</button>);
        add('rinse', <button className="btn" onClick={() => D({ type: 'rinseProbe', wasteId: 'wasteAq' })}>🚿 {t('p7.act.rinseProbe')}</button>);
        add('home', <button className="btn ghost" onClick={() => run(ctl?.moveTo(id, 'cond01'))}>{t('p7.act.toHolder')}</button>);
        add('readK', <button className="btn" onClick={() => ctl?.readConductivity()}>{t('p7.act.read')}</button>);
        break;
      }
    }
    add('insp', <button className="btn ghost" onClick={() => { D({ type: 'inspect', target: id }); stage?.focusObject(id, 4); }}>🔍 {t('p7.act.inspect')}</button>);
  }

  const desc = id ? describeObject(w, id, mode) : '';
  return (
    <section id="actions" className={`actions${demo ? ' demo-locked' : ''}`} aria-label={t('p7.act.title')} aria-disabled={demo || undefined}>
      <div className="desc" id="action-desc" aria-live="polite">
        {id ? <><strong>{name(id)}</strong>{desc ? ` — ${desc}` : ''}</> : t('p7.act.none')}
      </div>
      <div className="row">{buttons}</div>
    </section>
  );
}
