/**
 * Visor de lectura de F08: amplía lo que se acaba de leer y lo dibuja con la lectura registrada (la que produjo el
 * dominio con la técnica real). Transportador de la base y regla radial de la barra (con paralaje si lo hubo),
 * pantallas de la balanza y del calibre, y las gráficas del último ensayo: el ángulo θ(t) que indica el encoder (con
 * su cero, su escala y su sentido tal como están configurados) y la velocidad angular ω(t), con el instante en que la
 * cuerda deja de tirar marcado. No corrige nada: un encoder sin calibrar dibuja la curva con su escala equivocada.
 */
import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useF08 } from './store';
import type { EyeTargetF8 } from '../../engine/f08/F08Lab3D';
import type { F08World, ReadingF8 } from '../../simulation/f08-world/types';
import { encoderDeg } from '../../simulation/f08-world/world';

const LENS_INSTRUMENT: Record<string, string> = { base01: 'base01', ruler01: 'ruler01', balance01: 'balance01', caliper01: 'caliper01', logger01: 'logger01' };

/** Vista de lectura para lo seleccionado (o el transportador). */
export function eyeTargetFor(sel: string | null): EyeTargetF8 {
  if (sel === 'base01' || sel === 'ruler01' || sel === 'slide1' || sel === 'slide2' || sel === 'balance01' || sel === 'logger01' || sel === 'tach01' || sel === 'caliper01' || sel === 'column01') return sel;
  if (sel && ['massRack01', 'drop20', 'drop50', 'drop100', 'rack01', 'disc01', 'ring01'].includes(sel)) return 'balance01';
  if (sel && ['encoder01', 'tension01'].includes(sel)) return 'logger01';
  if (sel && ['gate01', 'catch01', 'pulley01'].includes(sel)) return 'column01';
  if (sel === 'bar01') return 'ruler01';
  return 'base01';
}

const fmt = (v: number | null | undefined, d: number) => (typeof v === 'number' && Number.isFinite(v) ? v.toFixed(d).replace('.', ',') : '—');

/** Escala en cm (o en grados) alrededor del valor leído; el índice rojo marca lo que se leyó. */
function ScaleSvg({ v, unit }: { v: number; unit: string }) {
  const px = 9;
  const ticks = [];
  const c0 = Math.floor(v) - 3;
  for (let i = c0 * 10; i <= (c0 + 7) * 10; i++) {
    const x = 20 + (i / 10 - c0) * px * 10;
    const len = i % 10 === 0 ? 26 : i % 5 === 0 ? 18 : 11;
    ticks.push(<line key={i} x1={x} x2={x} y1={10} y2={10 + len} stroke="currentColor" strokeWidth={i % 10 === 0 ? 1.4 : 0.8} />);
    if (i % 10 === 0) ticks.push(<text key={`t${i}`} x={x} y={52} fontSize={11} textAnchor="middle" fill="currentColor">{i / 10}{unit}</text>);
  }
  const xi = 20 + (v - c0) * px * 10;
  return (
    <svg viewBox="0 0 680 64" role="img" aria-hidden="true" className="lens-svg">
      <rect x={0} y={8} width={680} height={32} fill="var(--lens-bg, #f3ecd8)" />
      {ticks}
      <polygon points={`${xi},40 ${xi - 6},60 ${xi + 6},60`} fill="#c0392b" />
    </svg>
  );
}

function Digital({ lines }: { lines: string[] }) {
  return <div className="lens-digital" style={{ fontFamily: 'monospace', background: '#10261a', color: '#7CFC9A', padding: '0.4rem 0.6rem', borderRadius: 6 }}>{lines.map((l) => <div key={l}>{l}</div>)}</div>;
}

function ReadingLine({ r }: { r: ReadingF8 }) {
  const { t } = useTranslation();
  const d = Math.max(0, Math.round(-Math.log10(r.resolution) + 0.01));
  let val = `${fmt(r.value, d)} ${r.unit}`;
  if (r.fit) val = t('f08.lens.fit', { a: fmt(r.value, 3), ac: fmt(r.fit.cc !== null ? Math.abs(2 * r.fit.cc) : null, 3), n: r.fit.n, nc: r.fit.nc });
  if (r.tach) val += ` · ${t(r.tach.peak ? 'f08.lens.peak' : 'f08.lens.instant')}`;
  return (
    <p className="lens-reading">
      <strong>{r.id}</strong> · {val} <span className="hint">({t('f08.lens.res', { res: fmt(r.resolution, d) })})</span>
      {r.qualityFlags.length > 0 && <span className="pending"> ⚠ {r.qualityFlags.map((f) => t(`f08.flag.${f}`)).join(', ')}</span>}
    </p>
  );
}

const W = 640;
const H = 220;
const PAD = { l: 44, r: 12, t: 12, b: 26 };

/** Gráfica de dos señales con eje de tiempo, sucesos marcados y (opcional) ventana arrastrable. */
function Chart({ series, dur, events, win, onWin, yLabel, x0 = 0 }: {
  series: Array<{ pts: Array<[number, number]>; color: string; label: string }>;
  dur: number;
  x0?: number;
  events: Array<{ t: number; label: string }>;
  win?: [number, number];
  onWin?: (w: [number, number]) => void;
  yLabel: string;
}) {
  const svg = useRef<SVGSVGElement>(null);
  const drag = useRef<0 | 1 | 2 | null>(null);
  const ys = series.flatMap((s) => s.pts.map((p) => p[1])).filter(Number.isFinite);
  let y0 = Math.min(0, ...ys);
  let y1 = Math.max(0.1, ...ys);
  const span = y1 - y0 || 1;
  y0 -= span * 0.08;
  y1 += span * 0.08;
  const X = (t: number) => PAD.l + ((t - x0) / Math.max(dur, 1e-6)) * (W - PAD.l - PAD.r);
  const Y = (v: number) => PAD.t + (1 - (v - y0) / (y1 - y0)) * (H - PAD.t - PAD.b);
  const toT = (clientX: number) => {
    const r = svg.current!.getBoundingClientRect();
    const x = ((clientX - r.left) / r.width) * W;
    return Math.max(0, Math.min(dur, ((x - PAD.l) / (W - PAD.l - PAD.r)) * dur));
  };
  const down = (e: React.PointerEvent) => {
    if (!win || !onWin) return;
    const tt = toT(e.clientX);
    const d0 = Math.abs(tt - win[0]);
    const d1 = Math.abs(tt - win[1]);
    drag.current = d0 < dur * 0.03 ? 0 : d1 < dur * 0.03 ? 1 : tt > win[0] && tt < win[1] ? 2 : d0 < d1 ? 0 : 1;
    (e.target as Element).setPointerCapture?.(e.pointerId);
    if (drag.current !== 2) move(e);
  };
  const last = useRef(0);
  const move = (e: React.PointerEvent) => {
    if (drag.current === null || !win || !onWin) return;
    const tt = toT(e.clientX);
    if (drag.current === 0) onWin([Math.min(tt, win[1] - 0.05), win[1]]);
    else if (drag.current === 1) onWin([win[0], Math.max(tt, win[0] + 0.05)]);
    else {
      const d = tt - last.current;
      const w0 = Math.max(0, Math.min(dur - (win[1] - win[0]), win[0] + d));
      onWin([w0, w0 + (win[1] - win[0])]);
    }
    last.current = tt;
  };
  const gridT = [];
  const step = dur > 4 ? 1 : dur > 2 ? 0.5 : dur > 1 ? 0.25 : dur > 0.4 ? 0.1 : dur > 0.1 ? 0.02 : 0.01;
  for (let t = x0; t <= x0 + dur + 1e-9; t += step) gridT.push(Math.round(t * 1e6) / 1e6);
  return (
    <svg ref={svg} viewBox={`0 0 ${W} ${H}`} className="lens-svg f08-chart" role="img" aria-hidden="true" style={{ touchAction: 'none', cursor: win ? 'ew-resize' : undefined }}
      onPointerDown={(e) => {
        last.current = toT(e.clientX);
        down(e);
      }}
      onPointerMove={move}
      onPointerUp={() => (drag.current = null)}>
      <rect x={PAD.l} y={PAD.t} width={W - PAD.l - PAD.r} height={H - PAD.t - PAD.b} fill="var(--lens-bg, #f8f6ef)" />
      {gridT.map((t) => (
        <g key={t}>
          <line x1={X(t)} x2={X(t)} y1={PAD.t} y2={H - PAD.b} stroke="#ccc" strokeWidth={0.6} />
          <text x={X(t)} y={H - 8} fontSize={10} textAnchor="middle" fill="currentColor">{fmt(t, step < 0.1 ? 2 : step < 1 ? 1 : 0)}</text>
        </g>
      ))}
      <line x1={PAD.l} x2={W - PAD.r} y1={Y(0)} y2={Y(0)} stroke="#888" strokeWidth={0.8} />
      <text x={4} y={PAD.t + 10} fontSize={10} fill="currentColor">{fmt(y1, 1)}</text>
      <text x={4} y={H - PAD.b} fontSize={10} fill="currentColor">{fmt(y0, 1)}</text>
      <text x={4} y={H / 2} fontSize={10} fill="currentColor">{yLabel}</text>
      {win && <rect x={X(win[0])} y={PAD.t} width={Math.max(1, X(win[1]) - X(win[0]))} height={H - PAD.t - PAD.b} fill="#2f6db5" opacity={0.14} stroke="#2f6db5" />}
      {events.map((e) => (
        <g key={`${e.label}${e.t}`}>
          <line x1={X(e.t)} x2={X(e.t)} y1={PAD.t} y2={H - PAD.b} stroke="#c0392b" strokeDasharray="4 3" />
          <text x={X(e.t) + 3} y={PAD.t + 10} fontSize={10} fill="#c0392b">{e.label}</text>
        </g>
      ))}
      {series.map((s) => (
        <polyline key={s.label} fill="none" stroke={s.color} strokeWidth={1.4} points={s.pts.filter((p) => Number.isFinite(p[1])).map((p) => `${X(p[0]).toFixed(1)},${Y(p[1]).toFixed(1)}`).join(' ')} />
      ))}
      {series.map((s, i) => <text key={`l${s.label}`} x={W - PAD.r - 150 + i * 75} y={PAD.t + 12} fontSize={11} fill={s.color}>■ {s.label}</text>)}
    </svg>
  );
}

function RunLens({ w }: { w: F08World }) {
  const { t } = useTranslation();
  const dispatch = useF08((s) => s.dispatch);
  const toast = useF08((s) => s.toast);
  const rec = w.run ?? w.runs[w.runs.length - 1];
  if (!rec || rec.samples.length < 2) return <p className="hint">{t('f08.lens.noRun')}</p>;
  const th: Array<[number, number]> = rec.samples.map((x) => [x[0], encoderDeg(w, x[1])]);
  const om: Array<[number, number]> = rec.samples.map((x) => [x[0], x[2]]);
  const dur = rec.samples[rec.samples.length - 1][0];
  const ev = rec.slackT !== null ? [{ t: rec.slackT, label: t('f08.lens.ev.slack') }] : [];
  const run = (c: Parameters<typeof dispatch>[0]) => {
    const r = dispatch(c);
    if (!r.ok && r.code) toast('warn', t(`f08.cmd.${r.code}`));
  };
  return (
    <>
      <p className="hint">{t('f08.lens.run', { n: rec.id, n2: rec.samples.length, hz: rec.setup.rateHz, live: rec.done ? '' : t('f08.lens.live') })}</p>
      <p className="hint"><strong>{t('f08.lens.theta')}</strong></p>
      <Chart dur={Math.max(0.5, dur)} yLabel="θ (°)" events={ev} series={[{ pts: th, color: '#2f6db5', label: 'θ(t)' }]} />
      <p className="hint"><strong>{t('f08.lens.omega')}</strong></p>
      <Chart dur={Math.max(0.5, dur)} yLabel="ω (rad/s)" events={ev} series={[{ pts: om, color: '#e67e22', label: 'ω(t)' }]} />
      <div className="row">
        <button className="btn primary" data-testid="f08-read-encoder" disabled={!rec.done} onClick={() => run({ type: 'readEncoder' })}>📈 {t('f08.lens.readEncoder')}</button>
        <button className="btn" data-testid="f08-read-tension" onClick={() => run({ type: 'readTension' })}>🧵 {t('f08.lens.readTension')}</button>
        <button className="btn" data-testid="f08-read-tach" onClick={() => run({ type: 'readTach' })}>🌀 {t('f08.lens.readTach')}</button>
        <button className="btn" data-testid="f08-read-gate" disabled={rec.gateOut === null} onClick={() => run({ type: 'readGate' })}>⏱ {t('f08.lens.readGate')}</button>
      </div>
    </>
  );
}

export function LensF08() {
  const { t } = useTranslation();
  const lens = useF08((s) => s.settings.lens);
  const rt = useF08((s) => s.runtime);
  useF08((s) => s.version);
  if (!lens || !rt) return null;
  const w = rt.world;
  const inst = LENS_INSTRUMENT[lens];
  const last = [...w.readingOrder].reverse().map((id) => w.readings[id])
    .find((r) => (lens === 'logger01' ? ['encoder', 'tension', 'tach', 'gate'].includes(r.kind) : r.instrumentId === inst));
  const close = () => useF08.getState().setSettings({ lens: null });
  return (
    <aside className="lens-panel f08-lens" role="dialog" aria-label={t('f08.lens.title')}>
      <header>
        <strong>🔍 {t(`f08.lens.of.${lens}`)}</strong>
        <button className="x" aria-label={t('common.close')} onClick={close}>×</button>
      </header>
      {lens === 'logger01' && <RunLens w={w} />}
      {(lens === 'ruler01' || lens === 'base01') && last && Number.isFinite(last.value) && <ScaleSvg v={lens === 'base01' ? last.value / 10 : last.value} unit={lens === 'base01' ? '0°' : ''} />}
      {lens === 'balance01' && last && <Digital lines={[`${fmt(last.value, 1)} g`]} />}
      {lens === 'caliper01' && last && <Digital lines={[`${fmt(last.value, 2)} cm`]} />}
      {!last && lens !== 'logger01' && <p className="hint">{t('f08.lens.none')}</p>}
      {last && <ReadingLine r={last} />}
      <p className="hint">{t(lens === 'logger01' ? 'f08.lens.noteRun' : 'f08.lens.note')}</p>
    </aside>
  );
}
