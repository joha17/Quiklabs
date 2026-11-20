/**
 * Escenarios docentes (§10) y catálogo de 40 errores simulables (§9). Contrato de cada error: `id`, `group`,
 * `trigger` (comando o predicado de libreta), `effect` (estado o sesgo calculado), `evidenceKey` (`err:Exx` en el
 * mundo o `nb:Exx` en la libreta), `feedbackKey` (`f10fb.Exx`), `recoverable` y `fixture` (prueba de integración).
 */
import { SF10 } from '../../simulation/f10-world/world';

export type F10Scenario = (typeof SF10)[keyof typeof SF10];
export const F10_SCENARIOS: F10Scenario[] = Object.values(SF10);

export interface SimulatedErrorF10 {
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

const e = (n: number, group: SimulatedErrorF10['group'], src: 'err' | 'nb', trigger: string, effect: string, recoverable = true, safety = false): SimulatedErrorF10 => {
  const id = `E${String(n).padStart(2, '0')}`;
  return { id: `F10-${id}`, group, trigger, effect, evidenceKey: `${src}:${id}`, feedbackKey: `f10fb.${id}`, recoverable, fixture: `f10-flow:${id}`, safety };
};

export const SIMULATED_ERRORS_F10: SimulatedErrorF10[] = [
  // 20 errores experimentales específicos
  e(1, 'EXPERIMENTAL', 'err', 'leer las reacciones con la viga sin asentar en los filos', 'el peso se reparte mal entre los apoyos (±12 % del peso)'),
  e(2, 'EXPERIMENTAL', 'err', 'colgar la carga fuera de la zona apoyada (o juntar los apoyos) hasta que una reacción saldría negativa', 'la viga vuelca sobre el otro filo y golpea el tope; el ensayo queda bloqueado', true, true),
  e(3, 'EXPERIMENTAL', 'nb', 'predecir R_B sin el peso propio de la viga', 'reacción subestimada'),
  e(4, 'EXPERIMENTAL', 'nb', 'medir los brazos desde el extremo de la viga y no desde el apoyo A', 'torques mal calculados'),
  e(5, 'EXPERIMENTAL', 'err', 'leer el dinamómetro inclinado respecto de la vertical (≥ 3°)', 'mide W cos α, menor que el peso'),
  e(6, 'EXPERIMENTAL', 'err', 'sostener la viga con la mano mientras se leen las reacciones', 'la mano suma o resta fuerza: ΣF ≠ 0'),
  e(7, 'EXPERIMENTAL', 'err', 'colgar la carga con el gancho abierto', 'la carga se suelta y golpea la mesada; el ensayo queda bloqueado', true, true),
  e(8, 'EXPERIMENTAL', 'nb', 'escribir una reacción negativa en un apoyo que solo empuja', 'interpretación incorrecta: el apoyo no puede tirar'),
  e(9, 'EXPERIMENTAL', 'err', 'juntar los apoyos a menos de 3 cm', 'sistema mal condicionado: lecturas muy sensibles y ruidosas'),
  e(10, 'EXPERIMENTAL', 'nb', 'sumar los torques con el signo de las cargas invertido', 'Στ_A no da cero'),
  e(11, 'EXPERIMENTAL', 'err', 'montar el comparador transversal a la probeta', 'mide el cambio de diámetro (−ν ε d) en lugar del alargamiento'),
  e(12, 'EXPERIMENTAL', 'nb', 'calcular σ con el área en mm² tomada como m²', 'esfuerzo en escala incorrecta (×10⁶)'),
  e(13, 'EXPERIMENTAL', 'nb', 'usar una lectura con deformación plástica en la tabla elástica', 'E calculado fuera de la zona de Hooke'),
  e(14, 'EXPERIMENTAL', 'err', 'soltar la palanca de descarga rápida con la probeta cargada', 'descarga brusca: la probeta y el comparador vibran unos segundos'),
  e(15, 'EXPERIMENTAL', 'err', 'cargar con la probeta excéntrica en las mordazas', 'flexión: el comparador marca de más (1 + 8e/d)'),
  e(16, 'EXPERIMENTAL', 'err', 'recargar una probeta que ya fluyó como si fuera nueva', 'parte de una deformación residual: el ensayo no es de una probeta virgen'),
  e(17, 'EXPERIMENTAL', 'nb', 'intercambiar las columnas de σ y ε', 'la pendiente se informa invertida'),
  e(18, 'EXPERIMENTAL', 'err', 'leer el comparador con el travesaño todavía moviéndose', 'lectura con vibración'),
  e(19, 'EXPERIMENTAL', 'err', 'cerrar la segunda mordaza con el freno de la manivela puesto', 'la cuña precarga la probeta: el cero queda corrido'),
  e(20, 'EXPERIMENTAL', 'err', 'buscar el centro de masa en la cuña con la mesada inclinada', 'el punto de equilibrio se corre h tan θ'),
  // 20 errores de instrumentación, registro o montaje
  e(21, 'INSTRUMENTATION', 'err', 'leer el dinamómetro, los sensores de reacción, la celda o el comparador sin cero', 'cada lectura incorpora el sesgo de origen'),
  e(22, 'INSTRUMENTATION', 'err', 'dejar la celda de carga en el rango de 2 kN con cargas mayores', 'la señal satura (clipped): F subestimada'),
  e(23, 'INSTRUMENTATION', 'err', 'leer con un canal sin conectar', 'no hay señal de ese canal: la etapa no se acredita'),
  e(24, 'INSTRUMENTATION', 'err', 'registrar la curva a menos de 20 Hz', 'pocos puntos: el ajuste del tramo elástico pierde resolución'),
  e(25, 'INSTRUMENTATION', 'err', 'dejar el cable del comparador suelto con el protector cerrado', 'la puerta lo aprieta contra el vástago: +0,05 mm'),
  e(26, 'INSTRUMENTATION', 'err', 'montar el comparador inclinado respecto del eje', 'mide ΔL cos α'),
  e(27, 'INSTRUMENTATION', 'err', 'usar el comparador sin calibrar contra el bloque patrón', 'ΔL multiplicado por su factor de escala'),
  e(28, 'INSTRUMENTATION', 'err', 'cargar la viga con un apoyo sin trabar', 'el apoyo se corre: la luz cambia sin que se note'),
  e(29, 'INSTRUMENTATION', 'err', 'leer la cinta o el dinamómetro con la vista oblicua', 'error de paralaje'),
  e(30, 'INSTRUMENTATION', 'err', 'leer antes de que la viga o el dinamómetro dejen de oscilar', 'valor transitorio tomado como estático'),
  e(31, 'INSTRUMENTATION', 'nb', 'dato bruto escrito a mano en lugar de importarlo de una lectura', 'sin procedencia: dato no observado'),
  e(32, 'INSTRUMENTATION', 'err', 'cambiar el montaje con el registrador grabando', 'la curva mezcla dos condiciones'),
  e(33, 'INSTRUMENTATION', 'nb', 'reacciones y posición (o fuerza y alargamiento) de ensayos distintos en la misma fila', 'datos de otro ensayo'),
  e(34, 'INSTRUMENTATION', 'nb', 'conversión cm → m, mm → m o N → kN errónea', 'resultado en escala incorrecta'),
  e(35, 'INSTRUMENTATION', 'nb', 'ΔL redondeado a 0,01 mm antes de calcular ε', 'sesgo por truncamiento'),
  e(36, 'INSTRUMENTATION', 'nb', 'pendiente calculada como ε frente a σ', 'se informa 1/E'),
  e(37, 'INSTRUMENTATION', 'nb', 'menos de cinco puntos elásticos (o de tres posiciones de carga)', 'tendencia y repetibilidad no sustentadas'),
  e(38, 'INSTRUMENTATION', 'nb', 'u escrita menor que la tipo B de los instrumentos', 'intervalo subestimado'),
  e(39, 'INSTRUMENTATION', 'err', 'seguir midiendo tras un vuelco o una carga caída sin revisar la viga', 'el filo golpeado no describe el modelo ideal'),
  e(40, 'INSTRUMENTATION', 'err', 'cerrar el puesto con la probeta cargada, el travesaño moviéndose o la viga volcando', 'queda energía o movimiento: el cierre se bloquea'),
];

/** Clave corta (E01…E40), que también es la clave de retroalimentación `f10fb.Exx`. */
export const errKeyF10 = (x: SimulatedErrorF10) => x.evidenceKey.replace(/^(err|nb):/, '');
