/**
 * Escenarios docentes (§10) y catálogo de 40 errores simulables (§9). Contrato de cada error: `id`, `group`,
 * `trigger` (comando o predicado de libreta), `effect` (estado o sesgo calculado), `evidenceKey` (`err:Exx` en el
 * mundo o `nb:Exx` en la libreta), `feedbackKey` (`f09fb.Exx`), `recoverable` y `fixture` (prueba de integración).
 */
import { SF9 } from '../../simulation/f09-world/world';

export type F09Scenario = (typeof SF9)[keyof typeof SF9];
export const F09_SCENARIOS: F09Scenario[] = Object.values(SF9);

export interface SimulatedErrorF09 {
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

const e = (n: number, group: SimulatedErrorF09['group'], src: 'err' | 'nb', trigger: string, effect: string, recoverable = true, safety = false): SimulatedErrorF09 => {
  const id = `E${String(n).padStart(2, '0')}`;
  return { id: `F09-${id}`, group, trigger, effect, evidenceKey: `${src}:${id}`, feedbackKey: `f09fb.${id}`, recoverable, fixture: `f09-flow:${id}`, safety };
};

export const SIMULATED_ERRORS_F09: SimulatedErrorF09[] = [
  // 20 errores experimentales específicos
  e(1, 'EXPERIMENTAL', 'err', 'girar con la masa orbitante más allá del tope radial (o con el tope suelto)', 'la masa sale de la guía y golpea la guarda; el ensayo queda bloqueado', true, true),
  e(2, 'EXPERIMENTAL', 'err', 'encender el motor o acoplar el embrague con la guarda abierta', 'el enclavamiento bloquea el encendido'),
  e(3, 'EXPERIMENTAL', 'err', 'tirar con el dinamómetro inclinado fuera del plano del tambor (≥ 3°)', 'el torque es r F cos β, menor que r F'),
  e(4, 'EXPERIMENTAL', 'err', 'arrancar con las masas gemelas sin bloquear', 'el cordón central se estira desparejo: asimetría, vibración y roce extra'),
  e(5, 'EXPERIMENTAL', 'err', 'medir el radio de la masa hasta su borde y no hasta su centro', 'F_c calculada con un radio menor'),
  e(6, 'EXPERIMENTAL', 'err', 'cronometrar media vuelta como período', 'período subestimado a la mitad'),
  e(7, 'EXPERIMENTAL', 'nb', 'rapidez tangencial escrita igual a ω (sin multiplicar por r)', 'error de dimensión: rad/s en lugar de m/s'),
  e(8, 'EXPERIMENTAL', 'nb', 'elegir que la fuerza centrípeta cambia la rapidez', 'interpretación incorrecta: solo cambia la dirección de v⃗'),
  e(9, 'EXPERIMENTAL', 'err', 'subir la consigna del motor de golpe (o pasar el límite de velocidad)', 'transitorio: torque máximo, el sensor de fuerza se sobreesfuerza y pierde el cero'),
  e(10, 'EXPERIMENTAL', 'err', 'registrar con el freno aplicado', 'torque externo: ω decae y L no se conserva'),
  e(11, 'EXPERIMENTAL', 'err', 'recoger las masas con el motor acoplado', 'el motor sostiene ω: L no se conserva aislado'),
  e(12, 'EXPERIMENTAL', 'err', 'recoger las masas partiendo de radios distintos', 'I varía asimétricamente: desbalance y roce'),
  e(13, 'EXPERIMENTAL', 'err', 'leer la fuerza después de detener la mesa', 'registro vacío de esa velocidad'),
  e(14, 'EXPERIMENTAL', 'nb', 'energía cinética calculada sin las masas móviles', 'balance energético incompleto: falta el trabajo radial'),
  e(15, 'EXPERIMENTAL', 'err', 'enrollar el cordón al revés (torque en sentido horario)', 'α invertida respecto de la convención antihoraria'),
  e(16, 'EXPERIMENTAL', 'nb', 'torque de la fuerza centrípeta escrito como F_c · r', 'la fuerza centrípeta apunta al eje: su torque es cero'),
  e(17, 'EXPERIMENTAL', 'err', 'girar sin nivelar el eje', 'precesión y fuerzas laterales: roce extra en el eje'),
  e(18, 'EXPERIMENTAL', 'err', 'tirar con más fuerza que el alcance del dinamómetro', 'el resorte llega al tope: lectura recortada'),
  e(19, 'EXPERIMENTAL', 'err', 'girar con el cordón de la masa orbitante con holgura', 'la masa golpetea: tensión cero a ratos, fuerza no uniforme'),
  e(20, 'EXPERIMENTAL', 'err', 'frenar o tocar la mesa con la mano con la guarda abierta', 'freno de emergencia y bloqueo de contacto', true, true),
  // 20 errores de instrumentación, registro o montaje
  e(21, 'INSTRUMENTATION', 'err', 'lectura del sensor de fuerza, del dinamómetro o de la balanza sin cero', 'cada lectura incorpora el sesgo de origen'),
  e(22, 'INSTRUMENTATION', 'err', 'rango del sensor de fuerza menor que la fuerza centrípeta', 'la señal satura (clipped): F subestimada'),
  e(23, 'INSTRUMENTATION', 'err', 'lectura con un canal sin conectar', 'no hay señal de ese canal: la etapa no se acredita'),
  e(24, 'INSTRUMENTATION', 'err', 'registrador a menos de 50 Hz', 'pocas muestras de ω(t): el ajuste pierde el tirón'),
  e(25, 'INSTRUMENTATION', 'err', 'cable del sensor de fuerza suelto frente a la fotopuerta', 'el haz queda tapado: el cronómetro no mide'),
  e(26, 'INSTRUMENTATION', 'err', 'sensor de fuerza montado inclinado respecto del cordón', 'mide T cos α'),
  e(27, 'INSTRUMENTATION', 'err', 'lectura del encoder sin calibrar las cuentas por vuelta', 'ω y α multiplicadas por 400/360'),
  e(28, 'INSTRUMENTATION', 'err', 'poner en marcha con la base sin sujetar', 'la reacción del torque gira la base: el encoder mide un giro relativo'),
  e(29, 'INSTRUMENTATION', 'err', 'leer la regla radial o el dinamómetro con la vista oblicua', 'error de paralaje'),
  e(30, 'INSTRUMENTATION', 'err', 'leer antes de que el instrumento se estabilice (balanza, mesa acelerando)', 'valor transitorio tomado como estacionario'),
  e(31, 'INSTRUMENTATION', 'nb', 'dato bruto escrito a mano en lugar de importarlo de una lectura', 'sin procedencia: dato no observado'),
  e(32, 'INSTRUMENTATION', 'err', 'cambiar el montaje con la mesa girando', 'el ensayo mezcla dos condiciones'),
  e(33, 'INSTRUMENTATION', 'nb', 'fuerza y período (o tirón y encoder, o ω₁ y ω₂) de ensayos distintos en la misma fila', 'datos de otro ensayo'),
  e(34, 'INSTRUMENTATION', 'nb', 'conversión g → kg o cm → m errónea', 'resultado en escala incorrecta'),
  e(35, 'INSTRUMENTATION', 'nb', 'período redondeado a 0,1 s antes de calcular F_c', 'sesgo por truncamiento'),
  e(36, 'INSTRUMENTATION', 'nb', 'pendiente F_c vs ω² calculada con los ejes invertidos', 'se informa 1/(m r)'),
  e(37, 'INSTRUMENTATION', 'nb', 'menos de cuatro velocidades válidas en la tabla de F_c', 'tendencia y repetibilidad no sustentadas'),
  e(38, 'INSTRUMENTATION', 'nb', 'u escrita menor que la tipo B del instrumento', 'intervalo subestimado'),
  e(39, 'INSTRUMENTATION', 'err', 'lecturas con la guía doblada tras la salida de la masa, sin repararla', 'el modelo ideal no describe la señal'),
  e(40, 'INSTRUMENTATION', 'err', 'cerrar el puesto con la mesa girando, el motor acoplado o el cordón tirando', 'queda movimiento o energía residual: el cierre se bloquea'),
];

/** Clave corta (E01…E40), que también es la clave de retroalimentación `f09fb.Exx`. */
export const errKeyF9 = (x: SimulatedErrorF09) => x.evidenceKey.replace(/^(err|nb):/, '');
