/**
 * Escenarios docentes (§10) y catálogo de 40 errores simulables (§9). Contrato de cada error: `id`, `group`,
 * `trigger` (comando o predicado de libreta), `effect` (estado o sesgo calculado), `evidenceKey` (`err:Exx` en el
 * mundo o `nb:Exx` en la libreta), `feedbackKey` (`f11fb.Exx`), `recoverable` y `fixture` (prueba de integración).
 */
import { SF11 } from '../../simulation/f11-world/world';

export type F11Scenario = (typeof SF11)[keyof typeof SF11];
export const F11_SCENARIOS: F11Scenario[] = Object.values(SF11);

export interface SimulatedErrorF11 {
  id: string;
  group: 'EXPERIMENTAL' | 'INSTRUMENTATION';
  trigger: string;
  effect: string;
  evidenceKey: string;
  feedbackKey: string;
  recoverable: boolean;
  fixture: string;
  safety?: boolean;
}

const e = (n: number, group: SimulatedErrorF11['group'], src: 'err' | 'nb', trigger: string, effect: string, recoverable = true, safety = false): SimulatedErrorF11 => {
  const id = `E${String(n).padStart(2, '0')}`;
  return { id: `F11-${id}`, group, trigger, effect, evidenceKey: `${src}:${id}`, feedbackKey: `f11fb.${id}`, recoverable, fixture: `f11-flow:${id}`, safety };
};

export const SIMULATED_ERRORS_F11: SimulatedErrorF11[] = [
  // 20 errores experimentales específicos
  e(1, 'EXPERIMENTAL', 'err', 'leer la sonda manométrica sin fijar el cero en el aire o en la superficie (o con la membrana sumergida)', 'la curva p(h) queda con el intercepto desplazado'),
  e(2, 'EXPERIMENTAL', 'nb', 'medir h desde el fondo en lugar de desde la superficie', 'el gradiente de presión sale con signo invertido'),
  e(3, 'EXPERIMENTAL', 'err', 'dejar una burbuja atrapada en la membrana', 'lectura más baja y respuesta lenta (τ ≈ 4 s)'),
  e(4, 'EXPERIMENTAL', 'err', 'llevar la sonda contra la pared del tanque', 'la membrana se apoya: no mide el fluido libre'),
  e(5, 'EXPERIMENTAL', 'err', 'cambiar de líquido sin vaciar el tanque', 'se mide una mezcla de densidad intermedia'),
  e(6, 'EXPERIMENTAL', 'nb', 'usar la lectura de la sonda absoluta sin restar la presión de la superficie', 'presiones con un desplazamiento de ~101 kPa'),
  e(7, 'EXPERIMENTAL', 'nb', 'tomar el bloque parcialmente sumergido como si estuviera completo', 'empuje previsto exagerado'),
  e(8, 'EXPERIMENTAL', 'err', 'bajar el bloque del dinamómetro hasta apoyarlo en el fondo del vaso', 'el apoyo modifica el peso aparente'),
  e(9, 'EXPERIMENTAL', 'err', 'soltar un objeto con el hilo atado y tenso', 'el hilo le impide flotar o hundirse libremente'),
  e(10, 'EXPERIMENTAL', 'err', 'pesar el colector o la probeta sin tararlos vacíos', 'la masa del recipiente entra en la del líquido'),
  e(11, 'EXPERIMENTAL', 'err', 'confundir derrame y rebose: no cebar el vaso, rebosar sin colector o desbordar el tanque', 'el balance de agua desplazada no cierra (el derrame del tanque bloquea el puesto)', true, true),
  e(12, 'EXPERIMENTAL', 'err', 'tomar datos con oleaje (vertido, agitador u objeto recién soltado)', 'presión y nivel transitorios, no hidrostáticos'),
  e(13, 'EXPERIMENTAL', 'nb', 'usar la masa del objeto como si fuera su densidad', 'la predicción de flotación queda equivocada'),
  e(14, 'EXPERIMENTAL', 'err', 'cambiar la densidad del tanque a mitad de una serie sin abrir una nueva', 'la serie mezcla dos líquidos'),
  e(15, 'EXPERIMENTAL', 'err', 'soltar un objeto encima de otro', 'el contacto transmite fuerza: ninguno flota libre'),
  e(16, 'EXPERIMENTAL', 'nb', 'escribir el empuje como peso aparente menos peso real', 'F_b con signo negativo'),
  e(17, 'EXPERIMENTAL', 'err', 'soltar el objeto fuera del tanque', 'cae a la mesada y no desplaza líquido'),
  e(18, 'EXPERIMENTAL', 'nb', 'ajustar p = ρ g h sobre un perfil estratificado', 'la densidad calculada no describe el líquido'),
  e(19, 'EXPERIMENTAL', 'err', 'leer mientras el cuerpo todavía se mueve', 'la inercia altera la tensión o el calado'),
  e(20, 'EXPERIMENTAL', 'err', 'cerrar el puesto con objetos en el tanque o sobre la mesada', 'el inventario y el volumen inicial quedan mal para la siguiente prueba'),
  // 20 errores de instrumentación, registro o montaje
  e(21, 'INSTRUMENTATION', 'err', 'leer el dinamómetro, la balanza o la guía de inmersión sin cero', 'cada lectura incorpora el sesgo de origen'),
  e(22, 'INSTRUMENTATION', 'err', 'dejar la sonda en el rango de 2 kPa a más de 20 cm', 'la señal satura (clipped): p subestimada'),
  e(23, 'INSTRUMENTATION', 'err', 'leer la sonda sin conectarla al registrador', 'no hay señal: la etapa no se acredita'),
  e(24, 'INSTRUMENTATION', 'err', 'registrar a menos de 20 Hz', 'menos muestras promediadas: más ruido y oleaje sin filtrar'),
  e(25, 'INSTRUMENTATION', 'err', 'leer la escala de nivel con el carro de la guía delante', 'se lee el borde del carro: +4 mm'),
  e(26, 'INSTRUMENTATION', 'err', 'dejar el dinamómetro inclinado respecto de la vertical', 'mide T cos α'),
  e(27, 'INSTRUMENTATION', 'err', 'usar la sonda sin calibrar su pendiente en el puerto patrón', 'p multiplicada por su factor de escala'),
  e(28, 'INSTRUMENTATION', 'err', 'dejar la guía de la sonda sin trabar', 'la varilla baja sola: la cota cambia sin que se note'),
  e(29, 'INSTRUMENTATION', 'err', 'leer una escala con la vista oblicua', 'error de paralaje'),
  e(30, 'INSTRUMENTATION', 'err', 'leer antes de que la sonda, el dinamómetro o el pico del vaso se estabilicen', 'valor transitorio tomado como estacionario'),
  e(31, 'INSTRUMENTATION', 'nb', 'dato bruto escrito a mano en lugar de importarlo de una lectura', 'sin procedencia: dato no observado'),
  e(32, 'INSTRUMENTATION', 'err', 'cambiar la configuración de la sonda con una serie empezada', 'la serie mezcla dos condiciones'),
  e(33, 'INSTRUMENTATION', 'nb', 'presión y cota (o peso e inmersión) de ensayos distintos en la misma fila', 'datos de otro ensayo'),
  e(34, 'INSTRUMENTATION', 'nb', 'conversión kPa → Pa, cm → m o cm³ → m³ errónea', 'resultado en escala incorrecta'),
  e(35, 'INSTRUMENTATION', 'nb', 'h redondeada al centímetro antes de calcular', 'sesgo por truncamiento'),
  e(36, 'INSTRUMENTATION', 'nb', 'pendiente calculada como h frente a p', 'se informa 1/(ρ g)'),
  e(37, 'INSTRUMENTATION', 'nb', 'menos de cinco profundidades por líquido (o de cuatro inmersiones)', 'tendencia y repetibilidad no sustentadas'),
  e(38, 'INSTRUMENTATION', 'nb', 'u escrita menor que la tipo B de los instrumentos', 'intervalo subestimado'),
  e(39, 'INSTRUMENTATION', 'err', 'seguir midiendo tras golpear la membrana contra el fondo', 'la sonda golpeada no describe el modelo ideal'),
  e(40, 'INSTRUMENTATION', 'err', 'cerrar el puesto con llaves abiertas, el agitador encendido o el bloque colgado', 'queda flujo o carga: el cierre se bloquea'),
];

/** Clave corta (E01…E40), que también es la clave de retroalimentación `f11fb.Exx`. */
export const errKeyF11 = (x: SimulatedErrorF11) => x.evidenceKey.replace(/^(err|nb):/, '');
