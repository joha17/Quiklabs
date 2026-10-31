import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useB08 } from './store';
import { b08NameOf } from './describe';
import type { PhotoCommand } from '../../simulation/photo-world/commands';
import { bandsOf, btbColorOf, elapsedOf, lampDistance, seriesElapsed } from '../../simulation/photo-world/world';
import { drawPaper } from '../../engine/optical/objects3dPhoto';

type Tab = 'gas' | 'btb' | 'extract' | 'paper';
const TAB_OF: Record<string, Tab> = {
  gasTube: 'gas', gasRack: 'gas', thermalTank: 'gas', sprigTray: 'gas',
  btbTube: 'btb', btbRack: 'btb', btbDropper: 'btb', co2Dispenser: 'btb',
  fumeHood: 'extract', solventBottle: 'extract', leafBalance: 'extract', mortar: 'extract', spinachLeaf: 'extract', sepTube: 'extract', extractVial: 'extract',
  chromPaper: 'paper', paperStand: 'paper', devTube: 'paper',
};
const PAPER_W = 60;
const PAPER_H = 440;

/**
 * Mesa de trabajo de B08: tubo y capilar, indicador, extracción en campana y papel con regla. Se abre al elegir el objeto. Cada
 * control envía un HECHO (asiento del tapón, altura del ojo, posición marcada); el dominio decide lo que resulta y la lectura.
 */
export function BenchPanelB08() {
  const { t } = useTranslation();
  useB08((s) => s.version);
  const rt = useB08((s) => s.runtime);
  const sel = useB08((s) => s.selected);
  const dispatch = useB08((s) => s.dispatch);
  const toast = useB08((s) => s.toast);
  const demo = useB08((s) => !!s.demo);
  const [tab, setTab] = useState<Tab | null>(null);
  const [tube, setTube] = useState('gL');
  const [btb, setBtb] = useState('bN');
  const [vol, setVol] = useState(30);
  const [tilt, setTilt] = useState(30);
  const [seat, setSeat] = useState(1);
  const [contact, setContact] = useState(1);
  const [level, setLevel] = useState(0);
  const [eye, setEye] = useState(0);
  const [dicKnown, setDicKnown] = useState(true);
  const [tempC, setTempC] = useState(25);
  const [dist, setDist] = useState(20);
  const [power, setPower] = useState(100);
  const [unit, setUnit] = useState<'au' | 'par'>('au');
  const [btbMl, setBtbMl] = useState(10);
  const [drops, setDrops] = useState(4);
  const [units, setUnits] = useState(3);
  const [aligned, setAligned] = useState(true);
  const [leafG, setLeafG] = useState(1);
  const [strokes, setStrokes] = useState(14);
  const [solvMl, setSolvMl] = useState(4);
  const [shakeI, setShakeI] = useState(1);
  const [mm, setMm] = useState(20);
  const [tool, setTool] = useState<'pencil' | 'pen'>('pencil');
  const [spot, setSpot] = useState<'small' | 'large'>('small');
  const [eluentMm, setEluentMm] = useState(10);
  const [paperTilt, setPaperTilt] = useState(0);
  const [clip, setClip] = useState(true);
  const [band, setBand] = useState('');
  const paperRef = useRef<HTMLCanvasElement>(null);
  const w = rt?.world;
  const kind = sel && w ? w.objects[sel]?.kind : undefined;

  useEffect(() => {
    if (!kind) return;
    // Otro objeto en la mano o elegido: la mesa se aparta para no tapar la escena.
    setTab(TAB_OF[kind] ?? null);
    if (kind === 'gasTube' && sel) setTube(sel);
    if (kind === 'btbTube' && sel) setBtb(sel);
  }, [kind, sel]);

  useEffect(() => {
    const ctx = paperRef.current?.getContext('2d');
    if (!ctx || !w) return;
    drawPaper(ctx, PAPER_W, PAPER_H, w);
    const L = w.params.photo!.paperLengthMm;
    ctx.fillStyle = '#333';
    ctx.font = '9px sans-serif';
    for (let k = 0; k <= L; k += 10) {
      const y = PAPER_H - (k / L) * PAPER_H;
      ctx.fillRect(PAPER_W - (k % 50 ? 4 : 8), y, k % 50 ? 4 : 8, 1);
      if (k % 50 === 0) ctx.fillText(String(k), 1, Math.max(9, y - 1));
    }
    ctx.fillStyle = 'rgba(200,30,30,.8)';
    ctx.fillRect(0, PAPER_H - (mm / L) * PAPER_H, PAPER_W, 1);
  });

  if (!rt || !w || !tab || demo) return null;
  const m = w.photo;
  const D = (c: PhotoCommand) => {
    const r = dispatch(c);
    if (!r.ok && r.code) {
      const k = `b08.cmd.${r.code}`;
      toast('warn', t(k) !== k ? t(k) : t('b08.cmd.FAILED'));
    }
    return r;
  };
  const num = (label: string, v: number, set: (x: number) => void, min: number, max: number, step = 1, suffix = '') => (
    <label className="slider">
      <span>{label}</span>
      <input aria-label={label} type="range" min={min} max={max} step={step} value={v} onChange={(e) => set(Number(e.target.value))} />
      <output>{v}{suffix}</output>
    </label>
  );
  const b = (label: string, c: PhotoCommand, cls = 'btn small') => <button className={cls} onClick={() => D(c)}>{label}</button>;
  const pick = (ids: string[], v: string, set: (x: string) => void, label: string) => (
    <select aria-label={label} value={v} onChange={(e) => set(e.target.value)}>{ids.map((x) => <option key={x} value={x}>{b08NameOf(w, x)}</option>)}</select>
  );
  const lampRow = (lampId: string, target: string) => {
    const lamp = m.lamps[lampId];
    const p = w.objects[target].pose;
    return (
      <div className="row">
        {num(t('b08.bench.power'), power, setPower, 0, 100, 5, ' %')}
        {b(lamp.on ? t('b08.bench.lampOff') : t('b08.bench.lampOn'), { type: 'setLamp', lampId, on: !lamp.on, powerPct: power })}
        {num(t('b08.bench.distance'), dist, setDist, 10, 60, 5, ' cm')}
        <button className="btn small" onClick={() => D({ type: 'setPose', id: lampId, pose: { x: p.x, y: p.y + dist, z: 0, rotationRad: 0 } })}>{t('b08.bench.placeLamp', { o: b08NameOf(w, target) })}</button>
        <span className="hint">{t('b08.bench.lampNow', { d: Math.round(lampDistance(w, target)) })}</span>
      </div>
    );
  };
  const g = m.tubes[tube];
  const bt = m.btb[btb];
  const bands = bandsOf(w);
  const canvasMm = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const L = w.params.photo!.paperLengthMm;
    setMm(Math.round(((r.bottom - e.clientY) / r.height) * L));
  };
  const elapsed = elapsedOf(w);
  const sElapsed = seriesElapsed(w);
  return (
    <section className="bench-panel" role="dialog" aria-label={t(`b08.bench.tab.${tab}`)} data-testid="b08-bench" style={{ position: 'absolute', top: '0.6rem', left: '3.4rem', width: 'min(24rem, 80%)', maxHeight: '92%', overflow: 'auto', background: 'var(--surface, #fff)', borderRadius: '0.5rem', padding: '0.6rem', boxShadow: '0 4px 18px rgba(0,0,0,.25)', zIndex: 5, display: 'grid', gap: '0.4rem' }}>
      <div className="tabs" role="tablist">
        {(['gas', 'btb', 'extract', 'paper'] as Tab[]).map((k) => <button key={k} role="tab" aria-selected={tab === k} className={`tab${tab === k ? ' on' : ''}`} onClick={() => setTab(k)}>{t(`b08.bench.tab.${k}`)}</button>)}
        <button className="btn small ghost" aria-label={t('nb.close')} onClick={() => setTab(null)}>✕</button>
      </div>
      {tab === 'gas' && (
        <>
          {pick(Object.keys(m.tubes), tube, setTube, t('b08.bench.tube'))}
          <div className="row">
            {num(t('b08.bench.volume'), vol, setVol, 5, 70, 1, ' mL')}
            {num(t('b08.bench.tilt'), tilt, setTilt, 0, 90, 5, '°')}
            {b(t('b08.bench.fill'), { type: 'fillTube', tubeId: tube, mL: vol, tiltDeg: tilt })}
            {g.bubble && b(t('b08.bench.tap'), { type: 'tapBubble', tubeId: tube })}
          </div>
          <div className="row">
            {num(t('b08.bench.seat'), seat, setSeat, 0, 1, 0.1)}
            {b(t('b08.bench.stopper'), { type: 'setStopper', tubeId: tube, seat01: seat })}
            {num(t('b08.bench.contact'), contact, setContact, 0, 1, 0.1)}
            {b(t('b08.bench.capillary'), { type: 'connectCapillary', tubeId: tube, contact01: contact })}
            {b(t('b08.bench.clear'), { type: 'clearCapillary', tubeId: tube })}
          </div>
          <div className="row">
            {num(t('b08.bench.level'), level, setLevel, -15, 15, 1, '°')}
            {b(t('b08.bench.applyLevel'), { type: 'levelCapillary', tubeId: tube, deg: level })}
            {b(t('b08.val.light'), { type: 'labelTube', tubeId: tube, label: 'light' })}
            {b(t('b08.val.dark'), { type: 'labelTube', tubeId: tube, label: 'dark' })}
          </div>
          <div className="row">
            <label className="check"><input type="checkbox" checked={dicKnown} onChange={(e) => setDicKnown(e.target.checked)} /> {t('b08.bench.dicKnown')}</label>
            {num(t('b08.bench.temp'), tempC, setTempC, 15, 40, 1, ' °C')}
            <select aria-label={t('b08.bench.unit')} value={unit} onChange={(e) => setUnit(e.target.value as 'au' | 'par')}><option value="au">{t('b08.bench.unitAu')}</option><option value="par">{t('b08.bench.unitPar')}</option></select>
            <button className="btn small" onClick={() => D({ type: 'recordControls', dicKnown, tempC, distanceCm: dist, powerIndex: power, lightUnit: unit })}>{t('b08.bench.recordControls')}</button>
          </div>
          {lampRow('lampG', tube)}
          <div className="row">
            {num(t('b08.bench.eye'), eye, setEye, -6, 6, 1, ' cm')}
            {b(t('b08.bench.baseline'), { type: 'markBaseline', tubeId: tube, eyeOffsetCm: eye })}
            {m.runStartedAt === null ? b(t('b08.bench.startRun'), { type: 'startGasRun' }, 'btn small primary') : b(t('b08.bench.read'), { type: 'readMeniscus', tubeId: tube, eyeOffsetCm: eye }, 'btn small primary')}
            {b(t('b08.bench.stir'), { type: 'stirTube', tubeId: tube })}
            {b(t('b08.bench.open'), { type: 'openStopper', tubeId: tube })}
          </div>
          <p className="hint" aria-live="off">{elapsed === null ? t('b08.bench.notStarted') : t('b08.bench.elapsed', { s: Math.floor(elapsed), total: w.params.photo!.runDurationS })}</p>
          <ul className="fb-list">{m.readings.filter((r) => r.target === tube).map((r) => <li key={r.id}>{r.id} · {t(`b08.reading.${r.kind}`)}: {r.value} {r.unit}</li>)}</ul>
        </>
      )}
      {tab === 'btb' && (
        <>
          {pick(Object.keys(m.btb), btb, setBtb, t('b08.bench.tube'))}
          <div className="row">
            {num(t('b08.bench.volume'), btbMl, setBtbMl, 2, 20, 1, ' mL')}
            {b(t('b08.bench.fill'), { type: 'fillBtb', tubeId: btb, mL: btbMl })}
            {num(t('b08.bench.drops'), drops, setDrops, 1, 8)}
            {b(t('b08.bench.addDrops'), { type: 'addIndicator', tubeId: btb, drops })}
          </div>
          <div className="row">
            {num(t('b08.bench.units'), units, setUnits, 1, 8)}
            <label className="check"><input type="checkbox" checked={aligned} onChange={(e) => setAligned(e.target.checked)} /> {t('b08.bench.aligned')}</label>
            {b(t('b08.bench.dose'), { type: 'doseCO2', tubeId: btb, units, aligned })}
          </div>
          {lampRow('lampB', btb)}
          <div className="row">
            {b(t('b08.bench.readColor'), { type: 'readIndicator', tubeId: btb }, 'btn small primary')}
            {m.seriesStartedAt === null && b(t('b08.bench.startSeries'), { type: 'startSeries' }, 'btn small primary')}
          </div>
          <p className="hint">{sElapsed === null ? t('b08.bench.notStarted') : t('b08.bench.elapsed', { s: Math.floor(sElapsed), total: w.params.photo!.seriesDurationS })} · {t('b08.bench.color')}: {bt.drops ? t(`b08.val.${btbColorOf(w, btb)}`) : '—'}</p>
          <p className="hint">{t('b08.bench.btbNote')}</p>
          <ul className="fb-list">{m.readings.filter((r) => r.target === btb).map((r) => <li key={r.id}>{r.id} · {r.elapsedS === null ? t('b08.bench.before') : `${Math.round(r.elapsedS)} s`} · {t(`b08.val.${r.color}`)}{r.ph != null ? ` · pH ${r.ph}` : ''}</li>)}</ul>
        </>
      )}
      {tab === 'extract' && (
        <>
          <p className="hint virtual-note">{t('b08.bench.virtualSolvent')}</p>
          <div className="row">
            {b(m.hood.on ? t('b08.bench.hoodOff') : t('b08.bench.hoodOn'), { type: 'setHood', on: !m.hood.on, sashOk: true })}
            {b(t('b08.bench.weigh'), { type: 'weighLeaf' })}
            <span className="hint">{m.leaf.weighedG === null ? '—' : `${m.leaf.weighedG} g`}</span>
          </div>
          <div className="row">
            {num(t('b08.bench.mass'), leafG, setLeafG, 0.2, 2, 0.1, ' g')}
            {b(t('b08.bench.transfer'), { type: 'transferLeaf', g: leafG, inside: true })}
            {num(t('b08.bench.strokes'), strokes, setStrokes, 1, 30)}
            {b(t('b08.bench.grind'), { type: 'grind', strokes })}
          </div>
          <div className="row">
            {num(t('b08.bench.addMl'), solvMl, setSolvMl, 0.5, 6, 0.5, ' mL')}
          </div>
          <ul className="fb-list">
            {Object.keys(m.solvents).filter((x) => x !== 'bE').map((x) => (
              <li key={x} className="row">
                <span>{b08NameOf(w, x)}</span>
                {b(m.solvents[x].open ? t('b08.bench.closeBottle') : t('b08.bench.openBottle'), { type: m.solvents[x].open ? 'closeSolvent' : 'openSolvent', bottleId: x })}
                {b(t('b08.bench.add'), { type: 'addSolvent', bottleId: x, mL: solvMl })}
              </li>
            ))}
          </ul>
          <div className="row">
            {b(m.sep.closed ? t('b08.bench.uncap') : t('b08.bench.cap'), { type: 'capSepTube', closed: !m.sep.closed })}
            {num(t('b08.bench.shakeI'), shakeI, setShakeI, 0, 1, 0.1)}
            {b(t('b08.bench.shake'), { type: 'shake', intensity01: shakeI, seconds: 10 })}
          </div>
          <div className="row">
            {(['upper', 'interface', 'lower'] as const).map((z) => <span key={z}>{b(t(`b08.bench.asp_${z}`), { type: 'aspirate', zone: z })}</span>)}
            <span className="hint">{m.vialReady ? t('b08.bench.vialReady') : ''}</span>
          </div>
        </>
      )}
      {tab === 'paper' && (
        <div className="paper-layout">
          <canvas ref={paperRef} width={PAPER_W} height={PAPER_H} className="paper-canvas" role="img" aria-label={t('b08.bench.paperAlt')} onClick={canvasMm} />
          <div style={{ display: 'grid', gap: '0.35rem', alignContent: 'start' }}>
            <p className="hint">{t('b08.bench.paperNote')}</p>
            <div className="row">
              {b(t('b08.bench.cut'), { type: 'cutPaper' })}
              <select aria-label={t('b08.bench.tool')} value={tool} onChange={(e) => setTool(e.target.value as 'pencil' | 'pen')}><option value="pencil">{t('b08.bench.pencil')}</option><option value="pen">{t('b08.bench.pen')}</option></select>
            </div>
            <label className="field">{t('b08.bench.rulerAt')}
              <input type="number" min={0} max={220} step={1} value={mm} onChange={(e) => setMm(Number(e.target.value))} />
            </label>
            <div className="row">
              {b(t('b08.bench.markOrigin'), { type: 'markOrigin', tool, mm })}
              <select aria-label={t('b08.bench.spot')} value={spot} onChange={(e) => setSpot(e.target.value as 'small' | 'large')}><option value="small">{t('b08.bench.small')}</option><option value="large">{t('b08.bench.large')}</option></select>
              {b(t('b08.bench.applySpot'), { type: 'applySpot', size: spot })}
            </div>
            <div className="row">
              {num(t('b08.bench.eluent'), eluentMm, setEluentMm, 2, 35, 1, ' mm')}
              {b(t('b08.bench.openEluent'), { type: m.solvents.bE.open ? 'closeSolvent' : 'openSolvent', bottleId: 'bE' })}
              {b(t('b08.bench.pour'), { type: 'pourEluent', bottleId: 'bE', levelMm: eluentMm })}
            </div>
            <div className="row">
              {num(t('b08.bench.paperTilt'), paperTilt, setPaperTilt, 0, 20, 1, '°')}
              <label className="check"><input type="checkbox" checked={clip} onChange={(e) => setClip(e.target.checked)} /> {t('b08.bench.clip')}</label>
              {b(t('b08.bench.hang'), { type: 'hangPaper', tiltDeg: paperTilt, clip })}
              {b(m.paper.chamberClosed ? t('b08.bench.openChamber') : t('b08.bench.closeChamber'), { type: 'closeChamber', closed: !m.paper.chamberClosed })}
              {b(t('b08.bench.remove'), { type: 'removePaper' })}
            </div>
            <div className="row">
              {b(t('b08.bench.markFront'), { type: 'markSolventFront', mm })}
              <select aria-label={t('b08.bench.band')} value={band} onChange={(e) => setBand(e.target.value)}>
                <option value="">{t('nb.choose')}</option>
                {bands.map((x, i) => <option key={x.id} value={x.id}>{t('b08.bench.bandN', { n: i + 1, c: t(`b08.val.${x.color}`) })}</option>)}
              </select>
              <button className="btn small" disabled={!band} onClick={() => D({ type: 'markBand', bandId: band, mm })}>{t('b08.bench.markBand')}</button>
            </div>
            <ul className="fb-list">{m.readings.filter((r) => r.kind === 'front' || r.kind === 'band').map((r) => <li key={r.id}>{r.id} · {t(`b08.reading.${r.kind}`)}: {r.value} ± {r.u} mm</li>)}</ul>
          </div>
        </div>
      )}
    </section>
  );
}
