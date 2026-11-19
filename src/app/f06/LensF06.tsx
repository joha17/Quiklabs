/**
 * Visor de lectura de F06: amplía lo que se acaba de leer y lo dibuja con la lectura registrada (la que produjo el
 * dominio con la técnica real). Regla del soporte frente al puntero, medidor de altura y escala del péndulo (con
 * paralaje si lo hubo), pantallas de la balanza y del captador de ángulo, y las gráficas del registrador del último
 * disparo: F contra x (el trabajo es el área bajo la curva) y la potencia P(t) = F·v, con la separación marcada.
 * Las señales se dibujan tal como llegaron: sin sincronizar, la posición llega retrasada y el lazo F–x se abre.
 * No corrige nada.
 */
import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useF06 } from './store';
import type { EyeTargetF6 } from '../../engine/f06/F06Lab3D';
import type { F06World, ReadingF6, RunRecord } from '../../simulation/f06-world/types';
import { GEOF06 } from '../../simulation/f06-world/geometry';
import { SF6 } from '../../simulation/f06-world/world';

const LENS_INSTRUMENT: Record<string, string> = { ruler01: 'ruler01', gauge01: 'gauge01', pendScale: 'pend01', balance01: 'balance01', angle01: 'angle01', logger01: 'logger01' };

/** Vista de lectura para lo seleccionado (o la regla). */
export function eyeTargetFor(sel: string | null): EyeTargetF6 {
  if (sel === 'ruler01' || sel === 'gauge01' || sel === 'pendScale' || sel === 'balance01' || sel === 'logger01' || sel === 'cart01' || sel === 'launcher01') return sel;
  if (sel && ['pend01', 'angle01', 'gate3'].includes(sel)) return 'pendScale';
  if (sel && ['massRack01', 'cw1', 'cw2', 'hanger01', 'm100a', 'm100b', 'm100c', 'm100d'].includes(sel)) return 'balance01';
  if (sel && ['force01', 'pos01', 'spring01', 'spring02', 'stand01'].includes(sel)) return sel === 'stand01' ? 'ruler01' : 'launcher01';
  if (sel && ['track01', 'brake01', 'gate1', 'gate2', 'pad01', 'damper01'].includes(sel)) return 'gauge01';
  return 'ruler01';
}

const fmt = (v: number | null | undefined, d: number) => (typeof v === 'number' && Number.isFinite(v) ? v.toFixed(d).replace('.', ',') : '—');

/** Escala del tablero en cm alrededor del valor leído; el índice rojo marca lo que se leyó. */
function ScaleSvg({ cm }: { cm: number }) {
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

function ReadingLine({ r }: { r: ReadingF6 }) {
  const { t } = useTranslation();
  const d = Math.max(0, Math.round(-Math.log10(r.resolution) + 0.01));
  let val = `${fmt(r.value, d)} ${r.unit}`;
  if (r.launch) val = `W ${fmt(r.launch.W, 3)} J · F_máx ${fmt(r.launch.Fmax, 2)} N · x_máx ${fmt((r.launch.xmax ?? NaN) * 100, 1)} cm · P_máx ${fmt(r.launch.Pmax, 1)} W · P_media ${fmt(r.launch.Pavg, 1)} W · Δt ${fmt(r.launch.tPush, 3)} s`;
  if (r.gates) val = `Δt₁ ${fmt(r.gates.dt1, 5)} s · Δt₂ ${fmt(r.gates.dt2, 5)} s${r.gates.crested ? '' : ` · ${t('f06.lens.notCrested')}`}`;
  if (r.pend) val = `θ₀ ${fmt(r.pend.theta0, 1)}° · Δt ${fmt(r.pend.dt, 5)} s`;
  return (
    <p className="lens-reading">
      <strong>{r.id}</strong> · {val} <span className="hint">({t('f06.lens.res', { res: fmt(r.resolution, d) })})</span>
      {r.qualityFlags.length > 0 && <span className="pending"> ⚠ {r.qualityFlags.map((f) => t(`f06.flag.${f}`)).join(', ')}</span>}
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
    <svg ref={svg} viewBox={`0 0 ${W} ${H}`} className="lens-svg f06-chart" role="img" aria-hidden="true" style={{ touchAction: 'none', cursor: win ? 'ew-resize' : undefined }}
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

/** Señales del empuje (hasta la separación) tal como las ve el registrador: x = d₀ − posición, F indicada y P = F·v. */
function pushSignals(w: F06World, rec: RunRecord) {
  const d0 = GEOF06.launcher.plunger0 - GEOF06.launcher.back;
  const sep = rec.sepT ?? rec.launch[rec.launch.length - 1]?.[0] ?? 0;
  const lag = rec.setup.synced ? 0 : w.params.lagS * (w.scenarios.includes(SF6.DECOUPLED) ? 2.5 : 1);
  const ts = rec.launch.map((x) => x[0]);
  const ps = rec.launch.map((x) => x[3]);
  const posAt = (t: number) => {
    if (t <= ts[0]) return ps[0];
    for (let i = 1; i < ts.length; i++) if (ts[i] >= t) return ps[i - 1] + ((ps[i] - ps[i - 1]) * (t - ts[i - 1])) / Math.max(1e-9, ts[i] - ts[i - 1]);
    return ps[ps.length - 1];
  };
  const push = rec.launch.filter((x) => x[0] <= sep + 1e-9);
  const fx: Array<[number, number]> = push.map((x) => [(d0 - posAt(x[0] - lag)) * 100, x[1]]);
  const pt: Array<[number, number]> = push.map((x, i) => {
    const a = push[Math.max(0, i - 1)];
    const b = push[Math.min(push.length - 1, i + 1)];
    const v = b[0] > a[0] ? (posAt(b[0] - lag) - posAt(a[0] - lag)) / (b[0] - a[0]) : 0;
    return [x[0], x[1] * v];
  });
  return { fx, pt, sep, n: push.length };
}

function LaunchLens({ w }: { w: F06World }) {
  const { t } = useTranslation();
  const dispatch = useF06((s) => s.dispatch);
  const toast = useF06((s) => s.toast);
  const rec = w.run ?? w.runs[w.runs.length - 1];
  if (!rec || !rec.launch.length) return <p className="hint">{t('f06.lens.noRun')}</p>;
  const sg = pushSignals(w, rec);
  const xs = sg.fx.map((p) => p[0]).filter(Number.isFinite);
  const xMin = Math.min(0, ...xs);
  const xMax = Math.max(1, ...xs);
  const run = (c: Parameters<typeof dispatch>[0]) => {
    const r = dispatch(c);
    if (!r.ok && r.code) toast('warn', t(`f06.cmd.${r.code}`));
  };
  return (
    <>
      <p className="hint">{t('f06.lens.run', { n: rec.id, n2: sg.n, hz: rec.setup.rateHz, live: rec.done ? '' : t('f06.lens.live') })}</p>
      <p className="hint"><strong>{t('f06.lens.fx')}</strong></p>
      <Chart dur={xMax - xMin} x0={xMin} yLabel="F (N)" events={[]} series={[{ pts: sg.fx, color: '#e67e22', label: 'F(x)' }]} />
      <p className="hint"><strong>{t('f06.lens.pt')}</strong></p>
      <Chart dur={Math.max(sg.sep, 0.02)} yLabel="P (W)" events={rec.sepT !== null ? [{ t: rec.sepT, label: t('f06.lens.ev.sep') }] : []} series={[{ pts: sg.pt, color: '#2f6db5', label: 'P(t)' }]} />
      <div className="row">
        <button className="btn primary" data-testid="f06-read-launch" disabled={!rec.done && rec.sepT === null} onClick={() => run({ type: 'readLaunch' })}>📈 {t('f06.lens.readLaunch')}</button>
        <button className="btn primary" data-testid="f06-read-gates" disabled={!rec.done} onClick={() => run({ type: 'readGates' })}>⏱ {t('f06.lens.readGates')}</button>
      </div>
    </>
  );
}

export function LensF06() {
  const { t } = useTranslation();
  const lens = useF06((s) => s.settings.lens);
  const rt = useF06((s) => s.runtime);
  useF06((s) => s.version);
  if (!lens || !rt) return null;
  const w = rt.world;
  const inst = LENS_INSTRUMENT[lens];
  const last = [...w.readingOrder].reverse().map((id) => w.readings[id])
    .find((r) => (lens === 'logger01' ? r.kind === 'launch' || r.kind === 'gates' : r.instrumentId === inst));
  const close = () => useF06.getState().setSettings({ lens: null });
  return (
    <aside className="lens-panel f06-lens" role="dialog" aria-label={t('f06.lens.title')}>
      <header>
        <strong>🔍 {t(`f06.lens.of.${lens}`)}</strong>
        <button className="x" aria-label={t('common.close')} onClick={close}>×</button>
      </header>
      {lens === 'logger01' && <LaunchLens w={w} />}
      {(lens === 'ruler01' || lens === 'gauge01' || lens === 'pendScale') && last && Number.isFinite(last.value) && <ScaleSvg cm={last.value} />}
      {lens === 'balance01' && last && <Digital lines={[`${fmt(last.value, 1)} g`]} />}
      {lens === 'angle01' && last && <Digital lines={[`θ₀ ${fmt(last.value, 1)}°`, `Δt ${fmt(last.pend?.dt, 5)} s`]} />}
      {!last && lens !== 'logger01' && <p className="hint">{t('f06.lens.none')}</p>}
      {last && <ReadingLine r={last} />}
      <p className="hint">{t(lens === 'logger01' ? 'f06.lens.noteRun' : 'f06.lens.note')}</p>
    </aside>
  );
}
