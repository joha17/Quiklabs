import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useF04 } from './store';
import { describeObjectF04 } from './describe';
import { HoldButton } from './ui';
import type { F04Command, FbdBody, FbdDir, FbdForce, FbdPartner, ForceId, SensorId } from '../../simulation/f04-world/commands';
import { SLOT_MASSES, runningF4 } from '../../simulation/f04-world/world';
import { eyeTargetFor } from './LensF04';

const FORCES: FbdForce[] = ['weight', 'normal', 'tension', 'friction', 'push', 'contact'];
const DIRS: FbdDir[] = ['up', 'down', 'left', 'right'];
const PARTNERS: FbdPartner[] = ['earth', 'track', 'string', 'hand', 'cartP', 'cartQ', 'cart', 'hanger'];
const FBD_OF: Record<string, FbdBody> = { cart01: 'cart', hanger01: 'hanger', cartP: 'cartP' };

/**
 * Editor del diagrama de cuerpo libre sobre el cuerpo seleccionado: cada flecha se arma con fuerza, sentido y el cuerpo
 * que la ejerce (el par de la tercera ley). El dominio decide si el diagrama es coherente al bloquearlo; aquí no hay
 * «diagrama correcto» ni plantilla.
 */
function FbdEditor({ body }: { body: FbdBody }) {
  const { t } = useTranslation();
  const rt = useF04((s) => s.runtime);
  const dispatch = useF04((s) => s.dispatch);
  const toast = useF04((s) => s.toast);
  const [force, setForce] = useState<FbdForce>('weight');
  const [dir, setDir] = useState<FbdDir>('down');
  const [partner, setPartner] = useState<FbdPartner>('earth');
  if (!rt) return null;
  const f = rt.world.fbd[body];
  const run = (c: F04Command) => {
    const r = dispatch(c);
    if (!r.ok && r.code) toast('warn', t(`f04.cmd.${r.code}`));
  };
  return (
    <fieldset className="f04-fbd" disabled={f.locked}>
      <legend>{t('f04.fbd.title', { body: t(`f04.fbd.body.${body}`) })}{f.locked ? ` · ${t('f04.fbd.locked')}` : ''}</legend>
      <ol className="f04-fbd-list">
        {f.arrows.map((a, i) => (
          <li key={`${a.force}${a.dir}${i}`}>
            {t(`f04.fbd.force.${a.force}`)} · {t(`f04.fbd.dir.${a.dir}`)} · {t('f04.fbd.by', { p: t(`f04.fbd.partner.${a.partner}`) })}
            {!f.locked && <button className="btn ghost" aria-label={t('f04.fbd.erase')} onClick={() => run({ type: 'eraseForce', body, index: i })}>×</button>}
          </li>
        ))}
        {!f.arrows.length && <li className="hint">{t('f04.fbd.empty')}</li>}
      </ol>
      <label>{t('f04.fbd.forceL')} <select value={force} onChange={(e) => setForce(e.target.value as FbdForce)}>{FORCES.map((x) => <option key={x} value={x}>{t(`f04.fbd.force.${x}`)}</option>)}</select></label>
      <label>{t('f04.fbd.dirL')} <select value={dir} onChange={(e) => setDir(e.target.value as FbdDir)}>{DIRS.map((x) => <option key={x} value={x}>{t(`f04.fbd.dir.${x}`)}</option>)}</select></label>
      <label>{t('f04.fbd.partnerL')} <select value={partner} onChange={(e) => setPartner(e.target.value as FbdPartner)}>{PARTNERS.map((x) => <option key={x} value={x}>{t(`f04.fbd.partner.${x}`)}</option>)}</select></label>
      <button className="btn" onClick={() => run({ type: 'drawForce', body, force, dir, partner })}>➕ {t('f04.fbd.draw')}</button>
      <button className="btn primary" onClick={() => run({ type: 'lockFbd', body })}>🔒 {t('f04.fbd.lock')}</button>
    </fieldset>
  );
}

/**
 * Panel de acciones de F04: alternativa accesible a cada gesto con el ratón. Ejecuta EXACTAMENTE los mismos comandos
 * del dominio que el controlador (el tornillo de nivel vuelta a vuelta, la compuerta, el freno y el tope centímetro a
 * centímetro, el sensor A de a un grado, la pesa a su lugar, el empuje con la fuerza elegida); no es un atajo
 * científico: no hay «medir la aceleración» ni «nivelar el carril».
 */
export function ActionPanelF04() {
  const { t } = useTranslation();
  useF04((s) => s.version);
  const rt = useF04((s) => s.runtime);
  const stage = useF04((s) => s.stage);
  const sel = useF04((s) => s.selected);
  const held = useF04((s) => s.held);
  const dispatch = useF04((s) => s.dispatch);
  const toast = useF04((s) => s.toast);
  const demo = useF04((s) => !!s.demo);
  const setSettings = useF04((s) => s.setSettings);
  const nudge = useRef<number | null>(null);
  const [pushN, setPushN] = useState(3);
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
      const k = `f04.cmd.${r.code}`;
      toast('warn', t(k) !== k ? t(k) : t('f04.cmd.FAILED'));
    }
    return r;
  };
  const D = (c: F04Command) => run(dispatch(c));
  const buttons: React.ReactNode[] = [];
  const add = (key: string, node: React.ReactNode) => buttons.push(<span key={key}>{node}</span>);
  const btn = (key: string, label: string, fn: () => unknown, cls = 'btn') => add(key, <button className={cls} onClick={() => run(fn() as never)}>{label}</button>);
  const hold = (key: string, label: string, fn: () => void, ms = 120) => add(key, <HoldButton onStart={() => startNudge(fn, ms)} onStop={stopNudge}>{label}</HoldButton>);
  const eye = (target = id) => btn('eye', `👁 ${t('f04.act.eyeLevel')}`, () => stage?.camera?.eyeLevel(eyeTargetFor(target)), 'btn ghost');
  const lens = (target: string, label: string) => btn(`lens${target}`, `📈 ${label}`, () => setSettings({ lens: target }), 'btn ghost');
  const sensorButtons = (sid: SensorId) => {
    const s = w.sensors[sid];
    btn('plug', t(s.connected ? 'f04.act.unplug' : 'f04.act.plug'), () => D({ type: 'connect', channel: sid, on: !s.connected }));
    btn('zero', t('f04.act.zero'), () => D({ type: 'zeroSensor', id: sid }));
    if (sid !== 'accel01') {
      const fid = sid as ForceId;
      btn('cal', t('f04.act.calibrate'), () => D({ type: 'calibrateSensor', id: fid }));
      const ranges = w.params.force.ranges;
      btn('range', t('f04.act.range', { n: ranges[(s.rangeIdx + 1) % ranges.length] }), () => D({ type: 'setRange', id: fid, n: (s.rangeIdx + 1) % ranges.length }));
      hold('tiltUp', `▲ ${t('f04.act.tiltUp')}`, () => void D({ type: 'mountSensor', id: fid, angleDeg: w.sensors[fid].angleDeg + 1 }), 200);
      hold('tiltDown', `▼ ${t('f04.act.tiltDown')}`, () => void D({ type: 'mountSensor', id: fid, angleDeg: w.sensors[fid].angleDeg - 1 }), 200);
      if (fid !== 'forceA') btn('sign', t('f04.act.sign', { s: s.axisSign > 0 ? '−' : '+' }), () => D({ type: 'setAxisSign', id: fid, sign: s.axisSign > 0 ? -1 : 1 }));
    }
  };
  const busy = runningF4(w);

  if (id && o) {
    switch (o.kind) {
      case 'track':
        hold('screwUp', `⟳ ${t('f04.act.screwUp')}`, () => void D({ type: 'turnLevelScrew', turns: 1 }), 300);
        hold('screwDown', `⟲ ${t('f04.act.screwDown')}`, () => void D({ type: 'turnLevelScrew', turns: -1 }), 300);
        btn('tilt', `🔍 ${t('f04.act.readTilt')}`, () => D({ type: 'readTilt' }), 'btn primary');
        break;
      case 'cart':
        if (w.cart.on === 'balance') btn('off', t('f04.act.offBalance'), () => D({ type: 'removeFromBalance' }), 'btn primary');
        else {
          if (w.cart.latched) btn('weigh', t('f04.act.weigh'), () => D({ type: 'placeOnBalance', id: 'cart01' }));
          btn('attach', t(w.string.attached ? 'f04.act.detach' : 'f04.act.attach'), () => D({ type: 'attachString', on: !w.string.attached }));
          btn('clip', t(w.logger.cableClipped ? 'f04.act.unclip' : 'f04.act.clip'), () => D({ type: 'clipCable', on: !w.logger.cableClipped }));
          if (w.cart.latched) {
            btn('release', `▶ ${t('f04.act.release')}`, () => ctl?.release() ?? D({ type: 'release' }), 'btn primary');
            btn('pushCart', t('f04.act.pushCart'), () => D({ type: 'pushCart', ms: 0.3 }), 'btn ghost');
          } else btn('return', `↩ ${t('f04.act.returnCart')}`, () => D({ type: 'returnCart' }), 'btn primary');
          if (!w.cart.latched && !busy) lens('logger01', t('f04.act.graph'));
        }
        eye('cart01');
        break;
      case 'latch':
        btn('release', `▶ ${t('f04.act.release')}`, () => ctl?.release() ?? D({ type: 'release' }), 'btn primary');
        break;
      case 'brake':
        btn('brake', t(w.brake.on ? 'f04.act.brakeOff' : 'f04.act.brakeOn'), () => D({ type: 'setBrake', on: !w.brake.on }), w.brake.on ? 'btn ghost' : 'btn primary');
        hold('brakeFwd', `◀ ${t('f04.act.towardPulley')}`, () => void D({ type: 'moveBrake', s: w.brake.s + 0.01 }));
        hold('brakeBack', `▶ ${t('f04.act.towardRelease')}`, () => void D({ type: 'moveBrake', s: w.brake.s - 0.01 }));
        break;
      case 'stop':
        hold('stopFwd', `◀ ${t('f04.act.towardPulley')}`, () => void D({ type: 'moveStop', s: w.stopS + 0.01 }));
        hold('stopBack', `▶ ${t('f04.act.towardRelease')}`, () => void D({ type: 'moveStop', s: w.stopS - 0.01 }));
        break;
      case 'pulley':
        btn('clamp', t(w.string.clamped ? 'f04.act.unclamp' : 'f04.act.clamp'), () => D({ type: 'clampPulley', on: !w.string.clamped }));
        btn('groove', t('f04.act.groove'), () => D({ type: 'threadString', path: 'groove' }), w.string.path === 'groove' ? 'btn ghost' : 'btn primary');
        btn('axle', t('f04.act.axle'), () => D({ type: 'threadString', path: 'axle' }), 'btn ghost');
        if (w.string.hung && w.string.held) btn('taut', t('f04.act.taut'), () => D({ type: 'tensionString' }), 'btn primary');
        break;
      case 'hanger':
        if (o.support === 'rack') {
          btn('hang', t('f04.act.hang'), () => D({ type: 'hangHanger', on: true }), 'btn primary');
          btn('weigh', t('f04.act.weigh'), () => D({ type: 'placeOnBalance', id: 'hanger01' }));
        } else if (o.support === 'balance') btn('off', t('f04.act.offBalance'), () => D({ type: 'removeFromBalance' }), 'btn primary');
        else if (o.support === 'floor') btn('pick', t('f04.act.pickUp'), () => D({ type: 'hangHanger', on: false }), 'btn primary');
        else {
          if (w.string.held) btn('taut', t('f04.act.taut'), () => D({ type: 'tensionString' }), 'btn primary');
          btn('unhang', t('f04.act.unhang'), () => D({ type: 'hangHanger', on: false }));
        }
        break;
      case 'slotMass':
        if (o.support === 'balance') btn('off', t('f04.act.offBalance'), () => D({ type: 'removeFromBalance' }), 'btn primary');
        else {
          if (o.support !== 'hanger01') btn('toHanger', t('f04.act.toHanger'), () => D({ type: 'placeMass', id, on: 'hanger' }), 'btn primary');
          if (o.support !== 'cart01') btn('toCart', t('f04.act.toCart'), () => D({ type: 'placeMass', id, on: 'cart' }));
          if (o.support !== 'rack') btn('toRack', t('f04.act.toRack'), () => D({ type: 'placeMass', id, on: 'rack' }));
          else btn('weigh', t('f04.act.weigh'), () => D({ type: 'placeOnBalance', id }));
        }
        break;
      case 'massRack':
        SLOT_MASSES.filter((m) => w.objects[m].support !== 'rack' && w.objects[m].support !== 'balance').forEach((m) => btn(`back${m}`, t('f04.act.massBack', { m: t(`f04.obj.${m}`) }), () => D({ type: 'placeMass', id: m, on: 'rack' })));
        btn('close', `✅ ${t('f04.act.closeStation')}`, () => D({ type: 'closeStation' }), 'btn primary');
        break;
      case 'forceSensor':
      case 'accelerometer':
        sensorButtons(id as SensorId);
        break;
      case 'logger': {
        const rates = w.params.rates;
        btn('rate', t('f04.act.rate', { hz: rates[(rates.indexOf(w.logger.rateHz) + 1) % rates.length] }), () => D({ type: 'setRate', hz: rates[(rates.indexOf(w.logger.rateHz) + 1) % rates.length] }));
        btn('gates', t(w.logger.gatesConnected ? 'f04.act.gatesOff' : 'f04.act.gatesOn'), () => D({ type: 'connect', channel: 'gates', on: !w.logger.gatesConnected }));
        lens('logger01', t('f04.act.graph'));
        lens('pair', t('f04.act.graphPair'));
        eye('logger01');
        break;
      }
      case 'gate': {
        const g = w.gates[id];
        hold('gFwd', `◀ ${t('f04.act.towardPulley')}`, () => void D({ type: 'moveGate', id: id as 'gate1' | 'gate2', s: g.s + 0.01 }));
        hold('gBack', `▶ ${t('f04.act.towardRelease')}`, () => void D({ type: 'moveGate', id: id as 'gate1' | 'gate2', s: g.s - 0.01 }));
        btn('scale', `🔍 ${t('f04.act.readScale')}`, () => ctl?.readScale(id as 'gate1' | 'gate2') ?? D({ type: 'readScale', target: id as 'gate1' | 'gate2', viewDeg: 0 }), 'btn primary');
        eye(id);
        break;
      }
      case 'balance':
        btn('tare', t('f04.act.tare'), () => D({ type: 'tareBalance' }));
        btn('read', `🔍 ${t('f04.act.readBalance')}`, () => ctl?.readBalance() ?? D({ type: 'readBalance' }), 'btn primary');
        if (w.balance.on) btn('off', t('f04.act.offBalance'), () => D({ type: 'removeFromBalance' }));
        eye('balance01');
        break;
      case 'pairTrack':
      case 'pairCart': {
        if (o.support === 'balance') {
          btn('off', t('f04.act.offBalance'), () => D({ type: 'removeFromBalance' }), 'btn primary');
          break;
        }
        add('pushN', (
          <label className="f04-push">{t('f04.act.pushForce')} <input type="range" min={0.5} max={8} step={0.5} value={pushN} onChange={(e) => setPushN(Number(e.target.value))} aria-valuetext={`${pushN} N`} /> <output>{pushN.toFixed(1).replace('.', ',')} N</output></label>
        ));
        btn('push', `👋 ${t('f04.act.push')}`, () => D({ type: 'push', forceN: pushN, durationS: 0.3 }), 'btn primary');
        btn('readPair', `🔍 ${t('f04.act.readPair')}`, () => D({ type: 'readPair' }));
        btn('reset', t('f04.act.resetPair'), () => D({ type: 'resetPair' }));
        if (id !== 'pairTrack01' && !w.pair.active) btn('weigh', t('f04.act.weigh'), () => D({ type: 'placeOnBalance', id }));
        lens('pair', t('f04.act.graphPair'));
        eye('pair');
        break;
      }
    }
    btn('insp', `🔍 ${t('f04.act.inspect')}`, () => {
      D({ type: 'inspect', target: id });
      stage?.focusObject(id, 4);
    }, 'btn ghost');
  }
  if (w.safety.block) btn('ack', `⚠ ${t('f04.act.acknowledge')}`, () => D({ type: 'acknowledge' }), 'btn primary');

  const desc = id ? describeObjectF04(w, id) : '';
  const fbdBody = id ? FBD_OF[id] : undefined;
  return (
    <section id="actions" className={`actions${demo ? ' demo-locked' : ''}`} aria-label={t('f04.act.title')} aria-disabled={demo || undefined}>
      <div className="desc" id="action-desc" aria-live="polite">{id ? desc : t('f04.act.none')}</div>
      <div className="row">{buttons}</div>
      {fbdBody && <FbdEditor body={fbdBody} />}
    </section>
  );
}
