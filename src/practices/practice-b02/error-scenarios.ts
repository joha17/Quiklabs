/**
 * Escenarios docentes (§10) y catálogo de errores simulables (§9) de la práctica B02, con su contrato: código, grupo,
 * hecho que lo provoca, consecuencia medible, clave de evidencia y de retroalimentación. Los gestos de tejido y la
 * tinción se calculan en `cell-world/world.ts`; los del microscopio son los de B01 traducidos por `CODE_MAP_B02`;
 * los de interpretación (`nb:*`) en la libreta (rúbrica). CEL68 es una incidencia técnica: nunca descuenta.
 */
import { SC } from '../../simulation/cell-world/world';

export type B02Scenario = (typeof SC)[keyof typeof SC];

export interface B02ScenarioSpec {
  id: B02Scenario;
  excludes?: B02Scenario[];
}

export const B02_SCENARIOS: B02ScenarioSpec[] = [
  { id: SC.LUGOL_CONTROL },
  { id: SC.PLAIN_CONTROL },
  { id: SC.THICK_SCRAPE },
  { id: SC.BUBBLE_SLIDE },
  { id: SC.DROPPER_JITTER },
  { id: SC.DENSE_ELODEA },
  { id: SC.HARD_FOCUS },
  { id: SC.CYCLOSIS_VIDEO },
  { id: SC.CONTRAST_FRUITS, excludes: [SC.SIMILAR_FRUITS] },
  { id: SC.SIMILAR_FRUITS, excludes: [SC.CONTRAST_FRUITS] },
  { id: SC.CLEAR_SCLEREIDS },
  { id: SC.GUAVA },
  { id: SC.METHYLENE_BLUE, excludes: [SC.EOSIN_ONLY] },
  { id: SC.EOSIN_ONLY, excludes: [SC.METHYLENE_BLUE] },
  { id: SC.FIXED_SLIDES },
  { id: SC.STEREO },
  { id: SC.TEACHER_ASSETS },
  { id: SC.MISSING_ASSET },
];

/** Escenarios compatibles: al pedir uno incompatible con otro ya elegido, gana el primero. */
export function validScenariosB02(list: string[]): B02Scenario[] {
  const known = new Set<string>(B02_SCENARIOS.map((s) => s.id));
  const out: B02Scenario[] = [];
  for (const s of list) {
    if (!known.has(s) || out.includes(s as B02Scenario)) continue;
    const spec = B02_SCENARIOS.find((x) => x.id === s)!;
    if (out.some((o) => spec.excludes?.includes(o) || B02_SCENARIOS.find((x) => x.id === o)?.excludes?.includes(spec.id))) continue;
    out.push(s as B02Scenario);
  }
  return out;
}

export interface SimulatedErrorB02 {
  code: string;
  group: 'prep' | 'stain' | 'optics' | 'science' | 'care';
  trigger: string;
  effect: string;
  evidenceKey: string;
  feedbackKey: string;
}

/** 67 errores atribuibles (CEL01–CEL67) y la incidencia técnica sin culpa (CEL68). */
export const SIMULATED_ERRORS_B02: SimulatedErrorB02[] = [
  { code: 'CEL01', group: 'prep', trigger: 'Corte excesivamente grueso en tejido vegetal', effect: 'thicknessMm sube, campo ocluido y menor región utilizable', evidenceKey: 'err:CEL01', feedbackKey: 'b02fb.CEL01' },
  { code: 'CEL02', group: 'prep', trigger: 'Corte demasiado pequeño para la región buscada', effect: 'fragmento sin estructuras suficientes / menor cobertura de campo', evidenceKey: 'err:CEL02', feedbackKey: 'b02fb.CEL02' },
  { code: 'CEL03', group: 'prep', trigger: 'Presión excesiva durante raspado', effect: 'tearFraction aumenta; se pierde organización del tejido', evidenceKey: 'err:CEL03', feedbackKey: 'b02fb.CEL03' },
  { code: 'CEL04', group: 'prep', trigger: 'Raspado insuficiente', effect: 'masa/área insuficiente y captura sin muestra detectable', evidenceKey: 'err:CEL04', feedbackKey: 'b02fb.CEL04' },
  { code: 'CEL05', group: 'prep', trigger: 'Uso de herramienta de corte no autorizada', effect: 'acción rechazada y fuente intacta; riesgo de seguridad', evidenceKey: 'err:CEL05', feedbackKey: 'b02fb.CEL05' },
  { code: 'CEL06', group: 'prep', trigger: 'Selección de muestra biológica distinta de la asignada', effect: 'identidad specimenId no coincide con receta', evidenceKey: 'err:CEL06', feedbackKey: 'b02fb.CEL06' },
  { code: 'CEL07', group: 'prep', trigger: 'Colocación del fragmento fuera del porta', effect: 'fragmento cae en mesada/residuos', evidenceKey: 'err:CEL07', feedbackKey: 'b02fb.CEL07' },
  { code: 'CEL08', group: 'prep', trigger: 'Centro de muestra fuera de región óptica', effect: 'viewport sin objeto relevante al centrar platina', evidenceKey: 'err:CEL08', feedbackKey: 'b02fb.CEL08' },
  { code: 'CEL09', group: 'prep', trigger: 'Portaobjetos contaminado por preparado previo', effect: 'contaminationFraction aumenta; anotación de interferencia', evidenceKey: 'err:CEL09', feedbackKey: 'b02fb.CEL09' },
  { code: 'CEL10', group: 'prep', trigger: 'Usar pinza que arrastró material de otra fruta', effect: 'contaminación cruzada entre pigmentos', evidenceKey: 'err:CEL10', feedbackKey: 'b02fb.CEL10' },
  { code: 'CEL11', group: 'prep', trigger: 'Fragmentos triple sin zonas separadas', effect: 'solapamiento espacial; identidad de campo ambigua', evidenceKey: 'err:CEL11', feedbackKey: 'b02fb.CEL11' },
  { code: 'CEL12', group: 'prep', trigger: 'Extendido bucal demasiado denso', effect: 'aglomeración y baja interpretabilidad', evidenceKey: 'err:CEL12', feedbackKey: 'b02fb.CEL12' },
  { code: 'CEL13', group: 'prep', trigger: 'Hisopo virtual sin material recolectado', effect: 'frotis sin fuente celular; observación no acredita', evidenceKey: 'err:CEL13', feedbackKey: 'b02fb.CEL13' },
  { code: 'CEL14', group: 'prep', trigger: 'Cubreobjetos bajado demasiado rápido', effect: 'fracción de burbujas y desplazamiento crece', evidenceKey: 'err:CEL14', feedbackKey: 'b02fb.CEL14' },
  { code: 'CEL15', group: 'prep', trigger: 'Cubreobjetos inclinado hacia zona errónea', effect: 'muestra se arrastra lateralmente', evidenceKey: 'err:CEL15', feedbackKey: 'b02fb.CEL15' },
  { code: 'CEL16', group: 'prep', trigger: 'Presionar cubierta hasta romper', effect: 'marcar cubierta rota, residuo vidrio y bloqueo de uso', evidenceKey: 'err:CEL16', feedbackKey: 'b02fb.CEL16' },
  { code: 'CEL17', group: 'prep', trigger: 'Retirar todo líquido al secar borde', effect: 'wetMl insuficiente; daño por desecación', evidenceKey: 'err:CEL17', feedbackKey: 'b02fb.CEL17' },
  { code: 'CEL18', group: 'stain', trigger: 'Omitir agua en Elodea', effect: 'hidratación cae y montaje no alcanza validez', evidenceKey: 'err:CEL18', feedbackKey: 'b02fb.CEL18' },
  { code: 'CEL19', group: 'stain', trigger: 'Agregar exceso de agua', effect: 'derrame a mesada y cubierta inestable', evidenceKey: 'err:CEL19', feedbackKey: 'b02fb.CEL19' },
  { code: 'CEL20', group: 'stain', trigger: 'Omitir Lugol en la muestra de papa teñida', effect: 'preparación sin condición de contraste requerida', evidenceKey: 'err:CEL20', feedbackKey: 'b02fb.CEL20' },
  { code: 'CEL21', group: 'stain', trigger: 'Agregar reactivo equivocado al raspado de papa', effect: 'muestra marcada incompatible, comparación inválida', evidenceKey: 'err:CEL21', feedbackKey: 'b02fb.CEL21' },
  { code: 'CEL22', group: 'stain', trigger: 'Gota de Lugol cae fuera del porta', effect: 'volumen pasa a derrame; muestra permanece sin teñir', evidenceKey: 'err:CEL22', feedbackKey: 'b02fb.CEL22' },
  { code: 'CEL23', group: 'stain', trigger: 'Cantidad de Lugol excesiva', effect: 'overstainRisk01 aumenta / región puede perder contraste si hay variante', evidenceKey: 'err:CEL23', feedbackKey: 'b02fb.CEL23' },
  { code: 'CEL24', group: 'stain', trigger: 'Contacto con Lugol insuficiente', effect: 'tinción no alcanza condición registrada; no inventar cambio visible', evidenceKey: 'err:CEL24', feedbackKey: 'b02fb.CEL24' },
  { code: 'CEL25', group: 'stain', trigger: 'Usar eosina como si fuera prueba específica de lignina', effect: 'marca interpretación incorrecta, no señal de lignina', evidenceKey: 'nb:CEL25', feedbackKey: 'b02fb.CEL25' },
  { code: 'CEL26', group: 'stain', trigger: 'Afirmar núcleo teñido con eosina sin evidencia visible', effect: 'respuesta sin respaldo, requiere corrección/revisión', evidenceKey: 'nb:CEL26', feedbackKey: 'b02fb.CEL26' },
  { code: 'CEL27', group: 'stain', trigger: 'Frotis sin colorante cuando el contraste se exigía', effect: 'condición sin tinción; no se acredita núcleo automáticamente', evidenceKey: 'err:CEL27', feedbackKey: 'b02fb.CEL27' },
  { code: 'CEL28', group: 'stain', trigger: 'Confundir gotero de agua y azul de metileno', effect: 'reactivo incorrecto registrado, condición real alterada', evidenceKey: 'err:CEL28', feedbackKey: 'b02fb.CEL28' },
  { code: 'CEL29', group: 'stain', trigger: 'Contaminar la punta del gotero al tocar tejido', effect: 'el siguiente montaje recibe fracción de contaminación', evidenceKey: 'err:CEL29', feedbackKey: 'b02fb.CEL29' },
  { code: 'CEL30', group: 'stain', trigger: 'Reutilizar colorante derramado', effect: 'fluido de residuo no vuelve a reservorio; comando rechazado', evidenceKey: 'err:CEL30', feedbackKey: 'b02fb.CEL30' },
  { code: 'CEL31', group: 'optics', trigger: 'Lámina insertada con pinza cerrada', effect: 'encaje fallido o contacto dañino', evidenceKey: 'err:CEL31', feedbackKey: 'b02fb.CEL31' },
  { code: 'CEL32', group: 'optics', trigger: 'Lámina colocada sin cierre de pinza', effect: 'porta deslizante y campo inestable', evidenceKey: 'err:CEL32', feedbackKey: 'b02fb.CEL32' },
  { code: 'CEL33', group: 'optics', trigger: 'Intentar observar sin porta montado', effect: 'vista vacía / comando de observación no válido', evidenceKey: 'err:CEL33', feedbackKey: 'b02fb.CEL33' },
  { code: 'CEL34', group: 'optics', trigger: 'Empezar observación por 40X', effect: 'campo pequeño, riesgo de golpe y sin exploración 4X', evidenceKey: 'err:CEL34', feedbackKey: 'b02fb.CEL34' },
  { code: 'CEL35', group: 'optics', trigger: 'Subir platina hasta contacto físico con objetivo', effect: 'choque, daño al porta o cubierta si energía supera umbral', evidenceKey: 'err:CEL35', feedbackKey: 'b02fb.CEL35' },
  { code: 'CEL36', group: 'optics', trigger: 'Macrométrico en 40X con colisión potencial', effect: 'distancia de trabajo cae a zona peligrosa', evidenceKey: 'err:CEL36', feedbackKey: 'b02fb.CEL36' },
  { code: 'CEL37', group: 'optics', trigger: 'Micrométrico girado fuera de recorrido seguro', effect: 'tope de recorrido y foco sin mejora', evidenceKey: 'err:CEL37', feedbackKey: 'b02fb.CEL37' },
  { code: 'CEL38', group: 'optics', trigger: 'Cambiar objetivo sin centrar región', effect: 'campo reducido ya no contiene estructura buscada', evidenceKey: 'err:CEL38', feedbackKey: 'b02fb.CEL38' },
  { code: 'CEL39', group: 'optics', trigger: 'Cambio de objetivo antes de asegurar revólver', effect: 'posición intermedia; trayectoria luminosa inutilizable', evidenceKey: 'err:CEL39', feedbackKey: 'b02fb.CEL39' },
  { code: 'CEL40', group: 'optics', trigger: 'Diafragma demasiado cerrado', effect: 'contraste/iluminación inapropiados y pérdida de detalle', evidenceKey: 'err:CEL40', feedbackKey: 'b02fb.CEL40' },
  { code: 'CEL41', group: 'optics', trigger: 'Luz excesiva', effect: 'saturación perceptiva, pérdida de contraste', evidenceKey: 'err:CEL41', feedbackKey: 'b02fb.CEL41' },
  { code: 'CEL42', group: 'optics', trigger: 'Lámpara apagada', effect: 'observación de campo claro no válida', evidenceKey: 'err:CEL42', feedbackKey: 'b02fb.CEL42' },
  { code: 'CEL43', group: 'optics', trigger: 'Usar mandos X/Y hasta dejar el porta fuera de recorrido', effect: 'tope; campo vacío u objeto mal situado', evidenceKey: 'err:CEL43', feedbackKey: 'b02fb.CEL43' },
  { code: 'CEL44', group: 'optics', trigger: 'No ajustar foco fino en 40X', effect: 'focusErrorMm excede umbral de observación', evidenceKey: 'err:CEL44', feedbackKey: 'b02fb.CEL44' },
  { code: 'CEL45', group: 'optics', trigger: 'Retirar porta sin bajar a posición segura', effect: 'colisión durante retirada o comando rechazado', evidenceKey: 'err:CEL45', feedbackKey: 'b02fb.CEL45' },
  { code: 'CEL46', group: 'science', trigger: 'Llamar amiloplasto a cromoplasto pigmentado', effect: 'clasificación de organelo incorrecta en libreta', evidenceKey: 'nb:CEL46', feedbackKey: 'b02fb.CEL46' },
  { code: 'CEL47', group: 'science', trigger: 'Marcar un cloroplasto en imagen de epitelio bucal', effect: 'anotación fuera de estructura aprobada', evidenceKey: 'nb:CEL47', feedbackKey: 'b02fb.CEL47' },
  { code: 'CEL48', group: 'science', trigger: 'Señalar membrana plasmática vegetal no resoluble', effect: 'evidencia inválida o ítem marcado no evaluable', evidenceKey: 'nb:CEL48', feedbackKey: 'b02fb.CEL48' },
  { code: 'CEL49', group: 'science', trigger: 'Confundir pared vegetal con núcleo', effect: 'anotación desacoplada de región visible', evidenceKey: 'nb:CEL49', feedbackKey: 'b02fb.CEL49' },
  { code: 'CEL50', group: 'science', trigger: 'Decir que foto fija prueba ciclosis', effect: 'conclusión sin soporte temporal', evidenceKey: 'nb:CEL50', feedbackKey: 'b02fb.CEL50' },
  { code: 'CEL51', group: 'science', trigger: 'Atribuir función de lignina a señal de eosina', effect: 'interpretación química no demostrada', evidenceKey: 'nb:CEL51', feedbackKey: 'b02fb.CEL51' },
  { code: 'CEL52', group: 'science', trigger: 'Confundir vacuola con burbuja del montaje', effect: 'anotación sobre artefacto y no estructura celular', evidenceKey: 'nb:CEL52', feedbackKey: 'b02fb.CEL52' },
  { code: 'CEL53', group: 'science', trigger: 'Capturar sin foco o exposición mínimos', effect: 'observación con quality01 insuficiente; lectura no importable', evidenceKey: 'err:CEL53', feedbackKey: 'b02fb.CEL53' },
  { code: 'CEL54', group: 'science', trigger: 'Anotar escala física sin calibración', effect: 'lectura de micrómetros bloqueada y nota de metodología', evidenceKey: 'nb:CEL54', feedbackKey: 'b02fb.CEL54' },
  { code: 'CEL55', group: 'science', trigger: 'Etiquetar dibujo de otra muestra', effect: 'observationId y specimenId no corresponden', evidenceKey: 'nb:CEL55', feedbackKey: 'b02fb.CEL55' },
  { code: 'CEL56', group: 'care', trigger: 'Registrar una foto de un activo distinto al asignado', effect: 'rechazo por viewId/hash; no se mezcla evidencia', evidenceKey: 'err:CEL56', feedbackKey: 'b02fb.CEL56' },
  { code: 'CEL57', group: 'care', trigger: 'Intentar usar lámina fija como preparado fresco', effect: 'adición de reactivo prohibida, sin modificar la lámina', evidenceKey: 'err:CEL57', feedbackKey: 'b02fb.CEL57' },
  { code: 'CEL58', group: 'care', trigger: 'Devolver lámina fija a ranura incorrecta', effect: 'desorden inventario e incompletitud del cierre', evidenceKey: 'err:CEL58', feedbackKey: 'b02fb.CEL58' },
  { code: 'CEL59', group: 'care', trigger: 'Retirar cubre roto con mano sin herramienta', effect: 'bloqueo de seguridad y registro de incidencia', evidenceKey: 'err:CEL59', feedbackKey: 'b02fb.CEL59' },
  { code: 'CEL60', group: 'care', trigger: 'Descartar hisopo bucal virtual en residuos comunes', effect: 'contenedor incorrecto y riesgo de bioseguridad', evidenceKey: 'err:CEL60', feedbackKey: 'b02fb.CEL60' },
  { code: 'CEL61', group: 'care', trigger: 'No devolver pinzas o herramientas cortantes', effect: 'inventario faltante y cierre pendiente', evidenceKey: 'err:CEL61', feedbackKey: 'b02fb.CEL61' },
  { code: 'CEL62', group: 'care', trigger: 'Manipular bisturí contra posición del porta', effect: 'riesgo de corte, superficie marcada', evidenceKey: 'err:CEL62', feedbackKey: 'b02fb.CEL62' },
  { code: 'CEL63', group: 'care', trigger: 'Dejar condensador/diafragma inadecuado al nuevo objetivo', effect: 'contraste pobre en la siguiente observación', evidenceKey: 'err:CEL63', feedbackKey: 'b02fb.CEL63' },
  { code: 'CEL64', group: 'care', trigger: 'Dejar microscopio encendido al finalizar', effect: 'consumo/estado de estación pendiente, sin invalidar observaciones previas', evidenceKey: 'err:CEL64', feedbackKey: 'b02fb.CEL64' },
  { code: 'CEL65', group: 'care', trigger: 'Dejar porta húmedo en estación óptica al cerrar', effect: 'cierre incompleto y riesgo de contaminación del siguiente uso', evidenceKey: 'err:CEL65', feedbackKey: 'b02fb.CEL65' },
  { code: 'CEL66', group: 'care', trigger: 'Usar estereoscopio con luz insuficiente (si habilitado)', effect: 'observación macroscópica no válida', evidenceKey: 'err:CEL66', feedbackKey: 'b02fb.CEL66' },
  { code: 'CEL67', group: 'care', trigger: 'Usar estereoscopio para calificar un núcleo celular', effect: 'identificación fuera del alcance instrumental', evidenceKey: 'nb:CEL67', feedbackKey: 'b02fb.CEL67' },
  { code: 'CEL68', group: 'care', trigger: 'No reportar activo faltante e insistir en captura', effect: 'se registra incidencia sin penalización al estudiante; requiere recurso', evidenceKey: 'incident:CEL68', feedbackKey: 'b02fb.CEL68' },
];

/** Códigos cuya evidencia vive en la libreta (interpretación contrastada con las capturas propias). */
export const NOTEBOOK_CODES_B02 = SIMULATED_ERRORS_B02.filter((e) => e.evidenceKey.startsWith('nb:')).map((e) => e.code);
