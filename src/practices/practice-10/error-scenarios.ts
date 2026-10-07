/**
 * Escenarios docentes (§34) y catálogo de errores simulables (§26, criterio de aceptación 20: al menos 40). Cada
 * código tiene su clave de retroalimentación (`p10fb.*`) y la evidencia que lo detecta en el mundo o la libreta.
 */

/** Condiciones iniciales que el docente puede activar. */
export type P10Scenario =
  | 'UNLEVEL' | 'WET_WATCH_GLASS' | 'THERMO_OFFSET' | 'KINKED_HOSE' | 'CRACKED_BURETTE' | 'PIPETTE_BUBBLE'
  | 'DAMAGED_SEAL' | 'LOOSE_LUER' | 'SENSOR_OFFSET';

export const P10_SCENARIOS: P10Scenario[] = ['UNLEVEL', 'WET_WATCH_GLASS', 'THERMO_OFFSET', 'KINKED_HOSE', 'CRACKED_BURETTE', 'PIPETTE_BUBBLE', 'DAMAGED_SEAL', 'LOOSE_LUER', 'SENSOR_OFFSET'];

export interface SimulatedError {
  code: string;
  group: 'GRAV' | 'VOL' | 'GAS' | 'REACTION' | 'PRESSURE' | 'BOYLE' | 'SAFETY';
  /** Clave de evidencia en `w.evidence` (o `nb:` si se detecta en la libreta). */
  evidence: string;
}

const e = (code: string, group: SimulatedError['group'], evidence: string): SimulatedError => ({ code, group, evidence });

export const SIMULATED_ERRORS_P10: SimulatedError[] = [
  // §26.1 Preparación gravimétrica
  e('UNLEVEL_BALANCE', 'GRAV', 'err:unlevelReading'),
  e('DOORS_OPEN', 'GRAV', 'err:doorsOpen'),
  e('TARE_DOORS_OPEN', 'GRAV', 'err:tareDoorsOpen'),
  e('UNSTABLE_MASS', 'GRAV', 'err:unstableMass'),
  e('WET_WATCH_GLASS', 'GRAV', 'scenario:WET_WATCH_GLASS'),
  e('ADDED_INSIDE_CABIN', 'GRAV', 'err:addInsideCabin'),
  e('SOLID_SPILL', 'GRAV', 'err:solidSpill'),
  e('FINGERPRINTS', 'GRAV', 'err:fingers'),
  e('NO_RINSE_GLASS', 'GRAV', 'nb:noRinseGlass'),
  e('TARE_AS_DIFFERENCE', 'GRAV', 'nb:tareAsDifference'),
  // §26.2 Preparación volumétrica
  e('NO_FUNNEL', 'VOL', 'err:noFunnel'),
  e('FLASK_OVERSHOT', 'VOL', 'err:flaskOver'),
  e('FAST_FINISH', 'VOL', 'latch:fastFinish'),
  e('NOT_HOMOGENIZED', 'VOL', 'nb:notHomogenized'),
  e('INVERT_OPEN_FLASK', 'VOL', 'err:invertOpen'),
  e('PIPETTE_NOT_CONDITIONED', 'VOL', 'err:unconditioned'),
  e('MOUTH_PIPETTING', 'SAFETY', 'err:mouthPipette'),
  e('PIPETTE_BLOWN', 'VOL', 'err:blowTD'),
  e('PIPETTE_BUBBLE', 'VOL', 'latch:pipBubble'),
  e('PIPETTE_NOT_ADJUSTED', 'VOL', 'err:pipetteNotAdjusted'),
  e('PARALLAX', 'VOL', 'err:parallax'),
  e('FLASK_50_NOT_RECALCULATED', 'VOL', 'nb:flask50'),
  // §26.3 Montaje de gas
  e('BURETTE_AIR_BUBBLE', 'GAS', '__airBubbleMl'),
  e('INVERTED_IN_AIR', 'GAS', 'err:invertInAir'),
  e('LOOSE_CONNECTION', 'GAS', 'nb:loose'),
  e('KINKED_HOSE', 'GAS', 'scenario:KINKED_HOSE'),
  e('TIP_OBSTRUCTED', 'GAS', 'nb:tipObstructed'),
  e('TIP_NOT_SUBMERGED', 'GAS', 'nb:escape'),
  e('BURETTE_TILTED', 'GAS', 'err:tilt'),
  e('BURETTE_OVERFLOW', 'GAS', 'err:overflowBurette'),
  e('COLUMN_LOST', 'GAS', 'err:columnLost'),
  e('STOPCOCK_DURING_RUN', 'GAS', 'err:stopcockRun'),
  // §26.4 Reacción
  e('LATE_SEAL', 'REACTION', 'err:lateSeal'),
  e('ACID_LIMITING', 'REACTION', 'nb:acidLimiting'),
  e('WRONG_VINEGAR_BASIS', 'REACTION', 'nb:wrongBasis'),
  e('VIOLENT_SWIRL', 'REACTION', 'err:violentSwirl'),
  e('FOAM_IN_HOSE', 'REACTION', 'err:foamHose'),
  e('READ_BEFORE_END', 'REACTION', 'err:readMoving'),
  e('OPENED_DURING_REACTION', 'REACTION', 'err:openedEarly'),
  e('OVERPRESSURE', 'SAFETY', 'err:overpressure'),
  // §26.5 Presión y temperatura
  e('CELSIUS_IN_PV', 'PRESSURE', 'nb:celsius'),
  e('NO_VAPOR_SUBTRACTED', 'PRESSURE', 'nb:noVapor'),
  e('MMHG_CONVERSION', 'PRESSURE', 'nb:mmHgConversion'),
  e('HEIGHT_SIGN', 'PRESSURE', 'nb:heightSign'),
  e('PERSPECTIVE_HEIGHT', 'PRESSURE', 'err:perspective'),
  e('WEATHER_PRESSURE', 'PRESSURE', 'err:weatherPressure'),
  e('TEMP_NOT_EQUILIBRATED', 'PRESSURE', 'err:tempUnstable'),
  e('THERMO_TOUCHING', 'PRESSURE', 'err:thermoTouch'),
  // §26.6 Boyle
  e('NO_DEAD_VOLUME', 'BOYLE', 'err:noDeadVolume'),
  e('DEAD_VOLUME_TWICE', 'BOYLE', 'err:deadTwice'),
  e('GAUGE_AS_ABSOLUTE', 'BOYLE', 'nb:gaugeAsAbsolute'),
  e('UNSTABLE_KEEP', 'BOYLE', 'err:unstableKeep'),
  e('NOT_HELD', 'BOYLE', 'err:notHeld'),
  e('LUER_LEAK', 'BOYLE', 'scenario:LOOSE_LUER'),
  e('WRONG_TOTAL_VOLUME', 'BOYLE', 'err:wrongTotal'),
  e('FORCED_N_PLUS_1', 'BOYLE', 'nb:nPlusOne'),
  e('DAMAGED_SEAL', 'BOYLE', 'scenario:DAMAGED_SEAL'),
  e('NO_AMBIENT_CHECK', 'BOYLE', 'nb:noAmbientCheck'),
  e('DUPLICATE_POINT', 'BOYLE', 'err:duplicatePoint'),
  e('CONNECT_NOT_10', 'BOYLE', 'err:connectNot10'),
  e('VALVE_VENTED', 'BOYLE', 'err:valveVent'),
  e('PLUNGER_OUT', 'BOYLE', 'err:plungerOut'),
];
