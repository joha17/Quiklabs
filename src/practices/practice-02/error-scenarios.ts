/**
 * §8 — Catálogo de errores simulables con su detección en el dominio (evento o evidencia).
 * Lo usan la documentación, el modo depuración y las pruebas. Todos tienen consecuencia observable.
 */
export interface ErrorScenario {
  id: string;
  part: 'A' | 'B' | 'C' | 'D';
  /** Cómo se detecta: código de evento (ev:) o clave de evidencia (evidence:) o estado (state:). */
  detection: string;
  recoverable: boolean;
}

export const ERROR_SCENARIOS: ErrorScenario[] = [
  { id: 'A1', part: 'A', detection: 'state:tube.errors MISLABELED', recoverable: true },
  { id: 'A2', part: 'A', detection: 'ev:CROSS_CONTAMINATION · state:tube.errors CONTAMINATED', recoverable: true },
  { id: 'A3', part: 'A', detection: 'state:tube.appearance SOLID_REMAINING', recoverable: true },
  { id: 'A4', part: 'A', detection: 'state:tube.waterMl < 1,9', recoverable: true },
  { id: 'A5', part: 'A', detection: 'state:tube.appearance INCONCLUSIVE (sin agitar)', recoverable: true },
  { id: 'A6', part: 'A', detection: 'state:tube.appearance EMULSION → TWO_LAYERS', recoverable: true },
  { id: 'A7', part: 'A', detection: 'ev:SAFETY_DIRECT_SNIFF (sin dato)', recoverable: true },
  { id: 'B1', part: 'B', detection: 'evidence:tareCount = 0 (masa con tara del papel)', recoverable: true },
  { id: 'B2', part: 'B', detection: 'evidence:pour:cyl->beaker1 ≠ 10,0 mL', recoverable: true },
  { id: 'B3', part: 'B', detection: 'evidence:heatUnstirredS:<vaso>', recoverable: true },
  { id: 'B4', part: 'B', detection: 'ev:ABRUPT_POWER · ev:BUMPING', recoverable: false },
  { id: 'B5', part: 'B', detection: 'state:cristales de KNO₃ entre el carbón antes de filtrar', recoverable: true },
  { id: 'B6', part: 'B', detection: 'ev:SAFETY_DRY_MIXTURE_HEAT (bloqueo crítico)', recoverable: true },
  { id: 'B7', part: 'B', detection: 'ev:SAFETY_BURN · ev:SAFETY_BURN_PLATE', recoverable: true },
  { id: 'C1', part: 'C', detection: 'ev:PAPER_BAD_FOLD (CONE_BAD → canales)', recoverable: true },
  { id: 'C2', part: 'C', detection: 'state:filter.wetted = false (paso lateral)', recoverable: true },
  { id: 'C3', part: 'C', detection: 'ev:PAPER_TORN · evidence:solidsPassedFilterG', recoverable: true },
  { id: 'C4', part: 'C', detection: 'ev:FILTER_OVERFLOW · evidence:filterOverflowMl', recoverable: true },
  { id: 'C5', part: 'C', detection: 'evidence:fastFunnelPourS (rasgado/rebalse)', recoverable: true },
  { id: 'C6', part: 'C', detection: 'ev:FILTRATE_LOST · evidence:filtrateLostMl', recoverable: false },
  { id: 'C7', part: 'C', detection: 'evidence:washMl < 1,6 (KNO₃ retenido en el residuo)', recoverable: true },
  { id: 'C8', part: 'C', detection: 'evidence:washMl > 2,8 (filtrado diluido)', recoverable: true },
  { id: 'C9', part: 'C', detection: 'state:cristales en el embudo/papel', recoverable: true },
  { id: 'D1', part: 'D', detection: 'evidence:pour:cyl->dish ≠ 2,0 mL', recoverable: true },
  { id: 'D2', part: 'D', detection: 'evidence:openEvapS:dish · splashG:dish', recoverable: false },
  { id: 'D3', part: 'D', detection: 'ev:COVER_SEALED_BLOCKED', recoverable: true },
  { id: 'D4', part: 'D', detection: 'ev:INCIDENT_OVERHEAT (práctica detenida)', recoverable: true },
  { id: 'D5', part: 'D', detection: 'ev:THERMAL_SHOCK_RISK · ev:THERMAL_SHOCK_BREAK', recoverable: false },
  { id: 'D6', part: 'D', detection: 'ev:BATH_WATER_INGRESS', recoverable: true },
  { id: 'D7', part: 'D', detection: 'state:cryst.phase SUPERSATURATED/DILUTE sin cristales en el baño', recoverable: true },
  { id: 'D8', part: 'D', detection: 'state:KNO₃ en waste_liquid', recoverable: false },
];
