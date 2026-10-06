import { useTranslation } from 'react-i18next';
import { useP6 } from './store';
import { displayedValue } from '../../simulation/calorimetry-world/world';

/**
 * Pantallas de los instrumentos (§27): los dos termómetros digitales y la perilla de la plantilla, tal como se ven en
 * la escena (con su retardo y resolución). Permite seguirlos sin acercar la cámara y lectura por lector de pantalla.
 */
export function InstrumentsBar() {
  const { t } = useTranslation();
  useP6((s) => s.version);
  const rt = useP6((s) => s.runtime);
  if (!rt) return null;
  const w = rt.world;
  const show = (id: string) => w.objects[id].support !== 'bench' && w.objects[id].support !== 'hand';
  const f = (v: number) => v.toFixed(1).replace('.', ',');
  return (
    <aside className="instruments-bar" aria-label={t('p6.instr.title')}>
      {show('therm_cal') && <span className="instr cal"><small>{t('p6.instr.cal')}</small><strong aria-live="off">{f(displayedValue(w, 'therm_cal'))} °C</strong></span>}
      {show('therm_bath') && <span className="instr bath"><small>{t('p6.instr.bath')}</small><strong aria-live="off">{f(displayedValue(w, 'therm_bath'))} °C</strong></span>}
      {w.plate.knob > 0.01 && <span className="instr plate"><small>{t('p6.instr.plate')}</small><strong>{f(w.plate.knob * 5)}</strong></span>}
    </aside>
  );
}
