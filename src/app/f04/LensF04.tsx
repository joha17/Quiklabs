/**
 * Visor de lectura: amplía la escala o la pantalla del instrumento que se acaba de leer y la dibuja con la lectura
 * registrada (la que produjo el dominio con la técnica real: cero del transportador, paralaje, cinta sin alinear).
 * Transportador en grados, nivel, regla vertical, cinta del suelo y escala de la pantalla en cm, pantalla de la
 * interfaz (Δt de la fotopuerta) y la placa con el punto de impacto. No corrige nada: si hubo paralaje, muestra la
 * división corrida.
 */
import { useTranslation } from 'react-i18next';
import { useF04 } from './store';
import type { EyeTargetF4 } from '../../engine/f04/F04Lab3D';
import type { ReadingF4 } from '../../simulation/f04-world/types';

const LENS_INSTRUMENT: Record<string, string> = {
  launcher01: 'launcher01', stand01: 'stand01', heightRuler01: 'heightRuler01', floorTape01: 'floorTape01', screen01: 'screen01', timer01: 'gate01', platform01: 'platform01',
};

/** Vista de lectura para lo seleccionado (o el transportador, la escala más usada). */
export function eyeTargetFor(sel: string | null): EyeTargetF4 {
  if (sel === 'gate01' || sel === 'plumb01') return 'launcher01';
  if (sel === 'ballA' || sel === 'tray01') return 'stand01';
  if (sel && ['launcher01', 'heightRuler01', 'screen01', 'floorTape01', 'platform01', 'timer01', 'stand01'].includes(sel)) return sel as EyeTargetF4;
  return 'launcher01';
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

/** Transportador: arco de 0 a 90° con el puntero en la lectura registrada. */
function ProtractorSvg({ deg }: { deg: number }) {
  const ticks = [];
  for (let d = 0; d <= 90; d += 5) {
    const a = (d * Math.PI) / 180;
    const r0 = d % 10 === 0 ? 88 : 95;
    ticks.push(<line key={d} x1={20 + Math.cos(a) * r0} y1={120 - Math.sin(a) * r0} x2={20 + Math.cos(a) * 104} y2={120 - Math.sin(a) * 104} stroke="currentColor" strokeWidth={d % 10 === 0 ? 1.4 : 0.8} />);
    if (d % 10 === 0) ticks.push(<text key={`t${d}`} x={20 + Math.cos(a) * 76} y={124 - Math.sin(a) * 76} fontSize={9} textAnchor="middle" fill="currentColor">{d}</text>);
  }
  const a = (deg * Math.PI) / 180;
  return (
    <svg viewBox="0 0 140 130" role="img" aria-hidden="true" className="lens-svg" style={{ maxWidth: 220 }}>
      {ticks}
      <line x1={20} y1={120} x2={20 + Math.cos(a) * 104} y2={120 - Math.sin(a) * 104} stroke="#c0392b" strokeWidth={1.6} />
    </svg>
  );
}

/** Placa de 40 × 40 cm con el contacto registrado (origen en el borde cercano al lanzador). */
function PlateSvg({ r }: { r: ReadingF4 }) {
  const i = r.impact;
  const ok = i && Number.isFinite(i.xCm) && Number.isFinite(i.yCm);
  return (
    <svg viewBox="0 0 220 220" role="img" aria-hidden="true" className="lens-svg" style={{ maxWidth: 220 }}>
      <rect x={10} y={10} width={200} height={200} fill="#2b3138" />
      {Array.from({ length: 9 }, (_, k) => <line key={`v${k}`} x1={10 + k * 25} x2={10 + k * 25} y1={10} y2={210} stroke="#56606a" />)}
      {Array.from({ length: 9 }, (_, k) => <line key={`h${k}`} y1={10 + k * 25} y2={10 + k * 25} x1={10} x2={210} stroke="#56606a" />)}
      <rect x={10} y={10} width={5} height={200} fill="#f5d742" />
      {ok && <circle cx={10 + (i!.xCm / 40) * 200} cy={110 - (i!.yCm / 40) * 200} r={5} fill="#ff3b30" />}
    </svg>
  );
}

function Digital({ lines }: { lines: string[] }) {
  return <div className="lens-digital" style={{ fontFamily: 'monospace', background: '#10261a', color: '#7CFC9A', padding: '0.4rem 0.6rem', borderRadius: 6 }}>{lines.map((l) => <div key={l}>{l}</div>)}</div>;
}

function ReadingLine({ r }: { r: ReadingF4 }) {
  const { t } = useTranslation();
  const d = Math.max(0, Math.round(-Math.log10(r.resolution) + 0.01));
  const val = `${Number.isFinite(r.value) ? fmt(r.value, d) : '—'} ${r.unit}`;
  return (
    <p className="lens-reading">
      <strong>{r.id}</strong> · {val} <span className="hint">({t('f04.lens.res', { res: fmt(r.resolution, d) })})</span>
      {r.qualityFlags.length > 0 && <span className="pending"> ⚠ {r.qualityFlags.map((f) => t(`f04.flag.${f}`)).join(', ')}</span>}
    </p>
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
  const last = [...w.readingOrder].reverse().map((id) => w.readings[id]).find((r) => r.instrumentId === inst);
  const close = () => useF04.getState().setSettings({ lens: null });
  const i = last?.impact;
  return (
    <aside className="lens-panel" role="dialog" aria-label={t('f04.lens.title')}>
      <header>
        <strong>🔍 {t(`f04.obj.${lens}`)}</strong>
        <button className="x" aria-label={t('common.close')} onClick={close}>×</button>
      </header>
      {!last && <p className="hint">{t('f04.lens.none')}</p>}
      {last && lens === 'launcher01' && <ProtractorSvg deg={last.value} />}
      {last && lens === 'stand01' && <Digital lines={[`${fmt(last.value, 1)}°`]} />}
      {last && (lens === 'heightRuler01' || lens === 'floorTape01' || lens === 'screen01') && Number.isFinite(last.value) && <ScaleSvg cm={last.value} vertical={lens !== 'floorTape01'} />}
      {last && lens === 'timer01' && <Digital lines={[`Δt ${Number.isFinite(last.value) ? fmt(last.value, 5) : '-----'} s`]} />}
      {last && lens === 'platform01' && (
        <>
          <PlateSvg r={last} />
          <Digital lines={[`x ${i && Number.isFinite(i.xCm) ? fmt(i.xCm, 1) : '--'} cm · y ${i && Number.isFinite(i.yCm) ? fmt(i.yCm, 1) : '--'} cm`, `t ${i && Number.isFinite(i.tFlight) && i.tFlight >= 0 ? fmt(i.tFlight, 4) : '----'} s`]} />
        </>
      )}
      {last && <ReadingLine r={last} />}
      <p className="hint">{t('f04.lens.note')}</p>
    </aside>
  );
}
