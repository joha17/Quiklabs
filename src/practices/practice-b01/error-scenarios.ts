/**
 * Escenarios docentes (§10) y catálogo de los 68 errores simulables (§9) de la práctica B01, con su contrato:
 * código, grupo, hecho que lo provoca, consecuencia medible, clave de evidencia y de retroalimentación. Las
 * consecuencias se calculan en el dominio (`optical-world/world.ts`) o, para E60–E62, en la libreta (rúbrica).
 */
import { SB } from '../../simulation/optical-world/world';

export type B01Scenario = (typeof SB)[keyof typeof SB];

export interface B01ScenarioSpec {
  id: B01Scenario;
  excludes?: B01Scenario[];
}

export const B01_SCENARIOS: B01ScenarioSpec[] = [
  { id: SB.DIRTY_SLIDE },
  { id: SB.BIG_LEAF },
  { id: SB.LIMITED_DROPPER },
  { id: SB.NO_WATER, excludes: [SB.RESUME_PREP] },
  { id: SB.COVER_GRIP },
  { id: SB.LOW_LIGHT },
  { id: SB.CONDENSER },
  { id: SB.STAGE_OFF },
  { id: SB.CLIP_CLOSED },
  { id: SB.START_40X },
  { id: SB.SIMILAR_SLIDES, excludes: [SB.UNKNOWN_SLIDES] },
  { id: SB.TWO_PLANES },
  { id: SB.REFLECTIVE },
  { id: SB.STEREO_DEFOCUS },
  { id: SB.STEREO_PAIR },
  { id: SB.MONO_2D },
  { id: SB.UNKNOWN_SLIDES, excludes: [SB.SIMILAR_SLIDES] },
  { id: SB.RESUME_PREP, excludes: [SB.NO_WATER] },
];

/** Escenarios compatibles: al pedir uno incompatible con otro ya elegido, gana el primero. */
export function validScenariosB01(list: string[]): B01Scenario[] {
  const known = new Set<string>(B01_SCENARIOS.map((s) => s.id));
  const out: B01Scenario[] = [];
  for (const s of list) {
    if (!known.has(s) || out.includes(s as B01Scenario)) continue;
    const spec = B01_SCENARIOS.find((x) => x.id === s)!;
    if (out.some((o) => spec.excludes?.includes(o) || B01_SCENARIOS.find((x) => x.id === o)?.excludes?.includes(spec.id))) continue;
    out.push(s as B01Scenario);
  }
  return out;
}

export interface SimulatedErrorB01 {
  code: string;
  group: 'prep' | 'compound' | 'fixed' | 'stereo' | 'notebook' | 'closing';
  trigger: string;
  effect: string;
  evidenceKey: string;
  feedbackKey: string;
}

export const SIMULATED_ERRORS_B01: SimulatedErrorB01[] = [
  { code: 'E01', group: 'prep', trigger: 'Portaobjetos con residuo sin limpiar bajo la muestra', effect: 'contaminationFraction ↑ (artefactos)', evidenceKey: 'err:E01', feedbackKey: 'b01fb.E01' },
  { code: 'E02', group: 'prep', trigger: 'Fragmento más grande que el cubreobjetos', effect: 'coveredFraction ↓', evidenceKey: 'err:E02', feedbackKey: 'b01fb.E02' },
  { code: 'E03', group: 'prep', trigger: 'Fragmento diminuto o en el borde', effect: 'región útil ↓', evidenceKey: 'err:E03', feedbackKey: 'b01fb.E03' },
  { code: 'E04', group: 'prep', trigger: 'Corte demasiado profundo cuando se exige seccionar', effect: 'damage ↑', evidenceKey: 'err:E04', feedbackKey: 'b01fb.E04' },
  { code: 'E05', group: 'prep', trigger: 'Corte de una hoja apta sin indicación', effect: 'damage ↑', evidenceKey: 'err:E05', feedbackKey: 'b01fb.E05' },
  { code: 'E06', group: 'prep', trigger: 'Montaje sin líquido', effect: 'hydratedFraction ↓ con el tiempo', evidenceKey: 'err:E06', feedbackKey: 'b01fb.E06' },
  { code: 'E07', group: 'prep', trigger: 'Exceso de líquido', effect: 'spilledMl ↑, cubreobjetos flotante', evidenceKey: 'err:E07', feedbackKey: 'b01fb.E07' },
  { code: 'E08', group: 'prep', trigger: 'Gota fuera de la muestra', effect: 'la hoja no se humedece', evidenceKey: 'err:E08', feedbackKey: 'b01fb.E08' },
  { code: 'E09', group: 'prep', trigger: 'Cubreobjetos bajado plano', effect: 'bubbleFraction ↑ (burbuja sobre el tejido)', evidenceKey: 'err:E09', feedbackKey: 'b01fb.E09' },
  { code: 'E10', group: 'prep', trigger: 'Descenso rápido con poca inclinación', effect: 'bubbleFraction ↑', evidenceKey: 'err:E10', feedbackKey: 'b01fb.E10' },
  { code: 'E11', group: 'prep', trigger: 'Presión excesiva sobre el cubreobjetos', effect: 'vidrio roto, damage ↑', evidenceKey: 'err:E11', feedbackKey: 'b01fb.E11' },
  { code: 'E12', group: 'prep', trigger: 'Papel absorbente sobre la zona central', effect: 'líquido útil ↓, damage ↑', evidenceKey: 'err:E12', feedbackKey: 'b01fb.E12' },
  { code: 'E13', group: 'prep', trigger: 'Pinza sucia al tomar otra muestra', effect: 'contaminación cruzada', evidenceKey: 'err:E13', feedbackKey: 'b01fb.E13' },
  { code: 'E14', group: 'prep', trigger: 'Reactivo no asignado', effect: 'preparación fuera de protocolo', evidenceKey: 'err:E14', feedbackKey: 'b01fb.E14' },
  { code: 'E15', group: 'compound', trigger: 'Lámina con la pinza cerrada', effect: 'rechazo; no entra a la platina', evidenceKey: 'err:E15', feedbackKey: 'b01fb.E15' },
  { code: 'E16', group: 'compound', trigger: 'Lámina sin sujetar al mover X/Y', effect: 'la lámina se desplaza', evidenceKey: 'err:E16', feedbackKey: 'b01fb.E16' },
  { code: 'E17', group: 'compound', trigger: 'Lámina invertida o fuera del asiento', effect: 'cobertura del campo ↓', evidenceKey: 'err:E17', feedbackKey: 'b01fb.E17' },
  { code: 'E18', group: 'compound', trigger: '40X antes de localizar con 4X', effect: 'búsqueda con campo pequeño', evidenceKey: 'err:E18', feedbackKey: 'b01fb.E18' },
  { code: 'E19', group: 'compound', trigger: 'Revólver entre enclavamientos', effect: 'sin objetivo operativo', evidenceKey: 'err:E19', feedbackKey: 'b01fb.E19' },
  { code: 'E20', group: 'compound', trigger: 'Aproximación sin comprobar de lado', effect: 'separación en zona de advertencia', evidenceKey: 'err:E20', feedbackKey: 'b01fb.E20' },
  { code: 'E21', group: 'compound', trigger: 'Objetivo contra la preparación', effect: 'choque: daño y accidente', evidenceKey: 'err:E21', feedbackKey: 'b01fb.E21' },
  { code: 'E22', group: 'compound', trigger: 'Macrométrico a 40X', effect: 'aproximación peligrosa', evidenceKey: 'err:E22', feedbackKey: 'b01fb.E22' },
  { code: 'E23', group: 'compound', trigger: 'Micrométrico sin foco grueso', effect: 'sigue borroso', evidenceKey: 'err:E23', feedbackKey: 'b01fb.E23' },
  { code: 'E24', group: 'compound', trigger: 'Macrométrico más allá del tope', effect: 'el mando no avanza', evidenceKey: 'err:E24', feedbackKey: 'b01fb.E24' },
  { code: 'E25', group: 'compound', trigger: 'Micrométrico más allá del tope', effect: 'el mando no avanza', evidenceKey: 'err:E25', feedbackKey: 'b01fb.E25' },
  { code: 'E26', group: 'compound', trigger: 'Luz apagada', effect: 'observación inválida', evidenceKey: 'err:E26', feedbackKey: 'b01fb.E26' },
  { code: 'E27', group: 'compound', trigger: 'Iluminación insuficiente', effect: 'contraste ↓', evidenceKey: 'err:E27', feedbackKey: 'b01fb.E27' },
  { code: 'E28', group: 'compound', trigger: 'Iluminación saturada', effect: 'campo lavado', evidenceKey: 'err:E28', feedbackKey: 'b01fb.E28' },
  { code: 'E29', group: 'compound', trigger: 'Diafragma demasiado cerrado', effect: 'detalle ↓', evidenceKey: 'err:E29', feedbackKey: 'b01fb.E29' },
  { code: 'E30', group: 'compound', trigger: 'Diafragma demasiado abierto', effect: 'contraste ↓', evidenceKey: 'err:E30', feedbackKey: 'b01fb.E30' },
  { code: 'E31', group: 'compound', trigger: 'Condensador mal ajustado', effect: 'iluminación desigual', evidenceKey: 'err:E31', feedbackKey: 'b01fb.E31' },
  { code: 'E32', group: 'compound', trigger: 'Cambio de aumento sin centrar', effect: 'la estructura sale del campo', evidenceKey: 'err:E32', feedbackKey: 'b01fb.E32' },
  { code: 'E33', group: 'compound', trigger: 'Platina fuera de la muestra', effect: 'campo vacío', evidenceKey: 'err:E33', feedbackKey: 'b01fb.E33' },
  { code: 'E34', group: 'compound', trigger: 'Mando en sentido contrario', effect: 'la estructura se aleja', evidenceKey: 'err:E34', feedbackKey: 'b01fb.E34' },
  { code: 'E35', group: 'compound', trigger: 'Sin reenfoque tras cambiar de objetivo', effect: 'captura desenfocada', evidenceKey: 'err:E35', feedbackKey: 'b01fb.E35' },
  { code: 'E36', group: 'compound', trigger: 'Captura fuera de foco', effect: 'observación inválida', evidenceKey: 'err:E36', feedbackKey: 'b01fb.E36' },
  { code: 'E37', group: 'compound', trigger: 'Captura sobre una burbuja', effect: 'tejido oculto', evidenceKey: 'err:E37', feedbackKey: 'b01fb.E37' },
  { code: 'E38', group: 'compound', trigger: 'Retirar la lámina sujeta', effect: 'rechazo', evidenceKey: 'err:E38', feedbackKey: 'b01fb.E38' },
  { code: 'E39', group: 'compound', trigger: 'Retirar sin alejar el objetivo', effect: 'rechazo por separación insegura', evidenceKey: 'err:E39', feedbackKey: 'b01fb.E39' },
  { code: 'E40', group: 'fixed', trigger: 'Lámina distinta de la asignada', effect: 'la observación no acredita', evidenceKey: 'err:E40', feedbackKey: 'b01fb.E40' },
  { code: 'E41', group: 'fixed', trigger: 'Tomar una lámina con la caja cerrada', effect: 'rechazo', evidenceKey: 'err:E41', feedbackKey: 'b01fb.E41' },
  { code: 'E42', group: 'fixed', trigger: 'Gota sobre una lámina fija', effect: 'rechazo', evidenceKey: 'err:E42', feedbackKey: 'b01fb.E42' },
  { code: 'E43', group: 'fixed', trigger: 'Otro cubreobjetos sobre una lámina fija', effect: 'rechazo', evidenceKey: 'err:E43', feedbackKey: 'b01fb.E43' },
  { code: 'E44', group: 'fixed', trigger: 'Devolver en otra ranura', effect: 'caja desordenada', evidenceKey: 'err:E44', feedbackKey: 'b01fb.E44' },
  { code: 'E45', group: 'fixed', trigger: 'Lámina fuera de la caja al terminar', effect: 'cierre incompleto', evidenceKey: 'err:E45', feedbackKey: 'b01fb.E45' },
  { code: 'E46', group: 'fixed', trigger: 'Caja abierta mientras se opera el equipo', effect: 'exposición del material', evidenceKey: 'err:E46', feedbackKey: 'b01fb.E46' },
  { code: 'E47', group: 'fixed', trigger: 'Vista que no corresponde a la lámina colocada', effect: 'rechazo', evidenceKey: 'err:E47', feedbackKey: 'b01fb.E47' },
  { code: 'E48', group: 'stereo', trigger: 'Sin muestra en la base', effect: 'visor vacío', evidenceKey: 'err:E48', feedbackKey: 'b01fb.E48' },
  { code: 'E49', group: 'stereo', trigger: 'Muestra lejos del centro', effect: 'parte de la muestra fuera del campo', evidenceKey: 'err:E49', feedbackKey: 'b01fb.E49' },
  { code: 'E50', group: 'stereo', trigger: 'Solo luz transmitida en un opaco', effect: 'contornos invisibles', evidenceKey: 'err:E50', feedbackKey: 'b01fb.E50' },
  { code: 'E51', group: 'stereo', trigger: 'Luz incidente intensa en un objeto reflectante', effect: 'reflejos saturados', evidenceKey: 'err:E51', feedbackKey: 'b01fb.E51' },
  { code: 'E52', group: 'stereo', trigger: 'Luz apagada', effect: 'campo oscuro', evidenceKey: 'err:E52', feedbackKey: 'b01fb.E52' },
  { code: 'E53', group: 'stereo', trigger: 'Zoom máximo sin localizar', effect: 'la estructura sale del campo', evidenceKey: 'err:E53', feedbackKey: 'b01fb.E53' },
  { code: 'E54', group: 'stereo', trigger: 'Sin reenfoque tras mover el cabezal', effect: 'desenfocado', evidenceKey: 'err:E54', feedbackKey: 'b01fb.E54' },
  { code: 'E55', group: 'stereo', trigger: 'Perilla de enfoque en el tope', effect: 'no enfoca más', evidenceKey: 'err:E55', feedbackKey: 'b01fb.E55' },
  { code: 'E56', group: 'stereo', trigger: 'Dioptrías desiguales con par binocular', effect: 'un ocular borroso', evidenceKey: 'err:E56', feedbackKey: 'b01fb.E56' },
  { code: 'E57', group: 'stereo', trigger: 'Distancia interpupilar incompatible', effect: 'no se fusionan las vistas', evidenceKey: 'err:E57', feedbackKey: 'b01fb.E57' },
  { code: 'E58', group: 'stereo', trigger: 'Insecto apretado con la pinza', effect: 'daño en los apéndices', evidenceKey: 'err:E58', feedbackKey: 'b01fb.E58' },
  { code: 'E59', group: 'stereo', trigger: 'Retirar la muestra sin registrar', effect: 'observación interrumpida', evidenceKey: 'err:E59', feedbackKey: 'b01fb.E59' },
  { code: 'E60', group: 'notebook', trigger: 'Aumento total sumado', effect: 'aumento anotado incorrecto', evidenceKey: 'nb:E60', feedbackKey: 'b01fb.E60' },
  { code: 'E61', group: 'notebook', trigger: 'Estructura no presente en la región observada', effect: 'identificación sin sustento', evidenceKey: 'nb:E61', feedbackKey: 'b01fb.E61' },
  { code: 'E62', group: 'notebook', trigger: 'Muestra anotada distinta de la observada', effect: 'registro inconsistente', evidenceKey: 'nb:E62', feedbackKey: 'b01fb.E62' },
  { code: 'E63', group: 'closing', trigger: 'Captura de otro intento', effect: 'adjunto rechazado', evidenceKey: 'err:E63', feedbackKey: 'b01fb.E63' },
  { code: 'E64', group: 'closing', trigger: 'Material sin devolver', effect: 'puesto incompleto', evidenceKey: 'err:E64', feedbackKey: 'b01fb.E64' },
  { code: 'E65', group: 'closing', trigger: 'Lente limpiada con material abrasivo', effect: 'rechazo / riesgo de daño', evidenceKey: 'err:E65', feedbackKey: 'b01fb.E65' },
  { code: 'E66', group: 'closing', trigger: 'Cierre con 40X en el eje', effect: 'equipo no estacionado', evidenceKey: 'err:E66', feedbackKey: 'b01fb.E66' },
  { code: 'E67', group: 'closing', trigger: 'Luz encendida al terminar', effect: 'equipo encendido', evidenceKey: 'err:E67', feedbackKey: 'b01fb.E67' },
  { code: 'E68', group: 'closing', trigger: 'Sin verificación de seguridad', effect: 'operación no habilitada', evidenceKey: 'err:E68', feedbackKey: 'b01fb.E68' },
];
