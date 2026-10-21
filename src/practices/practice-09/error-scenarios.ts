/**
 * Escenarios docentes S01–S16 (§7) y catálogo de los 50 errores E01–E50 (§9) con su contrato:
 * `code, group, trigger, effect, evidenceKey, feedbackKey, kind`. Los `err:*` modifican el estado químico, una fracción
 * o un instrumento, o bloquean el gesto; los `nb:*` (interpretación: E07, E08, E11, E16, E19, E23, E30, E45–E50) actúan
 * sobre la libreta y la rúbrica, nunca sobre la composición (§9, regla de causalidad).
 */
import { S9 } from '../../simulation/cation-analysis-world/world';

export type P09Scenario = (typeof S9)[keyof typeof S9];

export interface P09ScenarioSpec {
  id: P09Scenario;
  excludes?: P09Scenario[];
}

const SAMPLE_SETS: P09Scenario[] = [S9.NO_SR, S9.NO_FE, S9.NO_K, S9.ONLY_K, S9.NEAR_LIMIT];

export const P09_SCENARIOS: P09ScenarioSpec[] = [
  { id: S9.COMPLETE, excludes: SAMPLE_SETS },
  { id: S9.NO_SR, excludes: [S9.COMPLETE, S9.ONLY_K, S9.NEAR_LIMIT] },
  { id: S9.NO_FE, excludes: [S9.COMPLETE, S9.ONLY_K, S9.NEAR_LIMIT] },
  { id: S9.NO_K, excludes: [S9.COMPLETE, S9.ONLY_K, S9.NEAR_LIMIT] },
  { id: S9.ONLY_K, excludes: [S9.COMPLETE, S9.NO_SR, S9.NO_FE, S9.NO_K, S9.NEAR_LIMIT] },
  { id: S9.NA_CONTAMINANT },
  { id: S9.DIRTY_LOOP },
  { id: S9.SUPPORT_RESIDUE },
  { id: S9.SULFATE_CLOGGED },
  { id: S9.ALKALI_CONTAMINATED },
  { id: S9.MISLABELED },
  { id: S9.UNBALANCED },
  { id: S9.SLOW_SETTLING },
  { id: S9.BRIGHT_ROOM },
  { id: S9.LOW_FLOW },
  { id: S9.NEAR_LIMIT, excludes: [S9.COMPLETE, S9.NO_SR, S9.NO_FE, S9.NO_K, S9.ONLY_K] },
];

/** Quita escenarios incompatibles (gana el primero de la lista). */
export function validScenarios09(list: string[]): P09Scenario[] {
  const out: P09Scenario[] = [];
  for (const id of list) {
    const spec = P09_SCENARIOS.find((s) => s.id === id);
    if (!spec || out.includes(spec.id)) continue;
    if (out.some((o) => P09_SCENARIOS.find((s) => s.id === o)?.excludes?.includes(spec.id))) continue;
    out.push(spec.id);
  }
  return out;
}

export type ErrorGroup09 = 'PPE' | 'HOOD' | 'OPTICS' | 'GLASS' | 'LABEL' | 'VOLUMETRY' | 'PRECIPITATION' | 'CENTRIFUGE' | 'DECANT' | 'NOTEBOOK';

export interface SimulatedError09 {
  code: string;
  group: ErrorGroup09;
  trigger: string;
  effect: string;
  evidenceKey: string;
  feedbackKey: string;
  severity: 'info' | 'warn' | 'danger' | 'critical';
  preventive?: boolean;
  affectedRubricItems: string[];
  testFixture: string;
}

const e = (n: number, group: ErrorGroup09, kind: 'err' | 'nb', trigger: string, effect: string, severity: SimulatedError09['severity'], affected: string[], preventive = false): SimulatedError09 => {
  const code = `E${String(n).padStart(2, '0')}`;
  return { code, group, trigger, effect, evidenceKey: `${kind}:${code}`, feedbackKey: `p9fb.${code}`, severity, preventive, affectedRubricItems: affected, testFixture: `error-${code}` };
};

export const SIMULATED_ERRORS_P09: SimulatedError09[] = [
  e(1, 'PPE', 'err', 'manipular o empezar sin EPP', 'bloqueo PPE_REQUIRED: ningún comando cambia el mundo', 'critical', ['p9.ppe'], true),
  e(2, 'HOOD', 'err', 'encender la llama virtual sin extracción válida', 'ignición denegada; banda roja persistente', 'critical', ['p9.hood'], true),
  e(3, 'HOOD', 'err', 'encender (o subir la mampara) por encima del rango admitido', 'ignición denegada o llama suspendida', 'critical', ['p9.hood'], true),
  e(4, 'HOOD', 'err', 'apagar la extracción durante el ensayo', 'la llama virtual se suspende y la emisión se detiene', 'critical', ['p9.hood'], true),
  e(5, 'HOOD', 'err', 'intentar oscurecer la sala o la señalización', 'rechazado: solo se regula la luz LOCAL de observación', 'warn', ['p9.hood'], true),
  e(6, 'OPTICS', 'err', 'observar con luz ambiental alta (100 %) una emisión de bajo contraste', 'contraste perceptual menor; el espectro no cambia', 'warn', ['p9.lighting']),
  e(7, 'NOTEBOOK', 'nb', 'anotar un color distinto del observado (violeta como rojo)', 'respuesta incorrecta frente a la lectura citada', 'warn', ['p9.atlas']),
  e(8, 'NOTEBOOK', 'nb', 'identificar un catión solo por el color de llama', 'la identidad queda indeterminada; baja la argumentación', 'warn', ['p9.identification']),
  e(9, 'OPTICS', 'err', 'registrar la emisión antes de estabilizarse (< 1 s)', 'lectura marcada como precoz', 'warn', ['p9.atlas']),
  e(10, 'OPTICS', 'err', 'vista espectral saturada (ganancia excesiva)', 'líneas recortadas; lectura inválida', 'warn', ['p9.spectrum']),
  e(11, 'NOTEBOOK', 'nb', 'concluir sin comparar con un blanco', 'no se descarta fondo ni contaminación; menor confianza', 'warn', ['p9.controls']),
  e(12, 'OPTICS', 'err', 'sodio en el asa (residuo) durante la observación', 'el amarillo domina y enmascara al potasio', 'warn', ['p9.interference']),
  e(13, 'OPTICS', 'err', 'restos de estroncio en el asa', 'componente rojo persistente en la prueba siguiente', 'warn', ['p9.interference']),
  e(14, 'OPTICS', 'err', 'no limpiar el asa entre muestras', 'contaminación acumulada en el soporte', 'warn', ['p9.interference']),
  e(15, 'OPTICS', 'err', 'observar solo la zona más brillante de la llama', 'intensidad no reproducible entre réplicas', 'warn', ['p9.atlas']),
  e(16, 'NOTEBOOK', 'nb', 'calificar el vidrio de reloj común como apto para llama real', 'aviso de seguridad; se mantiene la etiqueta de montaje virtual', 'warn', ['p9.supports']),
  e(17, 'GLASS', 'err', 'sobrecalentar el vidrio de reloj virtual', 'fisura virtual: el ensayo se corta y el contenido cae a la bandeja', 'danger', ['p9.supports']),
  e(18, 'GLASS', 'err', 'depositar muestra sobre un soporte con residuo ajeno', 'emisión combinada en el soporte', 'warn', ['p9.supports']),
  e(19, 'NOTEBOOK', 'nb', 'no evaluar el portamuestras refractario', 'menor justificación de la elección del material', 'warn', ['p9.supports']),
  e(20, 'GLASS', 'err', 'registrar una llama apagada o sin muestra', 'lectura sin señal; no cuenta como evidencia', 'warn', ['p9.atlas']),
  e(21, 'LABEL', 'err', 'rotular un tubo con el código de otra muestra', 'la composición sigue al tubo físico; la tabla se sesga', 'warn', ['p9.traceability']),
  e(22, 'VOLUMETRY', 'err', 'leer el menisco con paralaje', 'volumen reportado desplazado', 'warn', ['p9.volumetry']),
  e(23, 'NOTEBOOK', 'nb', 'suponer el volumen nominal de gota de un gotero no calibrado', 'el volumen anotado difiere del dosificado', 'warn', ['p9.volumetry']),
  e(24, 'VOLUMETRY', 'err', 'retirar la pipeta del tubo con líquido dentro', 'llegan menos moles a la fracción destino', 'warn', ['p9.volumetry']),
  e(25, 'VOLUMETRY', 'err', 'verter de golpe sobre un tubo', 'salpica: los moles quedan en la mesada', 'warn', ['p9.volumetry']),
  e(26, 'PRECIPITATION', 'err', 'muy poco sulfato', 'Sr²⁺ sigue en solución; sedimento incompleto', 'warn', ['p9.srPrecipitation']),
  e(27, 'PRECIPITATION', 'err', 'gran exceso de sulfato', 'cambia la composición del sobrenadante; no crea más SrSO₄ que el límite', 'warn', ['p9.srPrecipitation']),
  e(28, 'PRECIPITATION', 'err', 'no mezclar tras agregar el reactivo', 'reacción más lenta e incompleta en el tiempo observado', 'warn', ['p9.srPrecipitation', 'p9.fePrecipitation']),
  e(29, 'PRECIPITATION', 'err', 'separar antes de que se forme el sólido', 'el ion restante pasa al sobrenadante', 'warn', ['p9.srPrecipitation', 'p9.fePrecipitation']),
  e(30, 'NOTEBOOK', 'nb', 'tomar la turbidez como identificación concluyente', 'penalización de inferencia sin controles', 'warn', ['p9.identification']),
  e(31, 'PRECIPITATION', 'err', 'álcali sobre la mezcla original sin separar el Sr²⁺', 'precipitados mezclados; peor selectividad', 'warn', ['p9.fePrecipitation']),
  e(32, 'PRECIPITATION', 'err', 'poco álcali', 'Fe³⁺ residual en el líquido', 'warn', ['p9.fePrecipitation']),
  e(33, 'PRECIPITATION', 'err', 'agua en lugar del reactivo', 'dilución sin precipitación específica', 'warn', ['p9.srPrecipitation']),
  e(34, 'PRECIPITATION', 'err', 'usar el reactivo contaminado', 'cambia la composición real y el blanco', 'warn', ['p9.fePrecipitation', 'p9.interference']),
  e(35, 'PRECIPITATION', 'err', 'medio demasiado ácido para el álcali dosificado', 'la acidez consume el OH⁻ y queda Fe³⁺', 'warn', ['p9.fePrecipitation']),
  e(36, 'CENTRIFUGE', 'err', 'contrapeso de masa insuficiente', 'arranque bloqueado por desequilibrio', 'danger', ['p9.centrifuge'], true),
  e(37, 'CENTRIFUGE', 'err', 'tubos sin par opuesto', 'arranque bloqueado por disposición asimétrica', 'danger', ['p9.centrifuge'], true),
  e(38, 'CENTRIFUGE', 'err', 'girar con la tapa abierta', 'arranque denegado', 'danger', ['p9.centrifuge'], true),
  e(39, 'CENTRIFUGE', 'err', 'abrir o sacar tubos con el rotor en movimiento', 'acceso denegado hasta velocidad cero', 'danger', ['p9.centrifuge'], true),
  e(40, 'CENTRIFUGE', 'err', 'centrifugar muy poco tiempo', 'turbidez persistente; sólido arrastrable', 'warn', ['p9.fractions']),
  e(41, 'CENTRIFUGE', 'err', 'agitar el tubo centrifugado antes de decantar', 'el sedimento vuelve a suspenderse', 'warn', ['p9.fractions']),
  e(42, 'DECANT', 'err', 'inclinar bruscamente al decantar', 'el sedimento pasa al sobrenadante', 'warn', ['p9.fractions']),
  e(43, 'DECANT', 'err', 'descartar un sobrenadante con potasio sin ensayarlo', 'los iones van al residuo y no se recuperan', 'warn', ['p9.fractions']),
  e(44, 'DECANT', 'err', 'aspirar el sedimento con la pipeta', 'la fracción final lleva sólido de otra fracción', 'warn', ['p9.fractions']),
  e(45, 'NOTEBOOK', 'nb', 'no reservar una fracción testigo', 'se pierde la posibilidad de cotejo', 'warn', ['p9.traceability']),
  e(46, 'NOTEBOOK', 'nb', 'escribir K⁺ con carga +2', 'ecuación y balance de carga incorrectos', 'warn', ['p9.equations']),
  e(47, 'NOTEBOOK', 'nb', 'balancear Fe³⁺ + OH⁻ en proporción 1:1', 'coeficientes erróneos', 'warn', ['p9.equations']),
  e(48, 'NOTEBOOK', 'nb', 'confundir precipitación con evaporación', 'argumento inconsistente con la conservación', 'warn', ['p9.argument']),
  e(49, 'NOTEBOOK', 'nb', 'color anotado sin la condición de iluminación', 'trazabilidad incompleta de la observación', 'warn', ['p9.atlas']),
  e(50, 'NOTEBOOK', 'nb', 'afirmar ausencia total por una señal débil', 'omite límite de detección e interferencias', 'warn', ['p9.identification']),
];

export const errorSpec09 = (code: string) => SIMULATED_ERRORS_P09.find((x) => x.code === code);
