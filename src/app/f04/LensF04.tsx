/**
 * Visor de lectura de F04: amplía lo que se acaba de leer y lo dibuja con la lectura registrada (la que produjo el
 * dominio con la técnica real). Escala del carril en el índice de una compuerta (con paralaje si lo hubo), pantalla
 * de la balanza, y la gráfica del registrador: a(t) y T(t) del último ensayo con los sucesos marcados (cordel flojo,
 * portapesas en el suelo, entrada al freno, choque) y una VENTANA que el estudiante arrastra para elegir el tramo
 * limpio antes de leer las medias. En la pareja, F_A(t) y F_B(t) del último empuje. No corrige nada: la ventana mal
 * puesta da una lectura marcada, no una advertencia que la arregle.
 */
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useF04 } from './store';
import type { EyeTargetF4 } from '../../engine/f04/F04Lab3D';
import type { F04World, ReadingF4, RunRecord } from '../../simulation/f04-world/types';

const LENS_INSTRUMENT: Record<string, string> = { gate1: 'track01', gate2: 'track01', balance01: 'balance01', logger01: 'logger01', pair: 'dynP' };

/** Vista de lectura para lo seleccionado (o el índice de la primera compuerta). */
export function eyeTargetFor(sel: string | null): EyeTargetF4 {
  if (sel === 'gate1' || sel === 'gate2' || sel === 'balance01' || sel === 'logger01' || sel === 'cart01') return sel;
  if (sel === 'cartP' || sel === 'cartQ' || sel === 'dynP' || sel === 'dynQ' || sel === 'pairTrack01') return 'pair';
  if (sel && ['slotMass', 'hanger', 'massRack'].includes(sel)) return 'balance01';
  return 'gate1';
}

const fmt = (v: number | null | undefined, d: number) => (typeof v === 'number' && Number.isFinite(v) ? v.toFixed(d).replace('.', ',') : '—');

/** Escala del carril en cm alrededor del valor leído; el índice rojo marca lo que se leyó. */
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

function ReadingLine({ r }: { r: ReadingF4 }) {
  const { t } = useTranslation();
  const d = Math.max(0, Math.round(-Math.log10(r.resolution) + 0.01));
  let val = `${fmt(r.value, d)} ${r.unit}`;
  if (r.run) val = `a ${fmt(r.run.a, 3)} m/s² · T ${fmt(r.run.T, 3)} N · Δt₁ ${fmt(r.run.dt1, 5)} s · Δt₂ ${fmt(r.run.dt2, 5)} s · t₁ ${fmt(r.run.t1g, 4)} s · t₂ ${fmt(r.run.t2g, 4)} s`;
  if (r.pair) val = `F_A ${fmt(r.pair.FA, 2)} N · F_B ${fmt(r.pair.FB, 2)} N · t ${fmt(r.pair.t, 3)} s`;
  return (
    <p className="lens-reading">
      <strong>{r.id}</strong> · {val} <span className="hint">({t('f04.lens.res', { res: fmt(r.resolution, d) })})</span>
      {r.qualityFlags.length > 0 && <span className="pending"> ⚠ {r.qualityFlags.map((f) => t(`f04.flag.${f}`)).join(', ')}</span>}
    </p>
  );
}

const W = 640;
const H = 220;
const PAD = { l: 44, r: 12, t: 12, b: 26 };

/** Gráfica de dos señales con eje de tiempo, sucesos marcados y (opcional) ventana arrastrable. */
function Chart({ series, dur, events, win, onWin, yLabel }: {
  series: Array<{ pts: Array<[number, number]>; color: string; label: string }>;
  dur: number;
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
  const X = (t: number) => PAD.l + (t / Math.max(dur, 1e-6)) * (W - PAD.l - PAD.r);
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
  const step = dur > 4 ? 1 : dur > 2 ? 0.5 : 0.25;
  for (let t = 0; t <= dur + 1e-9; t += step) gridT.push(t);
  return (
    <svg ref={svg} viewBox={`0 0 ${W} ${H}`} className="lens-svg f04-chart" role="img" aria-hidden="true" style={{ touchAction: 'none', cursor: win ? 'ew-resize' : undefined }}
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
          <text x={X(t)} y={H - 8} fontSize={10} textAnchor="middle" fill="currentColor">{fmt(t, step < 1 ? 2 : 0)}</text>
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

/** Ventana inicial: desde 0,15 s hasta poco antes del primer suceso del ensayo (lo que haría un docente). */
function defaultWindow(rec: RunRecord): [number, number] {
  const dur = rec.samples.length ? rec.samples[rec.samples.length - 1][0] : 1;
  return [Math.min(0.1, dur / 4), Math.max(0.2, dur * 0.9)];
}

function RunLens({ w }: { w: F04World }) {
  const { t } = useTranslation();
  const rec = w.runs[w.runs.length - 1];
  const dispatch = useF04((s) => s.dispatch);
  const toast = useF04((s) => s.toast);
  const [win, setWin] = useState<{ id: number; w: [number, number] } | null>(null);
  if (!rec || !rec.samples.length) return <p className="hint">{t('f04.lens.noRun')}</p>;
  const dur = rec.samples[rec.samples.length - 1][0];
  const cur = win && win.id === rec.id ? win.w : defaultWindow(rec);
  const events = ([
    [rec.slackT, t('f04.lens.ev.slack')], [rec.landedT, t('f04.lens.ev.landed')], [rec.brakeT, t('f04.lens.ev.brake')], [rec.impactT, t('f04.lens.ev.impact')],
  ] as Array<[number | null, string]>).filter((e): e is [number, string] => e[0] !== null && e[0] > 0).map(([tt, label]) => ({ t: tt, label }));
  const read = () => {
    const r = dispatch({ type: 'readRun', t0: Math.round(cur[0] * 1000) / 1000, t1: Math.round(cur[1] * 1000) / 1000 });
    if (!r.ok && r.code) toast('warn', t(`f04.cmd.${r.code}`));
  };
  return (
    <>
      <p className="hint">{t('f04.lens.run', { n: rec.id, s: fmt(dur, 2), live: rec.done ? '' : t('f04.lens.live') })}</p>
      <Chart dur={Math.max(dur, 0.2)} yLabel="a · T" events={events} win={cur} onWin={(x) => setWin({ id: rec.id, w: x })}
        series={[
          { pts: rec.samples.map((s) => [s[0], s[1]]), color: '#2e9d57', label: 'a (m/s²)' },
          { pts: rec.samples.map((s) => [s[0], s[2]]), color: '#e67e22', label: 'T (N)' },
        ]} />
      <div className="row">
        <span className="hint" aria-live="polite">{t('f04.lens.window', { t0: fmt(cur[0], 3), t1: fmt(cur[1], 3) })}</span>
        <button className="btn" onClick={() => setWin({ id: rec.id, w: [Math.max(0, cur[0] - 0.02), cur[1]] })}>◀ t₀</button>
        <button className="btn" onClick={() => setWin({ id: rec.id, w: [Math.min(cur[1] - 0.05, cur[0] + 0.02), cur[1]] })}>t₀ ▶</button>
        <button className="btn" onClick={() => setWin({ id: rec.id, w: [cur[0], Math.max(cur[0] + 0.05, cur[1] - 0.02)] })}>◀ t₁</button>
        <button className="btn" onClick={() => setWin({ id: rec.id, w: [cur[0], Math.min(dur, cur[1] + 0.02)] })}>t₁ ▶</button>
        <button className="btn primary" data-testid="f04-read-run" disabled={!rec.done} onClick={read}>📈 {t('f04.lens.readWindow')}</button>
      </div>
    </>
  );
}

function PairLens({ w }: { w: F04World }) {
  const { t } = useTranslation();
  const rec = w.pairRec;
  const dispatch = useF04((s) => s.dispatch);
  const toast = useF04((s) => s.toast);
  if (!rec || !rec.samples.length) return <p className="hint">{t('f04.lens.noPair')}</p>;
  const dur = rec.samples[rec.samples.length - 1][0];
  return (
    <>
      <Chart dur={Math.max(dur, 0.2)} yLabel="F (N)" events={[{ t: rec.durationS, label: t('f04.lens.ev.handOff') }]}
        series={[
          { pts: rec.samples.map((s) => [s[0], s[1]]), color: '#c0392b', label: 'F_A' },
          { pts: rec.samples.map((s) => [s[0], s[2]]), color: '#2f6db5', label: 'F_B' },
        ]} />
      <div className="row">
        <button className="btn primary" disabled={!rec.done && w.pair.active && !!w.pair.push} onClick={() => {
          const r = dispatch({ type: 'readPair' });
          if (!r.ok && r.code) toast('warn', t(`f04.cmd.${r.code}`));
        }}>📈 {t('f04.lens.readPair')}</button>
      </div>
    </>
  );
}

export function LensF04() {
  const { t } = useTranslation();
  const lens = useF04((s) => s.settings.lens);
  const rt = useF04((s) => s.runtime);
  useF04((s) => s.version);
  if (!lens || !rt) return null;
  const w = rt.world;
  const inst = LENS_INSTRUMENT[lens];
  const last = [...w.readingOrder].reverse().map((id) => w.readings[id]).find((r) => r.instrumentId === inst && (lens === 'logger01' ? r.kind === 'run' : lens.startsWith('gate') ? r.target === lens : true));
  const close = () => useF04.getState().setSettings({ lens: null });
  return (
    <aside className="lens-panel f04-lens" role="dialog" aria-label={t('f04.lens.title')}>
      <header>
        <strong>🔍 {t(`f04.lens.of.${lens}`)}</strong>
        <button className="x" aria-label={t('common.close')} onClick={close}>×</button>
      </header>
      {lens === 'logger01' && <RunLens w={w} />}
      {lens === 'pair' && <PairLens w={w} />}
      {(lens === 'gate1' || lens === 'gate2') && last && Number.isFinite(last.value) && <ScaleSvg cm={last.value} />}
      {lens === 'balance01' && last && <Digital lines={[`${fmt(last.value, 1)} g`]} />}
      {!last && lens !== 'logger01' && lens !== 'pair' && <p className="hint">{t('f04.lens.none')}</p>}
      {last && <ReadingLine r={last} />}
      <p className="hint">{t(lens === 'logger01' ? 'f04.lens.noteRun' : 'f04.lens.note')}</p>
    </aside>
  );
}
