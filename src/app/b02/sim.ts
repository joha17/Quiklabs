/** La simulación del mundo celular para el runtime compartido con B01 (sin React: la usan la app y los tests). */
import type { OpticalSim } from '../b01/runtime';
import type { CellWorld } from '../../simulation/cell-world/types';
import type { CellCommand } from '../../simulation/cell-world/commands';
import { cellSummary, dispatchCell, stepCellWorld } from '../../simulation/cell-world/world';

export const CELL_SIM: OpticalSim = {
  dispatch: (w, c: CellCommand) => dispatchCell(w as CellWorld, c),
  step: (w) => stepCellWorld(w as CellWorld),
  summary: (w) => cellSummary(w as CellWorld),
};
