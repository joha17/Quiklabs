/**
 * Escenarios docentes (§10) y catálogo de errores simulables (§9) de la práctica B06, con su contrato: código, grupo,
 * tipo (`err` del mundo, `nb` de la libreta, `asset` incidencia sin culpa), hecho que lo provoca, consecuencia y clave
 * de retroalimentación. Los gestos propios se calculan en `div-world/world.ts`; los de instrumentos y montaje son los
 * de B01/B02 traducidos por `CODE_MAP_B06`; los `nb` los evalúa la rúbrica sobre la libreta. CEL-037, CEL-043,
 * CEL-046 y CEL-047 se disparan al escribir la libreta (su gesto es un registro), por eso son `nb` (decisión B06-13).
 */
import { SC_B06 } from '../../simulation/div-world/world';

export type B06Scenario = (typeof SC_B06)[keyof typeof SC_B06];

export interface B06ScenarioSpec {
  id: B06Scenario;
  excludes?: B06Scenario[];
}

const S = SC_B06;
export const B06_SCENARIOS: B06ScenarioSpec[] = [
  { id: S.FRESH_CLEAR },
  { id: S.FRESH_THICK },
  { id: S.FRESH_BUBBLES },
  { id: S.BUCCAL_SPARSE, excludes: [S.BUCCAL_CLUMPED] },
  { id: S.BUCCAL_CLUMPED, excludes: [S.BUCCAL_SPARSE] },
  { id: S.BUCCAL_STAINED },
  { id: S.EL_STATIC, excludes: [S.EL_LIVE] },
  { id: S.EL_LIVE, excludes: [S.EL_STATIC] },
  { id: S.TRADES_STOMATA, excludes: [S.TRADES_BLUR] },
  { id: S.TRADES_BLUR, excludes: [S.TRADES_STOMATA] },
  { id: S.EUG_VISIBLE },
  { id: S.EUG_MOTILITY },
  { id: S.PAR_MOTILITY },
  { id: S.PAR_FINE },
  { id: S.PROT_METHYL },
  { id: S.BACT_FIXED, excludes: [S.BACT_IMMERSION] },
  { id: S.BACT_IMMERSION, excludes: [S.BACT_FIXED] },
  { id: S.CYANO_OPTION },
  { id: S.BLOOD_OVERVIEW, excludes: [S.BLOOD_DIFFERENTIAL, S.BLOOD_LOWCONTRAST] },
  { id: S.BLOOD_DIFFERENTIAL, excludes: [S.BLOOD_OVERVIEW, S.BLOOD_LOWCONTRAST] },
  { id: S.BLOOD_LOWCONTRAST, excludes: [S.BLOOD_OVERVIEW, S.BLOOD_DIFFERENTIAL] },
  { id: S.METROLOGY, excludes: [S.NO_SCALE] },
  { id: S.NO_SCALE, excludes: [S.METROLOGY] },
  { id: S.MIXED_UNKNOWN },
  { id: S.ONLY_ADMIN, excludes: [S.TEACHER_OVERRIDE] },
  { id: S.TEACHER_OVERRIDE, excludes: [S.ONLY_ADMIN] },
  { id: S.ACCESSIBILITY },
  { id: S.RESOURCE_OUTAGE },
];

/** Escenarios compatibles: al pedir uno incompatible con otro ya elegido, gana el primero. */
export function validScenariosB06(list: string[]): B06Scenario[] {
  const known = new Set<string>(B06_SCENARIOS.map((s) => s.id));
  const out: B06Scenario[] = [];
  for (const s of list) {
    if (!known.has(s) || out.includes(s as B06Scenario)) continue;
    const spec = B06_SCENARIOS.find((x) => x.id === s)!;
    if (out.some((o) => spec.excludes?.includes(o) || B06_SCENARIOS.find((x) => x.id === o)?.excludes?.includes(spec.id))) continue;
    out.push(s as B06Scenario);
  }
  return out;
}

export interface SimulatedErrorB06 {
  code: string;
  group: 'safety' | 'prep' | 'optics' | 'protists' | 'fixed' | 'notebook' | 'asset';
  kind: 'err' | 'nb' | 'asset';
  trigger: string;
  effect: string;
  evidenceKey: string;
  feedbackKey: string;
}

/** 75 entradas: errores del mundo (`err`), de la libreta (`nb`) e incidencias de recursos que nunca descuentan (`asset`). */
export const SIMULATED_ERRORS_B06: SimulatedErrorB06[] = [
  { code: 'CEL-001', group: 'safety', kind: 'err', trigger: 'Tomar material sin el EPP completo', effect: 'Manipulación bloqueada; seguridad sin acreditar', evidenceKey: 'err:CEL-001', feedbackKey: 'b06fb.CEL-001' },
  { code: 'CEL-002', group: 'safety', kind: 'err', trigger: 'Apoyar portaobjetos o muestra en la zona sin desinfectar', effect: 'Vidrio y montaje contaminados', evidenceKey: 'err:CEL-002', feedbackKey: 'b06fb.CEL-002' },
  { code: 'CEL-003', group: 'safety', kind: 'err', trigger: 'Montar el portaobjetos rajado', effect: 'Montaje rechazado; va al contenedor de vidrio', evidenceKey: 'err:CEL-003', feedbackKey: 'b06fb.CEL-003' },
  { code: 'CEL-004', group: 'safety', kind: 'err', trigger: 'Cambiar de estación con el bisturí en la mano', effect: 'Riesgo persistente hasta depositarlo', evidenceKey: 'err:CEL-004', feedbackKey: 'b06fb.CEL-004' },
  { code: 'CEL-005', group: 'safety', kind: 'err', trigger: 'Pedir sangre fresca con lanceta', effect: 'Bloqueo; se ofrece el frotis preparado', evidenceKey: 'err:CEL-005', feedbackKey: 'b06fb.CEL-005' },
  { code: 'CEL-006', group: 'safety', kind: 'err', trigger: 'Abrir el cultivo de B. cereus', effect: 'Bloqueo por bioseguridad; usar la lámina permanente', evidenceKey: 'err:CEL-006', feedbackKey: 'b06fb.CEL-006' },
  { code: 'CEL-007', group: 'safety', kind: 'err', trigger: 'Verter líquido sobre el microscopio', effect: 'Derrame, luz cortada y bloqueo eléctrico hasta secarlo', evidenceKey: 'err:CEL-007', feedbackKey: 'b06fb.CEL-007' },
  { code: 'CEL-008', group: 'safety', kind: 'err', trigger: 'Vidrio roto o hisopo en residuos comunes', effect: 'Recuperación obligatoria al contenedor correcto', evidenceKey: 'err:CEL-008', feedbackKey: 'b06fb.CEL-008' },
  { code: 'CEL-009', group: 'safety', kind: 'err', trigger: 'Forzar un mando más allá de su tope', effect: 'Movimiento recortado y aviso de daño', evidenceKey: 'err:CEL-009', feedbackKey: 'b06fb.CEL-009' },
  { code: 'CEL-010', group: 'safety', kind: 'err', trigger: 'Cerrar con la luz encendida', effect: 'Cierre no acreditado hasta apagar', evidenceKey: 'err:CEL-010', feedbackKey: 'b06fb.CEL-010' },
  { code: 'CEL-011', group: 'prep', kind: 'err', trigger: 'Epidermis separada demasiado gruesa', effect: 'Capas superpuestas: los estomas no se distinguen', evidenceKey: 'err:CEL-011', feedbackKey: 'b06fb.CEL-011' },
  { code: 'CEL-012', group: 'prep', kind: 'err', trigger: 'Muestra lejos del centro del portaobjetos', effect: 'Región buscada fuera del campo inicial', evidenceKey: 'err:CEL-012', feedbackKey: 'b06fb.CEL-012' },
  { code: 'CEL-013', group: 'prep', kind: 'err', trigger: 'Usar el portaobjetos con restos previos', effect: 'Artefactos sobre la imagen', evidenceKey: 'err:CEL-013', feedbackKey: 'b06fb.CEL-013' },
  { code: 'CEL-014', group: 'prep', kind: 'err', trigger: 'Montaje fresco sin agua', effect: 'La muestra se seca; la captura no vale', evidenceKey: 'err:CEL-014', feedbackKey: 'b06fb.CEL-014' },
  { code: 'CEL-015', group: 'prep', kind: 'err', trigger: 'Exceso de agua en el montaje', effect: 'Derrame y cubreobjetos flotante', evidenceKey: 'err:CEL-015', feedbackKey: 'b06fb.CEL-015' },
  { code: 'CEL-016', group: 'prep', kind: 'err', trigger: 'Cubreobjetos bajado plano o deprisa', effect: 'Burbujas que tapan regiones', evidenceKey: 'err:CEL-016', feedbackKey: 'b06fb.CEL-016' },
  { code: 'CEL-017', group: 'prep', kind: 'err', trigger: 'Presionar el cubreobjetos hasta romperlo', effect: 'Vidrio roto y montaje perdido', evidenceKey: 'err:CEL-017', feedbackKey: 'b06fb.CEL-017' },
  { code: 'CEL-018', group: 'prep', kind: 'err', trigger: 'Frotis bucal amontonado', effect: 'Células superpuestas sin contornos', evidenceKey: 'err:CEL-018', feedbackKey: 'b06fb.CEL-018' },
  { code: 'CEL-019', group: 'prep', kind: 'err', trigger: 'Gota o cubreobjetos sobre una lámina permanente', effect: 'Lámina contaminada; limpieza', evidenceKey: 'err:CEL-019', feedbackKey: 'b06fb.CEL-019' },
  { code: 'CEL-020', group: 'prep', kind: 'err', trigger: 'Etiqueta o cultivo de protista intercambiado', effect: 'Identidad en discrepancia', evidenceKey: 'err:CEL-020', feedbackKey: 'b06fb.CEL-020' },
  { code: 'CEL-021', group: 'prep', kind: 'err', trigger: 'Marcar una burbuja como célula', effect: 'Región sin estructura biológica', evidenceKey: 'err:CEL-021', feedbackKey: 'b06fb.CEL-021' },
  { code: 'CEL-022', group: 'prep', kind: 'err', trigger: 'Arrastrar el cubreobjetos sobre la muestra viva', effect: 'Organismos dañados y menos viables', evidenceKey: 'err:CEL-022', feedbackKey: 'b06fb.CEL-022' },
  { code: 'CEL-023', group: 'optics', kind: 'err', trigger: 'Introducir la lámina con la pinza cerrada', effect: 'Acople rechazado', evidenceKey: 'err:CEL-023', feedbackKey: 'b06fb.CEL-023' },
  { code: 'CEL-024', group: 'optics', kind: 'err', trigger: 'Mover la platina con la lámina suelta', effect: 'La lámina se desplaza', evidenceKey: 'err:CEL-024', feedbackKey: 'b06fb.CEL-024' },
  { code: 'CEL-025', group: 'optics', kind: 'err', trigger: 'Empezar a 40X sin localizar', effect: 'Campo reducido y búsqueda a ciegas', evidenceKey: 'err:CEL-025', feedbackKey: 'b06fb.CEL-025' },
  { code: 'CEL-026', group: 'optics', kind: 'err', trigger: 'Capturar a 100X sin aceite', effect: 'Imagen degradada; no se acredita', evidenceKey: 'err:CEL-026', feedbackKey: 'b06fb.CEL-026' },
  { code: 'CEL-027', group: 'optics', kind: 'err', trigger: 'Aceite en contacto con el 40X seco', effect: 'Lente contaminada hasta limpiarla', evidenceKey: 'err:CEL-027', feedbackKey: 'b06fb.CEL-027' },
  { code: 'CEL-028', group: 'optics', kind: 'err', trigger: 'Acercar la platina hasta el contacto', effect: 'Choque o riesgo de choque', evidenceKey: 'err:CEL-028', feedbackKey: 'b06fb.CEL-028' },
  { code: 'CEL-029', group: 'optics', kind: 'err', trigger: 'Macrométrico hacia la lámina con el 100X', effect: 'Maniobra bloqueada', evidenceKey: 'err:CEL-029', feedbackKey: 'b06fb.CEL-029' },
  { code: 'CEL-030', group: 'optics', kind: 'err', trigger: 'Revólver fuera de enclavamiento', effect: 'Campo oscuro; observación inválida', evidenceKey: 'err:CEL-030', feedbackKey: 'b06fb.CEL-030' },
  { code: 'CEL-031', group: 'optics', kind: 'err', trigger: 'Capturar con la luz apagada', effect: 'Sin lectura visual', evidenceKey: 'err:CEL-031', feedbackKey: 'b06fb.CEL-031' },
  { code: 'CEL-032', group: 'optics', kind: 'err', trigger: 'Diafragma demasiado abierto', effect: 'Imagen lavada, menos contraste', evidenceKey: 'err:CEL-032', feedbackKey: 'b06fb.CEL-032' },
  { code: 'CEL-033', group: 'optics', kind: 'err', trigger: 'Diafragma demasiado cerrado', effect: 'Imagen oscura y difusa', evidenceKey: 'err:CEL-033', feedbackKey: 'b06fb.CEL-033' },
  { code: 'CEL-034', group: 'optics', kind: 'err', trigger: 'Subir de aumento sin centrar', effect: 'La región sale del campo', evidenceKey: 'err:CEL-034', feedbackKey: 'b06fb.CEL-034' },
  { code: 'CEL-035', group: 'optics', kind: 'err', trigger: 'Capturar sin foco', effect: 'La observación no se acredita', evidenceKey: 'err:CEL-035', feedbackKey: 'b06fb.CEL-035' },
  { code: 'CEL-036', group: 'optics', kind: 'err', trigger: 'Retirar la lámina con la platina alta', effect: 'Retiro bloqueado hasta bajar', evidenceKey: 'err:CEL-036', feedbackKey: 'b06fb.CEL-036' },
  { code: 'CEL-037', group: 'optics', kind: 'nb', trigger: 'Confundir 40X de objetivo con 40X total', effect: 'Aumento de la libreta incoherente', evidenceKey: 'nb:CEL-037', feedbackKey: 'b06fb.CEL-037' },
  { code: 'CEL-038', group: 'optics', kind: 'err', trigger: 'Limpiar el objetivo con pañuelo', effect: 'Lente rayada; aviso de cuidado', evidenceKey: 'err:CEL-038', feedbackKey: 'b06fb.CEL-038' },
  { code: 'CEL-039', group: 'optics', kind: 'err', trigger: 'Pedir el 100X sin módulo de inmersión', effect: 'OBJECTIVE_UNAVAILABLE', evidenceKey: 'err:CEL-039', feedbackKey: 'b06fb.CEL-039' },
  { code: 'CEL-040', group: 'protists', kind: 'err', trigger: 'Cubrir sin metilcelulosa en la comparación', effect: 'Preparaciones no comparables', evidenceKey: 'err:CEL-040', feedbackKey: 'b06fb.CEL-040' },
  { code: 'CEL-041', group: 'protists', kind: 'err', trigger: 'Exceso de metilcelulosa', effect: 'Medio demasiado viscoso que interfiere', evidenceKey: 'err:CEL-041', feedbackKey: 'b06fb.CEL-041' },
  { code: 'CEL-042', group: 'protists', kind: 'err', trigger: 'Lugol antes de registrar la movilidad', effect: 'Observación viva invalidada', evidenceKey: 'err:CEL-042', feedbackKey: 'b06fb.CEL-042' },
  { code: 'CEL-043', group: 'protists', kind: 'nb', trigger: 'Glucógeno «confirmado» por Lugol en Euglena', effect: 'Conclusión incorrecta (paramilón)', evidenceKey: 'nb:CEL-043', feedbackKey: 'b06fb.CEL-043' },
  { code: 'CEL-044', group: 'protists', kind: 'err', trigger: 'Rotular un flagelo no validado', effect: 'Hallazgo sin respaldo', evidenceKey: 'err:CEL-044', feedbackKey: 'b06fb.CEL-044' },
  { code: 'CEL-045', group: 'protists', kind: 'err', trigger: 'Protistas inmóviles por manejo', effect: 'Motilidad sin acreditar; nueva preparación', evidenceKey: 'err:CEL-045', feedbackKey: 'b06fb.CEL-045' },
  { code: 'CEL-046', group: 'protists', kind: 'nb', trigger: 'Comparar velocidades sin videos equivalentes', effect: 'Comparación no evaluable', evidenceKey: 'nb:CEL-046', feedbackKey: 'b06fb.CEL-046' },
  { code: 'CEL-047', group: 'protists', kind: 'nb', trigger: 'Taxón de la libreta distinto del observado', effect: 'Incoherencia activo–libreta', evidenceKey: 'nb:CEL-047', feedbackKey: 'b06fb.CEL-047' },
  { code: 'CEL-048', group: 'protists', kind: 'err', trigger: 'Rotular cilios sobre un contorno borroso', effect: 'Estructura no validada', evidenceKey: 'err:CEL-048', feedbackKey: 'b06fb.CEL-048' },
  { code: 'CEL-049', group: 'protists', kind: 'err', trigger: 'Rotular una vacuola sobre una burbuja', effect: 'Marca fuera del organismo', evidenceKey: 'err:CEL-049', feedbackKey: 'b06fb.CEL-049' },
  { code: 'CEL-050', group: 'fixed', kind: 'err', trigger: 'Capturar una lámina no asignada', effect: 'Identidad distinta; tarea sin acreditar', evidenceKey: 'err:CEL-050', feedbackKey: 'b06fb.CEL-050' },
  { code: 'CEL-051', group: 'fixed', kind: 'err', trigger: 'Montar la lámina marcada como quebrada', effect: 'Carga bloqueada', evidenceKey: 'err:CEL-051', feedbackKey: 'b06fb.CEL-051' },
  { code: 'CEL-052', group: 'fixed', kind: 'err', trigger: 'No devolver una lámina permanente', effect: 'Cierre incompleto', evidenceKey: 'err:CEL-052', feedbackKey: 'b06fb.CEL-052' },
  { code: 'CEL-053', group: 'fixed', kind: 'err', trigger: 'Exceso de aceite y objetivo seco', effect: 'Lámina y lente con aceite', evidenceKey: 'err:CEL-053', feedbackKey: 'b06fb.CEL-053' },
  { code: 'CEL-054', group: 'fixed', kind: 'err', trigger: 'Rotular un nucléolo bacteriano', effect: 'Marca inválida: los procariotas no tienen nucléolo', evidenceKey: 'err:CEL-054', feedbackKey: 'b06fb.CEL-054' },
  { code: 'CEL-055', group: 'fixed', kind: 'err', trigger: 'Medir con una escala supuesta', effect: 'UNCALIBRATED_SCALE', evidenceKey: 'err:CEL-055', feedbackKey: 'b06fb.CEL-055' },
  { code: 'CEL-056', group: 'fixed', kind: 'err', trigger: 'Rotular un eritrocito como leucocito', effect: 'Rotulación incorrecta', evidenceKey: 'err:CEL-056', feedbackKey: 'b06fb.CEL-056' },
  { code: 'CEL-057', group: 'fixed', kind: 'err', trigger: 'Rotular una plaqueta como eritrocito', effect: 'Incoherente con el manifiesto', evidenceKey: 'err:CEL-057', feedbackKey: 'b06fb.CEL-057' },
  { code: 'CEL-058', group: 'fixed', kind: 'err', trigger: 'Nombrar un subtipo leucocitario no validado', effect: 'Hallazgo inventado', evidenceKey: 'err:CEL-058', feedbackKey: 'b06fb.CEL-058' },
  { code: 'CEL-059', group: 'fixed', kind: 'err', trigger: 'Dejar aceite en un objetivo o lámina', effect: 'Cierre bloqueado', evidenceKey: 'err:CEL-059', feedbackKey: 'b06fb.CEL-059' },
  { code: 'CEL-060', group: 'fixed', kind: 'err', trigger: 'Enjuagar el Wright sin tampón', effect: 'Contraste insuficiente', evidenceKey: 'err:CEL-060', feedbackKey: 'b06fb.CEL-060' },
  { code: 'CEL-061', group: 'notebook', kind: 'nb', trigger: 'Rotular un estoma como cloroplasto', effect: 'Anatomía vegetal incompatible', evidenceKey: 'nb:CEL-061', feedbackKey: 'b06fb.CEL-061' },
  { code: 'CEL-062', group: 'notebook', kind: 'nb', trigger: 'Velocidad a partir de una foto única', effect: 'Resultado no evaluable', evidenceKey: 'nb:CEL-062', feedbackKey: 'b06fb.CEL-062' },
  { code: 'CEL-063', group: 'notebook', kind: 'nb', trigger: 'Medida sin unidades', effect: 'Cálculo incompleto', evidenceKey: 'nb:CEL-063', feedbackKey: 'b06fb.CEL-063' },
  { code: 'CEL-064', group: 'notebook', kind: 'nb', trigger: 'Conversión mm→µm incorrecta', effect: 'Morfometría errónea', evidenceKey: 'nb:CEL-064', feedbackKey: 'b06fb.CEL-064' },
  { code: 'CEL-065', group: 'notebook', kind: 'nb', trigger: 'Responder sin captura propia', effect: 'Evidencia ausente', evidenceKey: 'nb:CEL-065', feedbackKey: 'b06fb.CEL-065' },
  { code: 'CEL-066', group: 'notebook', kind: 'nb', trigger: 'Presentar una inferencia como observación', effect: 'Visible e inferido confundidos', evidenceKey: 'nb:CEL-066', feedbackKey: 'b06fb.CEL-066' },
  { code: 'CEL-067', group: 'notebook', kind: 'nb', trigger: 'Captura de otro intento', effect: 'Evidencia no auténtica', evidenceKey: 'nb:CEL-067', feedbackKey: 'b06fb.CEL-067' },
  { code: 'CEL-068', group: 'notebook', kind: 'nb', trigger: 'Medida calibrada sin incertidumbre', effect: 'Criterio metrológico incompleto', evidenceKey: 'nb:CEL-068', feedbackKey: 'b06fb.CEL-068' },
  { code: 'CEL-069', group: 'notebook', kind: 'nb', trigger: 'Clasificar Paramecium como procariota (o al revés)', effect: 'Clasificación incorrecta', evidenceKey: 'nb:CEL-069', feedbackKey: 'b06fb.CEL-069' },
  { code: 'CEL-070', group: 'notebook', kind: 'nb', trigger: 'Fotosíntesis deducida del color', effect: 'Conclusión sin ensayo', evidenceKey: 'nb:CEL-070', feedbackKey: 'b06fb.CEL-070' },
  { code: 'CEL-071', group: 'notebook', kind: 'nb', trigger: 'Registro sin captura vinculada', effect: 'Registro incompleto', evidenceKey: 'nb:CEL-071', feedbackKey: 'b06fb.CEL-071' },
  { code: 'CEL-072', group: 'asset', kind: 'asset', trigger: 'Recurso docente ausente', effect: 'Incidencia de plataforma; sin descuento', evidenceKey: 'asset:unavailable', feedbackKey: 'b06fb.CEL-072' },
  { code: 'CEL-073', group: 'asset', kind: 'asset', trigger: 'Manifiesto sin calibración', effect: 'Medición no evaluable; sin descuento', evidenceKey: 'asset:unavailable', feedbackKey: 'b06fb.CEL-073' },
  { code: 'CEL-074', group: 'asset', kind: 'asset', trigger: 'Foto docente de otro objetivo', effect: 'Pregunta afectada excluida; sin descuento', evidenceKey: 'asset:unavailable', feedbackKey: 'b06fb.CEL-074' },
  { code: 'CEL-075', group: 'asset', kind: 'asset', trigger: 'Video sin escala temporal', effect: 'Velocidad no evaluable; sin descuento', evidenceKey: 'asset:unavailable', feedbackKey: 'b06fb.CEL-075' },
];

/** Prefijo de una incidencia → código: `scale:` CEL-073, `objective:` CEL-074, `video:` CEL-075; el resto, CEL-072. */
export function incidentCode(key: string): 'CEL-072' | 'CEL-073' | 'CEL-074' | 'CEL-075' {
  if (key.startsWith('scale:')) return 'CEL-073';
  if (key.startsWith('objective:')) return 'CEL-074';
  if (key.startsWith('video:')) return 'CEL-075';
  return 'CEL-072';
}
