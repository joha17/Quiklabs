/**
 * Visor de lectura de F11: amplía lo que se acaba de leer y lo dibuja con la lectura registrada (la que produjo el
 * dominio con la técnica real). Escalas verticales (nivel del tanque, guía de inmersión, calado, soporte y probeta, con
 * paralaje si lo hubo), escala del dinamómetro, pantalla de la balanza y pantalla del registrador con las lecturas de
 * la serie en curso. No corrige nada: una sonda sin calibrar muestra su presión equivocada.
 */
import { useTranslation } from 'react-i18next';
import { useF11 } from './store';
import type { EyeTargetF11 } from '../../engine/f11/F11Lab3D';
import type { F11World, ReadingF11 } from '../../simulation/f11-world/types';

const LENS_INSTRUMENT: Record<EyeTargetF11, string> = {
  scale01: 'scale01', ruler01: 'ruler01', draft: 'draft01', dyn01: 'dyn01', stand01: 'stand01', cyl01: 'cyl01', balance01: 'balance01', logger01: 'probe01',
};

/** Vista de lectura para lo seleccionado (o la escala del tanque). */
export function eyeTargetFor(sel: string | null): EyeTargetF11 {
  switch (sel) {
    case 'ruler01':
    case 'guide01':
      return 'ruler01';
    case 'float1':
    case 'bottle1':
      return 'draft';
    case 'dyn01':
    case 'alu1':
    case 'can01':
      return 'dyn01';
    case 'stand01':
      return 'stand01';
    case 'cyl01':
    case 'resB':
      return 'cyl01';
    case 'balance01':
    case 'catch01':
      return 'balance01';
    case 'logger01':
    case 'probe01':
    case 'holder01':
      return 'logger01';
    default:
      return 'scale01';
  }
}

const fmt = (v: number | null | undefined, d: number) => (typeof v === 'number' && Number.isFinite(v) ? v.toFixed(d).replace('.', ',') : '—');

/** Escala en cm (o en grados) alrededor del valor leído; el índice rojo marca lo que se leyó. */
function ScaleSvg({ v, unit, k = 1 }: { v: number; unit: string; k?: number }) {
  const px = 9;
  v *= k;
  const ticks = [];
  const c0 = Math.floor(v) - 3;
  for (let i = c0 * 10; i <= (c0 + 7) * 10; i++) {
    const x = 20 + (i / 10 - c0) * px * 10;
    const len = i % 10 === 0 ? 26 : i % 5 === 0 ? 18 : 11;
    ticks.push(<line key={i} x1={x} x2={x} y1={10} y2={10 + len} stroke="currentColor" strokeWidth={i % 10 === 0 ? 1.4 : 0.8} />);
    if (i % 10 === 0) ticks.push(<text key={`t${i}`} x={x} y={52} fontSize={11} textAnchor="middle" fill="currentColor">{fmt(i / 10 / k, k === 1 ? 0 : 1)}{unit}</text>);
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

function ReadingLine({ r }: { r: ReadingF11 }) {
  const { t } = useTranslation();
  const d = Math.max(0, Math.round(-Math.log10(r.resolution) + 0.01));
  let val = `${fmt(r.value, d)} ${r.unit}`;
  if (r.target) val += ` · ${t(`f11.lens.target.${r.target}`, { defaultValue: r.target })}`;
  return (
    <p className="lens-reading">
      <strong>{r.id}</strong> · {val} <span className="hint">({t('f11.lens.res', { res: fmt(r.resolution, d) })})</span>
      {r.qualityFlags.length > 0 && <span className="pending"> ⚠ {r.qualityFlags.map((f) => t(`f11.flag.${f}`)).join(', ')}</span>}
    </p>
  );
}

/** Lecturas de presión de la serie en curso (el registrador las lista). */
function SeriesList({ w }: { w: F11World }) {
  const { t } = useTranslation();
  const rows = w.readingOrder.map((id) => w.readings[id]).filter((r) => r.kind === 'pressure' && r.series === w.series.id);
  if (!rows.length) return <p className="hint">{t('f11.lens.noSeries', { n: w.series.id })}</p>;
  return (
    <table className="lens-table">
      <tbody>
        {rows.slice(-8).map((r) => (
          <tr key={r.id}>
            <td>{r.id}</td>
            <td>{fmt(r.value, Math.max(0, Math.round(-Math.log10(r.resolution) + 0.01)))} kPa</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function LensF11() {
  const { t } = useTranslation();
  const lens = useF11((s) => s.settings.lens) as EyeTargetF11 | null;
  const rt = useF11((s) => s.runtime);
  useF11((s) => s.version);
  if (!lens || !rt) return null;
  const w = rt.world;
  const inst = LENS_INSTRUMENT[lens];
  const last: ReadingF11 | undefined = [...w.readingOrder].reverse().map((id) => w.readings[id]).find((r) => r.instrumentId === inst);
  const close = () => useF11.getState().setSettings({ lens: null });
  const ok = !!last && Number.isFinite(last.value);
  const scale = lens === 'scale01' || lens === 'ruler01' || lens === 'draft' || lens === 'stand01';
  return (
    <aside className="lens-panel f11-lens" role="dialog" aria-label={t('f11.lens.title')}>
      <header>
        <strong>🔍 {t(`f11.lens.of.${lens}`)}</strong>
        <button className="x" aria-label={t('common.close')} onClick={close}>×</button>
      </header>
      {scale && ok && <ScaleSvg v={last!.value} unit="" />}
      {lens === 'cyl01' && ok && <ScaleSvg v={last!.value} unit="" />}
      {lens === 'dyn01' && ok && <ScaleSvg v={last!.value} unit=" N" k={10} />}
      {lens === 'balance01' && last && <Digital lines={[`${fmt(last.value, 1)} g`]} />}
      {lens === 'logger01' && last && <Digital lines={[`${fmt(last.value, Math.max(0, Math.round(-Math.log10(last.resolution) + 0.01)))} kPa`]} />}
      {lens === 'logger01' && <SeriesList w={w} />}
      {!last && <p className="hint">{t('f11.lens.none')}</p>}
      {last && <ReadingLine r={last} />}
      <p className="hint">{t('f11.lens.note')}</p>
    </aside>
  );
}
