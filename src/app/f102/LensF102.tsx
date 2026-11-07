/**
 * Visor de lectura: amplía la escala o la pantalla del instrumento que se acaba de leer y la dibuja con la lectura
 * registrada (la que produjo el dominio con la técnica real: borde de la base, paralaje, cero del inclinómetro).
 * Regla del carril y escala de la torre en cm, pantallas del temporizador y del cronómetro, tira de la cinta con sus
 * puntos y la curva distancia–tiempo del sensor. No corrige nada: si hubo paralaje, muestra la división corrida.
 */
import { useTranslation } from 'react-i18next';
import { useF102 } from './store';
import type { EyeTargetF2 } from '../../engine/f102/F102Lab3D';
import type { ReadingF2 } from '../../simulation/f102-world/types';

const LENS_INSTRUMENT: Record<string, string> = {
  track01: 'track01', tower01: 'tower01', inclinometer01: 'inclinometer01', gateTimer01: 'gateTimer01', tapeTimer01: 'tapeTimer01',
  photocell01: 'photocell01', motionSensor01: 'motionSensor01',
};

/** Vista de lectura para lo seleccionado (o la regla del carril, la escala más usada a la altura del ojo). */
export function eyeTargetFor(sel: string | null): EyeTargetF2 {
  if (sel === 'gate1' || sel === 'gate2' || sel === 'cart01') return 'track01';
  if (sel && ['track01', 'tower01', 'magnet01', 'inclinometer01', 'gateTimer01', 'photocell01', 'motionSensor01'].includes(sel)) return (sel === 'magnet01' ? 'tower01' : sel) as EyeTargetF2;
  return 'track01';
}

const fmt = (v: number, d: number) => v.toFixed(d).replace('.', ',');

/** Regla en cm con divisiones de mm alrededor del valor leído; el índice marca lo que se leyó. */
function ScaleSvg({ cm, vertical }: { cm: number; vertical?: boolean }) {
  const px = 9;
  const ticks = [];
  const c0 = Math.floor(cm) - 3;
  for (let i = c0 * 10; i <= (c0 + 7) * 10; i++) {
    const x = 20 + (i / 10 - c0) * px * 10;
    const len = i % 10 === 0 ? 26 : i % 5 === 0 ? 18 : 11;
    ticks.push(<line key={i} x1={x} x2={x} y1={10} y2={10 + len} stroke="currentColor" strokeWidth={i % 10 === 0 ? 1.4 : 0.8} />);
    if (i % 10 === 0) ticks.push(<text key={`t${i}`} x={x} y={52} fontSize={11} textAnchor="middle" fill="currentColor">{i / 10}</text>);
  }
  const xi = 20 + (cm - c0) * px * 10;
  return (
    <svg viewBox="0 0 680 64" role="img" aria-hidden="true" className="lens-svg" style={vertical ? { transform: 'scaleY(-1)' } : undefined}>
      <rect x={0} y={8} width={680} height={32} fill="var(--lens-bg, #f3ecd8)" />
      {ticks}
      <polygon points={`${xi},40 ${xi - 6},60 ${xi + 6},60`} fill="#c0392b" />
    </svg>
  );
}

/** Tira de la cinta del registrador: un punto cada 1/50 s a escala 1:1 (recortada a lo que entra). */
function TapeSvg({ r }: { r: ReadingF2 }) {
  const pts = r.samples ?? [];
  const maxCm = Math.max(1, ...pts.map((p) => p[1]));
  const k = 640 / Math.max(maxCm, 10);
  return (
    <svg viewBox="0 0 680 50" role="img" aria-hidden="true" className="lens-svg">
      <rect x={10} y={12} width={660} height={26} fill="#f7f3e3" stroke="#c9bf9f" />
      {pts.map(([tt, x], i) => (
        <circle key={i} cx={20 + x * k} cy={25} r={1.8} fill={r.cutS !== undefined && tt >= r.cutS ? '#c0392b' : '#222'} />
      ))}
    </svg>
  );
}

/** Distancia del sensor a lo que ve, en función del tiempo. */
function MotionPlot({ r }: { r: ReadingF2 }) {
  const pts = r.samples ?? [];
  if (pts.length < 2) return null;
  const t1 = pts[pts.length - 1][0] || 1;
  const dMax = Math.max(...pts.map((p) => p[1]));
  const dMin = Math.min(...pts.map((p) => p[1]));
  const sx = (t: number) => 30 + (t / t1) * 630;
  const sy = (d: number) => 110 - ((d - dMin) / Math.max(1, dMax - dMin)) * 95;
  return (
    <svg viewBox="0 0 680 124" role="img" aria-hidden="true" className="lens-svg">
      <line x1={30} x2={30} y1={10} y2={112} stroke="currentColor" />
      <line x1={30} x2={670} y1={112} y2={112} stroke="currentColor" />
      <polyline fill="none" stroke="#1f4e79" strokeWidth={1.5} points={pts.map(([t, d]) => `${sx(t)},${sy(d)}`).join(' ')} />
      {pts.map(([t, d], i) => <circle key={i} cx={sx(t)} cy={sy(d)} r={1.6} fill="#1f4e79" />)}
      <text x={34} y={20} fontSize={10} fill="currentColor">{dMax} mm</text>
      <text x={34} y={106} fontSize={10} fill="currentColor">{dMin} mm</text>
      <text x={660} y={122} fontSize={10} textAnchor="end" fill="currentColor">{fmt(t1, 2)} s</text>
    </svg>
  );
}

function Digital({ lines }: { lines: string[] }) {
  return <div className="lens-digital" style={{ fontFamily: 'monospace', background: '#10261a', color: '#7CFC9A', padding: '0.4rem 0.6rem', borderRadius: 6 }}>{lines.map((l) => <div key={l}>{l}</div>)}</div>;
}

function ReadingLine({ r }: { r: ReadingF2 }) {
  const { t } = useTranslation();
  const d = Math.max(0, Math.round(-Math.log10(r.resolution) + 0.01));
  const warn = r.qualityFlags.filter((f) => f !== 'ZERO');
  const val = r.kind === 'tape' || r.kind === 'motion' ? t('f102.lens.points', { n: r.value }) : `${Number.isFinite(r.value) ? fmt(r.value, d) : '—'} ${r.unit}`;
  return (
    <p className="lens-reading">
      <strong>{r.id}</strong> · {val} <span className="hint">({t('f102.lens.res', { res: fmt(r.resolution, d) })})</span>
      {warn.length > 0 && <span className="pending"> ⚠ {warn.map((f) => t(`f102.flag.${f}`)).join(', ')}</span>}
    </p>
  );
}

export function LensF102() {
  const { t } = useTranslation();
  const lens = useF102((s) => s.settings.lens);
  const rt = useF102((s) => s.runtime);
  useF102((s) => s.version);
  if (!lens || !rt) return null;
  const w = rt.world;
  const inst = LENS_INSTRUMENT[lens];
  const last = [...w.readingOrder].reverse().map((id) => w.readings[id]).find((r) => r.instrumentId === inst);
  const close = () => useF102.getState().setSettings({ lens: null });
  const g = last?.gates;
  const ts = (x: number | null | undefined) => (x === null || x === undefined ? '----' : fmt(x, 4));
  return (
    <aside className="lens-panel" role="dialog" aria-label={t('f102.lens.title')}>
      <header>
        <strong>🔍 {t(`f102.obj.${lens}`)}</strong>
        <button className="x" aria-label={t('common.close')} onClick={close}>×</button>
      </header>
      {!last && <p className="hint">{t('f102.lens.none')}</p>}
      {last && (lens === 'track01' || lens === 'tower01') && last.kind === 'length' && <ScaleSvg cm={last.value} />}
      {last && lens === 'inclinometer01' && <Digital lines={[`${fmt(last.value, 1)}°`]} />}
      {last && lens === 'gateTimer01' && g && <Digital lines={[`A ${ts(g.t1In)} → ${ts(g.t1Out)} s`, `B ${ts(g.t2In)} → ${ts(g.t2Out)} s`]} />}
      {last && lens === 'photocell01' && <Digital lines={[`${Number.isFinite(last.value) ? fmt(last.value, 4) : '----'} s`]} />}
      {last && lens === 'tapeTimer01' && <TapeSvg r={last} />}
      {last && lens === 'motionSensor01' && <MotionPlot r={last} />}
      {last && <ReadingLine r={last} />}
      <p className="hint">{t('f102.lens.note')}</p>
    </aside>
  );
}
