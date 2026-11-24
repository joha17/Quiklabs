/**
 * Visor de lectura de F12: amplía lo que se acaba de leer y lo dibuja con la lectura registrada (la que produjo el
 * dominio con la técnica real). Escalas verticales (nivel del depósito, regla de las tomas, vaso graduado, con
 * paralaje si lo hubo), escala del calibre, pantallas del cronómetro y del caudalímetro, y la pantalla del registrador
 * con las lecturas de la serie en curso. No corrige nada: un sensor sin calibrar muestra su presión equivocada.
 */
import { useTranslation } from 'react-i18next';
import { useF12 } from './store';
import type { EyeTargetF12 } from '../../engine/f12/F12Lab3D';
import type { F12World, ReadingF12 } from '../../simulation/f12-world/types';

const LENS_INSTRUMENTS: Record<EyeTargetF12, string[]> = {
  sump01: ['sump01'], ruler01: ['ruler01'], beaker01: ['beaker01'], timer01: ['timer01'], logger01: ['sensor1', 'sensor2', 'sensor3'], meter01: ['meter01'], caliper01: ['caliper01'],
};

/** Vista de lectura para lo seleccionado (o el registrador). */
export function eyeTargetFor(sel: string | null): EyeTargetF12 {
  switch (sel) {
    case 'sump01':
    case 'pump01':
    case 'purge01':
      return 'sump01';
    case 'ruler01':
    case 'venturi01':
      return 'ruler01';
    case 'beaker01':
    case 'outlet01':
      return 'beaker01';
    case 'timer01':
      return 'timer01';
    case 'meter01':
    case 'valve01':
      return 'meter01';
    case 'caliper01':
    case 'sample01':
      return 'caliper01';
    default:
      return 'logger01';
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

function ReadingLine({ r }: { r: ReadingF12 }) {
  const { t } = useTranslation();
  const d = Math.max(0, Math.round(-Math.log10(r.resolution) + 0.01));
  let val = `${fmt(r.value, d)} ${r.unit}`;
  if (r.target) val += ` · ${t(`f12.lens.target.${r.target}`, { defaultValue: r.target })}`;
  return (
    <p className="lens-reading">
      <strong>{r.id}</strong> · {val} <span className="hint">({t('f12.lens.res', { res: fmt(r.resolution, d) })})</span>
      {r.qualityFlags.length > 0 && <span className="pending"> ⚠ {r.qualityFlags.map((f) => t(`f12.flag.${f}`)).join(', ')}</span>}
    </p>
  );
}

/** Lecturas de presión de la serie en curso (el registrador las lista). */
function SeriesList({ w }: { w: F12World }) {
  const { t } = useTranslation();
  const rows = w.readingOrder.map((id) => w.readings[id]).filter((r) => r.kind === 'pressure' && r.series === w.series.id);
  if (!rows.length) return <p className="hint">{t('f12.lens.noSeries', { n: w.series.id })}</p>;
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

export function LensF12() {
  const { t } = useTranslation();
  const lens = useF12((s) => s.settings.lens) as EyeTargetF12 | null;
  const rt = useF12((s) => s.runtime);
  useF12((s) => s.version);
  if (!lens || !rt) return null;
  const w = rt.world;
  const inst = LENS_INSTRUMENTS[lens] ?? [];
  const last: ReadingF12 | undefined = [...w.readingOrder].reverse().map((id) => w.readings[id]).find((r) => inst.includes(r.instrumentId));
  const close = () => useF12.getState().setSettings({ lens: null });
  const ok = !!last && Number.isFinite(last.value);
  const scale = lens === 'sump01' || lens === 'ruler01';
  return (
    <aside className="lens-panel f12-lens" role="dialog" aria-label={t('f12.lens.title')}>
      <header>
        <strong>🔍 {t(`f12.lens.of.${lens}`)}</strong>
        <button className="x" aria-label={t('common.close')} onClick={close}>×</button>
      </header>
      {scale && ok && <ScaleSvg v={last!.value} unit="" />}
      {lens === 'caliper01' && ok && <ScaleSvg v={last!.value} unit=" cm" k={10} />}
      {lens === 'beaker01' && ok && <ScaleSvg v={last!.value / 100} unit="" k={10} />}
      {lens === 'timer01' && last && <Digital lines={[`${fmt(last.value, 2)} s`]} />}
      {lens === 'meter01' && last && <Digital lines={[`${fmt(last.value, 2)} L/s`]} />}
      {lens === 'logger01' && last && <Digital lines={[`${last.target ?? ''} ${fmt(last.value, Math.max(0, Math.round(-Math.log10(last.resolution) + 0.01)))} kPa`]} />}
      {lens === 'logger01' && <SeriesList w={w} />}
      {!last && <p className="hint">{t('f12.lens.none')}</p>}
      {last && <ReadingLine r={last} />}
      <p className="hint">{t('f12.lens.note')}</p>
    </aside>
  );
}
