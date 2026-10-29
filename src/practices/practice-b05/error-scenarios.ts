/**
 * Escenarios docentes (§10) y catálogo de errores simulables (§9) de la práctica B05, con su contrato: código, grupo,
 * hecho que lo provoca, consecuencia que REALMENTE cambia el estado (o, en `nb:*`, que solo afecta la interpretación),
 * clave de evidencia y de retroalimentación. Los gestos de catalasa, amilasa, baños, pH y ADH se calculan en
 * `enz-world/world.ts`; los del microscopio (gránulos de almidón de papa) son los de B01/B02 traducidos por
 * `CODE_MAP_B05` al grupo MIC (adición de Quiklabs, BIO5-21); los de cálculo e interpretación (`nb:*`), en la libreta.
 * B05RES es una incidencia técnica del recurso: nunca descuenta (BIO5-20).
 */
import { ADH_SCENARIOS, SC_B05, type B05Scenario } from '../../simulation/enz-world/scenarios';

export type { B05Scenario };

export interface B05ScenarioSpec {
  id: B05Scenario;
  excludes?: B05Scenario[];
}

export const B05_SCENARIOS: B05ScenarioSpec[] = [
  { id: SC_B05.IDEAL },
  { id: SC_B05.LOW_ACTIVITY, excludes: [SC_B05.FAST_CATALASE] },
  { id: SC_B05.OTHER_LOT },
  { id: SC_B05.OLD_PEROXIDE },
  { id: SC_B05.COLLECTOR_LEAK },
  { id: SC_B05.COLLECTOR_BIAS },
  { id: SC_B05.BATH_INERTIA },
  { id: SC_B05.BATH_OFFSET },
  { id: SC_B05.PREHEATED },
  { id: SC_B05.PH_EXTREME },
  { id: SC_B05.STRIPS_COARSE },
  { id: SC_B05.WEAK_BUFFER },
  { id: SC_B05.PIPETTE_BUBBLE },
  { id: SC_B05.AMBIGUOUS_LABELS, excludes: [SC_B05.BLIND] },
  { id: SC_B05.FOAM },
  { id: SC_B05.FAST_CATALASE, excludes: [SC_B05.LOW_ACTIVITY] },
  { id: SC_B05.AMYLASE_LOW, excludes: [SC_B05.AMYLASE_HIGH] },
  { id: SC_B05.AMYLASE_HIGH, excludes: [SC_B05.AMYLASE_LOW] },
  { id: SC_B05.PIGMENTED_STARCH },
  { id: SC_B05.BENEDICT_IRREGULAR },
  { id: SC_B05.AMYLASE_UNKNOWN },
  { id: SC_B05.BLIND, excludes: [SC_B05.AMBIGUOUS_LABELS] },
  // El módulo ADH solo se habilita con constantes, controles y UV validados; sin curva UV (SC26) no se asigna (§13).
  { id: SC_B05.ADH_NAD_LIMIT, excludes: [SC_B05.NO_UV_CURVE] },
  { id: SC_B05.ADH_COMPETITOR, excludes: [SC_B05.NO_UV_CURVE] },
  { id: SC_B05.UV_NO_BLANK, excludes: [SC_B05.NO_UV_CURVE] },
  { id: SC_B05.NO_UV_CURVE, excludes: ADH_SCENARIOS },
  { id: SC_B05.INHIBITION_MODEL, excludes: [SC_B05.NO_UV_CURVE] },
  { id: SC_B05.TONGS_MISPLACED },
];

/** Escenarios compatibles: al pedir uno incompatible con otro ya elegido, gana el primero. */
export function validScenariosB05(list: string[]): B05Scenario[] {
  const known = new Set<string>(B05_SCENARIOS.map((s) => s.id));
  const out: B05Scenario[] = [];
  for (const s of list) {
    if (!known.has(s) || out.includes(s as B05Scenario)) continue;
    const spec = B05_SCENARIOS.find((x) => x.id === s)!;
    if (out.some((o) => spec.excludes?.includes(o) || B05_SCENARIOS.find((x) => x.id === o)?.excludes?.includes(spec.id))) continue;
    out.push(s as B05Scenario);
  }
  return out;
}

/** Rutas docentes (§10): perfiles que fijan qué escenarios empiezan activos (no sustituyen el modo). */
export const B05_ROUTES: Record<'core' | 'inquiry' | 'kinetics' | 'advancedADH', B05Scenario[]> = {
  core: [SC_B05.IDEAL],
  inquiry: [SC_B05.BLIND, SC_B05.COLLECTOR_LEAK, SC_B05.BATH_INERTIA, SC_B05.AMYLASE_LOW],
  kinetics: [SC_B05.FAST_CATALASE, SC_B05.INHIBITION_MODEL],
  advancedADH: [SC_B05.ADH_NAD_LIMIT, SC_B05.ADH_COMPETITOR, SC_B05.UV_NO_BLANK],
};

export type B05ErrorGroup = 'setup' | 'catalase' | 'thermoPh' | 'amylase' | 'adh' | 'analysis' | 'safety' | 'prep' | 'microscopy';

export interface SimulatedErrorB05 {
  code: string;
  group: B05ErrorGroup;
  trigger: string;
  worldConsequence: string;
  /** `err:<código>` (hecho del mundo) o `nb:<código>` (libreta contrastada con las lecturas propias). */
  evidenceKey: string;
  feedbackKey: string;
}

const E = (code: string, group: B05ErrorGroup, trigger: string, worldConsequence: string, nb = false): SimulatedErrorB05 => ({
  code, group, trigger, worldConsequence, evidenceKey: `${nb ? 'nb' : 'err'}:${code}`, feedbackKey: `b05fb.${code}`,
});
const NB = 'solo cálculo/interpretación: no altera la química del intento';

/** 95 errores de la especificación, 6 del microscopio (MIC, BIO5-21) y la incidencia sin culpa B05RES. */
export const SIMULATED_ERRORS_B05: SimulatedErrorB05[] = [
  // ── Montaje (M01–M12) ──
  E('M01', 'setup', 'Rótulos de catalasa y blanco intercambiados', 'el tubo rotulado «blanco» tiene tejido y el de catalasa no: la curva queda asociada al tubo equivocado'),
  E('M02', 'setup', 'Comparar sin blanco de reactivos', NB, true),
  E('M03', 'setup', 'Usar la misma alícuota como blanco y como ensayo', NB, true),
  E('M04', 'setup', 'Medir con probeta un volumen que pide pipeta', 'la probeta entrega con su resolución (±0,5 mL): concentración menos determinada'),
  E('M05', 'setup', 'Aspirar con burbuja', 'el volumen entregado es menor que el indicado (aire en la pipeta)'),
  E('M06', 'setup', 'Tomar del lote sin volver a homogeneizar', 'la alícuota lleva menos sólido que el promedio del lote (sedimentado)'),
  E('M07', 'setup', 'Reusar un gotero con la punta contaminada', 'el gotero arrastra almidón/azúcar del tubo anterior al siguiente'),
  E('M08', 'setup', 'Verter fuera del tubo', 'el reactivo va a la mesada: menos sustancia en el tubo y más derrame'),
  E('M09', 'setup', 'Agua del gotero equivocado sobre una mezcla de ensayo', 'la mezcla queda más diluida que lo planeado'),
  E('M10', 'setup', 'Recipiente con residuo de un ensayo previo', 'la película del contenido anterior pasa al nuevo (indicador, enzima o pH)'),
  E('M11', 'setup', 'Leer un volumen con paralaje', 'la cifra registrada difiere del menisco real según el ángulo del ojo'),
  E('M12', 'setup', 'Manipular sin el EPP requerido', 'se bloquea el acceso a los reactivos activos'),
  // ── Catalasa (C01–C16) ──
  E('C01', 'catalase', 'Menos tejido en un tubo comparado que en la línea base', 'menos catalasa en el tubo: menor producción de gas'),
  E('C02', 'catalase', 'Tejido de otro lote', 'otra carga de catalasa por masa: velocidad diferente'),
  E('C03', 'catalase', 'Tejido previamente calentado', 'fracción de catalasa activa menor desde el inicio'),
  E('C04', 'catalase', 'Peróxido del frasco degradado', 'menos H₂O₂ efectivo y menor gas máximo'),
  E('C05', 'catalase', 'Agregar el peróxido antes de iniciar el cronómetro', 'el reloj registra tarde: se pierde el tramo inicial de la curva'),
  E('C06', 'catalase', 'Reacción con el captador desconectado', 'el O₂ va al ambiente (venteado), no al colector'),
  E('C07', 'catalase', 'Captador montado con fuga parcial', 'solo una fracción del gas llega al colector'),
  E('C08', 'catalase', 'Usar la altura de espuma como volumen de gas', NB, true),
  E('C09', 'catalase', 'Agitar con distinta fuerza los tubos comparados', 'distinta liberación de O₂ disuelto y espuma entre tubos'),
  E('C10', 'catalase', 'Tapar el tubo sin salida cuando hay gas', 'sobrepresión: se abre el alivio y el gas se pierde; bloqueo de seguridad'),
  E('C11', 'catalase', 'Segunda adición de peróxido sin registrar', 'más sustrato total y gas máximo superior'),
  E('C12', 'catalase', 'Derramar parte del extracto fuera del tubo', 'enzima disponible menor; el material va a la mesada'),
  E('C13', 'catalase', 'Una sola lectura de gas', NB, true),
  E('C14', 'catalase', 'Comparar tasas sin normalizar por masa de tejido', NB, true),
  E('C15', 'catalase', 'Colector saturado', 'la lectura queda truncada en 50 mL aunque siga la liberación'),
  E('C16', 'catalase', 'Retirar mezcla después de iniciada la reacción', 'volumen y sustrato salen del sistema: la curva se altera'),
  // ── Temperatura y pH (T01–T12) ──
  E('T01', 'thermoPh', 'Iniciar la reacción con el baño sin estabilizar', 'la temperatura efectiva difiere de la consigna'),
  E('T02', 'thermoPh', 'Tubo sumergido solo en parte', 'temperatura intermedia y desigual en el tubo'),
  E('T03', 'thermoPh', 'Anotar la temperatura del baño como la de la muestra', NB, true),
  E('T04', 'thermoPh', 'Exponer la enzima a temperatura dañina demasiado tiempo', 'fracción activa reducida de forma irreversible'),
  E('T05', 'thermoPh', 'Declarar recuperada una muestra desnaturalizada al enfriarla', NB, true),
  E('T06', 'thermoPh', 'Más ácido que el tratamiento asignado', 'pH efectivo menor y otra velocidad'),
  E('T07', 'thermoPh', 'Más base que el tratamiento asignado', 'pH efectivo mayor y otra velocidad'),
  E('T08', 'thermoPh', 'Medir pH con una tira ya usada', 'color interferido: la lectura queda marcada como incierta'),
  E('T09', 'thermoPh', 'Iniciar sin homogeneizar el pH', 'zonas con pH distinto: actividad desigual en el tubo'),
  E('T10', 'thermoPh', 'Atribuir al pH una diferencia con temperaturas distintas', NB, true),
  E('T11', 'thermoPh', 'Apagar el baño antes de completar la incubación', 'la mezcla se enfría y la hidrólisis se retrasa'),
  E('T12', 'thermoPh', 'Benedict en la mezcla de incubación antes de alicuotar', 'el indicador consume poder reductor de toda la mezcla'),
  // ── Amilasa (A01–A16) ──
  E('A01', 'amylase', 'Omitir la amilasa del tubo activo', 'no hay hidrólisis catalizada: persiste el almidón'),
  E('A02', 'amylase', 'Olvidar el almidón', 'no hay sustrato: ensayos negativos o ambiguos'),
  E('A03', 'amylase', 'Almidón de otra concentración', 'otra saturación y otra señal'),
  E('A04', 'amylase', 'Iniciar el tiempo antes de agregar la amilasa', 'el cero de la curva no es el inicio real'),
  E('A05', 'amylase', 'Primera alícuota tardía', 'el punto inicial ya contiene producto'),
  E('A06', 'amylase', 'Alícuotas de volumen no equivalente', 'señales no comparables entre tiempos'),
  E('A07', 'amylase', 'Mismo tubo para Lugol y Benedict', 'el yodo interfiere con el revelado de Benedict'),
  E('A08', 'amylase', 'Confundir alícuotas de dos tiempos', NB, true),
  E('A09', 'amylase', 'Alícuota sin mezclar la incubación', 'muestra local: menos almidón en suspensión que el promedio'),
  E('A10', 'amylase', 'Poco Lugol', 'complejo débil aunque haya almidón'),
  E('A11', 'amylase', 'Demasiado Lugol', 'color saturado: se pierde la lectura semicuantitativa'),
  E('A12', 'amylase', 'Leer Benedict sin calentar lo suficiente', 'revelado incompleto: subestima los reductores'),
  E('A13', 'amylase', 'Sobrecalentar Benedict', 'evaporación y aspecto alterado'),
  E('A14', 'amylase', 'Sin control de almidón sin amilasa', NB, true),
  E('A15', 'amylase', 'Afirmar glucosa pura por Benedict', NB, true),
  E('A16', 'amylase', 'Afirmar hidrólisis completa por Lugol negativo', NB, true),
  // ── ADH opcional (H01–H10) ──
  E('H01', 'adh', 'Omitir NAD⁺', 'sin aceptor redox: no aparece NADH'),
  E('H02', 'adh', 'Leer A340 sin blanco UV', 'la absorbancia incluye el fondo de la matriz'),
  E('H03', 'adh', 'Cubeta que no transmite 340 nm', 'lectura UV inválida (bloqueo por incompatibilidad óptica)'),
  E('H04', 'adh', 'Cambiar el paso óptico sin declararlo', NB, true),
  E('H05', 'adh', 'Competidor en concentración distinta de la prescrita', 'la velocidad de la ADH cambia según el modelo competitivo'),
  E('H06', 'adh', 'Asumir inhibición total por el competidor', NB, true),
  E('H07', 'adh', 'Fehling como cuantificación selectiva de acetaldehído', NB, true),
  E('H08', 'adh', 'Yodoformo como medida exacta de etanol', NB, true),
  E('H09', 'adh', 'Comparar cubetas a temperaturas distintas', NB, true),
  E('H10', 'adh', 'Fehling rojo sin blanco de tejido', NB, true),
  // ── Análisis (N01–N12) ──
  E('N01', 'analysis', 'Tasa media de una ventana tardía como tasa inicial', NB, true),
  E('N02', 'analysis', 'Intercambiar segundos y minutos', NB, true),
  E('N03', 'analysis', 'Usar mL como L en PV = nRT', NB, true),
  E('N04', 'analysis', 'Balance de O₂ sin el gas venteado', NB, true),
  E('N05', 'analysis', 'Copiar resultados ideales ajenos al intento', NB, true),
  E('N06', 'analysis', 'Atribuir menos gas medido a menos catálisis pese a fugas', NB, true),
  E('N07', 'analysis', 'Mezclar normalización por mg de enzima con g de tejido', NB, true),
  E('N08', 'analysis', 'Omitir incertidumbre y resolución', NB, true),
  E('N09', 'analysis', 'Calcular aumento de actividad al enfriar una muestra inactivada', NB, true),
  E('N10', 'analysis', 'Identificar el mecanismo de inhibición con un solo punto', NB, true),
  E('N11', 'analysis', 'Confundir mmol con mol en la catalasa', NB, true),
  E('N12', 'analysis', 'No registrar tiempo ni temperatura', NB, true),
  // ── Seguridad (S01–S08) ──
  E('S01', 'safety', 'Llama abierta junto al etanol', 'acción impedida y bloqueo crítico'),
  E('S02', 'safety', 'Manipular metanol fuera del módulo autorizado', 'comando rechazado (RESTRICTED_METHANOL)'),
  E('S03', 'safety', 'Retirar un tubo caliente sin pinza', 'accidente térmico: el tubo cae con pérdidas; anula Seguridad'),
  E('S04', 'safety', 'Agitar con fuerza un tubo sobrellenado', 'derrame: se pierde muestra'),
  E('S05', 'safety', 'Residuos incompatibles en un contenedor', 'descarte rechazado: la mezcla queda en el recipiente'),
  E('S06', 'safety', 'Cerrar la llave del colector con la reacción en curso', 'sobrepresión: se activa el alivio y el gas se pierde'),
  E('S07', 'safety', 'Verter la solución cáustica directamente del frasco madre', 'acción impedida: se exige el gotero'),
  E('S08', 'safety', 'Entregar con una fuente térmica encendida', 'cierre incompleto'),
  // ── Preparaciones P1–P3 (PREP01–PREP09) ──
  E('PREP01', 'prep', 'Pesar distinto de 25,0 g de almidón', 'otra carga real del lote P1 y otra señal de Lugol/amilasa'),
  E('PREP02', 'prep', 'Agua distinta de 100,0 mL para el almidón', 'otra relación masa/agua del lote P1'),
  E('PREP03', 'prep', 'Almidón sin pastilla o sin agitación', 'grumos y sedimento: alícuotas heterogéneas'),
  E('PREP04', 'prep', 'P1 sin llegar a ~30 °C medidos', 'otra historia térmica; nunca se disuelve por completo'),
  E('PREP05', 'prep', 'Agitación muy rápida con la suspensión viscosa', 'la barra desliza, salpica y se pierde masa'),
  E('PREP06', 'prep', 'Fragmentos de hígado grandes o sin mezclar', 'menos catalasa accesible y curvas no comparables'),
  E('PREP07', 'prep', 'Agua ≠ 25,0 mL o calefacción encendida con el hígado', 'extracto más diluido o con actividad perdida por calor'),
  E('PREP08', 'prep', 'Pesar distinto de 0,20 g de amilasa', 'otra dosis nominal de amilasa'),
  E('PREP09', 'prep', 'Agua ≠ 5,0 mL, sin agitar o amilasa contaminada', 'concentración o actividad del lote P3 sesgadas'),
  // ── Microscopio compartido (MIC01–MIC06, BIO5-21) ──
  E('MIC01', 'microscopy', 'Montaje de papa sin líquido o con exceso', 'la muestra se reseca o el cubreobjetos flota'),
  E('MIC02', 'microscopy', 'Cubreobjetos bajado bruscamente o presionado', 'burbujas o rotura: menos área visible'),
  E('MIC03', 'microscopy', 'Lámina con la pinza de la platina cerrada', 'colocación rechazada'),
  E('MIC04', 'microscopy', 'Enfocar con alto aumento o con el macrométrico a 40X', 'distancia de trabajo en zona peligrosa'),
  E('MIC05', 'microscopy', 'Objetivo contra la preparación', 'contacto dañino y bloqueo de seguridad'),
  E('MIC06', 'microscopy', 'Cerrar sin volver al objetivo de bajo aumento', 'estado inseguro del equipo al cierre'),
  { code: 'B05RES', group: 'safety', trigger: 'Recurso docente faltante o pendiente (curva UV, foto, sensor)', worldConsequence: 'aviso e ítem excluido sin descuento; nunca err:*', evidenceKey: 'incident:B05RES', feedbackKey: 'b05fb.B05RES' },
];

/** Códigos cuya evidencia vive en la libreta (interpretación y cálculo contrastados con las lecturas propias). */
export const NOTEBOOK_CODES_B05 = SIMULATED_ERRORS_B05.filter((e) => e.evidenceKey.startsWith('nb:')).map((e) => e.code);

export { SC_B05 };
