/**
 * Escenarios docentes (§10) y catálogo de errores simulables (§9) de la práctica B03, con su contrato: código, grupo,
 * hecho que lo provoca, consecuencia que REALMENTE cambia el estado, clave de evidencia y de retroalimentación. Los
 * gestos con membranas, cámaras y tubos se calculan en `perm-world/world.ts`; los del microscopio y del montaje son
 * los de B01/B02 traducidos por `CODE_MAP_B03`; los de interpretación (`nb:*`) en la libreta (rúbrica). PERMRES es
 * una incidencia técnica del recurso: nunca descuenta.
 */
import { SC_B03 } from '../../simulation/perm-world/world';

export type B03Scenario = (typeof SC_B03)[keyof typeof SC_B03];

export interface B03ScenarioSpec {
  id: B03Scenario;
  excludes?: B03Scenario[];
}

export const B03_SCENARIOS: B03ScenarioSpec[] = [
  { id: SC_B03.IDEAL },
  { id: SC_B03.WEAK_CLAMP },
  { id: SC_B03.CELLOPHANE },
  { id: SC_B03.PROTEIN_LEAK, excludes: [SC_B03.VARIABLE_PORES] },
  { id: SC_B03.TRACER_BLOCKED },
  { id: SC_B03.CURVE, excludes: [SC_B03.NO_COLORIMETER] },
  { id: SC_B03.NO_COLORIMETER, excludes: [SC_B03.CURVE] },
  { id: SC_B03.VALID_SYRUP, excludes: [SC_B03.UNKNOWN_SYRUP] },
  { id: SC_B03.UNKNOWN_SYRUP, excludes: [SC_B03.VALID_SYRUP] },
  { id: SC_B03.LOW_GRADIENT },
  { id: SC_B03.HEAD_DIFF },
  { id: SC_B03.CONTROL_TUBES },
  { id: SC_B03.INTERFERENCE },
  { id: SC_B03.PHOTOS_ALL },
  { id: SC_B03.TIME_SERIES, excludes: [SC_B03.SINGLE_PHOTO] },
  { id: SC_B03.SINGLE_PHOTO, excludes: [SC_B03.TIME_SERIES] },
  { id: SC_B03.NONISO_09 },
  { id: SC_B03.PENDING_PHOTO },
  { id: SC_B03.BIASED_CYLINDER },
  { id: SC_B03.VARIABLE_PORES, excludes: [SC_B03.PROTEIN_LEAK] },
];

/** Escenarios compatibles: al pedir uno incompatible con otro ya elegido, gana el primero. */
export function validScenariosB03(list: string[]): B03Scenario[] {
  const known = new Set<string>(B03_SCENARIOS.map((s) => s.id));
  const out: B03Scenario[] = [];
  for (const s of list) {
    if (!known.has(s) || out.includes(s as B03Scenario)) continue;
    const spec = B03_SCENARIOS.find((x) => x.id === s)!;
    if (out.some((o) => spec.excludes?.includes(o) || B03_SCENARIOS.find((x) => x.id === o)?.excludes?.includes(spec.id))) continue;
    out.push(s as B03Scenario);
  }
  return out;
}

export interface SimulatedErrorB03 {
  code: string;
  group: 'setup' | 'diffusion' | 'dialysis' | 'osmosis' | 'microscopy' | 'closure' | 'analysis';
  trigger: string;
  effect: string;
  evidenceKey: string;
  feedbackKey: string;
}

const E = (code: string, group: SimulatedErrorB03['group'], trigger: string, effect: string, nb = false): SimulatedErrorB03 => ({
  code, group, trigger, effect, evidenceKey: `${nb ? 'nb' : 'err'}:${code}`, feedbackKey: `b03fb.${code}`,
});
const NB_EFFECT = 'solo cálculo/interpretación: no altera el estado real de la muestra';

/** 65 errores atribuibles (PERM01–PERM65) y la incidencia técnica sin culpa (PERMRES). */
export const SIMULATED_ERRORS_B03: SimulatedErrorB03[] = [
  E('PERM01', 'setup', 'Membrana insertada fuera de centro', 'areaFactor < 1: menor área útil y menor transferencia de soluto y agua'),
  E('PERM02', 'setup', 'Abrazadera sin el apriete de sellado', 'fuga: líquido a la mesada y mezcla convectiva entre lados (leakOutMl, leakCrossMl)'),
  E('PERM03', 'setup', 'Apriete por encima de la resistencia de la película', 'membrana rasgada: paso no selectivo de todo (tornP, tornLp)'),
  E('PERM04', 'setup', 'Membrana de diálisis instalada seca', 'permeabilidad efectiva baja hasta humectarse (wet01)'),
  E('PERM05', 'setup', 'Membrana no asignada por el docente', 'otros P y Lp físicos: otro resultado medible'),
  E('PERM06', 'setup', 'Proteína en la junta o en el borde de la membrana', 'sello irregular: más vueltas para sellar y área útil reducida'),
  E('PERM07', 'setup', 'Cargar solutos sin una prueba de fugas superada', 'fuga eventual no diagnosticada; falta la evidencia de control'),
  E('PERM08', 'setup', 'Llenar por encima de la capacidad', 'derrame: el excedente con sus solutos pasa a la mesada'),
  E('PERM09', 'setup', 'Usar la membrana rota de fábrica', 'paso convectivo no selectivo desde el primer paso con líquido'),
  E('PERM10', 'setup', 'Reutilizar una membrana impregnada sin remojarla', 'arrastre de soluto del ensayo anterior a la nueva cámara'),
  E('PERM11', 'diffusion', 'Trazador en el compartimento de observación', 'gradiente invertido: el color pasa de B a A'),
  E('PERM12', 'diffusion', 'Menos trazador que la dosis prevista', 'menor masa inicial y señal reducida'),
  E('PERM13', 'diffusion', 'Más trazador que la dosis prevista', 'mayor masa inicial y otra señal; la dosis real queda registrada'),
  E('PERM14', 'diffusion', 'Trazador agregado directamente al lado observado', 'color por adición directa, no por paso a través de la membrana'),
  E('PERM15', 'diffusion', 'Agitar un lado casi lleno hasta saltar el tabique', 'contaminación cruzada y derrame; falsa evidencia de transporte'),
  E('PERM16', 'diffusion', 'Primera lectura después de perder t = 0', 'serie sin basal; no comparable temporalmente'),
  E('PERM17', 'diffusion', 'Trazador con permeabilidad cero en la membrana', 'no aparece color al otro lado: evidencia negativa válida'),
  E('PERM18', 'diffusion', 'Acelerar el tiempo mientras se vierte o se pipetea', 'aceleración bloqueada; se registra el intento'),
  E('PERM19', 'diffusion', 'Colorímetro sin cero con el blanco', 'lectura con sesgo (+0,06 A) marcada como no calibrada'),
  E('PERM20', 'analysis', 'Concentración numérica sin curva de calibración', NB_EFFECT, true),
  E('PERM21', 'dialysis', 'Membrana de poro ancho en la diálisis', 'aparece proteína en el lado A según su permeabilidad'),
  E('PERM22', 'dialysis', 'Proteína insuficiente en el compartimento de origen', 'Biuret débil o negativo también en B'),
  E('PERM23', 'dialysis', 'Omitir el NaCl del compartimento de origen', 'no hay cloruro: AgNO₃ no precipita'),
  E('PERM24', 'dialysis', 'Volumen de NaCl distinto del protocolo', 'otra cantidad de cloruro y otra intensidad del ensayo'),
  E('PERM25', 'dialysis', 'Mezclar los dos compartimentos de la diálisis', 'proteína y sal cruzan por contacto directo (crossContaminated)'),
  E('PERM26', 'dialysis', 'Alícuota de un lado en el tubo rotulado del otro', 'etiqueta y composición discordantes; el ensayo corresponde al lado real'),
  E('PERM27', 'dialysis', 'Misma pipeta en A y B sin enjuagar', 'película de la pipeta transfiere proteína o sal a la otra muestra'),
  E('PERM28', 'dialysis', 'Alícuota demasiado grande', 'baja el depósito y cambian concentraciones y gradientes'),
  E('PERM29', 'dialysis', 'Alícuota demasiado pequeña', 'señal bajo el umbral: resultado ambiguo'),
  E('PERM30', 'dialysis', 'AgNO₃ en el tubo de Biuret', 'interferencia: resultado no interpretable'),
  E('PERM31', 'dialysis', 'Biuret en el tubo de cloruro', 'mezcla incorrecta; el precipitado no se interpreta'),
  E('PERM32', 'dialysis', 'Leer el tubo de Biuret sin el reactivo', 'sin complejo violeta: no hay medida de proteína'),
  E('PERM33', 'dialysis', 'Leer el tubo de cloruro sin AgNO₃', 'sin AgCl aunque haya cloruro'),
  E('PERM34', 'dialysis', 'Leer el Biuret antes del tiempo de desarrollo', 'señal preliminar débil'),
  E('PERM35', 'dialysis', 'Desechar un tubo antes de registrar su lectura', 'sin medida ni evidencia de esa observación'),
  E('PERM36', 'osmosis', 'Jarabe en el lado B (el protocolo pide A)', 'signo de ΔV invertido respecto de la hipótesis, físicamente coherente'),
  E('PERM37', 'osmosis', 'Jarabe con osmolalidad distinta a la asignada', 'otro gradiente osmótico y otra predicción'),
  E('PERM38', 'osmosis', 'Usar el jarabe «light» por el asignado', 'composición no comparable sin analizar la receta'),
  E('PERM39', 'osmosis', 'Volumen inicial de jarabe distinto de 20 mL', 'otra columna y presión hidrostática; más incertidumbre'),
  E('PERM40', 'osmosis', 'Leer el menisco desde arriba o abajo', 'paralaje reproducible: la cifra registrada difiere de la escala'),
  E('PERM41', 'osmosis', 'Cerrar la ósmosis sin medir la temperatura', 'falta T para estimar π(T)'),
  E('PERM42', 'osmosis', 'Tapa abierta durante la observación', 'evaporación: pérdida de agua no causada por ósmosis'),
  E('PERM43', 'osmosis', 'Junta de la cámara de ósmosis suelta', 'la fuga compite con el flujo osmótico'),
  E('PERM44', 'osmosis', 'Última lectura antes del tiempo definido', 'ΔV menor y duración efectiva más corta'),
  E('PERM45', 'osmosis', 'Agregar o quitar líquido durante la observación', 'el gradiente cambia; la curva pierde comparabilidad'),
  E('PERM46', 'microscopy', 'Hoja de Elodea expuesta al aire antes de montarla', 'hoja deshidratada: el estado de la preparación cambia'),
  E('PERM47', 'microscopy', 'Dos medios en la misma lámina', 'exposición combinada distinta de la rotulada'),
  E('PERM48', 'microscopy', 'Exceso de solución sobre el portaobjetos', 'derrame, cubreobjetos móvil y peor observación'),
  E('PERM49', 'microscopy', 'Montaje sin líquido', 'la hoja se reseca'),
  E('PERM50', 'microscopy', 'Cubreobjetos bajado bruscamente o presionado', 'burbujas o rotura: menos área visible'),
  E('PERM51', 'microscopy', 'Lámina con la pinza de la platina cerrada', 'colocación rechazada; no se acredita el montaje'),
  E('PERM52', 'microscopy', 'Empezar a enfocar con 40X', 'campo pequeño y riesgo de colisión'),
  E('PERM53', 'microscopy', 'Objetivo contra la preparación', 'contacto dañino; bloqueo de seguridad'),
  E('PERM54', 'microscopy', 'Macrométrico con objetivo de alto aumento', 'distancia de trabajo en zona peligrosa'),
  E('PERM55', 'microscopy', 'Cambiar de objetivo sin centrar', 'la región buscada queda fuera del campo'),
  E('PERM56', 'microscopy', 'Iluminación insuficiente o excesiva', 'imagen oscura o saturada; observación no acreditable'),
  E('PERM57', 'analysis', 'Afirmar plasmólisis sin evidencia en la captura', NB_EFFECT, true),
  E('PERM58', 'analysis', 'Asociar la captura a otro tratamiento', NB_EFFECT, true),
  E('PERM59', 'closure', 'Cerrar sin volver al objetivo de bajo aumento', 'estado inseguro del equipo al cierre'),
  E('PERM60', 'analysis', 'Llamar «isotónica» a 0,9 % sin datos de la célula', NB_EFFECT, true),
  E('PERM61', 'analysis', 'Confundir cloruro con la totalidad de los minerales', NB_EFFECT, true),
  E('PERM62', 'analysis', 'Atribuir el color a difusión pese a una fuga registrada', NB_EFFECT, true),
  E('PERM63', 'analysis', 'Usar °C en lugar de K con la constante de los gases', NB_EFFECT, true),
  E('PERM64', 'analysis', 'Flujo promedio sin dividir por el tiempo', NB_EFFECT, true),
  E('PERM65', 'analysis', 'Diferencia de volúmenes con el signo invertido', NB_EFFECT, true),
  { code: 'PERMRES', group: 'closure', trigger: 'Fotografía del tratamiento inexistente o pendiente de aprobación', effect: 'aviso de recurso y revisión docente; nunca err:*', evidenceKey: 'incident:PERMRES', feedbackKey: 'b03fb.PERMRES' },
];

/** Códigos cuya evidencia vive en la libreta (interpretación y cálculo contrastados con las lecturas propias). */
export const NOTEBOOK_CODES_B03 = SIMULATED_ERRORS_B03.filter((e) => e.evidenceKey.startsWith('nb:')).map((e) => e.code);
