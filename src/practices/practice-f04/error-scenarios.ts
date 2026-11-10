/**
 * Escenarios docentes (§10) y catálogo de 40 errores simulables (§9). Contrato de cada error: `id`, `group`,
 * `trigger` (comando o predicado de libreta), `effect` (estado o sesgo calculado), `evidenceKey` (`err:Exx` en el
 * mundo o `nb:Exx` en la libreta), `feedbackKey` (`f04fb.Exx`), `recoverable` y `fixture` (prueba de integración).
 */
import { SF4 } from '../../simulation/f04-world/world';

export type F04Scenario = (typeof SF4)[keyof typeof SF4];
export const F04_SCENARIOS: F04Scenario[] = Object.values(SF4);

export interface SimulatedErrorF04 {
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

const e = (n: number, group: SimulatedErrorF04['group'], src: 'err' | 'nb', trigger: string, effect: string, recoverable = true, safety = false): SimulatedErrorF04 => {
  const id = `E${String(n).padStart(2, '0')}`;
  return { id: `F04-${id}`, group, trigger, effect, evidenceKey: `${src}:${id}`, feedbackKey: `f04fb.${id}`, recoverable, fixture: `f04-flow:${id}`, safety };
};

export const SIMULATED_ERRORS_F04: SimulatedErrorF04[] = [
  // 20 errores experimentales específicos
  e(1, 'EXPERIMENTAL', 'nb', 'a_pred calculada con la masa del carro sola (m_h g / m_c)', 'aceleración teórica inflada'),
  e(2, 'EXPERIMENTAL', 'err', 'release con el carril inclinado > 0,15° (nivelado a ojo)', 'la aceleración incluye la componente del peso a lo largo del carril'),
  e(3, 'EXPERIMENTAL', 'err', 'release con el cordel flojo (portapesas sostenido)', 'el portapesas cae libre y tensa el cordel con un tirón'),
  e(4, 'EXPERIMENTAL', 'err', 'release con el cordel enredado en el eje de la polea', 'torque de roce extra: la aceleración baja'),
  e(5, 'EXPERIMENTAL', 'err', 'readRun con una ventana posterior al aterrizaje del portapesas', 'la tensión cae a cero y el carro sigue libre'),
  e(6, 'EXPERIMENTAL', 'nb', 'm_h escrita sin la masa del portapesas', 'a calculada con masa incorrecta'),
  e(7, 'EXPERIMENTAL', 'err', 'lectura con el sensor de fuerza montado perpendicular (≥ 60°)', 'la fuerza medida es casi nula (proyección)'),
  e(8, 'EXPERIMENTAL', 'err', 'readRun o readPair de una señal recortada', 'el pico de fuerza queda recortado al rango'),
  e(9, 'EXPERIMENTAL', 'err', 'pushCart: soltar empujando el carro con la mano', 'el impulso cambia v₀ y la ventana inicial'),
  e(10, 'EXPERIMENTAL', 'err', 'carro que golpea el tope a más de 0,3 m/s (freno apagado o mal ubicado)', 'fuerza impulsiva en la señal del ensayo'),
  e(11, 'EXPERIMENTAL', 'err', 'drawForce del peso en una dirección que no es hacia abajo', 'diagrama incoherente con el equilibrio vertical'),
  e(12, 'EXPERIMENTAL', 'err', 'drawForce de la fuerza que el cuerpo ejerce (o con él mismo como agente) en su propio diagrama', 'falsa cancelación de un par acción-reacción'),
  e(13, 'EXPERIMENTAL', 'err', 'readPair con los dos dinamómetros proyectados en el mismo sentido', 'F_PQ y F_QP con el mismo signo'),
  e(14, 'EXPERIMENTAL', 'nb', 'fila de masas cuya m_h no coincide con la carga del ensayo importado', 'la aceleración no corresponde a la masa del informe'),
  e(15, 'EXPERIMENTAL', 'err', 'peso atribuido al carril o normal atribuida a la Tierra en el diagrama', 'confusión de pares de interacción'),
  e(16, 'EXPERIMENTAL', 'nb', 'masa escrita en newtons (m g en lugar de m)', 'unidad de masa incompatible'),
  e(17, 'EXPERIMENTAL', 'nb', 'masa efectiva o a_pred sin I/r² en modo realista', 'la predicción ideal queda mayor que lo medido'),
  e(18, 'EXPERIMENTAL', 'err', 'release con el cable del sensor sin sujetar (roza el carril)', 'aparece una fuerza de roce extra en la dinámica'),
  e(19, 'EXPERIMENTAL', 'nb', 'promedio de ensayos de configuraciones distintas (sin repetir tras el ajuste)', 'fuerza media sin reproducibilidad'),
  e(20, 'EXPERIMENTAL', 'nb', 'conclusión: la fuerza neta es proporcional a la velocidad', 'ajuste F-a interpretado al revés'),
  // 20 errores de instrumentación, registro o montaje
  e(21, 'INSTRUMENTATION', 'err', 'lectura de balanza o sensor sin cero', 'cada lectura incorpora el corrimiento de origen'),
  e(22, 'INSTRUMENTATION', 'err', 'rango del sensor menor que la fuerza del fenómeno', 'la señal satura (clipped)'),
  e(23, 'INSTRUMENTATION', 'err', 'lectura con un canal sin conectar', 'no hay señal de ese canal'),
  e(24, 'INSTRUMENTATION', 'err', 'registrador a menos de 50 Hz', 'se pierden transitorios: pico y media sesgados'),
  e(25, 'INSTRUMENTATION', 'err', 'fotopuerta dentro del freno o del pestillo', 'el haz queda tapado: sin tiempos'),
  e(26, 'INSTRUMENTATION', 'err', 'sensor de fuerza montado inclinado (3°–60°)', 'mide F cos α'),
  e(27, 'INSTRUMENTATION', 'err', 'lectura sin calibrar la pendiente del sensor con la masa patrón', 'fuerzas multiplicadas por 1,04'),
  e(28, 'INSTRUMENTATION', 'err', 'release con la abrazadera de la polea floja', 'la polea deriva y roza: aceleración menor'),
  e(29, 'INSTRUMENTATION', 'err', 'lectura de la escala del carril con la vista oblicua', 'la posición leída de la compuerta se corre'),
  e(30, 'INSTRUMENTATION', 'err', 'lectura de la balanza o del acelerómetro antes de estabilizarse', 'valor transitorio tomado como final'),
  e(31, 'INSTRUMENTATION', 'nb', 'dato bruto escrito a mano en lugar de importarlo de una lectura', 'sin procedencia: dato no observado'),
  e(32, 'INSTRUMENTATION', 'err', 'cambio de montaje con el carro en marcha', 'el ensayo mezcla dos condiciones'),
  e(33, 'INSTRUMENTATION', 'nb', 'ensayo importado cuya masa colgante no es la del montaje declarado', 'datos de otro ensayo'),
  e(34, 'INSTRUMENTATION', 'nb', 'conversión g → kg o cm → m errónea', 'resultado en escala incorrecta (×10, ×100, ×1000)'),
  e(35, 'INSTRUMENTATION', 'nb', 'tiempo de bloqueo redondeado al ms antes de calcular v', 'sesgo por truncamiento (≈ 5–10 %)'),
  e(36, 'INSTRUMENTATION', 'nb', 'pendiente de T contra a con los ejes invertidos', 'se informa 1/m en lugar de m'),
  e(37, 'INSTRUMENTATION', 'nb', 'menos de tres ensayos válidos para a media', 'repetibilidad no sustentada'),
  e(38, 'INSTRUMENTATION', 'nb', 'u escrita menor que la tipo B del instrumento', 'intervalo subestimado'),
  e(39, 'INSTRUMENTATION', 'err', 'lecturas tras un choque fuerte sin reasentar el acelerómetro', 'el acelerómetro queda corrido: datos sesgados', true, true),
  e(40, 'INSTRUMENTATION', 'err', 'soltar el cordel con el portapesas colgado', 'la masa cae al suelo; bloqueo del puesto', true, true),
];

/** Clave corta (E01…E40), que también es la clave de retroalimentación `f04fb.Exx`. */
export const errKeyF4 = (x: SimulatedErrorF04) => x.evidenceKey.replace(/^(err|nb):/, '');
