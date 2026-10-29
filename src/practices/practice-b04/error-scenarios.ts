/**
 * Escenarios docentes (§7.3) y catálogo de errores simulables (§9.1) de B04, con su contrato: código, grupo, hecho
 * que lo provoca, consecuencia que REALMENTE cambia el estado, clave de evidencia y de retroalimentación. Los gestos
 * bioquímicos se calculan en `bio-world/world.ts`; los del microscopio compartido son los de B01/B02 traducidos por
 * `CODE_MAP_B04` (F05–F08, S06); los de interpretación (`nb:*`) en la libreta. Las incidencias de recurso (§9.2)
 * nunca descuentan.
 */
import { SC_B04 } from '../../simulation/bio-world/world';

export type B04Scenario = (typeof SC_B04)[keyof typeof SC_B04];

export interface B04ScenarioSpec {
  id: B04Scenario;
  excludes?: B04Scenario[];
}

export const B04_SCENARIOS: B04ScenarioSpec[] = (Object.values(SC_B04) as B04Scenario[]).map((id) => ({
  id,
  excludes: id === SC_B04.FEULGEN_UNDER ? [SC_B04.FEULGEN_OVER, SC_B04.FEULGEN_MISSING]
    : id === SC_B04.FEULGEN_OVER ? [SC_B04.FEULGEN_UNDER, SC_B04.FEULGEN_MISSING]
      : id === SC_B04.FEULGEN_MISSING ? [SC_B04.FEULGEN_UNDER, SC_B04.FEULGEN_OVER] : undefined,
}));

/** Escenarios compatibles: al pedir uno incompatible con otro ya elegido, gana el primero. */
export function validScenariosB04(list: string[]): B04Scenario[] {
  const known = new Set<string>(B04_SCENARIOS.map((s) => s.id));
  const out: B04Scenario[] = [];
  for (const s of list) {
    if (!known.has(s) || out.includes(s as B04Scenario)) continue;
    const spec = B04_SCENARIOS.find((x) => x.id === s)!;
    if (out.some((o) => spec.excludes?.includes(o) || B04_SCENARIOS.find((x) => x.id === o)?.excludes?.includes(spec.id))) continue;
    out.push(s as B04Scenario);
  }
  return out;
}

export interface SimulatedErrorB04 {
  code: string;
  group: 'handling' | 'biuret' | 'lugol' | 'lipids' | 'benedict' | 'feulgen' | 'catalase' | 'amylase' | 'adh' | 'safety' | 'prep';
  trigger: string;
  effect: string;
  evidenceKey: string;
  feedbackKey: string;
}

const E = (code: string, group: SimulatedErrorB04['group'], trigger: string, effect: string, nb = false): SimulatedErrorB04 => ({
  code, group, trigger, effect, evidenceKey: `${nb ? 'nb' : 'err'}:${code}`, feedbackKey: `b04fb.${code}`,
});

/** 77 errores de ensayo y seguridad más PREP01–PREP09 (86). */
export const SIMULATED_ERRORS_B04: SimulatedErrorB04[] = [
  E('M01', 'handling', 'Alícuota sin identificar', 'correspondencia incierta muestra–ensayo'),
  E('M02', 'handling', 'Usar dos muestras con la misma etiqueta', 'asociación contradictoria de resultados'),
  E('M03', 'handling', 'Pipetear sin revisar cero/lectura', 'volumen real ≠ anotado'),
  E('M04', 'handling', 'Aspirar con burbuja grande', 'líquido transferido menor'),
  E('M05', 'handling', 'No soltar punta residual según calibración', 'alícuota corta'),
  E('M06', 'handling', 'Soplar pipeta aforada no diseñada para ello', 'alícuota excesiva'),
  E('M07', 'handling', 'Usar gotero de otro reactivo sin limpiar', 'contaminación de sustancias'),
  E('M08', 'handling', 'Verter fuera del tubo', 'masa a superficie/residuo'),
  E('M09', 'handling', 'Reutilizar alícuota después de reactivo', 'compuestos arrastrados a segundo ensayo'),
  E('M10', 'handling', 'Tomar sólido húmedo sin registrarlo', 'concentración/masa seca sesgada'),
  E('M11', 'handling', 'Olvidar control negativo', 'imposible distinguir fondo de señal'),
  E('M12', 'handling', 'Olvidar control positivo', 'falla de reactivo no detectable'),
  E('M13', 'handling', 'Confundir lote de control con incógnita', 'interpretación de ensayo errónea'),
  E('M14', 'handling', 'Mezclar por tiempo insuficiente', 'concentración local heterogénea'),
  E('M15', 'handling', 'Agitar violentamente tubo abierto', 'salpicadura y pérdida trazada'),
  E('M16', 'handling', 'Dejar tubo abierto cerca de otra muestra', 'ingreso de contaminantes configurados'),
  E('B01', 'biuret', 'Omitir alcalinización de Biuret', 'complejo reducido/no se forma adecuadamente'),
  E('B02', 'biuret', 'Añadir Cu(II) fuera del rango calibrado', 'color de reactivo o precipitado interferente'),
  E('B03', 'biuret', 'Lectura Biuret antes de equilibrio', 'señal transitoria'),
  E('B04', 'biuret', 'Interpretar azul del reactivo como positivo', 'respuesta de libreta incorrecta', true),
  E('B05', 'biuret', 'Muestra de Biuret muy diluida', 'señal bajo LOD aunque haya proteína'),
  E('B06', 'biuret', 'Omitir agitación tras dosificación', 'zona con reacción desigual'),
  E('L01', 'lugol', 'Usar Lugol excesivamente diluido', 'color positivo débil por falta de reactivo'),
  E('L02', 'lugol', 'Colocar almidón sólido sin dispersar', 'grumos y señal localizada'),
  E('L03', 'lugol', 'Confundir pigmento de muestra con complejo', 'clasificación falsa', true),
  E('L04', 'lugol', 'Reutilizar gotero de Cu para Lugol', 'contaminación/fondo alterado'),
  E('L05', 'lugol', 'Omitir comparación con blanco', 'cambio de color no atribuido'),
  E('E01', 'lipids', 'No agregar etanol al ensayo lipídico', 'disolución/extracción insuficiente'),
  E('E02', 'lipids', 'Omitir la fase de adición de agua', 'no se demuestra emulsión'),
  E('E03', 'lipids', 'Exceso de agua inicial', 'pérdida de eficacia de extracción'),
  E('E04', 'lipids', 'Confundir turbidez previa de leche con nueva emulsión', 'falso positivo de interpretación', true),
  E('E05', 'lipids', 'Esperar tanto que las fases se separan antes de medir', 'índice de emulsión menor'),
  E('E06', 'lipids', 'Agitar tubo destapado', 'pérdida de fase orgánica trazada'),
  E('R01', 'benedict', 'Realizar Benedict sin aporte térmico necesario', 'reducción incompleta'),
  E('R02', 'benedict', 'Retirar muestra demasiado pronto', 'menor cantidad de Cu₂O'),
  E('R03', 'benedict', 'Sobrecalentar hasta evaporación apreciable', 'concentración y color sesgados, riesgo'),
  E('R04', 'benedict', 'Introducción incorrecta de tubo al baño', 'calentamiento desigual'),
  E('R05', 'benedict', 'Confundir reductor no carbohidrato con glucosa', 'inferencia incorrecta', true),
  E('R06', 'benedict', 'No enfriar cuando el instrumento lo exige', 'lectura afectada/riesgo de quemadura'),
  E('F01', 'feulgen', 'Feulgen en material sin fijación apropiada', 'pérdida/daño de integridad nuclear'),
  E('F02', 'feulgen', 'Hidrólisis insuficiente', 'señal Feulgen débil'),
  E('F03', 'feulgen', 'Hidrólisis excesiva', 'degradación/accesibilidad alterada'),
  E('F04', 'feulgen', 'Omitir lavado entre tratamientos', 'arrastre de reactivos y tinción interferida'),
  E('F05', 'feulgen', 'Selección incorrecta de lámina', 'estructuras no corresponden a consigna'),
  E('F06', 'feulgen', 'Colocar lámina sin pinza', 'desplazamiento durante enfoque'),
  E('F07', 'feulgen', 'Empezar microscopia con alto aumento', 'campo pequeño y riesgo de colisión'),
  E('F08', 'feulgen', 'Enfocar mal o iluminar de forma inadecuada', 'señal histológica ilegible'),
  E('F09', 'feulgen', 'Atribuir visibilidad a imagen sin resolución suficiente', 'no inventar detalle; error de inferencia', true),
  E('C01', 'catalase', 'Usar H₂O₂ vencido parcialmente', 'menor sustrato y O₂'),
  E('C02', 'catalase', 'No registrar masa/cantidad de tejido', 'tasa no comparable entre ensayos'),
  E('C03', 'catalase', 'Precalentar hígado sin registrar duración', 'fracción activa distinta'),
  E('C04', 'catalase', 'Agregar peróxido antes de iniciar registro', 'parte del O₂ producido no se mide'),
  E('C05', 'catalase', 'Tubo con pérdida de gas no controlada', 'volumen recogido bajo sin cambiar producción'),
  E('C06', 'catalase', 'Mezclar vigorosamente generando espuma', 'altura de espuma deja de equivaler a O₂ producido'),
  E('C07', 'catalase', 'No incluir blanco sin enzima', 'tasa de fondo no descontable'),
  E('C08', 'catalase', 'Comparar tasa sin normalizar por masa/actividad', 'conclusión cinética injustificada', true),
  E('C09', 'catalase', 'Exceso de sustrato y rebose', 'cantidad en mesa/residuos'),
  E('A01', 'amylase', 'Usar almidón de diferente concentración sin anotarlo', 'controles no comparables'),
  E('A02', 'amylase', 'Añadir amilasa antes de registrar t0', 'conversión previa oculta'),
  E('A03', 'amylase', 'No medir pH real', 'curva no vinculable a condición'),
  E('A04', 'amylase', 'Temperatura fuera del rango de estudio', 'actividad y desnaturalización alteradas'),
  E('A05', 'amylase', 'Incubar demasiado poco', 'almidón residual alto'),
  E('A06', 'amylase', 'Hacer Lugol y Benedict en misma alícuota contaminada', 'reacciones cruzadas/fondo no interpretable'),
  E('A07', 'amylase', 'Tomar muestra sin agitar cuando hace falta', 'valor de alícuota no representativo'),
  E('A08', 'amylase', 'Afirmar «Benedict negativo = cero hidrólisis»', 'omitir LOD y cinética de producto', true),
  E('D01', 'adh', 'Ejecutar ADH sin NAD⁺ disponible', 'ausencia de conversión, no inhibición inferida'),
  E('D02', 'adh', 'Medir NADH sin blanco', 'señal desplazada'),
  E('D03', 'adh', 'Atribuir Fehling positivo solo a acetaldehído', 'posible interferencia reductora', true),
  E('D04', 'adh', 'Atribuir yodoformo positivo a etanol exclusivo', 'interpretación no específica', true),
  E('D05', 'adh', 'Afirmar inhibición total por metanol sin curva validada', 'contraste contra simulación refuta conclusión', true),
  E('D06', 'adh', 'Comparar reacción con lotes de hígado desiguales', 'actividad confundida con cantidad de enzima'),
  E('S01', 'safety', 'Tocar recipiente caliente sin protección', 'bloqueo/alerta de seguridad'),
  E('S02', 'safety', 'Destapar tubo en zona de derrame reactivo', 'evento de exposición y recuperación'),
  E('S03', 'safety', 'Desechar Cu/iodo junto a residuos comunes', 'corriente de residuos incorrecta'),
  E('S04', 'safety', 'Llevar llama a tubo con etanol', 'bloqueo crítico en simulador'),
  E('S05', 'safety', 'Intentar manipulación de metanol no autorizada', 'bloqueo crítico y explicación'),
  E('S06', 'safety', 'Retirar portaobjetos con objetivo en posición riesgosa', 'rechazo preventivo y registro'),
  E('PREP01', 'prep', 'Pesar menos/más de 25,0 g de almidón', 'cambia carga real del lote, viscosidad y señal de Lugol/amilasa'),
  E('PREP02', 'prep', 'Medir agua diferente de 100,0 mL para el almidón', 'cambia relación masa/agua y comparabilidad entre lotes'),
  E('PREP03', 'prep', 'Omitir pastilla magnética o agitación de almidón', 'persisten grumos/sedimentación y alícuotas heterogéneas'),
  E('PREP04', 'prep', 'No alcanzar ~30 °C o confundir consigna con lectura del líquido', 'cambia historia térmica/viscosidad sin conferir solubilidad falsa'),
  E('PREP05', 'prep', 'Agitador muy rápido con suspensión viscosa', 'deslizamiento de barra, salpicadura y masa perdida'),
  E('PREP06', 'prep', 'Cortar hígado en fragmentos demasiado grandes o no mezclar', 'acceso heterogéneo a catalasa, curva posterior afectada'),
  E('PREP07', 'prep', 'Usar agua ≠ 25,0 mL o encender calefacción del hígado', 'dilución distinta o pérdida térmica de actividad'),
  E('PREP08', 'prep', 'Pesar amilasa distinta de 0,20 g', 'cambia la dosis nominal y potencial velocidad de hidrólisis'),
  E('PREP09', 'prep', 'Usar agua ≠ 5,0 mL, olvidar agitación o contaminar amilasa', 'concentración aparente y actividad quedan sesgadas'),
];

/** Incidencias técnicas del recurso (§9.2): aviso y revisión docente, nunca `err:*`. */
export const RESOURCE_INCIDENTS_B04 = ['RESOURCE_MISSING_FEULGEN_IMAGE', 'RESOURCE_MISMATCHED_SCALE', 'RESOURCE_UNCALIBRATED_KINETICS', 'RESOURCE_UNAVAILABLE_INSTRUMENT'] as const;

/** Códigos cuya evidencia vive en la libreta. */
export const NOTEBOOK_CODES_B04 = SIMULATED_ERRORS_B04.filter((e) => e.evidenceKey.startsWith('nb:')).map((e) => e.code);
