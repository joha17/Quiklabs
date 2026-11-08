/**
 * Escenarios docentes (§10) y catálogo de 40 errores simulables (§9). Contrato de cada error: `id`, `group`,
 * `trigger` (comando o predicado de libreta), `effect` (estado o sesgo calculado), `evidenceKey` (`err:Exx` en el
 * mundo o `nb:Exx` en la libreta), `feedbackKey` (`f102fb.Exx`), `recoverable` y `fixture` (prueba de integración).
 */
import { SF2 } from '../../simulation/f102-world/world';

export type F102Scenario = (typeof SF2)[keyof typeof SF2];
export const F102_SCENARIOS: F102Scenario[] = Object.values(SF2);

export interface SimulatedErrorF102 {
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

const e = (n: number, group: SimulatedErrorF102['group'], src: 'err' | 'nb', trigger: string, effect: string, recoverable = true, safety = false): SimulatedErrorF102 => {
  const id = `E${String(n).padStart(2, '0')}`;
  return { id: `F102-${id}`, group, trigger, effect, evidenceKey: `${src}:${id}`, feedbackKey: `f102fb.${id}`, recoverable, fixture: `f102-flow:${id}`, safety };
};

export const SIMULATED_ERRORS_F102: SimulatedErrorF102[] = [
  // 20 errores experimentales específicos
  e(1, 'EXPERIMENTAL', 'err', 'corrida de MRU (sin masa colgante) con el carril inclinado > 0,15°', 'la gravedad acelera o frena el carro: v₁ ≠ v₂ entre compuertas'),
  e(2, 'EXPERIMENTAL', 'err', 'releaseCart con velocidad de la mano > 0,02 m/s', 'el carro arranca con v₀ ≠ 0: la cinta y las compuertas lo registran'),
  e(3, 'EXPERIMENTAL', 'err', 'readGateTimer tras pasar por una compuerta girada > 8°', 'el haz no corta la bandera: falta el tiempo de esa compuerta'),
  e(4, 'EXPERIMENTAL', 'err', 'compuertas separadas menos que el ancho de la bandera', 'la bandera tapa las dos a la vez: los intervalos se superponen'),
  e(5, 'EXPERIMENTAL', 'err', 'startTape con el carro ya en marcha', 'el origen temporal queda después de la liberación: v₀ aparente ≠ 0'),
  e(6, 'EXPERIMENTAL', 'err', 'corrida con la cinta sin tensar', 'la cinta floja frena el carro (0,06 N) y los puntos se corren'),
  e(7, 'EXPERIMENTAL', 'err', 'la masa colgante toca el suelo antes de la segunda compuerta o con < 8 puntos de cinta', 'la tensión se anula: el carro pasa a velocidad casi constante'),
  e(8, 'EXPERIMENTAL', 'err', 'corrida con el cordel fuera de la ranura de la polea', 'el roce de cabrestante reduce la tensión (e^(−μθ)): a menor'),
  e(9, 'EXPERIMENTAL', 'err', 'el carro rebota en el tope final dentro del registro', 'puntos o cruces con velocidad negativa mezclados con la corrida'),
  e(10, 'EXPERIMENTAL', 'err', 'readRuler en el borde de la base de la compuerta', 'la posición se corre medio ancho de base (1,5 cm)'),
  e(11, 'EXPERIMENTAL', 'nb', 'masa colgante o del carro de la libreta distinta de la del montaje de la corrida', 'la predicción a = m g/(M + m) no corresponde al ensayo'),
  e(12, 'EXPERIMENTAL', 'err', 'attachToMagnet con desplazamiento lateral > 2 mm', 'la esfera se separa girando y sale con velocidad lateral'),
  e(13, 'EXPERIMENTAL', 'err', 'readFallTimer con la tapa de la fotocelda puesta', 'el haz no se interrumpe: el cronómetro no se detiene'),
  e(14, 'EXPERIMENTAL', 'err', 'la esfera cae fuera de la almohadilla', 'golpe contra la base de la torre', true, true),
  e(15, 'EXPERIMENTAL', 'err', 'soltar una pila con filtros arrugados y lisos', 'geometría mezclada: C_d y área no corresponden a n filtros'),
  e(16, 'EXPERIMENTAL', 'err', 'filtros anidados descentrados > 4 mm', 'la pila cae dando tumbos: la velocidad límite oscila'),
  e(17, 'EXPERIMENTAL', 'nb', 'lectura de caída con arrastre (DRAG/TUMBLING) usada en la tabla de caída libre', 'g estimada con un cuerpo que no cae libre'),
  e(18, 'EXPERIMENTAL', 'nb', 'v media entre compuertas escrita como velocidad instantánea en una compuerta', 'confunde v̄ = d/t con v = w/Δt'),
  e(19, 'EXPERIMENTAL', 'nb', 'aceleración de la libreta sin cinta importada que la respalde', 'a no observada'),
  e(20, 'EXPERIMENTAL', 'nb', 'ajuste con cinta marcada IMPACT o LANDED sin recortar', 'el ajuste mezcla tramos con otra aceleración'),
  // 20 errores de instrumentación, registro o montaje
  e(21, 'INSTRUMENTATION', 'err', 'readInclinometer sobre el carril sin haber puesto el cero sobre la mesada', 'cada lectura lleva el desplazamiento del instrumento (±0,4°)'),
  e(22, 'INSTRUMENTATION', 'err', 'captura de movimiento en rango cercano con el cuerpo más lejos que 1 m', 'la distancia satura en el límite del rango'),
  e(23, 'INSTRUMENTATION', 'err', 'temporizador de compuertas o sensor de movimiento sin conectar', 'no hay señal de ese canal'),
  e(24, 'INSTRUMENTATION', 'err', 'captura de la caída a 10 Hz con < 8 muestras en movimiento', 'submuestreo: la velocidad límite no se resuelve'),
  e(25, 'INSTRUMENTATION', 'err', 'captura con el brazo del electroimán dentro del cono del sensor', 'el eco vuelve del brazo, no del cuerpo (oclusión)'),
  e(26, 'INSTRUMENTATION', 'err', 'captura con el sensor inclinado > 3°', 'se mide la oblicua d/cos α'),
  e(27, 'INSTRUMENTATION', 'err', 'captura sin calibrar el sensor contra la distancia patrón', 'distancias multiplicadas por 1,03'),
  e(28, 'INSTRUMENTATION', 'err', 'caída con la prensa del electroimán floja', 'el electroimán se desliza: h real distinta de la leída'),
  e(29, 'INSTRUMENTATION', 'err', 'lectura de la regla del carril o de la escala de la torre con la vista oblicua', 'la división leída se corre'),
  e(30, 'INSTRUMENTATION', 'err', 'lectura del inclinómetro sin estabilizar o del temporizador con el carro en la compuerta', 'valor transitorio o incompleto tomado como final'),
  e(31, 'INSTRUMENTATION', 'nb', 'dato bruto escrito a mano en lugar de importarlo de una lectura', 'sin procedencia: dato no observado'),
  e(32, 'INSTRUMENTATION', 'err', 'cambio de montaje (masa, compuerta, cinta, sensor) durante una corrida', 'la réplica mezcla dos condiciones'),
  e(33, 'INSTRUMENTATION', 'nb', 'tabla o promedio con corridas de montajes distintos (versión distinta)', 'resultados incompatibles con el montaje'),
  e(34, 'INSTRUMENTATION', 'nb', 'conversión cm → m o ms → s errónea', 'resultado en escala incorrecta (×10, ×100, ×1000)'),
  e(35, 'INSTRUMENTATION', 'nb', 'tiempo redondeado por debajo de la resolución antes de calcular', 'sesgo por truncamiento'),
  e(36, 'INSTRUMENTATION', 'nb', 'aceleración o velocidad escrita con el signo contrario al sentido medido', 'el signo contradice el eje del carril'),
  e(37, 'INSTRUMENTATION', 'nb', 'menos de tres corridas válidas por condición', 'repetibilidad no sustentada'),
  e(38, 'INSTRUMENTATION', 'nb', 'u escrita menor que la tipo B del instrumento', 'intervalo subestimado'),
  e(39, 'INSTRUMENTATION', 'err', 'lecturas con la bandera doblada tras un choque fuerte sin reemplazarla', 'el ancho efectivo cambia: v = w/Δt sesgada', true, true),
  e(40, 'INSTRUMENTATION', 'err', 'soltar el cordel con la masa colgando y el carro libre', 'la masa cae al suelo sin control; bloqueo', true, true),
];

/** Clave corta (E01…E40), que también es la clave de retroalimentación `f102fb.Exx`. */
export const errKeyF2 = (x: SimulatedErrorF102) => x.evidenceKey.replace(/^(err|nb):/, '');
