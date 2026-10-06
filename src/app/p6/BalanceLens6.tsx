import { useTranslation } from 'react-i18next';
import { useP6 } from './store';

/**
 * Lupa de la balanza (§6.3): vista ampliada de la escala del fiel y de las tres pesas, como la vería el estudiante de
 * frente. No muestra la masa del objeto: solo lo que la balanza indica (posición de las pesas y del fiel).
 */
export function BalanceLens6() {
  const { t } = useTranslation();
  useP6((s) => s.version);
  const rt = useP6((s) => s.runtime);
  const sel = useP6((s) => s.selected);
  const held = useP6((s) => s.held);
  if (!rt) return null;
  const w = rt.world;
  const b = w.balance;
  const show = sel === 'balance' || b.panObjectId !== null;
  void held;
  if (!show) return null;
  const y = 50 - Math.max(-1, Math.min(1, b.pointer)) * 38;
  const sum = b.riders[0] + b.riders[1] + b.riders[2];
  const settled = b.stable && Math.abs(b.pointer) < 0.06;
  return (
    <aside className="balance-lens" aria-label={t('p6.lens.title')}>
      <div className="lens-head"><strong>⚖ {t('p6.lens.title')}</strong></div>
      <div className="lens-body">
        <svg viewBox="0 0 60 100" className="lens-scale" role="img" aria-label={t('p6.lens.pointer', { s: settled ? t('p6.lens.centered') : b.pointer > 0 ? t('p6.lens.up') : t('p6.lens.down') })}>
          <rect x="18" y="6" width="24" height="88" rx="3" className="scale-bg" />
          {[-2, -1, 0, 1, 2].map((k) => <line key={k} x1={k === 0 ? 18 : 24} x2={k === 0 ? 42 : 36} y1={50 - k * 19} y2={50 - k * 19} className={k === 0 ? 'zero' : 'tick'} />)}
          <polygon points={`4,${y} 30,${y - 2} 30,${y + 2}`} className="needle" />
        </svg>
        <dl className="lens-riders">
          <dt>{t('p6.lens.r100')}</dt><dd>{b.riders[0]} g</dd>
          <dt>{t('p6.lens.r10')}</dt><dd>{b.riders[1]} g</dd>
          <dt>{t('p6.lens.r1')}</dt><dd>{b.riders[2].toFixed(2).replace('.', ',')} g</dd>
          <dt>{t('p6.lens.sum')}</dt><dd><strong>{sum.toFixed(2).replace('.', ',')} g</strong></dd>
        </dl>
      </div>
      <div className={`lens-state ${settled ? 'ok' : 'pending'}`} aria-live="polite">{settled ? t('p6.lens.ready') : t('p6.lens.wait')}</div>
    </aside>
  );
}
