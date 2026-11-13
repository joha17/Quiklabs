import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useF05 } from './store';
import { describeObjectF05 } from './describe';
import { HoldButton } from './ui';
import type { F05Command, FbdBody, FbdDir, FbdForce, FbdPartner, GateId, Material } from '../../simulation/f05-world/commands';
import { BALLASTS, busyF5 } from '../../simulation/f05-world/world';
import { BLOCK_START_S } from '../../simulation/f05-world/geometry';
import { eyeTargetFor } from './LensF05';

const FORCES: FbdForce[] = ['weight', 'normal', 'tension', 'friction'];
const DIRS: FbdDir[] = ['up', 'down', 'perp', 'upSlope', 'downSlope'];
const PARTNERS: FbdPartner[] = ['earth', 'plane', 'cable', 'block'];
const MATERIALS: Material[] = ['wood', 'paper', 'rubber'];

/**
 * Editor del diagrama de cuerpo libre sobre el cuerpo seleccionado: cada flecha se arma con fuerza, sentido y el cuerpo
 * que la ejerce (el par de la tercera ley). El dominio decide si el diagrama es coherente al bloquearlo; aquí no hay
 * «diagrama correcto» ni plantilla.
 */
function FbdEditor({ body }: { body: FbdBody }) {
  const { t } = useTranslation();
  const rt = useF05((s) => s.runtime);
  const dispatch = useF05((s) => s.dispatch);
  const toast = useF05((s) => s.toast);
  const [force, setForce] = useState<FbdForce>('weight');
  const [dir, setDir] = useState<FbdDir>('down');
  const [partner, setPartner] = useState<FbdPartner>('earth');
  if (!rt) return null;
  const f = rt.world.fbd[body];
  const run = (c: F05Command) => {
    const r = dispatch(c);
    if (!r.ok && r.code) toast('warn', t(`f05.cmd.${r.code}`));
  };
  return (
    <fieldset className="f05-fbd" disabled={f.locked}>
      <legend>{t('f05.fbd.title', { body: t(`f05.fbd.body.${body}`) })}{f.locked ? ` · ${t('f05.fbd.locked')}` : ''}</legend>
      <ol className="f05-fbd-list">
        {f.arrows.map((a, i) => (
          <li key={`${a.force}${a.dir}${i}`}>
            {t(`f05.fbd.force.${a.force}`)} · {t(`f05.fbd.dir.${a.dir}`)} · {t('f05.fbd.by', { p: t(`f05.fbd.partner.${a.partner}`) })}
            {!f.locked && <button className="btn ghost" aria-label={t('f05.fbd.erase')} onClick={() => run({ type: 'eraseForce', body, index: i })}>×</button>}
          </li>
        ))}
        {!f.arrows.length && <li className="hint">{t('f05.fbd.empty')}</li>}
      </ol>
      <label>{t('f05.fbd.forceL')} <select value={force} onChange={(e) => setForce(e.target.value as FbdForce)}>{FORCES.map((x) => <option key={x} value={x}>{t(`f05.fbd.force.${x}`)}</option>)}</select></label>
      <label>{t('f05.fbd.dirL')} <select value={dir} onChange={(e) => setDir(e.target.value as FbdDir)}>{DIRS.map((x) => <option key={x} value={x}>{t(`f05.fbd.dir.${x}`)}</option>)}</select></label>
      <label>{t('f05.fbd.partnerL')} <select value={partner} onChange={(e) => setPartner(e.target.value as FbdPartner)}>{PARTNERS.map((x) => <option key={x} value={x}>{t(`f05.fbd.partner.${x}`)}</option>)}</select></label>
      <button className="btn" onClick={() => run({ type: 'drawForce', body, force, dir, partner })}>➕ {t('f05.fbd.draw')}</button>
      <button className="btn primary" onClick={() => run({ type: 'lockFbd', body })}>🔒 {t('f05.fbd.lock')}</button>
    </fieldset>
  );
}

/**
 * Panel de acciones de F05: alternativa accesible a cada gesto con el ratón. Ejecuta EXACTAMENTE los mismos comandos
 * del dominio que el controlador (el elevador vuelta a vuelta, la compuerta centímetro a centímetro, la célula de a un
 * grado, el lastre a su lugar, el tirador a la rapidez elegida); no es un atajo científico: no hay «medir μ» ni
 * «buscar el ángulo crítico».
 */
export function ActionPanelF05() {
  const { t } = useTranslation();
  useF05((s) => s.version);
  const rt = useF05((s) => s.runtime);
  const stage = useF05((s) => s.stage);
  const sel = useF05((s) => s.selected);
  const held = useF05((s) => s.held);
  const dispatch = useF05((s) => s.dispatch);
  const toast = useF05((s) => s.toast);
  const demo = useF05((s) => !!s.demo);
  const setSettings = useF05((s) => s.setSettings);
  const nudge = useRef<number | null>(null);
  const [body, setBody] = useState<FbdBody>('blockPull');
  if (!rt) return null;
  const w = rt.world;
  const ctl = stage?.controller;
  const id = held ?? sel;
  const o = id ? w.objects[id] : undefined;

  const startNudge = (fn: () => void, ms = 120) => {
    if (nudge.current) window.clearInterval(nudge.current);
    fn();
    nudge.current = window.setInterval(fn, ms);
  };
  const stopNudge = () => {
    if (nudge.current) window.clearInterval(nudge.current);
    nudge.current = null;
  };
  const run = (r: { ok: boolean; code?: string } | undefined | void) => {
    if (r && !r.ok && r.code) {
      const k = `f05.cmd.${r.code}`;
      toast('warn', t(k) !== k ? t(k) : t('f05.cmd.FAILED'));
    }
    return r;
  };
  const D = (c: F05Command) => run(dispatch(c));
  const buttons: React.ReactNode[] = [];
  const add = (key: string, node: React.ReactNode) => buttons.push(<span key={key}>{node}</span>);
  const btn = (key: string, label: string, fn: () => unknown, cls = 'btn') => add(key, <button className={cls} onClick={() => run(fn() as never)}>{label}</button>);
  const hold = (key: string, label: string, fn: () => void, ms = 120) => add(key, <HoldButton onStart={() => startNudge(fn, ms)} onStop={stopNudge}>{label}</HoldButton>);
  const eye = (target = id) => btn('eye', `👁 ${t('f05.act.eyeLevel')}`, () => stage?.camera?.eyeLevel(eyeTargetFor(target)), 'btn ghost');
  const lens = (target: string, label: string) => btn(`lens${target}`, `📈 ${label}`, () => setSettings({ lens: target }), 'btn ghost');
  const busy = busyF5(w);
  const weigh = (what: string) => btn(`weigh${what}`, t('f05.act.weigh'), () => D({ type: 'placeOnBalance', id: what }));
  const offBalance = () => btn('off', t('f05.act.offBalance'), () => D({ type: 'removeFromBalance' }), 'btn primary');
  let showFbd = false;

  if (id && o) {
    switch (o.kind) {
      case 'plane':
        MATERIALS.filter((m) => m !== w.surface.material).forEach((m) => btn(`surf${m}`, t('f05.act.surface', { m: t(`f05.material.${m}`) }), () => D({ type: 'setSurface', material: m })));
        btn('clamp', t(w.plane.clamped ? 'f05.act.unclamp' : 'f05.act.clamp'), () => D({ type: 'clampBase', on: !w.plane.clamped }), w.plane.clamped ? 'btn ghost' : 'btn primary');
        btn('angle', `🔍 ${t('f05.act.readAngle')}`, () => ctl?.readAngle('plane') ?? D({ type: 'readAngle', target: 'plane', viewDeg: 0 }), 'btn primary');
        break;
      case 'elevator':
        hold('up', `⟳ ${t('f05.act.raise')}`, () => void D({ type: 'turnElevator', turns: 1 }), 250);
        hold('down', `⟲ ${t('f05.act.lower')}`, () => void D({ type: 'turnElevator', turns: -1 }), 250);
        btn('lock', t(w.plane.locked ? 'f05.act.unlock' : 'f05.act.lock'), () => D({ type: 'setLock', on: !w.plane.locked }), w.plane.locked ? 'btn ghost' : 'btn primary');
        btn('support', `🔍 ${t('f05.act.readSupport')}`, () => ctl?.readAngle('support') ?? D({ type: 'readAngle', target: 'support', viewDeg: 0 }));
        eye('elevator01');
        break;
      case 'goniometer':
        btn('angle', `🔍 ${t('f05.act.readAngle')}`, () => ctl?.readAngle('plane') ?? D({ type: 'readAngle', target: 'plane', viewDeg: 0 }), 'btn primary');
        eye('gonio01');
        break;
      case 'catcher':
        btn('foam', t(w.catcherOn ? 'f05.act.foamOff' : 'f05.act.foamOn'), () => D({ type: 'setCatcher', on: !w.catcherOn }), w.catcherOn ? 'btn ghost' : 'btn primary');
        break;
      case 'block':
        showFbd = true;
        if (w.block.on === 'balance') offBalance();
        else {
          if (w.block.on === 'plane' && !w.puller.attached && !busy) weigh('block01');
          btn('start', t('f05.act.placeStart'), () => D({ type: 'placeBlock', s: BLOCK_START_S }));
          btn('top', t('f05.act.placeTop'), () => D({ type: 'placeBlock', s: 'top' }));
          if (w.block.pinned) btn('release', `▶ ${t('f05.act.releaseBlock')}`, () => ctl?.release() ?? D({ type: 'releaseBlock' }), 'btn primary');
          btn('attach', t(w.puller.attached ? 'f05.act.detach' : 'f05.act.attach'), () => D({ type: 'attachCable', on: !w.puller.attached }));
          if (w.block.flagBent) btn('flag', t('f05.act.reseatFlag'), () => D({ type: 'reseatFlag' }));
        }
        eye('block01');
        break;
      case 'ballast':
        if (o.support === 'balance') offBalance();
        else {
          if (o.support !== 'block01') btn('toBlock', t('f05.act.toBlock'), () => D({ type: 'placeMass', id, on: 'block' }), 'btn primary');
          if (o.support !== 'rack') btn('toRack', t('f05.act.toRack'), () => D({ type: 'placeMass', id, on: 'rack' }));
          else weigh(id);
        }
        break;
      case 'massRack':
        BALLASTS.filter((m) => w.objects[m].support !== 'rack' && w.objects[m].support !== 'balance').forEach((m) => btn(`back${m}`, t('f05.act.massBack', { m: t(`f05.obj.${m}`) }), () => D({ type: 'placeMass', id: m, on: 'rack' })));
        btn('close', `✅ ${t('f05.act.closeStation')}`, () => D({ type: 'closeStation' }), 'btn primary');
        break;
      case 'strip':
        btn('mount', t('f05.act.surface', { m: t(`f05.material.${id === 'stripRubber' ? 'rubber' : 'paper'}`) }), () => D({ type: 'setSurface', material: id === 'stripRubber' ? 'rubber' : 'paper' }), 'btn primary');
        break;
      case 'stripRack':
        btn('wood', t('f05.act.surface', { m: t('f05.material.wood') }), () => D({ type: 'setSurface', material: 'wood' }), 'btn primary');
        break;
      case 'puller': {
        const drives = w.params.drives;
        const cur = Math.round(w.puller.driveMs * 1000) / 10;
        drives.forEach((d) => btn(`drive${d}`, `▶ ${t('f05.act.drive', { cm: String(d).replace('.', ',') })}`, () => D({ type: 'setDrive', cmS: d }), cur === d ? 'btn primary' : 'btn'));
        if (cur > 0) btn('stop', `⏹ ${t('f05.act.stopDrive')}`, () => D({ type: 'setDrive', cmS: 0 }), 'btn primary');
        hold('crank', `⟳ ${t('f05.act.crank')}`, () => void D({ type: 'turnCrank', turns: 1 }), 200);
        btn('return', `↩ ${t('f05.act.returnPuller')}`, () => D({ type: 'returnPuller' }));
        hold('hUp', `▲ ${t('f05.act.hookUp')}`, () => void D({ type: 'setCableHeight', cm: w.puller.heightCm + 0.5 }), 250);
        hold('hDown', `▼ ${t('f05.act.hookDown')}`, () => void D({ type: 'setCableHeight', cm: w.puller.heightCm - 0.5 }), 250);
        btn('jerk', t('f05.act.jerk'), () => D({ type: 'jerk' }), 'btn ghost');
        lens('logger01', t('f05.act.graph'));
        break;
      }
      case 'loadCell': {
        const s = w.sensor;
        const ranges = w.params.force.ranges;
        btn('plug', t(s.connected ? 'f05.act.unplug' : 'f05.act.plug'), () => D({ type: 'connect', channel: 'load01', on: !s.connected }));
        btn('zero', t('f05.act.zero'), () => D({ type: 'zeroSensor' }));
        btn('cal', t('f05.act.calibrate'), () => D({ type: 'calibrateSensor' }));
        btn('range', t('f05.act.range', { n: ranges[(s.rangeIdx + 1) % ranges.length] }), () => D({ type: 'setRange', n: (s.rangeIdx + 1) % ranges.length }));
        hold('tiltUp', `▲ ${t('f05.act.tiltUp')}`, () => void D({ type: 'mountSensor', angleDeg: w.sensor.angleDeg + 1 }), 200);
        hold('tiltDown', `▼ ${t('f05.act.tiltDown')}`, () => void D({ type: 'mountSensor', angleDeg: w.sensor.angleDeg - 1 }), 200);
        break;
      }
      case 'spring':
        btn('attach', t(w.puller.attached ? 'f05.act.detach' : 'f05.act.attach'), () => D({ type: 'attachCable', on: !w.puller.attached }), 'btn primary');
        break;
      case 'logger': {
        const rates = w.params.rates;
        const next = rates[(rates.indexOf(w.logger.rateHz) + 1) % rates.length];
        btn('rate', t('f05.act.rate', { hz: next }), () => D({ type: 'setRate', hz: next }));
        btn('load', t(w.sensor.connected ? 'f05.act.unplug' : 'f05.act.plug'), () => D({ type: 'connect', channel: 'load01', on: !w.sensor.connected }));
        btn('gates', t(w.logger.gatesConnected ? 'f05.act.gatesOff' : 'f05.act.gatesOn'), () => D({ type: 'connect', channel: 'gates', on: !w.logger.gatesConnected }));
        btn('video', t(w.logger.videoOn ? 'f05.act.videoOff' : 'f05.act.videoOn'), () => D({ type: 'connect', channel: 'video', on: !w.logger.videoOn }));
        lens('logger01', t('f05.act.graph'));
        eye('logger01');
        break;
      }
      case 'gate': {
        const gid = id as GateId;
        const g = w.gates[gid];
        hold('gUp', `▲ ${t('f05.act.gateUp')}`, () => void D({ type: 'moveGate', id: gid, s: g.s + 0.01 }));
        hold('gDown', `▼ ${t('f05.act.gateDown')}`, () => void D({ type: 'moveGate', id: gid, s: g.s - 0.01 }));
        btn('scale', `🔍 ${t('f05.act.readScale')}`, () => ctl?.readScale(gid) ?? D({ type: 'readScale', target: gid, viewDeg: 0 }), 'btn primary');
        eye(gid);
        break;
      }
      case 'balance':
        btn('tare', t('f05.act.tare'), () => D({ type: 'tareBalance' }));
        btn('read', `🔍 ${t('f05.act.readBalance')}`, () => ctl?.readBalance() ?? D({ type: 'readBalance' }), 'btn primary');
        if (w.balance.on) btn('off', t('f05.act.offBalance'), () => D({ type: 'removeFromBalance' }));
        eye('balance01');
        break;
      case 'thermometer':
        btn('read', `🔍 ${t('f05.act.readTemp')}`, () => ctl?.readTemp() ?? D({ type: 'readTemp' }), 'btn primary');
        eye('thermo01');
        break;
    }
    btn('insp', `🔍 ${t('f05.act.inspect')}`, () => {
      D({ type: 'inspect', target: id });
      stage?.focusObject(id, 4);
    }, 'btn ghost');
  }
  if (w.safety.block) btn('ack', `⚠ ${t('f05.act.acknowledge')}`, () => D({ type: 'acknowledge' }), 'btn primary');

  const desc = id ? describeObjectF05(w, id) : '';
  return (
    <section id="actions" className={`actions${demo ? ' demo-locked' : ''}`} aria-label={t('f05.act.title')} aria-disabled={demo || undefined}>
      <div className="desc" id="action-desc" aria-live="polite">{id ? desc : t('f05.act.none')}</div>
      <div className="row">{buttons}</div>
      {showFbd && (
        <>
          <div className="row" role="radiogroup" aria-label={t('f05.fbd.which')}>
            {(['blockPull', 'blockSlide'] as const).map((b) => (
              <button key={b} role="radio" aria-checked={body === b} className={body === b ? 'btn primary' : 'btn ghost'} onClick={() => setBody(b)}>{t(`f05.fbd.body.${b}`)}</button>
            ))}
          </div>
          <FbdEditor body={body} />
        </>
      )}
    </section>
  );
}
