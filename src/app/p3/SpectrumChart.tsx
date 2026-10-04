import { useTranslation } from 'react-i18next';
import { NM_MAX, NM_MIN, N_BINS, nmAt, type Spectrum } from '../../simulation/spectroscopy/spectrum';

/**
 * Espectro simplificado (vista docente ampliada §9.5 y apoyo de visión cromática §24): sin filtro (línea continua)
 * y a través del vidrio de cobalto (línea discontinua). Etiquetas de región en texto, no solo color.
 */
export function SpectrumChart({ raw, filtered, title }: { raw: Spectrum; filtered?: Spectrum; title?: string }) {
  const { t } = useTranslation();
  const W = 320;
  const H = 120;
  let max = 0;
  for (let i = 0; i < N_BINS; i++) max = Math.max(max, raw[i], filtered?.[i] ?? 0);
  if (max <= 0) max = 1;
  const pts = (s: Spectrum) => {
    const out: string[] = [];
    for (let i = 0; i < N_BINS; i += 2) {
      const x = ((nmAt(i) - NM_MIN) / (NM_MAX - NM_MIN)) * W;
      const y = H - 14 - (Math.sqrt(s[i] / max) * (H - 24));
      out.push(`${x.toFixed(1)},${y.toFixed(1)}`);
    }
    return out.join(' ');
  };
  const bands: Array<[number, number, string, string]> = [
    [380, 450, '#7a4dd8', t('p3.spec.violet')], [450, 495, '#3f6fe0', t('p3.spec.blue')], [495, 570, '#3aa35a', t('p3.spec.green')],
    [570, 590, '#d6b21e', t('p3.spec.yellow')], [590, 620, '#e07b26', t('p3.spec.orange')], [620, 780, '#c73a3a', t('p3.spec.red')],
  ];
  return (
    <figure className="spectrum" aria-label={title ?? t('p3.spec.title')}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img">
        {bands.map(([a, b, c, label]) => {
          const x0 = ((a - NM_MIN) / (NM_MAX - NM_MIN)) * W;
          const x1 = ((b - NM_MIN) / (NM_MAX - NM_MIN)) * W;
          return (
            <g key={a}>
              <rect x={x0} y={H - 12} width={x1 - x0} height={6} fill={c} opacity={0.75} />
              <text x={(x0 + x1) / 2} y={H - 1} fontSize="7" textAnchor="middle" fill="currentColor">{label}</text>
            </g>
          );
        })}
        <polyline points={pts(raw)} fill="none" stroke="currentColor" strokeWidth="1.4" />
        {filtered && <polyline points={pts(filtered)} fill="none" stroke="#3f6fe0" strokeWidth="1.2" strokeDasharray="4 3" />}
        {[400, 500, 600, 700].map((nm) => (
          <text key={nm} x={((nm - NM_MIN) / (NM_MAX - NM_MIN)) * W} y={9} fontSize="7" textAnchor="middle" fill="currentColor">{nm} nm</text>
        ))}
      </svg>
      <figcaption className="hint">{t('p3.spec.legend')}</figcaption>
    </figure>
  );
}
