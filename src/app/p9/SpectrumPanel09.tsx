import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useP09 } from './store';
import type { Reading09 } from '../../simulation/cation-analysis-world/types';

const W = 260;
const H = 70;
const NM0 = 380;
const NM1 = 780;
const x = (nm: number) => ((nm - NM0) / (NM1 - NM0)) * W;

/** Color aproximado de una longitud de onda (solo para dibujar la barra; la tabla es la información). */
function nmColor(nm: number): string {
  const h = nm < 440 ? 270 : nm < 490 ? 270 - ((nm - 440) / 50) * 70 : nm < 580 ? 200 - ((nm - 490) / 90) * 140 : nm < 645 ? 60 - ((nm - 580) / 65) * 60 : 0;
  return `hsl(${Math.round(h)} 90% 55%)`;
}

/**
 * Vista espectral accesible (§13, §14): la última lectura de la cámara espectral como barras y como TABLA de líneas
 * (longitud de onda e intensidad relativa). No nombra el elemento que produce cada línea: eso lo interpreta el
 * estudiante con su atlas. El color nunca es la única evidencia.
 */
export function SpectrumPanel09() {
  const { t } = useTranslation();
  useP09((s) => s.version);
  const rt = useP09((s) => s.runtime);
  const [open, setOpen] = useState(true);
  if (!rt) return null;
  const w = rt.world;
  const last = [...w.readingOrder].reverse().map((id) => w.readings[id]).find((r): r is Reading09 => r?.kind === 'spectrum');
  if (!last) return null;
  const lines = [...(last.lines ?? [])].sort((a, b) => a.nm - b.nm);
  return (
    <aside className="spectrum-panel" aria-label={t('p9.spec.title')}>
      <div className="p3-safety-head">
        <strong>📈 {t('p9.spec.title')}</strong>
        <span className="hint">{last.id} · ×{last.snapshot.gain ?? 1}{last.valid ? '' : ` · ${t('p9.quality.SATURATED')}`}</span>
        <button className="btn small ghost" aria-expanded={open} onClick={() => setOpen(!open)}>{open ? '–' : '+'}</button>
      </div>
      {open && (
        <>
          <svg viewBox={`0 0 ${W} ${H + 14}`} width="100%" role="img" aria-label={t('p9.spec.chart', { n: lines.length })}>
            <rect x={0} y={0} width={W} height={H} fill="#0d1117" />
            {lines.map((l) => <rect key={l.nm} x={x(l.nm) - 1} y={H - l.intensity * H} width={2} height={l.intensity * H} fill={nmColor(l.nm)} />)}
            {[400, 500, 600, 700].map((nm) => <text key={nm} x={x(nm)} y={H + 11} fontSize={9} textAnchor="middle" fill="currentColor">{nm}</text>)}
          </svg>
          <table className="nb-table spectrum-table">
            <caption className="sr-only">{t('p9.spec.caption')}</caption>
            <thead><tr><th scope="col">{t('p9.spec.nm')}</th><th scope="col">{t('p9.spec.intensity')}</th></tr></thead>
            <tbody>
              {lines.map((l) => <tr key={l.nm}><td>{l.nm.toFixed(1).replace('.', ',')}</td><td>{l.intensity.toFixed(3).replace('.', ',')}</td></tr>)}
              {!lines.length && <tr><td colSpan={2}>{t('p9.spec.none')}</td></tr>}
            </tbody>
          </table>
        </>
      )}
    </aside>
  );
}
