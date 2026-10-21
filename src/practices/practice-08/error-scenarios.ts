/**
 * Escenarios docentes SC01–SC16 (§10) y catálogo de los 60 errores ORG01–ORG60 (§9) con su contrato:
 * `code, group, routes, triggerCommandOrState, effectOnWorld, evidenceKey, feedbackKey, testFixture`.
 * Los `err:*` cambian una condición real del mundo (composición, lecturas) o bloquean el gesto riesgoso; los `nb:*`
 * son errores de cálculo de la libreta: cambian la interpretación y la nota, nunca la composición (§9).
 */
import type { RouteId } from '../../simulation/organic-world/types';
import { S8 } from '../../simulation/organic-world/world';

export type P08Scenario = (typeof S8)[keyof typeof S8];

export interface P08ScenarioSpec {
  id: P08Scenario;
  routes: RouteId[];
  excludes?: P08Scenario[];
}

const ALL: RouteId[] = ['ISO', 'ASA', 'MS'];
const LIQ: RouteId[] = ['ISO', 'MS'];

export const P08_SCENARIOS: P08ScenarioSpec[] = [
  { id: S8.MASS_OFFSET, routes: ALL },
  { id: S8.THERM_BIAS, routes: ALL },
  { id: S8.UNPURE_START, routes: ALL },
  { id: S8.WET_VESSEL, routes: ['ASA', 'MS'] },
  { id: S8.HEAT_LOSS, routes: ALL },
  { id: S8.SLOW_STIR, routes: ALL },
  { id: S8.REFLUX_LEAK, routes: LIQ },
  { id: S8.LIMITING_SWITCH, routes: ALL, excludes: [S8.WATER_LOAD] },
  { id: S8.FILTER_TEAR, routes: ['ASA'] },
  { id: S8.FILTER_WET, routes: ['ASA'] },
  { id: S8.ASA_SOLUBILITY, routes: ['ASA'] },
  { id: S8.DRYING_LOW, routes: ALL },
  { id: S8.LAYER_EMULSION, routes: LIQ },
  { id: S8.WATER_LOAD, routes: LIQ, excludes: [S8.LIMITING_SWITCH] },
  { id: S8.FRACTION_CROSSOVER, routes: LIQ },
  { id: S8.ANALYZER_OFFSET, routes: ALL },
];

/** Quita escenarios de otra ruta o incompatibles (gana el primero de la lista). */
export function validScenarios08(list: string[], route: RouteId): P08Scenario[] {
  const out: P08Scenario[] = [];
  for (const id of list) {
    const spec = P08_SCENARIOS.find((s) => s.id === id);
    if (!spec || !spec.routes.includes(route) || out.includes(spec.id)) continue;
    if (out.some((o) => P08_SCENARIOS.find((s) => s.id === o)?.excludes?.includes(spec.id))) continue;
    out.push(spec.id);
  }
  return out;
}

export type ErrorGroup08 = 'SAFETY' | 'MEASUREMENT' | 'REACTION' | 'ASA_ISOLATION' | 'ISO_ISOLATION' | 'MS' | 'CALCULATION';

export interface SimulatedError08 {
  code: string;
  group: ErrorGroup08;
  routes: RouteId[];
  /** Comando o estado que lo dispara (contrato §9). */
  triggerCommandOrState: string;
  /** Consecuencia calculable en el mundo (o en la interpretación, para `nb:*`). */
  effectOnWorld: string;
  /** `err:ORGnn` (mundo) o `nb:ORGnn` (libreta). */
  evidenceKey: string;
  feedbackKey: string;
  severity: 'info' | 'warn' | 'danger' | 'critical';
  /** Prevención con bloqueo (no es un accidente consumado, §13). */
  preventive?: boolean;
  affectedRubricItems: string[];
  testFixture: string;
}

const e = (n: number, group: ErrorGroup08, routes: RouteId[], kind: 'err' | 'nb', trigger: string, effect: string, severity: SimulatedError08['severity'], affected: string[], preventive = false): SimulatedError08 => {
  const code = `ORG${String(n).padStart(2, '0')}`;
  return { code, group, routes, triggerCommandOrState: trigger, effectOnWorld: effect, evidenceKey: `${kind}:${code}`, feedbackKey: `p8fb.${code}`, severity, preventive, affectedRubricItems: affected, testFixture: `error-${code}` };
};

export const SIMULATED_ERRORS_P08: SimulatedError08[] = [
  e(1, 'SAFETY', ALL, 'err', 'startWork o manipular sin gafas', 'bloqueo: ningún comando de manipulación cambia el mundo', 'critical', ['p8.ppe'], true),
  e(2, 'SAFETY', ALL, 'err', 'startWork o manipular sin bata o guantes', 'bloqueo de la manipulación riesgosa', 'critical', ['p8.ppe'], true),
  e(3, 'SAFETY', ALL, 'err', 'setPour hacia el vaso de plástico con corrosivo, inflamable o caliente; vaso al baño', 'transferencia rechazada, contenido conservado', 'warn', ['p8.equipment'], true),
  e(4, 'SAFETY', ALL, 'err', 'setPose del balón con contenido sobre la mesada, sin aro ni pinza', 'el contenido pasa a la mesada (derrame): menos reactivo', 'danger', ['p8.equipment', 'p8.spills']),
  e(5, 'MEASUREMENT', ALL, 'err', 'setPour al balón desde el frasco parecido', 'entra otra especie o concentración: cambia la estequiometría', 'warn', ['p8.reagents']),
  e(6, 'MEASUREMENT', ALL, 'err', 'readBalance de un recipiente con contenido nunca pesado vacío ni tarado', 'la indicación incluye el recipiente: masa del reactivo sesgada', 'warn', ['p8.weighing']),
  e(7, 'MEASUREMENT', ALL, 'err', 'readBalance con la pantalla inestable', 'lectura inválida (oscilación real del instrumento)', 'warn', ['p8.weighing']),
  e(8, 'MEASUREMENT', ALL, 'err', 'readBalance con carga > capacidad', 'saturación: lectura inválida', 'warn', ['p8.weighing']),
  e(9, 'MEASUREMENT', ALL, 'err', 'readVolume con el ojo fuera del nivel del menisco', 'volumen indicado sesgado por paralaje', 'warn', ['p8.dosing']),
  e(10, 'MEASUREMENT', ALL, 'err', 'vertido muy inclinado deja película exterior; se pesa con ella', 'la película pesa y luego cae a la mesada al mover', 'warn', ['p8.weighing']),
  e(11, 'MEASUREMENT', ALL, 'err', 'setPour sin recipiente receptor acoplado', 'el líquido vertido va a la mesada y no reacciona', 'warn', ['p8.dosing', 'p8.spills']),
  e(12, 'MEASUREMENT', ALL, 'err', 'espátula con restos de otra sustancia descargada en el balón o vidrio', 'contaminación cruzada de especies', 'warn', ['p8.reagents']),
  e(13, 'REACTION', ALL, 'err', 'placa con consigna > 40 °C y la mezcla fuera del baño > 30 s', 'el líquido no se calienta: la consigna no es la temperatura real', 'warn', ['p8.heatControl']),
  e(14, 'REACTION', ALL, 'err', 'readThermometer con la sonda fuera del líquido', 'lectura cercana al ambiente', 'warn', ['p8.heatControl']),
  e(15, 'REACTION', ALL, 'err', 'calentar > 60 s sin agitación', 'peor transferencia de calor y mezcla más lenta', 'warn', ['p8.heatControl']),
  e(16, 'REACTION', ALL, 'err', 'agitación > 85 % con el balón abierto y caliente', 'salpicaduras: masa a la mesada', 'warn', ['p8.heatControl', 'p8.spills']),
  e(17, 'REACTION', ALL, 'err', 'retirar del baño o apagar con conversión baja', 'menor extensión de reacción', 'warn', ['p8.reactionTime']),
  e(18, 'REACTION', ALL, 'err', 'readThermometer con sesgo sin comprobar en agua con hielo', 'temperatura indicada distinta de la real', 'warn', ['p8.heatControl']),
  e(19, 'CALCULATION', ALL, 'nb', 'Cuadro A: pureza 1 para un reactivo de ficha comercial (o en solución)', 'moles teóricos mal calculados', 'warn', ['p8.moles']),
  e(20, 'REACTION', LIQ, 'err', 'calentar con condensador sin agua o sin reflujo (MS)', 'vapor no recuperado: volátiles a la campana', 'warn', ['p8.reflux']),
  e(21, 'MEASUREMENT', LIQ, 'err', 'verter al embudo con la llave abierta', 'la mezcla pasa al receptor o a la mesada', 'warn', ['p8.separation']),
  e(22, 'SAFETY', ALL, 'err', 'tomar o vaciar el balón caliente sin pinza', 'movimiento bloqueado por riesgo', 'danger', ['p8.equipment'], true),
  e(23, 'REACTION', ['ASA'], 'err', 'agua sobre el anhídrido antes de completar la acetilación', 'hidrólisis del anhídrido: menos reactivo disponible', 'warn', ['p8.reactionTime']),
  e(24, 'REACTION', ['ASA'], 'err', 'calentar > 120 s sin H₃PO₄', 'acetilación más lenta', 'warn', ['p8.catalyst']),
  e(25, 'REACTION', ['ASA'], 'err', 'añadir H₂SO₄ (catalizador no asignado) al balón', 'rechazo seguro: composición no validada', 'danger', ['p8.catalyst'], true),
  e(26, 'ASA_ISOLATION', ['ASA'], 'err', 'filtrar con > 40 g de agua en la mezcla', 'más ASA queda disuelta en el filtrado', 'warn', ['p8.crystallization']),
  e(27, 'ASA_ISOLATION', ['ASA'], 'err', 'filtrar con < 60 % del ASA cristalizada', 'el producto disuelto se va con el filtrado', 'warn', ['p8.crystallization']),
  e(28, 'ASA_ISOLATION', ['ASA'], 'err', 'filtrar con la mezcla a > 15 °C', 'menor fracción cristalizada', 'warn', ['p8.crystallization']),
  e(29, 'ASA_ISOLATION', ['ASA'], 'err', 'filtrar con papel de poro grueso', 'los finos pasan al kitasato', 'warn', ['p8.filtration']),
  e(30, 'ASA_ISOLATION', ['ASA'], 'err', 'vacío sin sellar el Büchner', 'menos caudal y torta más húmeda', 'warn', ['p8.filtration']),
  e(31, 'ASA_ISOLATION', ['ASA'], 'err', 'readBalance de cristales con líquido > 5 % de su masa', 'masa aparente alta; pureza más baja', 'warn', ['p8.drying']),
  e(32, 'ASA_ISOLATION', ALL, 'err', 'readBalance de un objeto a > 35 °C', 'lectura baja por convección', 'warn', ['p8.drying']),
  e(33, 'REACTION', ['ISO', 'MS'], 'err', 'calentar > 120 s sin H₂SO₄ (Fischer)', 'reacción más lenta; el equilibrio no cambia', 'warn', ['p8.catalyst']),
  e(34, 'CALCULATION', ['ISO'], 'nb', 'Cuadro A: volumen de alcohol anotado ≠ el dispensado', 'el limitante real y la masa teórica cambian', 'warn', ['p8.moles']),
  e(35, 'REACTION', ['ISO'], 'err', 'empezar a calentar con agua > 30 % del limitante', 'menor avance de equilibrio', 'warn', ['p8.reactionTime']),
  e(36, 'REACTION', ['ISO'], 'err', 'calentar > 60 °C sin condensador', 'alcohol, ácido y éster pasan a la campana', 'warn', ['p8.reflux']),
  e(37, 'ISO_ISOLATION', ['ISO'], 'err', 'enviar al residuo la capa con el éster (o guardar la acuosa como producto)', 'se descarta la fracción enriquecida en producto', 'warn', ['p8.separation']),
  e(38, 'ISO_ISOLATION', LIQ, 'err', 'seguir descargando > 0,3 mL pasada la interfase', 'la fracción se contamina con la otra fase', 'warn', ['p8.separation']),
  e(39, 'SAFETY', LIQ, 'err', 'agitar tapado con CO₂ por encima del límite sin ventear', 'bloqueo de seguridad hasta ventear', 'critical', ['p8.equipment', 'p8.separation'], true),
  e(40, 'ISO_ISOLATION', LIQ, 'err', 'fracción recolectada con > 0,4 % de agua (sin secar)', 'más agua en el producto: masa y densidad sesgadas', 'warn', ['p8.drying']),
  e(41, 'ISO_ISOLATION', LIQ, 'err', 'cargar el desecante ya saturado', 'retiene menos agua', 'warn', ['p8.drying']),
  e(42, 'ISO_ISOLATION', LIQ, 'err', 'corte de fracción > 16 °C o con > 5 % de otras especies', 'masa aparente mayor con componentes extraños', 'warn', ['p8.fractions']),
  e(43, 'MS', ['MS'], 'err', 'pesar ácido salicílico sobre el vidrio húmedo', 'agua adicional: masa aparente y equilibrio alterados', 'warn', ['p8.weighing']),
  e(44, 'MS', ['MS'], 'err', 'verter alcohol isoamílico al balón (en vez de metanol)', 'rechazo por reacción no validada', 'danger', ['p8.reagents'], true),
  e(45, 'SAFETY', ALL, 'err', 'setBurner con inflamables abiertos', 'bloqueo crítico del encendido', 'critical', ['p8.equipment'], true),
  e(46, 'SAFETY', ['ISO', 'MS'], 'err', 'retirar el condensador con el balón a > 50 °C', 'bloqueo: vapores; no hay transferencia', 'danger', ['p8.reflux'], true),
  e(47, 'CALCULATION', ['MS'], 'nb', 'Cuadro A: metanol anotado > el dispensado', 'estequiometría y equilibrio distintos de lo anotado', 'warn', ['p8.moles']),
  e(48, 'REACTION', ['MS'], 'err', 'empezar a calentar con agua > 30 % del limitante', 'menor avance de esterificación', 'warn', ['p8.reactionTime']),
  e(49, 'MS', ['MS'], 'err', 'guardar la fase acuosa como producto', 'se pierde o contamina el producto', 'warn', ['p8.separation']),
  e(50, 'MS', ['MS'], 'err', 'cerrar la llave con > 25 % del producto aún abajo (o descartarlo)', 'queda producto en el embudo', 'warn', ['p8.separation']),
  e(51, 'CALCULATION', ['ISO', 'MS'], 'nb', 'Cuadro C: densidad sin temperatura', 'comparación bibliográfica no verificable', 'warn', ['p8.analysis']),
  e(52, 'CALCULATION', ALL, 'nb', 'Cuadro C: pureza declarada sin ensayo (por apariencia)', 'ítem de pureza no acreditado', 'warn', ['p8.analysis']),
  e(53, 'CALCULATION', ALL, 'nb', 'masa teórica de otra ruta', 'rendimiento incompatible con las especies propias', 'warn', ['p8.yield']),
  e(54, 'CALCULATION', ALL, 'nb', 'limitante incorrecto', 'máximo teórico sobre o infraestimado', 'warn', ['p8.limiting']),
  e(55, 'CALCULATION', ALL, 'nb', 'mL usados como gramos', 'análisis dimensional incorrecto', 'warn', ['p8.units']),
  e(56, 'CALCULATION', ALL, 'nb', 'masa aislada sin restar el soporte (papel, vial, vidrio)', 'la masa del soporte suma al producto', 'warn', ['p8.yield']),
  e(57, 'CALCULATION', ALL, 'nb', 'recuperación 100 % equiparada a pureza 100 %', 'masa pura improcedente', 'warn', ['p8.purity']),
  e(58, 'CALCULATION', ALL, 'nb', 'rendimiento aparente > 100 recortado a 100', 'oculta humedad o contaminación', 'warn', ['p8.yield']),
  e(59, 'CALCULATION', ALL, 'nb', 'masa por diferencia sin incertidumbre propagada', 'confianza falsa', 'warn', ['p8.uncertainty']),
  e(60, 'CALCULATION', ALL, 'nb', 'lectura de otro intento en la libreta', 'trazabilidad inválida', 'warn', ['p8.traceable']),
];

export const errorSpec08 = (code: string) => SIMULATED_ERRORS_P08.find((x) => x.code === code);
