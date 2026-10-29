import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useB04 } from './store';
import { describeObject, b04NameOf } from './describe';
import { HoldButton } from './ui';
import type { BioCommand } from '../../simulation/bio-world/commands';
import type { DispenseMode } from '../../simulation/bio-world/commands';
import type { BioController } from '../../engine/optical/bioController';
import { ASSAYS, BAR_IDS, BATH_IDS, BEAKER_IDS, LOT_CODE, PLATE_IDS, STAIN_JARS, WASTE_IDS } from '../../simulation/bio-world/world';
import { BALANCE_POS, BOARD_B04, GEO_B04, PLATE_POS, STAIN_JAR_POS } from '../../simulation/bio-world/geometry';
import { spotsFor } from '../../engine/optical/layout';

const A11Y_KEY = 'b02.a11yControls';
const readA11y = () => {
  try {
    return localStorage.getItem(A11Y_KEY) === '1';
  } catch {
    return false;
  }
};
const LOT_CODES = [...new Set(Object.values(LOT_CODE))];
const num = (v: number, d = 1) => v.toFixed(d).replace('.', ',');

/**
 * Panel de acciones de B04 (§13.1, §14): alternativa accesible a cada gesto. Despacha EXACTAMENTE los mismos comandos
 * del dominio que el controlador: balanza (tara, lectura), espátula y bote, hígado (pesar, cortar, al agua), placas
 * (calefacción, consigna, agitador) y barras, vertidos con su inclinación, pipetas (volumen, émbolo, forma de
 * descarga, enjuague), goteros, rótulos, agitado, tapón, colector de gas, cronómetro, tiras de pH, baños y pinza de
 * tubos, lecturas (volumen con el ángulo real de la cámara), fotómetro, residuos; y, como en B02, la caja de láminas y
 * los mandos del microscopio. Nada se «resuelve» automáticamente.
 */
export function ActionPanelB04() {
  const { t } = useTranslation();
  useB04((s) => s.version);
  const rt = useB04((s) => s.runtime);
  const stage = useB04((s) => s.stage);
  const sel = useB04((s) => s.selected);
  const held = useB04((s) => s.held);
  const dispatch = useB04((s) => s.dispatch);
  const toast = useB04((s) => s.toast);
  const mode = useB04((s) => s.settings.mode);
  const demo = useB04((s) => !!s.demo);
  const nudge = useRef<number | null>(null);
  const [target, setTarget] = useState('');
  const [tilt, setTilt] = useState(55);
  const [assay, setAssay] = useState<string>(ASSAYS[0]);
  const [code, setCode] = useState<string>(LOT_CODES[0]);
  const [vigor, setVigor] = useState(0.5);
  const [mixS, setMixS] = useState(5);
  const [depth, setDepth] = useState(1);
  const [waste, setWaste] = useState<string>('cw');
  const [roughPlunger, setRoughPlunger] = useState(false);
  const [dmode, setDmode] = useState<DispenseMode>('drain');
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
  const controls = (fn: () => void) => {
    add('a11y', <button className="btn ghost" aria-expanded={a11y} onClick={toggleA11y}>{a11y ? '▾' : '▸'} {t('b02.act.a11yControls')}</button>);
    if (a11y) fn();
  };
  const w = rt.world;
  const ctl = stage?.controller as BioController | undefined;
  const B = w.bio;
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
  const D = (c: BioCommand) => {
    const r = dispatch(c);
    if (!r.ok && r.code) {
      const k4 = `b04.cmd.${r.code}`;
      const k2 = `b02.cmd.${r.code}`;
      toast('warn', t(k4) !== k4 ? t(k4) : t(k2) !== k2 ? t(k2) : t('b02.cmd.FAILED'));
    }
    return r;
  };
  const read = (instrument: Parameters<BioController['read']>[0], tid: string) => (ctl ? ctl.read(instrument, tid) : D({ type: 'readInstrument', instrument, targetId: tid }));
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
  const select = (key: string, label: string, value: string, set: (v: string) => void, opts: Array<[string, string]>) =>
    add(key, (
      <label className="slider">
        <span>{t(label)}</span>
        <select aria-label={t(label)} value={value} onChange={(e) => set(e.target.value)}>
          <option value="">{t('nb.choose')}</option>
          {opts.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </label>
    ));
  /** Lleva un objeto a un apoyo con nombre (como soltarlo allí). */
  const moveTo = (oid: string, support: string, x: number, y: number, z = 0) => {
    if (held) ctl?.release();
    const r = D({ type: 'setPose', id: oid, pose: { x, y, z, rotationRad: 0 }, support });
    if (!r.ok) ctl?.layOnBench(oid, w.objects[oid].pose.x, w.objects[oid].pose.y);
  };
  const live = (k: string) => !B.tubes[k]?.discarded && w.objects[k] && !(WASTE_IDS as readonly string[]).includes(w.objects[k].support);
  const vessels = Object.keys(B.vessels).filter((k) => k !== 'spill' && k !== 'rb' && !(WASTE_IDS as readonly string[]).includes(k) && live(k));
  const names = (ids: string[]) => ids.map((k) => [k, B.tubes[k]?.label ? `${b04NameOf(w, k)} · ${B.tubes[k].label}` : b04NameOf(w, k)] as [string, string]);
  const tubes = Object.keys(B.tubes).filter(live);

  if (id && o) {
    if (o.movable && !held && o.support !== 'fc') btn('take', t('b02.act.take'), () => ctl?.beginDrag(id, true), 'btn ghost');
    if (held) {
      btn('drop', t('b02.act.release'), () => ctl?.release(), 'btn primary');
      hold('up', `▲ ${t('b02.act.up')}`, () => ctl?.nudgeHeight(0.5), 90);
      hold('down', `▼ ${t('b02.act.down')}`, () => ctl?.nudgeHeight(-0.5), 90);
      btn('cancel', t('b02.act.cancel'), () => ctl?.cancel(), 'btn ghost');
    }
    switch (o.kind) {
      case 'fixedSlide': {
        for (const s of spotsFor(w, o.kind)) {
          if (s.id === o.support || (s.id.startsWith('case:') && s.id.slice(5) !== w.slideCase.home[id])) continue;
          btn(`spot-${s.id}`, t(`b02.spot.${s.id.startsWith('case:') ? 'homeSlot' : s.id}`), () => moveTo(id, s.id, s.x, s.y, s.z), 'btn ghost');
        }
        // El frotis sin teñir se trata en los frascos de Feulgen (fijar → hidrolizar → lavar → Schiff).
        if (B.feulgen[id]) for (const j of STAIN_JARS) if (o.support !== j) btn(`jar-${j}`, `🧪 ${t('b04.act.toJar', { j: b04NameOf(w, j) })}`, () => moveTo(id, j, STAIN_JAR_POS[j].x, STAIN_JAR_POS[j].y, 2), 'btn ghost');
        if (o.support !== 'bench') btn('bench', t('b02.act.toBench'), () => ctl?.layOnBench(id, o.pose.x, o.pose.y - 6), 'btn ghost');
        btn('flip', t('b02.act.flip'), () => D({ type: 'flipSlide', slideId: id }), 'btn ghost');
        break;
      }
      case 'lensPaper':
        btn('lens', t('b02.act.cleanLens'), () => D({ type: 'wipe', targetId: 'mic:lens', toolId: 'lp' }));
        for (const fx of Object.keys(w.slides).filter((s) => w.objects[s]?.support === 'stage')) btn(`clean-${fx}`, t('b02.act.cleanSlide'), () => D({ type: 'wipe', targetId: fx, toolId: 'lp' }), 'btn ghost');
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
      case 'bioBottle':
      case 'bioCylinder':
      case 'bioBeaker': {
        if (B.pours[id]) {
          btn('stop', `⏹ ${t('b04.act.stopPour')}`, () => D({ type: 'stopPour', sourceId: id }), 'btn primary');
          break;
        }
        select('pourTo', 'b04.act.pourTo', target, setTarget, names(vessels.filter((x) => x !== id && w.objects[x].kind !== 'bioPipette' && w.objects[x].kind !== 'bioDropper')));
        slider('tilt', 'b04.act.tilt', tilt, setTilt, 20, 120, 5, `${tilt}°`);
        if (target && B.vessels[target]) btn('pour', `🫗 ${t('b04.act.startPour')}`, () => D({ type: 'startPour', sourceId: id, targetId: target, tiltDeg: tilt }), 'btn primary');
        if (o.kind !== 'bioBottle') {
          btn('readVol', `📏 ${t('b04.act.readVolume')}`, () => read('scale', id));
          btn('eyeVol', `👁 ${t('b04.act.eyeLevel')}`, () => stage?.camera?.eyeLevel(id), 'btn ghost');
        }
        if (o.kind === 'bioBeaker') {
          btn('thermo', `🌡 ${t('b04.act.thermo')}`, () => read('thermo', id));
          for (const p of PLATE_IDS) if (o.support !== p && !B.plates[p].vesselId) btn(`plate-${p}`, t('b04.act.onPlate', { p: b04NameOf(w, p) }), () => moveTo(id, p, PLATE_POS[p].x, PLATE_POS[p].y - 1.5, GEO_B04.hotplate.h + 0.4), 'btn ghost');
          if (o.support.startsWith('hp')) btn('offPlate', t('b04.act.offPlate'), () => ctl?.layOnBench(id, o.pose.x + 14, o.pose.y + 4), 'btn ghost');
          const bar = Object.entries(B.bars).find(([, v]) => v === id)?.[0];
          if (bar) btn('bar', t('b04.act.retrieveBar'), () => D({ type: 'retrieveStirBar', barId: bar }), 'btn ghost');
          else {
            const free = BAR_IDS.find((b) => !B.bars[b]);
            if (free) btn('bar', `🧲 ${t('b04.act.insertBar')}`, () => D({ type: 'insertStirBar', barId: free, vesselId: id }));
          }
          const prep = Object.values(B.preps).find((p) => p?.vesselId === id);
          if (prep && !prep.labeled) btn('lblPrep', `🏷 ${t('b04.act.labelPrep', { p: prep.id })}`, () => D({ type: 'labelVessel', vesselId: id, label: prep.id }), 'btn primary');
          btn('ph', `🧻 ${t('b04.act.phStrip')}`, () => D({ type: 'usePhStrip', vesselId: id }), 'btn ghost');
          select('waste', 'b04.act.waste', waste, setWaste, WASTE_IDS.map((x) => [x, b04NameOf(w, x === 'bw' ? 'bioWaste' : x === 'tr' ? 'trashBin' : x)]));
          if (waste) btn('dispose', `🗑 ${t('b04.act.dispose')}`, () => D({ type: 'disposeVessel', vesselId: id, wasteId: waste }), 'btn ghost');
        }
        break;
      }
      case 'bioPipette': {
        const loaded = B.vessels[id].volumeMl > (w.params.bio?.pipetteFilmMl ?? 0.02) + 1e-6;
        const pml = ctl?.pipetteMl ?? 2;
        if (id === 'pi') slider('pml', 'b04.act.pipetteVolume', pml, (v) => { if (ctl) ctl.pipetteMl = v; useB04.getState().bump(); }, 0.1, 5, 0.1, `${num(pml)} mL`);
        btn('zero', `📏 ${t('b04.act.readPipette')}`, () => read('scale', id), 'btn ghost');
        const sources = vessels.filter((x) => x !== id && !['dI', 'dNa', 'dCu', 'pi', 'pv'].includes(x));
        if (!loaded) {
          add('rough', <label className="check"><input type="checkbox" checked={roughPlunger} onChange={(e) => setRoughPlunger(e.target.checked)} /> {t('b04.act.roughPlunger')}</label>);
          select('from', 'b04.act.aspirateFrom', target, setTarget, names(sources));
          if (target && B.vessels[target]) btn('asp', `⬆ ${t('b04.act.aspirate')}`, () => D({ type: 'aspirate', toolId: id, sourceId: target, volumeMl: pml, speed01: roughPlunger ? 0.95 : 0.3 }), 'btn primary');
        } else {
          select('dmode', 'b04.act.dispenseMode', dmode, (v) => setDmode((v || 'drain') as DispenseMode), (['drain', 'blow', 'quick'] as const).map((m) => [m, t(`b04.act.mode_${m}`)]));
          select('into', 'b04.act.dispenseInto', target, setTarget, names(sources));
          if (target && B.vessels[target]) btn('dsp', `⬇ ${t('b04.act.dispense')}`, () => D({ type: 'dispense', toolId: id, targetId: target, mode: dmode }), 'btn primary');
        }
        btn('rinse', `🚿 ${t('b04.act.rinse')}`, () => D({ type: 'rinseTool', toolId: id }), 'btn ghost');
        break;
      }
      case 'bioDropper':
        for (const tid of tubes.filter((k) => B.vessels[k].volumeMl > 0)) {
          btn(`drop-${tid}`, `💧 ${t('b04.act.dropInto', { o: b04NameOf(w, tid), l: B.tubes[tid].label ?? '—' })}`, () => D({ type: 'squeezeDropper', dispenserId: id, targetId: tid, force01: 0.5, dxCm: 0, dyCm: 0 }));
        }
        break;
      case 'bioTube':
      case 'cuvette': {
        const tb = B.tubes[id];
        if (!tb || tb.discarded) break;
        if (o.kind === 'bioTube') {
          select('assay', 'b04.act.assay', assay, setAssay, ASSAYS.map((a) => [a, t(`b04.assay.${a}`)]));
          add('code', (
            <label className="slider">
              <span>{t('b04.act.lotCode')}</span>
              <input aria-label={t('b04.act.lotCode')} list="b04-lot-codes" value={code} maxLength={12} onChange={(e) => setCode(e.target.value.replace(/[^A-Za-z0-9-]/g, ''))} />
              <datalist id="b04-lot-codes">{LOT_CODES.map((c) => <option key={c} value={c} />)}</datalist>
            </label>
          ));
          if (assay && code) btn('doLabel', `🏷 ${t('b04.act.applyLabel', { l: `${assay}/${code}` })}`, () => D({ type: 'labelVessel', vesselId: id, label: `${assay}/${code}` }), tb.label ? 'btn ghost' : 'btn primary');
          slider('vigor', 'b04.act.vigor', vigor, setVigor);
          slider('mixS', 'b04.act.mixTime', mixS, setMixS, 1, 30, 1, `${mixS} s`);
          btn('mix', `🔄 ${t('b04.act.mix')}`, () => D({ type: 'mixTube', tubeId: id, vigor01: vigor, durationS: mixS }));
          btn('cap', tb.capped ? t('b04.act.uncap') : t('b04.act.cap'), () => D({ type: 'capTube', tubeId: id, capped: !tb.capped }), 'btn ghost');
          if (!tb.collector) {
            btn('colS', `🫧 ${t('b04.act.collectorSealed')}`, () => D({ type: 'connectCollector', tubeId: id, sealed: true }), 'btn ghost');
            btn('colL', t('b04.act.collectorLoose'), () => D({ type: 'connectCollector', tubeId: id, sealed: false }), 'btn ghost');
          } else {
            btn('gas', `📏 ${t('b04.act.readGas')}`, () => read('gas', id));
            btn('colOff', t('b04.act.collectorOff'), () => D({ type: 'disconnectCollector', tubeId: id }), 'btn ghost');
          }
          if (tb.timerAt === null) btn('timer', `⏱ ${t('b04.act.timer')}`, () => D({ type: 'startTimer', tubeId: id }), 'btn ghost');
          btn('ph', `🧻 ${t('b04.act.phStrip')}`, () => D({ type: 'usePhStrip', vesselId: id }), 'btn ghost');
          btn('thermo', `🌡 ${t('b04.act.thermo')}`, () => read('thermo', id), 'btn ghost');
          if (tb.bath) btn('out', t('b04.act.tongsOut'), () => D({ type: 'tongs', tubeId: id, to: 'home' }));
          else {
            slider('depth', 'b04.act.depth', depth, setDepth, 0.2, 1, 0.1);
            for (const b of BATH_IDS) btn(`bath-${b}`, `♨ ${t('b04.act.tongsInto', { b: b04NameOf(w, b) })}`, () => D({ type: 'tongs', tubeId: id, to: b, depth01: depth }), 'btn ghost');
          }
          btn('readTube', `👁 ${t('b04.act.readTube')}`, () => read('eye', id), 'btn primary');
        } else {
          btn('blank', `0️⃣ ${t('b04.act.blank')}`, () => D({ type: 'blankPhotometer', cuvetteId: id }), 'btn ghost');
          btn('abs', `📟 ${t('b04.act.readAbs')}`, () => read('photometer', id), 'btn primary');
        }
        select('waste', 'b04.act.waste', waste, setWaste, WASTE_IDS.map((x) => [x, b04NameOf(w, x === 'bw' ? 'bioWaste' : x === 'tr' ? 'trashBin' : x)]));
        if (waste) btn('dispose', `🗑 ${t('b04.act.dispose')}`, () => D({ type: 'disposeVessel', vesselId: id, wasteId: waste }), 'btn ghost');
        break;
      }
      case 'hotplate': {
        const p = B.plates[id];
        btn('power', `⏻ ${p.on ? t('b04.act.heatOff') : t('b04.act.heatOn')}`, () => D({ type: 'setHotplatePower', plateId: id, on: !p.on }));
        slider('set', 'b04.act.setpoint', p.setK - 273.15, (v) => D({ type: 'setHotplateSetpoint', plateId: id, temperatureK: v + 273.15 }), 25, 200, 1, `${Math.round(p.setK - 273.15)} °C`);
        slider('rpm', 'b04.act.rpm', p.rpm, (v) => D({ type: 'setStirRate', plateId: id, rpm: v }), 0, 1500, 50, `${p.rpm} rpm`);
        break;
      }
      case 'waterBath': {
        const b = B.baths[id];
        btn('power', `⏻ ${b.on ? t('b04.act.heatOff') : t('b04.act.heatOn')}`, () => D({ type: 'setBathPower', bathId: id, on: !b.on }));
        slider('set', 'b04.act.setpoint', b.setK - 273.15, (v) => D({ type: 'setBathSetpoint', bathId: id, temperatureK: v + 273.15 }), 25, 99, 1, `${Math.round(b.setK - 273.15)} °C`);
        btn('thermo', `🌡 ${t('b04.act.thermo')}`, () => read('thermo', id), 'btn ghost');
        break;
      }
      case 'balance':
        btn('tare', `⚖ ${t('b04.act.tare')}`, () => D({ type: 'tare', balanceId: 'bal' }));
        btn('readBal', `📟 ${t('b04.act.readBalance')}`, () => read('balance', 'bal'), 'btn primary');
        break;
      case 'weighBoat':
        if (o.support !== 'bal') btn('toBal', t('b04.act.toBalance'), () => moveTo(id, 'bal', BALANCE_POS.x, BALANCE_POS.y - 1.5, GEO_B04.balance.h + 0.3));
        for (const bk of BEAKER_IDS) btn(`empty-${bk}`, `⬇ ${t('b04.act.emptyBoat', { o: b04NameOf(w, bk) })}`, () => D({ type: 'emptyBoat', targetId: bk }), 'btn ghost');
        btn('cleanBoat', t('b04.act.cleanBoat'), () => D({ type: 'dryTool', toolId: 'bt' }), 'btn ghost');
        break;
      case 'spatula':
      case 'powderJar': {
        const g = ctl?.scoopG ?? 1;
        slider('scoop', 'b04.act.scoopMass', g, (v) => { if (ctl) ctl.scoopG = v; useB04.getState().bump(); }, 0.05, 5, 0.05, `${num(g, 2)} g`);
        for (const jar of ['jSt', 'jAm']) btn(`scoop-${jar}`, `🥄 ${t('b04.act.scoop', { o: b04NameOf(w, jar) })}`, () => D({ type: 'scoopSolid', toolId: 'spa', sourceId: jar, massG: g }));
        for (const tgt of ['bt', ...BEAKER_IDS]) btn(`dep-${tgt}`, `⬇ ${t('b04.act.deposit', { o: b04NameOf(w, tgt) })}`, () => D({ type: 'depositSolid', toolId: 'spa', targetId: tgt }), 'btn ghost');
        btn('dry', t('b04.act.drySpatula'), () => D({ type: 'dryTool', toolId: 'spa' }), 'btn ghost');
        break;
      }
      case 'liverSample':
      case 'scalpel': {
        if (B.liver.inVessel) break;
        const lv = w.objects.liv;
        if (lv.support !== 'bal') btn('toBal', t('b04.act.toBalance'), () => moveTo('liv', 'bal', BALANCE_POS.x, BALANCE_POS.y - 1.5, GEO_B04.balance.h + 0.3));
        if (lv.support !== 'cb') btn('toBoard', t('b04.act.toBoard'), () => moveTo('liv', 'cb', BOARD_B04.x, BOARD_B04.y, BOARD_B04.z));
        btn('cutFine', `🔪 ${t('b04.act.cutFine')}`, () => D({ type: 'cutTissue', sampleId: 'liv', toolId: 'sc', cutSizeCm: 0.5 }));
        btn('cutCoarse', t('b04.act.cutCoarse'), () => D({ type: 'cutTissue', sampleId: 'liv', toolId: 'sc', cutSizeCm: 2 }), 'btn ghost');
        for (const bk of BEAKER_IDS) btn(`add-${bk}`, `⬇ ${t('b04.act.addTissue', { o: b04NameOf(w, bk) })}`, () => D({ type: 'addTissue', sampleId: 'liv', vesselId: bk }), 'btn ghost');
        break;
      }
      case 'stirBar':
        if (B.bars[id]) btn('retrieve', t('b04.act.retrieveBar'), () => D({ type: 'retrieveStirBar', barId: id }));
        else for (const bk of BEAKER_IDS) btn(`ins-${bk}`, `🧲 ${t('b04.act.insertInto', { o: b04NameOf(w, bk) })}`, () => D({ type: 'insertStirBar', barId: id, vesselId: bk }), 'btn ghost');
        break;
      case 'bioThermo':
        for (const v of [...BEAKER_IDS, ...BATH_IDS, ...tubes.filter((k) => B.vessels[k].volumeMl > 0.5)]) btn(`th-${v}`, `🌡 ${t('b04.act.thermoIn', { o: b04NameOf(w, v) })}`, () => read('thermo', v), 'btn ghost');
        break;
      case 'phStrips':
        for (const v of [...BEAKER_IDS, ...tubes].filter((k) => B.vessels[k].volumeMl > 0.05)) btn(`ph-${v}`, `🧻 ${t('b04.act.phOn', { o: b04NameOf(w, v) })}`, () => D({ type: 'usePhStrip', vesselId: v }), 'btn ghost');
        break;
      case 'photometer':
        if (!B.adhEnabled) btn('req', t('b04.act.requestPhotometer'), () => D({ type: 'requestModule', module: 'photometer' }), 'btn ghost');
        break;
      case 'burner':
        btn('flame', B.burnerLit ? t('b04.act.burnerOff') : t('b04.act.burnerOn'), () => D({ type: 'lightBurner', on: !B.burnerLit }), 'btn ghost');
        break;
      case 'glassBin':
        if (w.shards > 0) btn('shards', `🗑 ${t('b02.act.cleanShards')}`, () => D({ type: 'cleanShards' }), 'btn primary');
        break;
    }
    btn('insp', `🔍 ${t('b02.act.inspect')}`, () => {
      D({ type: 'inspect', target: id });
      stage?.focusObject(id, 4);
    }, 'btn ghost');
  } else {
    if (B.vessels.spill.volumeMl > 1e-3 || w.benchSpillMl > 0.005) btn('spill', `🧻 ${t('b02.act.wipeSpill')}`, () => D({ type: 'wipe', targetId: 'bench', toolId: 'pp' }));
    if (!B.adhEnabled) btn('adh', t('b04.act.requestAdh'), () => D({ type: 'requestModule', module: 'adh' }), 'btn ghost');
    btn('close', t('b02.act.closeBench'), () => D({ type: 'closeBench' }), 'btn ghost');
  }

  const desc = id ? describeObject(w, id, mode) : '';
  return (
    <section id="actions" className={`actions${demo ? ' demo-locked' : ''}`} aria-label={t('b04.act.title')} aria-disabled={demo || undefined}>
      <div className="desc" id="action-desc" aria-live="polite">
        {id ? <><strong>{b04NameOf(w, id)}</strong>{desc ? ` — ${desc}` : ''}</> : t('b02.act.none')}
      </div>
      <div className="row">{buttons}</div>
    </section>
  );
}
