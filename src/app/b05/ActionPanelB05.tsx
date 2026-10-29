import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useB05 } from './store';
import { describeObject, b05NameOf, b05NameTag } from './describe';
import { HoldButton } from './ui';
import type { EnzCommand } from '../../simulation/enz-world/commands';
import type { EnzController } from '../../engine/optical/enzController';
import { TUBE_LABELS_B05 } from '../../practices/practice-b05/notebook';
import { spotsFor } from '../../engine/optical/layout';
import { BATH_IDS_B05, CLOCK_IDS_B05, PLATE_IDS_B05, TUBE_IDS_B05, WASTE_IDS_B05 } from '../../simulation/enz-world/geometry';

const OFFSETS: Record<string, [number, number]> = { center: [0, 0], edge: [1.1, 0], off: [1.8, 0] };

const A11Y_KEY = 'b02.a11yControls';
const readA11y = () => {
  try {
    return localStorage.getItem(A11Y_KEY) === '1';
  } catch {
    return false;
  }
};

/**
 * Panel de acciones de B05 (§14): alternativa accesible a cada gesto. Despacha EXACTAMENTE los mismos comandos del
 * dominio que el controlador: tara y lectura de la balanza, espátula (cargar, descargar), bisturí y tabla de hígado,
 * pastillas y placas (rpm y calor), vertido desde frascos, beakers y probetas, pipetas (volumen, aspirar, descargar,
 * enjuagar), rótulos, goteros de Lugol, Benedict, HCl y NaOH, tapones, agitado, captador de gas (conectar, sello,
 * llave, puesta a cero, lectura con el ángulo real de la cámara), baños, pinza, termómetro, tiras de pH,
 * cronómetros, blanco y lectura UV, mechero y descarte por clase; y, como en B02, la pinza, los goteros del montaje
 * de papa, el cubreobjetos, los papeles y los mandos del microscopio. Nada se «resuelve» automáticamente.
 */
export function ActionPanelB05() {
  const { t } = useTranslation();
  useB05((s) => s.version);
  const rt = useB05((s) => s.runtime);
  const stage = useB05((s) => s.stage);
  const sel = useB05((s) => s.selected);
  const held = useB05((s) => s.held);
  const dispatch = useB05((s) => s.dispatch);
  const toast = useB05((s) => s.toast);
  const mode = useB05((s) => s.settings.mode);
  const demo = useB05((s) => !!s.demo);
  const nudge = useRef<number | null>(null);
  const [pos, setPos] = useState<'center' | 'edge' | 'off'>('center');
  const [force, setForce] = useState(0.5);
  const [pourTo, setPourTo] = useState('');
  const [pourTilt, setPourTilt] = useState(55);
  const [target, setTarget] = useState('');
  const [tubeLabel, setTubeLabel] = useState<string>(TUBE_LABELS_B05[0]);
  const [waste, setWaste] = useState<string>('wAq');
  const [seal, setSeal] = useState(1);
  const [bathC, setBathC] = useState(37);
  const [heatC, setHeatC] = useState(90);
  const [a11y, setA11y] = useState(readA11y);
  if (!rt) return null;
  const toggleA11y = () => {
    setA11y(!a11y);
    try {
      localStorage.setItem(A11Y_KEY, a11y ? '0' : '1');
    } catch {
      // Sin almacenamiento: la preferencia dura lo que la sesión.
    }
  };
  const w = rt.world;
  const E = w.enz;
  const ctl = stage?.controller as EnzController | undefined;
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
  const D = (c: EnzCommand) => {
    const r = dispatch(c);
    if (!r.ok && r.code) {
      const own = `b05.cmd.${r.code}`;
      const k = t(own) !== own ? own : `b02.cmd.${r.code}`;
      toast('warn', t(k) !== k ? t(k) : t('b02.cmd.FAILED'));
    }
    return r;
  };
  const buttons: React.ReactNode[] = [];
  const add = (key: string, node: React.ReactNode) => buttons.push(<span key={key}>{node}</span>);
  const btn = (key: string, label: string, c: () => void, cls = 'btn') => add(key, <button className={cls} onClick={c}>{label}</button>);
  const hold = (key: string, label: string, fn: () => void, ms = 120) => add(key, <HoldButton onStart={() => startNudge(fn, ms)} onStop={stopNudge}>{label}</HoldButton>);
  const slider = (key: string, label: string, value: number, set: (v: number) => void, min = 0, max = 1, step = 0.05, out?: string) =>
    add(key, (
      <label className="slider">
        <span>{t(label)}</span>
        <input aria-label={t(label)} type="range" min={min} max={max} step={step} value={value} onChange={(e) => set(Number(e.target.value))} />
        <output>{out ?? `${Math.round(value * 100)} %`}</output>
      </label>
    ));
  const picker = (key: string, label: string, value: string, set: (v: string) => void, options: string[], name = (x: string) => b05NameTag(w, x)) =>
    add(key, (
      <label className="slider">
        <span>{t(label)}</span>
        <select aria-label={t(label)} value={value} onChange={(e) => set(e.target.value)}>
          <option value="">{t('nb.choose')}</option>
          {options.map((x) => <option key={x} value={x}>{name(x)}</option>)}
        </select>
      </label>
    ));
  const controls = (fn: () => void) => {
    add('a11y', <button className="btn ghost" aria-expanded={a11y} onClick={toggleA11y}>{a11y ? '▾' : '▸'} {t('b02.act.a11yControls')}</button>);
    if (a11y) fn();
  };
  const liveTubes = TUBE_IDS_B05.filter((k) => !E.tubes[k].discarded);
  const vessels = [...Object.keys(E.batches).map((b) => E.batches[b as 'P1']?.vesselId).filter((x): x is string => !!x), 'bk1', 'bk2', 'bk3', 'g100', 'g25', 'g10', ...liveTubes, ...(E.adhEnabled ? ['cq', 'cs', 'cp'] : [])]
    .filter((x, i, a) => a.indexOf(x) === i && x !== id && !!w.objects[x]);
  const prepSlide = Object.values(w.objects).find((x) => x.support === 'prep')?.id ?? null;
  const cell = w.cell;
  const posSel = () => add('pos', (
    <label className="slider">
      <span>{t('b02.act.where')}</span>
      <select aria-label={t('b02.act.where')} value={pos} onChange={(e) => setPos(e.target.value as typeof pos)}>
        {Object.keys(OFFSETS).map((k) => <option key={k} value={k}>{t(`b02.act.pos_${k}`)}</option>)}
      </select>
    </label>
  ));
  const [dx, dy] = OFFSETS[pos];
  const discard = (vid: string) => {
    picker('waste', 'b05.act.wasteClass', waste, setWaste, [...WASTE_IDS_B05]);
    if (waste) btn('discard', `🗑 ${t('b05.act.discardInto', { w: b05NameOf(w, waste) })}`, () => D({ type: 'discardLiquid', vesselId: vid, wasteId: waste }), 'btn ghost');
  };

  if (id && o) {
    if (o.movable && !held && o.support !== 'fc') btn('take', t('b02.act.take'), () => ctl?.beginDrag(id, true), 'btn ghost');
    if (held) {
      btn('drop', t('b02.act.release'), () => ctl?.release(), 'btn primary');
      hold('up', `▲ ${t('b02.act.up')}`, () => ctl?.nudgeHeight(0.5), 90);
      hold('down', `▼ ${t('b02.act.down')}`, () => ctl?.nudgeHeight(-0.5), 90);
      btn('cancel', t('b02.act.cancel'), () => ctl?.cancel(), 'btn ghost');
    }
    if (o.movable && o.kind === 'slide') {
      for (const s of spotsFor(w, o.kind)) {
        if (s.id === o.support) continue;
        btn(`spot-${s.id}`, t(`b02.spot.${s.id}`), () => {
          if (held) ctl?.release();
          const r = D({ type: 'setPose', id, pose: { x: s.x, y: s.y, z: s.z, rotationRad: 0 }, support: s.id });
          if (!r.ok) ctl?.layOnBench(id, o.pose.x, o.pose.y);
        }, 'btn ghost');
      }
    }
    switch (o.kind) {
      // ── Microscopio y montaje de papa (como B02) ──
      case 'forceps': {
        const h = w.forceps.holding;
        if (cell.held.fc) {
          posSel();
          if (prepSlide) btn('placeTissue', t('b02.act.placeOnSlide'), () => D({ type: 'placeSpecimen', toolId: 'fc', targetId: prepSlide, dxCm: dx, dyCm: dy }), 'btn primary');
        } else if (!h) {
          const cv = Object.keys(w.covers).find((c) => w.covers[c].state === 'box');
          if (cv) btn('cover', t('b02.act.pickCover'), () => D({ type: 'grabCover', coverId: cv, toolId: 'fc' }));
          if (prepSlide && w.mounts[prepSlide]?.coverId) btn('lift', t('b02.act.liftCover'), () => D({ type: 'liftCover', slideId: prepSlide, toolId: 'fc' }), 'btn ghost');
        } else if (h.kind === 'cover') {
          const c = w.covers[h.coverId];
          slider('tilt', 'b02.act.tilt', c.tiltDeg, (v) => D({ type: 'setCoverTilt', coverId: h.coverId, angleDeg: v }), 0, 90, 5, `${Math.round(c.tiltDeg)}°`);
          if (prepSlide) {
            btn('lowerSlow', t('b02.act.lowerSlow'), () => D({ type: 'lowerCover', coverId: h.coverId, slideId: prepSlide, speedCmS: 0.4, dxCm: 0, dyCm: 0 }), 'btn primary');
            btn('lowerFast', t('b02.act.lowerFast'), () => D({ type: 'lowerCover', coverId: h.coverId, slideId: prepSlide, speedCmS: 2.5, dxCm: 0, dyCm: 0 }));
          }
        }
        break;
      }
      case 'spatula':
        if (!cell.held.sp) btn('scrape', t('b05.act.scrapePotato'), () => D({ type: 'scrape', sourceId: 'pot', toolId: 'sp', distanceCm: 1.2, pressure01: 0.4 }), 'btn primary');
        else if (prepSlide) {
          posSel();
          btn('place', t('b02.act.placeOnSlide'), () => D({ type: 'placeSpecimen', toolId: 'sp', targetId: prepSlide, dxCm: dx, dyCm: dy }), 'btn primary');
        }
        break;
      case 'dropperBottle':
        if (prepSlide) {
          posSel();
          slider('force', 'b02.act.force', force, setForce);
          btn('squeeze', `💧 ${t('b02.act.squeeze')}`, () => D({ type: 'squeezeDropper', dispenserId: id, targetId: prepSlide, force01: force, dxCm: dx, dyCm: dy }), 'btn primary');
        }
        break;
      case 'paper':
        if (prepSlide) btn('edge', t('b02.act.wipeEdge'), () => D({ type: 'wipe', targetId: prepSlide, toolId: 'pp', dxCm: 1.1, dyCm: 0 }), 'btn primary');
        if (w.benchSpillMl > 0.005 || E.vessels.spill.volumeMl > 0.05) btn('spill', t('b02.act.wipeSpill'), () => D({ type: 'wipe', targetId: 'bench', toolId: 'pp' }));
        break;
      case 'lensPaper':
        if (prepSlide) btn('slide', t('b02.act.cleanSlide'), () => D({ type: 'wipe', targetId: prepSlide, toolId: 'lp' }));
        btn('lens', t('b02.act.cleanLens'), () => D({ type: 'wipe', targetId: 'mic:lens', toolId: 'lp' }));
        break;
      case 'microscope': {
        const m = w.microscope;
        controls(() => {
          btn('power', `⏻ ${m.power ? t('b02.act.powerOff') : t('b02.act.powerOn')}`, () => D({ type: 'setPower', device: 'microscope', on: !m.power }));
          btn('clip', m.clipOpen ? t('b02.act.clipClose') : t('b02.act.clipOpen'), () => D({ type: 'openClip', open: !m.clipOpen }));
          slider('light', 'b02.act.light', m.light01, (v) => D({ type: 'setIllumination', device: 'microscope', value01: v }));
          slider('diaph', 'b02.act.diaphragm', m.diaphragm01, (v) => D({ type: 'setDiaphragm', value01: v }));
          slider('cond', 'b02.act.condenser', m.condenser01, (v) => D({ type: 'setCondenser', value01: v }));
          hold('xm', 'X −', () => D({ type: 'setStageXY', xMm: m.stageXmm - 0.2, yMm: m.stageYmm }));
          hold('xp', 'X +', () => D({ type: 'setStageXY', xMm: m.stageXmm + 0.2, yMm: m.stageYmm }));
          hold('ym', 'Y −', () => D({ type: 'setStageXY', xMm: m.stageXmm, yMm: m.stageYmm - 0.2 }));
          hold('yp', 'Y +', () => D({ type: 'setStageXY', xMm: m.stageXmm, yMm: m.stageYmm + 0.2 }));
          hold('cu', `${t('b02.act.coarse')} ▲`, () => D({ type: 'turnCoarse', deltaTurns: 0.1 }), 160);
          hold('cd', `${t('b02.act.coarse')} ▼`, () => D({ type: 'turnCoarse', deltaTurns: -0.1 }), 160);
          hold('fu', `${t('b02.act.fine')} ▲`, () => D({ type: 'turnFine', deltaTurns: 0.05 }), 160);
          hold('fd', `${t('b02.act.fine')} ▼`, () => D({ type: 'turnFine', deltaTurns: -0.05 }), 160);
          btn('tp', `${t('b02.act.turret')} ▶`, () => D({ type: 'turnTurret', deltaDeg: ctl?.nextTurretDelta(1) ?? 120 }));
          btn('tm', `◀ ${t('b02.act.turret')}`, () => D({ type: 'turnTurret', deltaDeg: ctl?.nextTurretDelta(-1) ?? -120 }));
          btn('side', `👁 ${t('b02.act.checkSide')}`, () => ctl?.checkSide());
          btn('eye', `🔬 ${w.view.instrument === 'compound' ? t('b02.act.closeEyepiece') : t('b02.act.lookEyepiece')}`, () => D({ type: 'observe', instrument: 'compound', open: w.view.instrument !== 'compound' }), 'btn primary');
        });
        break;
      }
      case 'glassBin':
        if (w.shards > 0) btn('shards', `🗑 ${t('b02.act.cleanShards')}`, () => D({ type: 'cleanShards' }), 'btn primary');
        break;

      // ── Preparaciones (§5) ──
      case 'enzBalance':
        btn('tare', `⚖ ${t('b05.act.tare')}`, () => D({ type: 'tare', balanceId: 'bal' }), 'btn primary');
        btn('readBal', `📟 ${t('b05.act.readBalance')}`, () => ctl?.read('balance', 'bal'));
        break;
      case 'enzSpatula': {
        const loaded = Object.values(E.spatula).some((g) => g > 0.005);
        slider('mass', 'b05.act.massStep', ctl?.massG ?? 1, (v) => { if (ctl) ctl.massG = v; useB05.getState().bump(); }, 0.05, 15, 0.05, `${(ctl?.massG ?? 1).toFixed(2).replace('.', ',')} g`);
        if (!loaded) for (const j of ['jS', 'jA']) btn(`scoop-${j}`, `🥄 ${t('b05.act.scoopFrom', { o: b05NameOf(w, j) })}`, () => D({ type: 'scoop', toolId: 'sp2', sourceId: j, massG: ctl?.massG ?? 1 }), 'btn primary');
        else for (const to of ['wb', ...vessels.filter((x) => w.objects[x].kind === 'enzBeaker')]) btn(`tx-${to}`, `⬇ ${t('b05.act.unloadInto', { o: b05NameOf(w, to) })}`, () => D({ type: 'transferSolid', fromId: 'sp2', toId: to }));
        btn('rinseSp', `🚿 ${t('b05.act.rinse')}`, () => D({ type: 'rinseTool', toolId: 'sp2' }), 'btn ghost');
        break;
      }
      case 'enzBoat':
        for (const to of vessels.filter((x) => w.objects[x].kind === 'enzBeaker')) btn(`tx-${to}`, `⬇ ${t('b05.act.unloadInto', { o: b05NameOf(w, to) })}`, () => D({ type: 'transferSolid', fromId: 'wb', toId: to }));
        btn('rinseWb', `🚿 ${t('b05.act.rinse')}`, () => D({ type: 'rinseTool', toolId: 'wb' }), 'btn ghost');
        break;
      case 'enzLiver':
        slider('mass', 'b05.act.massStep', ctl?.massG ?? 1, (v) => { if (ctl) ctl.massG = v; useB05.getState().bump(); }, 0.05, 15, 0.05, `${(ctl?.massG ?? 1).toFixed(2).replace('.', ',')} g`);
        btn('cut', `🔪 ${t('b05.act.cutLiver')}`, () => D({ type: 'cutTissue', sourceId: id, toolId: 'ls', massG: ctl?.massG ?? 1 }), 'btn primary');
        break;
      case 'enzBoard':
        btn('mince', `🔪 ${t('b05.act.mince')}`, () => D({ type: 'mince', toolId: 'ls', strokes: 2 }), 'btn primary');
        btn('toBoat', `⬇ ${t('b05.act.unloadInto', { o: b05NameOf(w, 'wb') })}`, () => D({ type: 'transferSolid', fromId: 'bdL', toId: 'wb' }));
        for (const to of vessels.filter((x) => w.objects[x].kind === 'enzBeaker')) btn(`tx-${to}`, `⬇ ${t('b05.act.unloadInto', { o: b05NameOf(w, to) })}`, () => D({ type: 'transferSolid', fromId: 'bdL', toId: to }), 'btn ghost');
        break;
      case 'enzStirBar': {
        const inside = E.bars[id];
        if (inside) btn('out', t('b05.act.removeBar'), () => D({ type: 'removeStirBar', barId: id }), 'btn ghost');
        else for (const b of ['bk1', 'bk2', 'bk3']) btn(`in-${b}`, t('b05.act.insertBar', { o: b05NameOf(w, b) }), () => D({ type: 'insertStirBar', barId: id, vesselId: b }));
        break;
      }
      case 'enzPlate': {
        const pl = E.plates[id];
        slider('rpm', 'b05.act.rpm', pl.rpm, (v) => D({ type: 'setStir', plateId: id, rpm: v }), 0, 1500, 50, `${pl.rpm} rpm`);
        slider('heatC', 'b05.act.heatSet', heatC, setHeatC, 30, 300, 5, `${heatC} °C`);
        btn('heat', pl.heatOn ? `🔥✕ ${t('b05.act.heatOff')}` : `🔥 ${t('b05.act.heatOn')}`, () => D({ type: 'setHeat', plateId: id, on: !pl.heatOn, setpointK: heatC + 273.15 }), pl.heatOn ? 'btn primary' : 'btn ghost');
        break;
      }

      // ── Líquidos ──
      case 'enzBottle':
      case 'enzBeaker':
      case 'enzCylinder': {
        if (E.pours[id]) {
          btn('stop', `⏹ ${t('b05.act.stopPour')}`, () => D({ type: 'stopPour', sourceId: id }), 'btn primary');
          break;
        }
        picker('pourTo', 'b05.act.pourTo', pourTo, setPourTo, vessels);
        slider('tilt', 'b05.act.tilt', pourTilt, setPourTilt, 20, 120, 5, `${pourTilt}°`);
        if (pourTo) btn('pour', `🫗 ${t('b05.act.startPour')}`, () => D({ type: 'startPour', sourceId: id, targetId: pourTo, tiltDeg: pourTilt }), 'btn primary');
        if (o.kind !== 'enzBottle') {
          btn('read', `📏 ${t('b05.act.readScale')}`, () => ctl?.read('scale', id));
          btn('eyeLvl', `👁 ${t('b05.act.eyeLevel')}`, () => stage?.camera?.eyeLevel(id), 'btn ghost');
          btn('thermo', `🌡 ${t('b05.act.readThermo')}`, () => ctl?.read('thermo', id), 'btn ghost');
          btn('shake', t('b05.act.swirl'), () => D({ type: 'shake', targetId: id, strength01: 0.4 }), 'btn ghost');
          btn('rinseV', `🚿 ${t('b05.act.rinseVessel')}`, () => D({ type: 'rinseVessel', vesselId: id }), 'btn ghost');
          discard(id);
        }
        break;
      }
      case 'enzPipette': {
        const loaded = E.vessels[id].volumeMl > (w.params.enz?.pipettes[id]?.filmMl ?? 0.02) + 1e-6;
        const pml = ctl?.pipetteMl[id] ?? 1;
        const max = w.params.enz?.pipettes[id]?.capMl ?? 5;
        slider('pml', 'b05.act.pipetteVolume', pml, (v) => { if (ctl) ctl.pipetteMl[id] = v; useB05.getState().bump(); }, max / 20, max, max / 20, `${pml.toFixed(2).replace('.', ',')} mL`);
        const sources = [...vessels, 'hp', 'hpOld', 'st1', 'naoh', 'bW', ...(E.adhEnabled ? ['nad', 'eth', 'eth2', 'meth', 'adh'] : [])].filter((x) => !!E.vessels[x]);
        picker('pipT', loaded ? 'b05.act.dispenseInto' : 'b05.act.aspirateFrom', target, setTarget, sources);
        if (target && !loaded) btn('asp', `⬆ ${t('b05.act.aspirate')}`, () => D({ type: 'aspirate', toolId: id, sourceId: target, volumeMl: pml, speed01: 0.4 }), 'btn primary');
        if (target && loaded) btn('dsp', `⬇ ${t('b05.act.dispense')}`, () => D({ type: 'dispense', toolId: id, targetId: target }), 'btn primary');
        btn('rinse', `🚿 ${t('b05.act.rinse')}`, () => D({ type: 'rinseTool', toolId: id }), 'btn ghost');
        break;
      }
      case 'enzDropper':
        picker('dropT', 'b05.act.dropInto', target, setTarget, liveTubes.filter((k) => E.vessels[k].volumeMl > 0));
        if (target) {
          btn('drop1', `💧 ${t('b05.act.oneDrop')}`, () => D({ type: 'squeezeDropper', dispenserId: id, targetId: target, force01: 0.5, dxCm: 0, dyCm: 0 }), 'btn primary');
          btn('drop3', `💧×3 ${t('b05.act.threeDrops')}`, () => { for (let i = 0; i < 3; i++) D({ type: 'squeezeDropper', dispenserId: id, targetId: target, force01: 0.5, dxCm: 0, dyCm: 0 }); });
        }
        break;
      case 'enzTube': {
        const tb = E.tubes[id];
        if (!tb || tb.discarded) break;
        if (!tb.label) {
          picker('lbl', 'b05.act.label', tubeLabel, setTubeLabel, [...TUBE_LABELS_B05], (x) => x);
          btn('doLabel', `🏷 ${t('b05.act.applyLabel')}`, () => D({ type: 'labelTube', tubeId: id, label: tubeLabel }), 'btn primary');
        }
        btn('readTube', `👁 ${t('b05.act.readColor')}`, () => ctl?.read('eye', id));
        btn('foam', t('b05.act.readFoam'), () => ctl?.read('foam', id), 'btn ghost');
        btn('thermo', `🌡 ${t('b05.act.readThermo')}`, () => ctl?.read('thermo', id), 'btn ghost');
        btn('strip', t('b05.act.dipStrip'), () => D({ type: 'dipStrip', targetId: id }), 'btn ghost');
        btn('stopper', tb.stoppered ? t('b05.act.unstopper') : t('b05.act.stopper'), () => D({ type: 'stopperTube', tubeId: id, closed: !tb.stoppered }), 'btn ghost');
        btn('shake', t('b05.act.shake'), () => D({ type: 'shake', targetId: id, strength01: 0.4 }), 'btn ghost');
        if (E.collector.tubeId === id) btn('disc', t('b05.act.disconnect'), () => D({ type: 'setCollector', tubeId: null }), 'btn ghost');
        else {
          slider('seal', 'b05.act.seal', seal, setSeal);
          btn('conn', `🔗 ${t('b05.act.connect')}`, () => D({ type: 'setCollector', tubeId: id, seal01: seal }));
        }
        for (const b of BATH_IDS_B05) if (tb.bath?.id !== b) btn(`tg-${b}`, `🗜 ${t('b05.act.tongsTo', { o: b05NameOf(w, b) })}`, () => D({ type: 'tongs', tubeId: id, to: b, depth01: 1 }), 'btn ghost');
        if (tb.bath) btn('tgRack', `🗜 ${t('b05.act.tongsRack')}`, () => D({ type: 'tongs', tubeId: id, to: 'rack' }), 'btn ghost');
        discard(id);
        break;
      }
      case 'enzCollector': {
        const c = E.collector;
        btn('readGc', `📏 ${t('b05.act.readCollector')}`, () => ctl?.read('collector', 'gc'), 'btn primary');
        btn('eyeGc', `👁 ${t('b05.act.eyeLevel')}`, () => stage?.camera?.eyeLevel('gc'), 'btn ghost');
        btn('valve', c.stopcockOpen ? t('b05.act.valveClose') : t('b05.act.valveOpen'), () => D({ type: 'setStopcock', open: !c.stopcockOpen }), 'btn ghost');
        btn('reset', t('b05.act.resetCollector'), () => D({ type: 'resetCollector' }), 'btn ghost');
        break;
      }
      case 'enzBath': {
        const b = E.baths[id];
        slider('bathC', 'b05.act.bathSet', bathC, setBathC, 20, 95, 0.5, `${bathC.toFixed(1).replace('.', ',')} °C`);
        btn('set', t('b05.act.applySet'), () => D({ type: 'setBath', bathId: id, setpointK: bathC + 273.15 }));
        btn('power', b.on ? `⏻ ${t('b05.act.off')}` : `⏻ ${t('b05.act.on')}`, () => D({ type: 'setBath', bathId: id, on: !b.on }), 'btn primary');
        btn('thermo', `🌡 ${t('b05.act.readThermo')}`, () => ctl?.read('thermo', id), 'btn ghost');
        break;
      }
      case 'enzThermo':
        picker('thT', 'b05.act.thermoIn', target, setTarget, [...BATH_IDS_B05, ...vessels]);
        if (target) btn('read', `🌡 ${t('b05.act.readThermo')}`, () => ctl?.read('thermo', target), 'btn primary');
        break;
      case 'enzStrips':
        picker('stT', 'b05.act.dipStrip', target, setTarget, vessels);
        if (target) btn('dip', t('b05.act.dipStrip'), () => D({ type: 'dipStrip', targetId: target }), 'btn primary');
        break;
      case 'enzClock': {
        const c = E.clocks[id];
        btn('start', c.running ? `⏸ ${t('b05.act.clockStop')}` : `▶ ${t('b05.act.clockStart')}`, () => D({ type: 'clock', clockId: id, action: c.running ? 'stop' : 'start' }), 'btn primary');
        btn('reset', t('b05.act.clockReset'), () => D({ type: 'clock', clockId: id, action: 'reset' }), 'btn ghost');
        btn('read', `⏱ ${t('b05.act.readClock')}`, () => ctl?.read('clock', id));
        break;
      }
      case 'enzPhotometer':
        for (const cu of ['cq', 'cs', 'cp']) {
          btn(`blank-${cu}`, t('b05.act.uvBlank', { o: b05NameOf(w, cu) }), () => D({ type: 'setUVBlank', cuvetteId: cu }), 'btn ghost');
          btn(`read-${cu}`, `📟 ${t('b05.act.uvRead', { o: b05NameOf(w, cu) })}`, () => ctl?.read('uv', cu));
        }
        break;
      case 'enzCuvette':
        btn('rinseC', `🚿 ${t('b05.act.rinseVessel')}`, () => D({ type: 'rinseVessel', vesselId: id }), 'btn ghost');
        discard(id);
        break;
      case 'enzBurner':
        btn('burner', E.burnerLit ? `🔥✕ ${t('b05.act.burnerOff')}` : `🔥 ${t('b05.act.burnerOn')}`, () => D({ type: 'setBurner', on: !E.burnerLit }), 'btn ghost');
        break;
    }
    btn('insp', `🔍 ${t('b02.act.inspect')}`, () => {
      D({ type: 'inspect', target: id });
      stage?.focusObject(id, 4);
    }, 'btn ghost');
  } else {
    for (const c of CLOCK_IDS_B05) btn(`clk-${c}`, `⏱ ${b05NameOf(w, c)} ${E.clocks[c].running ? '⏸' : '▶'}`, () => D({ type: 'clock', clockId: c, action: E.clocks[c].running ? 'stop' : 'start' }), 'btn ghost');
    for (const p of PLATE_IDS_B05) if (E.plates[p].heatOn || E.plates[p].rpm > 0) btn(`off-${p}`, t('b05.act.plateOff', { o: b05NameOf(w, p) }), () => { D({ type: 'setHeat', plateId: p, on: false }); D({ type: 'setStir', plateId: p, rpm: 0 }); }, 'btn ghost');
    btn('close', t('b02.act.closeBench'), () => D({ type: 'closeBench' }), 'btn ghost');
  }

  const desc = id ? describeObject(w, id, mode) : '';
  return (
    <section id="actions" className={`actions${demo ? ' demo-locked' : ''}`} aria-label={t('b05.act.title')} aria-disabled={demo || undefined}>
      <div className="desc" id="action-desc" aria-live="polite">
        {id ? <><strong>{b05NameTag(w, id)}</strong>{desc ? ` — ${desc}` : ''}</> : t('b02.act.none')}
      </div>
      <div className="row">{buttons}</div>
    </section>
  );
}
