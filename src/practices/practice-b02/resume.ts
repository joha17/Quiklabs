/**
 * Reanudación segura de B02 (§6.7): la de B01 (pinza, cubreobjetos, ocular, gesto) más el estado celular. El
 * fragmento que llevaba la pinza o la espátula vuelve a la tabla de corte (o, si está ocupada, a residuos, para
 * conservar la biomasa); un hisopo en la mano queda sobre la mesa en su estado. Función pura.
 */
import type { CellWorld } from '../../simulation/cell-world/types';
import { sanitizeOnResumeB01 } from '../practice-b01/resume';

export function sanitizeOnResumeB02(w: CellWorld): void {
  // La hoja de Elodea en la pinza la gestiona B01 (vuelve al recipiente); el estado celular se ajusta a eso.
  const fc = w.cell.held.fc;
  if (fc?.kind === 'elodea' && fc.sourceId === 'el' && w.forceps.holding?.kind === 'specimen') {
    w.cell.sources.el.massMg += fc.massMg;
    w.cell.held.fc = null;
  }
  // Cualquier otro fragmento: la pinza de B01 no debe devolverlo al recipiente de Elodea.
  if (w.cell.held.fc) w.forceps.holding = null;
  sanitizeOnResumeB01(w);
  for (const tool of ['fc', 'sp'] as const) {
    const f = w.cell.held[tool];
    if (!f) continue;
    if (!w.cell.board) w.cell.board = f;
    else w.cell.biomass.wasteMg += f.massMg;
    w.cell.held[tool] = null;
  }
}
