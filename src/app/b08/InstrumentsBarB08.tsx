import { useTranslation } from 'react-i18next';
import { useB08 } from './store';
import { elapsedOf, seriesElapsed } from '../../simulation/photo-world/world';

/** Indicadores que se ven en los equipos: cronómetro, lámparas y frente en el papel. Marcas de los mandos, no cifras ocultas. */
export function InstrumentsBarB08() {
  const { t } = useTranslation();
  useB08((s) => s.version);
  const rt = useB08((s) => s.runtime);
  if (!rt) return null;
  const m = rt.world.photo;
  const clock = (s: number | null) => (s === null ? '—' : `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`);
  return (
    <aside className="instruments-bar" aria-label={t('b08.instr.title')}>
      <span className="instr"><small>{t('b08.instr.gas')}</small><strong aria-live="off">{clock(elapsedOf(rt.world))}</strong></span>
      <span className="instr"><small>{t('b08.instr.btb')}</small><strong aria-live="off">{clock(seriesElapsed(rt.world))}</strong></span>
      <span className={`instr${m.lamps.lampG.on || m.lamps.lampB.on ? '' : ' unstable'}`}><small>{t('b08.instr.lamps')}</small><strong aria-live="off">{Object.values(m.lamps).filter((l) => l.on).length}/2</strong></span>
      <span className={`instr${m.hood.on ? '' : ' unstable'}`}><small>{t('b08.instr.hood')}</small><strong aria-live="off">{t(m.hood.on ? 'b08.instr.on' : 'b08.instr.off')}</strong></span>
    </aside>
  );
}
