import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useB09 } from './store';
import { assetById } from '../../simulation/specimens/assets';
import type { MarkStructure } from '../../simulation/div-world/types';
import { drawAsset } from '../../engine/instruments/optical/illustrations';

/** Glosario general (no revela qué hay en cada captura): rotular lo que la captura no sustenta es un error del estudiante. */
const GLOSSARY: MarkStructure[] = [
  'rootCap', 'meristem', 'elongationZone', 'epidermis', 'cortex', 'parenchyma', 'collenchyma', 'sclerenchyma', 'stele', 'endodermis', 'pericycle', 'casparian', 'pith',
  'vascularBundle', 'xylem', 'phloem', 'cambium', 'companionCell', 'palisade', 'spongy', 'mesophyll', 'cuticle', 'stoma', 'guardCells', 'growthRing', 'bark', 'sclereids', 'lignifiedWall',
];
const SIZE = 300;

/**
 * Marcas y mediciones sobre una captura PROPIA (§6.3, §8): se redibuja exactamente el campo registrado; un clic con
 * una estructura elegida envía `markRegion` (el punto, no la respuesta) y dos clics en modo medir envían `measure` con
 * los extremos del segmento. El veredicto lo decide el dominio con el manifiesto; aquí solo se muestra lo marcado.
 */
export function CaptureMarkerB09() {
  const { t } = useTranslation();
  const rt = useB09((s) => s.runtime);
  const dispatch = useB09((s) => s.dispatch);
  const toast = useB09((s) => s.toast);
  useB09((s) => s.version);
  const [obsId, setObsId] = useState('');
  const [structure, setStructure] = useState<MarkStructure | ''>('');
  const [mode, setMode] = useState<'mark' | 'measure'>('mark');
  const [scale, setScale] = useState<'calibration' | 'assumed'>('calibration');
  const [a, setA] = useState<[number, number] | null>(null);
  const ref = useRef<HTMLCanvasElement>(null);
  const w = rt?.world;
  const caps = w ? w.observationOrder.map((id) => w.observations[id]).filter((o) => o.instrument === 'compound' && o.isObservationValid) : [];
  const o = w && obsId ? w.observations[obsId] : null;
  const marks = w && o ? w.div.marks.filter((m) => m.observationId === o.id) : [];
  const measures = w && o ? w.div.measurements.filter((m) => m.observationId === o.id) : [];
  const px = w?.params.div?.imagePx ?? 1000;

  useEffect(() => {
    const c = ref.current;
    if (!c || !o) return;
    const ctx = c.getContext('2d')!;
    const asset = assetById(o.assetId);
    ctx.clearRect(0, 0, SIZE, SIZE);
    ctx.save();
    ctx.beginPath();
    ctx.arc(SIZE / 2, SIZE / 2, SIZE / 2, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = '#f4f2ea';
    ctx.fillRect(0, 0, SIZE, SIZE);
    if (asset) {
      const [cx, cy] = o.normalizedViewport;
      drawAsset(ctx, { assetId: o.assetId, centerMm: [(cx - 0.5) * asset.extentMm[0], (cy - 0.5) * asset.extentMm[1]], fovMm: o.fovMm, size: SIZE });
    }
    ctx.restore();
    for (const m of marks) {
      ctx.beginPath();
      ctx.arc(m.u * SIZE, m.v * SIZE, 5, 0, Math.PI * 2);
      ctx.strokeStyle = '#1565c0';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    for (const m of measures) {
      if (!m.seg) continue;
      const k = SIZE / px;
      ctx.beginPath();
      ctx.moveTo(m.seg[0] * k, m.seg[1] * k);
      ctx.lineTo(m.seg[2] * k, m.seg[3] * k);
      ctx.strokeStyle = '#e65100';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    if (a) {
      ctx.beginPath();
      ctx.arc(a[0] * SIZE, a[1] * SIZE, 3, 0, Math.PI * 2);
      ctx.fillStyle = '#e65100';
      ctx.fill();
    }
  });

  if (!w) return null;
  const onClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!o) return;
    const r = e.currentTarget.getBoundingClientRect();
    const u = Math.round(((e.clientX - r.left) / r.width) * 1000) / 1000;
    const v = Math.round(((e.clientY - r.top) / r.height) * 1000) / 1000;
    if (mode === 'mark') {
      if (!structure) return void toast('info', t('b09.marks.pickStructure'));
      const res = dispatch({ type: 'markRegion', observationId: o.id, structure, u, v });
      if (!res.ok && res.code) toast('warn', t(`b09.cmd.${res.code}`));
      else toast('info', t('b09.marks.marked', { s: t(`b09.structure.${structure}`) }));
      return;
    }
    if (!a) return void setA([u, v]);
    // El segmento va en píxeles de la captura (la escala µm/px la aplica el dominio).
    const P = (x: number) => Math.round(x * px);
    const res = dispatch({ type: 'measure', observationId: o.id, ax: P(a[0]), ay: P(a[1]), bx: P(u), by: P(v), scale });
    setA(null);
    if (!res.ok && res.code) toast('warn', t(`b09.cmd.${res.code}`));
    else if (res.id) toast('info', t('b09.marks.measured', { id: res.id }));
  };

  return (
    <section aria-label={t('b09.nb.tab.marks')} style={{ display: 'grid', gap: '0.6rem' }}>
      <h3>{t('b09.marks.title')}</h3>
      <p className="hint">{t('b09.marks.help')}</p>
      <div className="field">
        <label htmlFor="b09-mark-obs">{t('b09.nb.col.capture')}</label>
        <select id="b09-mark-obs" value={obsId} onChange={(e) => { setObsId(e.target.value); setA(null); }}>
          <option value="">{t('nb.choose')}</option>
          {caps.map((c) => <option key={c.id} value={c.id}>{c.id} · {c.objectiveX}X</option>)}
        </select>
      </div>
      <div className="row" role="radiogroup" aria-label={t('b09.marks.mode')}>
        <label className="check"><input type="radio" checked={mode === 'mark'} onChange={() => { setMode('mark'); setA(null); }} /> {t('b09.marks.modeMark')}</label>
        <label className="check"><input type="radio" checked={mode === 'measure'} onChange={() => setMode('measure')} /> {t('b09.marks.modeMeasure')}</label>
      </div>
      {mode === 'mark' ? (
        <div className="field">
          <label htmlFor="b09-mark-st">{t('b09.marks.structure')}</label>
          <select id="b09-mark-st" value={structure} onChange={(e) => setStructure(e.target.value as MarkStructure)}>
            <option value="">{t('nb.choose')}</option>
            {GLOSSARY.map((s) => <option key={s} value={s}>{t(`b09.structure.${s}`)}</option>)}
          </select>
        </div>
      ) : (
        <div className="field">
          <label htmlFor="b09-mark-scale">{t('b09.marks.scale')}</label>
          <select id="b09-mark-scale" value={scale} onChange={(e) => setScale(e.target.value as 'calibration' | 'assumed')}>
            <option value="calibration">{t('b09.marks.scaleCalibration')}</option>
            <option value="assumed">{t('b09.marks.scaleAssumed')}</option>
          </select>
          <p className="hint">{a ? t('b09.marks.secondPoint') : t('b09.marks.firstPoint')}</p>
        </div>
      )}
      {o && <canvas ref={ref} width={SIZE} height={SIZE} className="capture-marker" onClick={onClick} aria-label={t('b09.marks.canvas', { id: o.id })} style={{ cursor: 'crosshair', borderRadius: '50%', justifySelf: 'center' }} />}
      {o && (
        <ul className="fb-list">
          {marks.map((m, i) => <li key={i}>📍 {t(`b09.structure.${m.structure}`)} ({m.u.toFixed(2)}, {m.v.toFixed(2)})</li>)}
          {measures.map((m) => <li key={m.id}>📏 {m.id}: {Math.round(m.rawPixelDistance)} px</li>)}
        </ul>
      )}
    </section>
  );
}
