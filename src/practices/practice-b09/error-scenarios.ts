/**
 * Escenarios docentes (§10) y catálogo de errores simulables (§9) de la práctica B09. Tipos: `err` del mundo, `nb` de la
 * libreta y `asset` incidencia sin culpa. Los gestos propios se calculan en `plant-world/world.ts`; los de instrumentos son los
 * de B01/B02/B06 traducidos por `CODE_MAP_B09`; los `nb` los evalúa la rúbrica. TV-40 y TV-53 son incidencias: la guía los lista
 * entre los errores, pero su detección es `asset:*` y su texto dice que no se penaliza (B09-3).
 */
import { SC_B09 } from '../../simulation/plant-world/world';

export type B09Scenario = (typeof SC_B09)[keyof typeof SC_B09];

export interface B09ScenarioSpec {
  id: B09Scenario;
  excludes?: B09Scenario[];
}

const S = SC_B09;
export const B09_SCENARIOS: B09ScenarioSpec[] = [
  { id: S.STEM_EU }, { id: S.STEM_MONO }, { id: S.ROOT_EU }, { id: S.ROOT_MONO }, { id: S.ROOT_TIP },
  { id: S.CELERY_THIN }, { id: S.CELERY_THICK }, { id: S.PEAR_SCLEREIDS },
  { id: S.NO_LIGNIN, excludes: [S.LIGNIN_DOC] }, { id: S.LIGNIN_DOC, excludes: [S.NO_LIGNIN] }, { id: S.BAD_DOSE },
  { id: S.LEAF_EU }, { id: S.LEAF_MONO }, { id: S.STOMATA, excludes: [S.NO_STOMATA] }, { id: S.NO_STOMATA, excludes: [S.STOMATA] },
  { id: S.RINGS, excludes: [S.TROPICAL] }, { id: S.TROPICAL, excludes: [S.RINGS] }, { id: S.MISLABELED, excludes: [S.UNKNOWNS] }, { id: S.DIAPHRAGM }, { id: S.BAD_COVER },
  { id: S.NO_SCALE, excludes: [S.MOSAIC] }, { id: S.MOSAIC, excludes: [S.NO_SCALE] }, { id: S.UNKNOWNS, excludes: [S.MISLABELED] }, { id: S.MACRO }, { id: S.TEACHER }, { id: S.CONTINGENCY },
];

/** Escenarios compatibles: al pedir uno incompatible con otro ya elegido, gana el primero. */
export function validScenariosB09(list: string[]): B09Scenario[] {
  const known = new Set<string>(B09_SCENARIOS.map((s) => s.id));
  const out: B09Scenario[] = [];
  for (const s of list) {
    if (!known.has(s) || out.includes(s as B09Scenario)) continue;
    const spec = B09_SCENARIOS.find((x) => x.id === s)!;
    if (out.some((o) => spec.excludes?.includes(o) || B09_SCENARIOS.find((x) => x.id === o)?.excludes?.includes(spec.id))) continue;
    out.push(s as B09Scenario);
  }
  return out;
}

export interface SimulatedErrorB09 {
  code: string;
  group: 'external' | 'cut' | 'stain' | 'optics' | 'fixed' | 'analysis' | 'safety' | 'asset';
  kind: 'err' | 'nb' | 'asset';
  trigger: string;
  effect: string;
  evidenceKey: string;
  feedbackKey: string;
}

const E = (n: number, group: SimulatedErrorB09['group'], kind: SimulatedErrorB09['kind'], trigger: string, effect: string, evidence?: string): SimulatedErrorB09 => {
  const code = `TV-${String(n).padStart(2, '0')}`;
  return { code, group, kind, trigger, effect, evidenceKey: evidence ?? `${kind}:${code}`, feedbackKey: `b09fb.${code}` };
};
const A = (n: number, trigger: string, effect: string): SimulatedErrorB09 => {
  const code = `TV-ASSET-${String(n).padStart(2, '0')}`;
  return { code, group: 'asset', kind: 'asset', trigger, effect, evidenceKey: 'asset:unavailable', feedbackKey: `b09fb.${code}` };
};

/** 72 entradas `TV-01…72` y las cinco incidencias `TV-ASSET-*`, que nunca descuentan. */
export const SIMULATED_ERRORS_B09: SimulatedErrorB09[] = [
  E(1, 'external', 'nb', 'Registrar el tipo de raíz sin observarla o al revés', 'Clasificación externa incorrecta'),
  E(2, 'external', 'err', 'Señalar yema terminal en otra zona', 'Rótulo fuera del órgano'),
  E(3, 'external', 'err', 'Confundir nudo con entrenudo', 'Región incorrecta'),
  E(4, 'external', 'err', 'Asumir pecíolo en hoja que no lo presenta', 'Registro falso de inserción'),
  E(5, 'external', 'nb', 'Elegir venación paralela en hoja reticulada', 'Inferencia contra la imagen'),
  E(6, 'external', 'err', 'Sin luz incidente sobre hoja opaca', 'Contraste insuficiente en el estereoscopio'),
  E(7, 'external', 'err', 'Subir el zoom sin centrar el nervio', 'Nervadura fuera del campo'),
  E(8, 'external', 'nb', 'No registrar especie o procedencia', 'Comparación sin trazabilidad'),
  E(9, 'cut', 'err', 'Plano distinto del solicitado', 'Geometría incompatible con la comparación'),
  E(10, 'cut', 'err', 'Corte excesivamente grueso', 'Menos luz y campo útil'),
  E(11, 'cut', 'err', 'Corte excesivamente fino', 'La sección se fragmenta'),
  E(12, 'cut', 'err', 'Cortar fuera de la región asignada', 'No aparece el tejido solicitado'),
  E(13, 'cut', 'err', 'Presionar el bisturí bruscamente', 'Células aplastadas'),
  E(14, 'cut', 'err', 'No sujetar el tejido', 'El plano se desvía'),
  E(15, 'cut', 'err', 'Herramienta o vidrio con restos de otra muestra', 'Mezcla de tejidos en el campo'),
  E(16, 'cut', 'err', 'Transferir fuera del centro', 'Sección fuera del área útil'),
  E(17, 'cut', 'err', 'Dejar caer la sección', 'Pasa a residuos; no se reutiliza'),
  E(18, 'cut', 'err', 'Montar dos cortes superpuestos', 'Menos transmisión y nitidez'),
  E(19, 'cut', 'err', 'Sección sin humectar', 'Se seca y encoge'),
  E(20, 'cut', 'err', 'Presionar el cubreobjetos', 'Sección deformada; campo íntegro menor'),
  E(21, 'stain', 'err', 'Reactivo sobre una lámina fija', 'Rechazado; el activo no cambia'),
  E(22, 'stain', 'err', 'Omitir un reactivo asignado', 'Comparación teñida incompleta'),
  E(23, 'stain', 'err', 'Exceso de líquido', 'Desborda y desplaza la sección'),
  E(24, 'stain', 'err', 'Ácido en recipiente equivocado', 'Reactivo consumido sin teñir la muestra'),
  E(25, 'stain', 'err', 'Contacto fuera de la ventana del recurso', 'Tratamiento sin foto validada'),
  E(26, 'stain', 'nb', 'Interpretar toda zona roja como xilema', 'Fibras y esclereidas mal clasificadas'),
  E(27, 'stain', 'nb', 'Diagnosticar colénquima por el color', 'Clasificación contra la evidencia'),
  E(28, 'stain', 'err', 'Cubreobjetos de golpe tras teñir', 'Burbujas sobre la zona coloreada'),
  E(29, 'stain', 'err', 'Lavar en exceso', 'La sección se desprende'),
  E(30, 'stain', 'nb', 'No diferenciar foto teñida de sin teñir', 'Tratamiento mal atribuido'),
  E(31, 'optics', 'err', 'Colocar la lámina sin abrir la pinza', 'Lámina mal asentada'),
  E(32, 'optics', 'err', 'No sujetar la lámina', 'Deriva XY involuntaria'),
  E(33, 'optics', 'err', 'Empezar a 40X sin explorar a 4X', 'Región perdida; campo estrecho'),
  E(34, 'optics', 'err', 'Acercar el objetivo sin margen', 'Colisión o enfoque bloqueado'),
  E(35, 'optics', 'err', 'Macrométrico a 40X', 'Colisión o bloqueo de seguridad'),
  E(36, 'optics', 'err', 'Capturar sin ajustar el micrométrico', 'Nitidez insuficiente'),
  E(37, 'optics', 'err', 'Luz insuficiente o diafragma muy cerrado', 'Zonas oscuras; región poco fiable'),
  E(38, 'optics', 'err', 'Luz excesiva o diafragma muy abierto', 'Contraste perdido'),
  E(39, 'optics', 'err', 'Subir a 40X sin centrar', 'El tejido sale del campo'),
  E(40, 'optics', 'asset', 'Pedir un aumento sin recurso', 'Bloqueo no penalizable; no se infiere detalle', 'asset:missingMagnification'),
  E(41, 'optics', 'err', 'Lámina con la cara equivocada', 'Foco y contraste alterados'),
  E(42, 'optics', 'err', 'Retirar con el objetivo cerca', 'Bloqueo hasta bajar la platina'),
  E(43, 'fixed', 'err', 'Lámina de otro órgano o no asignada', 'Atlas con material incorrecto'),
  E(44, 'fixed', 'nb', 'Concluir mono/eudicot solo por la etiqueta', 'Respuesta sin rasgos observados'),
  E(45, 'fixed', 'err', 'Rotular la estela fuera del centro', 'Región equivocada'),
  E(46, 'fixed', 'err', 'Afirmar cambium no distinguible', 'Clasificación excesiva'),
  E(47, 'fixed', 'nb', 'Registrar el ápice longitudinal como transversal', 'Registro incoherente con el plano'),
  E(48, 'fixed', 'nb', 'No comprobar la orientación del haz', 'Tejidos invertidos en el atlas'),
  E(49, 'fixed', 'err', 'Devolver a otra ranura', 'Inventario con casilla incorrecta'),
  E(50, 'fixed', 'err', 'Dejar la lámina fuera de la caja', 'Inventario incompleto'),
  E(51, 'fixed', 'err', 'Aceite sin objetivo de inmersión', 'Lámina o lente contaminadas'),
  E(52, 'fixed', 'nb', 'Justificar con la foto de otra lámina', 'Procedencia que no coincide'),
  E(53, 'analysis', 'asset', 'Medir un recurso sin escala', 'Medición bloqueada; no se puntúa', 'asset:uncalibrated'),
  E(54, 'analysis', 'nb', 'Usar el campo visual como tamaño de célula', 'Sobreestimación sistemática'),
  E(55, 'analysis', 'nb', 'Dejar la medida en píxeles', 'Sin unidad física'),
  E(56, 'analysis', 'nb', 'Reportar 40X como aumento total', 'Aumento 10 veces menor'),
  E(57, 'analysis', 'nb', 'Intercambiar xilema y floema', 'Análisis de transporte incorrecto'),
  E(58, 'analysis', 'nb', 'Leer cada anillo como un año', 'Edad sin respaldo ambiental'),
  E(59, 'analysis', 'nb', 'Generalizar «toda monocotiledónea sin pecíolo»', 'Conclusión taxonómica inválida'),
  E(60, 'analysis', 'err', 'Rotular células acompañantes no resueltas', 'Etiqueta sin región certificada'),
  E(61, 'analysis', 'err', 'Afirmar banda de Caspary sin resolución', 'Clasificación no sustentada'),
  E(62, 'analysis', 'nb', 'Suponer almidón en todo parénquima', 'Función inferida erróneamente'),
  E(63, 'safety', 'err', 'Usar bisturí sin EPP', 'Corte bloqueado'),
  E(64, 'safety', 'err', 'Ácido sin protección o fuera de la zona', 'Bloqueo; no se transfiere volumen'),
  E(65, 'safety', 'err', 'Hoja hacia la mano que sujeta', 'Herramienta detenida'),
  E(66, 'safety', 'err', 'Romper el cubreobjetos', 'Vidrio a residuos; montaje perdido'),
  E(67, 'safety', 'err', 'Vidrio roto en residuo común', 'Incidente; recuperación obligatoria'),
  E(68, 'safety', 'err', 'Limpiar la lente con papel inadecuado', 'Óptica empeorada'),
  E(69, 'safety', 'err', 'Ácido derramado sin tratar', 'Cierre bloqueado hasta limpiar'),
  E(70, 'safety', 'err', 'Mover el microscopio por los oculares', 'Bloqueo y riesgo de caída'),
  E(71, 'safety', 'err', 'Terminar sin objetivo de seguridad', 'Cierre incompleto'),
  E(72, 'safety', 'err', 'Apagar con lámina en la platina o sin recoger', 'Resguardo incompleto'),
  A(1, 'Fotografía inexistente', 'Recurso estándar o tarea reducida; sin descuento'),
  A(2, 'Escala ausente', 'Solo observación cualitativa; sin descuento'),
  A(3, 'Aumento o plano no disponible', 'Vista limitada; sin descuento'),
  A(4, 'Metadatos discordantes', 'Manda la imagen; se avisa al docente'),
  A(5, 'Carga corrupta', 'Se notifica al docente; sin descuento'),
];

/** Prefijo de una incidencia → código. */
export function incidentCode(key: string): string {
  if (key.startsWith('scale:')) return 'TV-ASSET-02';
  if (key.startsWith('objective:')) return 'TV-ASSET-03';
  if (key.startsWith('label:') || key.startsWith('metadata:')) return 'TV-ASSET-04';
  if (key.startsWith('corrupt:')) return 'TV-ASSET-05';
  return 'TV-ASSET-01';
}
