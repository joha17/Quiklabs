/**
 * Visor de lectura: amplía la escala del instrumento que se acaba de leer y la dibuja en la posición de la lectura
 * registrada (la que produjo el dominio con la técnica real: cero, fuerza, paralaje). Calibrador con nonio,
 * micrómetro con tambor, probeta con menisco, dinamómetro y escala angular. No corrige nada: si hubo paralaje, el
 * dibujo muestra la división corrida que se leyó.
 */
import { useTranslation } from 'react-i18next';
import { useF101 } from './store';
import type { EyeTargetF } from '../../engine/f101/F101Lab3D';
import type { ReadingF } from '../../simulation/f101-world/types';

const LENS_INSTRUMENT: Record<string, string> = {
  caliper01: 'caliper01', micrometer01: 'micrometer01', gradCyl01: 'gradCyl01', dynamometer01: 'dynamometer01', forceTable01: 'forceTable01', ruler01: 'ruler01',
};

/** Vista de lectura para lo seleccionado (o la probeta, el instrumento más usado a la altura del ojo). */
export function eyeTargetFor(sel: string | null): EyeTargetF {
  if (sel && ['caliper01', 'micrometer01', 'gradCyl01', 'balance01', 'dynamometer01', 'forceTable01', 'ruler01'].includes(sel)) return sel as EyeTargetF;
  if (sel?.startsWith('pulley')) return 'forceTable01';
  return 'gradCyl01';
}

const fmt = (v: number, d: number) => v.toFixed(d).replace('.', ',');

function CaliperSvg({ mm }: { mm: number }) {
  // Escala principal en mm y nonio de 50 divisiones (49 mm): coincide la división `round(frac / 0,02)`.
  const px = 14;
  const x0 = 40 - (Math.floor(mm) - 6) * px;
  const main = [];
  for (let i = Math.max(0, Math.floor(mm) - 8); i <= Math.floor(mm) + 30; i++) {
    const x = x0 + i * px;
    main.push(<line key={i} x1={x} x2={x} y1={50} y2={i % 10 === 0 ? 22 : i % 5 === 0 ? 32 : 38} stroke="currentColor" strokeWidth={i % 10 === 0 ? 1.6 : 1} />);
    if (i % 10 === 0) main.push(<text key={`t${i}`} x={x} y={18} fontSize={11} textAnchor="middle" fill="currentColor">{i / 10}</text>);
  }
  const v0 = x0 + mm * px;
  const vern = [];
  for (let k = 0; k <= 50; k++) {
    const x = v0 + k * (49 / 50) * px;
    vern.push(<line key={k} x1={x} x2={x} y1={52} y2={k % 5 === 0 ? 76 : 66} stroke="#c0392b" strokeWidth={k % 10 === 0 ? 1.6 : 1} />);
    if (k % 10 === 0) vern.push(<text key={`v${k}`} x={x} y={90} fontSize={10} textAnchor="middle" fill="#c0392b">{k / 10}</text>);
  }
  return (
    <svg viewBox="0 0 520 96" role="img" aria-hidden="true" className="lens-svg">
      <rect x={0} y={0} width={520} height={51} fill="var(--lens-bg, #eef1f3)" />
      {main}
      <rect x={v0 - 4} y={51} width={520} height={45} fill="rgba(192,57,43,0.06)" />
      {vern}
    </svg>
  );
}

function MicrometerSvg({ mm, pitch }: { mm: number; pitch: number }) {
  // Manguito con mm arriba y medios mm abajo; tambor de 50 divisiones (0,01 mm) con la línea de referencia.
  const px = 22;
  const edge = 60 + mm * px;
  const sleeve = [];
  for (let h = 0; h <= Math.floor(mm / 0.5) + 1; h++) {
    const x = 60 + h * 0.5 * px;
    if (x > edge) break;
    const whole = h % 2 === 0;
    sleeve.push(<line key={h} x1={x} x2={x} y1={whole ? 30 : 48} y2={whole ? 48 : 62} stroke="currentColor" />);
    if (whole && (h / 2) % 5 === 0) sleeve.push(<text key={`s${h}`} x={x} y={26} fontSize={10} textAnchor="middle" fill="currentColor">{h / 2}</text>);
  }
  const turnFrac = (mm % pitch) / pitch;
  const drum = [];
  for (let k = -6; k <= 6; k++) {
    const div = (Math.round(turnFrac * 50) + k + 50) % 50;
    const y = 48 - (k - (turnFrac * 50 - Math.round(turnFrac * 50))) * 8;
    drum.push(<line key={k} x1={edge} x2={edge + (div % 5 === 0 ? 22 : 14)} y1={y} y2={y} stroke="#1f4e79" />);
    if (div % 5 === 0) drum.push(<text key={`d${k}`} x={edge + 34} y={y + 3} fontSize={10} textAnchor="middle" fill="#1f4e79">{div}</text>);
  }
  return (
    <svg viewBox="0 0 300 96" role="img" aria-hidden="true" className="lens-svg">
      <rect x={40} y={34} width={edge - 40} height={28} fill="var(--lens-bg, #eef1f3)" />
      <line x1={40} x2={edge} y1={48} y2={48} stroke="currentColor" />
      {sleeve}
      <rect x={edge} y={0} width={60} height={96} fill="rgba(31,78,121,0.08)" />
      {drum}
    </svg>
  );
}

function ReadingLine({ r }: { r: ReadingF }) {
  const { t } = useTranslation();
  const d = Math.max(0, Math.round(-Math.log10(r.resolution) + 0.01));
  const warn = r.qualityFlags.filter((f) => !['ZERO', 'TARE'].includes(f));
  return (
    <p className="lens-reading">
      <strong>{r.id}</strong> · {fmt(r.value, d)} {r.unit} <span className="hint">({t('f101.lens.res', { res: fmt(r.resolution, d) })})</span>
      {warn.length > 0 && <span className="pending"> ⚠ {warn.map((f) => t(`f101.flag.${f}`)).join(', ')}</span>}
    </p>
  );
}

export function LensF101() {
  const { t } = useTranslation();
  const lens = useF101((s) => s.settings.lens);
  const rt = useF101((s) => s.runtime);
  useF101((s) => s.version);
  if (!lens || !rt) return null;
  const w = rt.world;
  const inst = LENS_INSTRUMENT[lens];
  const last = [...w.readingOrder].reverse().map((id) => w.readings[id]).find((r) => r.instrumentId === inst || (lens === 'forceTable01' && r.kind === 'equilibrium'));
  const close = () => useF101.getState().setSettings({ lens: null });
  return (
    <aside className="lens-panel" role="dialog" aria-label={t('f101.lens.title')}>
      <header>
        <strong>🔍 {t(`f101.obj.${lens}`)}</strong>
        <button className="x" aria-label={t('common.close')} onClick={close}>×</button>
      </header>
      {!last && <p className="hint">{t('f101.lens.none')}</p>}
      {last && lens === 'caliper01' && <CaliperSvg mm={last.value} />}
      {last && lens === 'micrometer01' && <MicrometerSvg mm={last.value} pitch={w.params.micrometer.pitchMm} />}
      {last && last.kind === 'equilibrium' && (
        <ul className="lens-forces">
          {(last.forces ?? []).map((f, i) => (
            <li key={i}>{t('f101.lens.force', { i: i + 1, m: f.massG !== undefined ? `${f.massG} g` : `${fmt(f.readN ?? 0, 2)} N`, a: fmt(f.angleRead, 0) })}</li>
          ))}
          <li className="hint">{t('f101.lens.ring', { mm: fmt(last.ringOffsetMm ?? 0, 1) })}</li>
        </ul>
      )}
      {last && <ReadingLine r={last} />}
      <p className="hint">{t('f101.lens.note')}</p>
    </aside>
  );
}
