import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useB07 } from './store';
import { MEDIA, PLATE_IMAGE_PX, streakMetrics, type MediumId } from '../../simulation/micro-world/model';
import { coloniesOf } from '../../simulation/micro-world/world';
import { drawPlate } from '../../engine/instruments/optical/illustrationsMicro';
import type { Technique } from '../../simulation/micro-world/types';

const SIZE = 340;
const TECHNIQUES: Technique[] = ['fourZone', 'lawn', 'single'];
type Tab = 'media' | 'plate' | 'streak';

/**
 * Mesa de trabajo de B07: fichas de medios, visor de placa con retícula calibrada y trazado digital. Se abre al elegir el
 * objeto en la mesada. Cada gesto envía un hecho (leer la ficha, dos extremos en la imagen, el trazo); lo que resulta lo
 * calcula el dominio. Con teclado: lista de colonias y medición desde sus bordes; el trazado admite «zona» paso a paso.
 */
export function BenchPanelB07() {
  const { t } = useTranslation();
  useB07((s) => s.version);
  const rt = useB07((s) => s.runtime);
  const sel = useB07((s) => s.selected);
  const dispatch = useB07((s) => s.dispatch);
  const stage = useB07((s) => s.stage);
  const toast = useB07((s) => s.toast);
  const demo = useB07((s) => !!s.demo);
  const [tab, setTab] = useState<Tab | null>(null);
  const [colony, setColony] = useState('');
  const [anchor, setAnchor] = useState<[number, number] | null>(null);
  const [measuring, setMeasuring] = useState(false);
  const [technique, setTechnique] = useState<Technique>('fourZone');
  const [strokes, setStrokes] = useState<number[][][]>([]);
  const [draw, setDraw] = useState<number[][] | null>(null);
  const plateRef = useRef<HTMLCanvasElement>(null);
  const streakRef = useRef<HTMLCanvasElement>(null);
  const w = rt?.world;
  const kind = sel && w ? w.objects[sel]?.kind : undefined;

  useEffect(() => {
    if (kind === 'mediaJar' || kind === 'sampleCards' || kind === 'brothTube') setTab('media');
    else if (kind === 'plateViewer' || kind === 'petriPlate') setTab('plate');
    else if (kind === 'streakBoard') setTab('streak');
    // Otro objeto en la mano o elegido: la mesa se aparta para no tapar la escena.
    else if (kind) setTab(null);
  }, [kind, sel]);

  const plateId = w?.micro.selectedPlate ?? null;
  const zoom = w?.micro.viewer.zoom ?? 1;
  useEffect(() => {
    const ctx = plateRef.current?.getContext('2d');
    if (!ctx || !w || !plateId) return;
    drawPlate(ctx, SIZE, PLATE_IMAGE_PX, w.micro.plates[plateId].medium, coloniesOf(w, plateId), zoom, colony || null);
  });
  useEffect(() => {
    const ctx = streakRef.current?.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = '#d9c58a';
    ctx.fillRect(0, 0, SIZE, SIZE);
    ctx.strokeStyle = '#5d4037';
    ctx.lineWidth = 2;
    for (const s of [...strokes, ...(draw ? [draw] : [])]) {
      ctx.beginPath();
      s.forEach(([x, y], i) => {
        const px = SIZE / 2 + (x / 4.5) * (SIZE / 2);
        const py = SIZE / 2 + (y / 4.5) * (SIZE / 2);
        if (i) ctx.lineTo(px, py);
        else ctx.moveTo(px, py);
      });
      ctx.stroke();
    }
  }, [strokes, draw]);

  if (!rt || !w || !tab || demo) return null;
  const m = w.micro;
  const D = (c: Parameters<typeof dispatch>[0]) => {
    const r = dispatch(c);
    if (!r.ok && r.code) {
      const k = `b07.cmd.${r.code}`;
      toast('warn', t(k) !== k ? t(k) : t('b07.cmd.FAILED'));
    }
    return r;
  };
  const cols = plateId ? coloniesOf(w, plateId) : [];
  /** Clic en la vista → píxel de la vista expresado en la escala de la imagen (lo que mide el dominio). */
  const toImage = (e: React.MouseEvent<HTMLCanvasElement>): [number, number] => {
    const r = e.currentTarget.getBoundingClientRect();
    return [((e.clientX - r.left) / r.width) * PLATE_IMAGE_PX, ((e.clientY - r.top) / r.height) * PLATE_IMAGE_PX];
  };
  const onPlate = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!plateId) return;
    const [x, y] = toImage(e);
    if (measuring) {
      if (!anchor) return setAnchor([x, y]);
      D({ type: 'measureColony', plateId, colonyId: colony || null, ax: anchor[0], ay: anchor[1], bx: x, by: y, scale: 'calibration' });
      setAnchor(null);
      return;
    }
    const ix = PLATE_IMAGE_PX / 2 + (x - PLATE_IMAGE_PX / 2) / zoom;
    const iy = PLATE_IMAGE_PX / 2 + (y - PLATE_IMAGE_PX / 2) / zoom;
    const hit = cols.find((c) => Math.hypot(c.x - ix, c.y - iy) <= c.rPx * 1.2);
    if (hit) setColony(hit.id);
  };
  const measureAcross = () => {
    const c = cols.find((k) => k.id === colony);
    if (!plateId || !c) return;
    D({ type: 'measureColony', plateId, colonyId: c.id, ax: PLATE_IMAGE_PX / 2 + (c.x - c.rPx - PLATE_IMAGE_PX / 2) * zoom, ay: PLATE_IMAGE_PX / 2 + (c.y - PLATE_IMAGE_PX / 2) * zoom, bx: PLATE_IMAGE_PX / 2 + (c.x + c.rPx - PLATE_IMAGE_PX / 2) * zoom, by: PLATE_IMAGE_PX / 2 + (c.y - PLATE_IMAGE_PX / 2) * zoom, scale: 'calibration' });
  };
  const cm = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return [((e.clientX - r.left) / r.width - 0.5) * 9, ((e.clientY - r.top) / r.height - 0.5) * 9];
  };
  const preview = strokes.length ? streakMetrics(strokes) : null;
  const lastMeasure = m.measures[m.measures.length - 1];
  const f2 = (v: number) => v.toFixed(2).replace('.', ',');

  return (
    <section className="bench-panel" role="dialog" aria-label={t('b07.bench.title')} data-testid="b07-bench" style={{ position: 'absolute', top: '0.6rem', left: '3.4rem', width: 'min(24rem, 80%)', maxHeight: '92%', overflow: 'auto', background: 'var(--surface, #fff)', borderRadius: '0.5rem', padding: '0.6rem', boxShadow: '0 4px 18px rgba(0,0,0,.25)', zIndex: 5 }}>
      <div className="row" role="tablist">
        {(['media', 'plate', 'streak'] as Tab[]).map((x) => <button key={x} role="tab" aria-selected={tab === x} className={`btn small${tab === x ? ' primary' : ' ghost'}`} onClick={() => setTab(x)}>{t(`b07.bench.tab.${x}`)}</button>)}
        <button className="btn small ghost" aria-label={t('b07.bench.close')} onClick={() => setTab(null)}>✕</button>
      </div>

      {tab === 'media' && (Object.keys(MEDIA) as MediumId[]).map((id) => {
        const read = m.inspected.includes(id);
        const c = m.classified[id];
        return (
          <div key={id} className="field" data-testid={`media-${id}`}>
            <strong>{t(`b07.obj.${id}`)}</strong>
            {read ? <p className="hint">{t(`b07.media.${id}`)}</p> : <button className="btn small" onClick={() => D({ type: 'inspectMedia', mediaId: id })}>{t('b07.bench.readCard')}</button>}
            <div className="row">
              <select aria-label={`${t('b07.bench.consistency')} ${id}`} value={c?.consistency ?? ''} onChange={(e) => D({ type: 'classifyMedia', mediaId: id, consistency: e.target.value, func: c?.func ?? '' })}>
                <option value="">{t('b07.bench.consistency')}</option>
                {['solid', 'liquid'].map((v) => <option key={v} value={v}>{t(`b07.val.${v}`)}</option>)}
              </select>
              <select aria-label={`${t('b07.bench.func')} ${id}`} value={c?.func ?? ''} onChange={(e) => D({ type: 'classifyMedia', mediaId: id, consistency: c?.consistency ?? '', func: e.target.value })}>
                <option value="">{t('b07.bench.func')}</option>
                {['general', 'selective', 'differential', 'selectiveDifferential'].map((v) => <option key={v} value={v}>{t(`b07.val.${v}`)}</option>)}
              </select>
            </div>
          </div>
        );
      })}
      {tab === 'media' && <button className="btn primary" disabled={m.mediaCommitted} onClick={() => D({ type: 'commitMedia' })}>{m.mediaCommitted ? `✓ ${t('b07.bench.committed')}` : t('b07.bench.commit')}</button>}

      {tab === 'plate' && (!plateId ? <p className="hint">{t('b07.bench.noPlate')}</p> : (
        <>
          <p className="hint">{m.plates[plateId].label} · {t('b07.bench.sealed')}</p>
          <canvas ref={plateRef} width={SIZE} height={SIZE} style={{ width: '100%', cursor: 'crosshair' }} role="img" aria-label={t('b07.bench.plateAlt', { n: cols.length })} onClick={onPlate} />
          <div className="row">
            <select aria-label={t('b07.bench.colony')} value={colony} onChange={(e) => setColony(e.target.value)}>
              <option value="">{t('b07.bench.colony')}</option>
              {cols.map((c, i) => <option key={c.id} value={c.id}>{t('b07.bench.colonyN', { n: i + 1 })}</option>)}
            </select>
            <button className="btn small" disabled={!colony} onClick={() => D({ type: 'recordColony', plateId, colonyId: colony })}>{t('b07.bench.record')}</button>
            <button className="btn small" disabled={!colony} onClick={() => { if (stage) (stage.controller as unknown as { selectedColony: string | null }).selectedColony = colony; D({ type: 'pickColony', plateId, colonyId: colony }); }}>{t('b07.bench.pick')}</button>
          </div>
          <div className="row">
            <button className={`btn small${measuring ? ' primary' : ' ghost'}`} aria-pressed={measuring} onClick={() => { setMeasuring(!measuring); setAnchor(null); }}>{anchor ? t('b07.bench.measureSecond') : t('b07.bench.measure')}</button>
            <button className="btn small ghost" disabled={!colony} onClick={measureAcross}>{t('b07.bench.measureAcross')}</button>
            <label className="slider"><span>{t('b07.bench.crop')}</span>
              <input aria-label={t('b07.bench.crop')} type="range" min={1} max={4} step={0.5} value={zoom} onChange={(e) => D({ type: 'cropViewer', zoom: Number(e.target.value) })} />
              <output>{zoom}×</output>
            </label>
            <button className="btn small ghost" disabled={m.viewer.calibratedZoom === zoom} onClick={() => D({ type: 'recalibrateViewer' })}>{t('b07.bench.recalibrate')}</button>
          </div>
          {!m.scaleAvailable && <p className="hint">{t('b07.bench.noScale')}</p>}
          {lastMeasure && <p aria-live="polite">{lastMeasure.id}: {f2(lastMeasure.mm)} ± {f2(lastMeasure.uMm)} mm{lastMeasure.valid ? '' : ` — ${t('b07.bench.invalid')}`}</p>}
        </>
      ))}

      {tab === 'streak' && (
        <>
          <p className="hint">{t('b07.bench.streakNote')}</p>
          <select aria-label={t('b07.bench.technique')} value={technique} onChange={(e) => setTechnique(e.target.value as Technique)}>
            {TECHNIQUES.map((x) => <option key={x} value={x}>{t(`b07.technique.${x}`)}</option>)}
          </select>
          <canvas ref={streakRef} width={SIZE} height={SIZE} style={{ width: '100%', touchAction: 'none', borderRadius: '50%' }} role="img" aria-label={t('b07.bench.streakAlt')}
            onMouseDown={(e) => setDraw([cm(e)])}
            onMouseMove={(e) => { if (draw && e.buttons) setDraw([...draw, cm(e)]); }}
            onMouseUp={() => { if (draw && draw.length > 1) setStrokes([...strokes, draw]); setDraw(null); }} />
          {preview && <p className="hint">{t('b07.bench.trace', { zones: preview.zones, cm: preview.lengthCm.toFixed(1).replace('.', ',') })}</p>}
          <div className="row">
            <button className="btn small primary" disabled={!strokes.length} onClick={() => { D({ type: 'strokePlate', technique, strokes }); setStrokes([]); }}>{t('b07.bench.saveTrial')}</button>
            <button className="btn small ghost" onClick={() => setStrokes([])}>{t('b07.bench.clear')}</button>
            <button className="btn small" disabled={m.methodsCompared} onClick={() => D({ type: 'compareMethods' })}>{m.methodsCompared ? `✓ ${t('b07.bench.compared')}` : t('b07.bench.compare')}</button>
          </div>
          <ul className="fb-list">
            {m.trials.map((x) => <li key={x.id}>{x.id} · {t(`b07.technique.${x.technique}`)} · {t('b07.bench.overlap', { pct: Math.round(x.overlap01 * 100) })}</li>)}
          </ul>
        </>
      )}
    </section>
  );
}
