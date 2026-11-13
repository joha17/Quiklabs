/**
 * Escenarios docentes (§10) y catálogo de 40 errores simulables (§9). Contrato de cada error: `id`, `group`,
 * `trigger` (comando o predicado de libreta), `effect` (estado o sesgo calculado), `evidenceKey` (`err:Exx` en el
 * mundo o `nb:Exx` en la libreta), `feedbackKey` (`f05fb.Exx`), `recoverable` y `fixture` (prueba de integración).
 */
import { SF5 } from '../../simulation/f05-world/world';

export type F05Scenario = (typeof SF5)[keyof typeof SF5];
export const F05_SCENARIOS: F05Scenario[] = Object.values(SF5);

export interface SimulatedErrorF05 {
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

const e = (n: number, group: SimulatedErrorF05['group'], src: 'err' | 'nb', trigger: string, effect: string, recoverable = true, safety = false): SimulatedErrorF05 => {
  const id = `E${String(n).padStart(2, '0')}`;
  return { id: `F05-${id}`, group, trigger, effect, evidenceKey: `${src}:${id}`, feedbackKey: `f05fb.${id}`, recoverable, fixture: `f05-flow:${id}`, safety };
};

export const SIMULATED_ERRORS_F05: SimulatedErrorF05[] = [
  // 20 errores experimentales específicos
  e(1, 'EXPERIMENTAL', 'err', 'readPull con el cable inclinado más de 3° respecto del tablero', 'la normal baja (N = m g − T sen α) y el umbral cambia'),
  e(2, 'EXPERIMENTAL', 'nb', 'μ_k calculado con el pico de fuerza en lugar de la meseta', 'μ_k sobreestimado'),
  e(3, 'EXPERIMENTAL', 'err', 'lectura con el elevador sin la tuerca de bloqueo', 'el ángulo deriva durante la medida'),
  e(4, 'EXPERIMENTAL', 'nb', 'material declarado distinto del revestimiento del ensayo importado', 'coeficiente atribuido a otra superficie'),
  e(5, 'EXPERIMENTAL', 'err', 'jerk: tirón brusco del tirador', 'efectos inerciales mezclados con el roce'),
  e(6, 'EXPERIMENTAL', 'err', 'readPull de una ventana con el bloque acelerando', 'la tensión incluye m a'),
  e(7, 'EXPERIMENTAL', 'err', 'lastre apoyado fuera del perno del bloque', 'la carga se corre y puede caer durante el ensayo'),
  e(8, 'EXPERIMENTAL', 'err', 'readPull con la célula de carga sin cero', 'todas las fuerzas con corrimiento'),
  e(9, 'EXPERIMENTAL', 'err', 'placeBlock fuera del ancho del tablero', 'el bloque cae por el borde: no hay roce de superficie'),
  e(10, 'EXPERIMENTAL', 'err', 'readAngle en la escala del soporte en lugar del goniómetro del plano', 'θ sin la inclinación de la base'),
  e(11, 'EXPERIMENTAL', 'nb', 'μ_k escrito igual a μ_s', 'el modelo ignora el umbral estático'),
  e(12, 'EXPERIMENTAL', 'err', 'drawForce del roce en el sentido del movimiento', 'el bloque ganaría energía sin fuente'),
  e(13, 'EXPERIMENTAL', 'nb', 'temperatura de la sala sin registrar', 'condición del material no controlada'),
  e(14, 'EXPERIMENTAL', 'err', 'drawForce de la tensión vertical cuando el cable tira a lo largo del tablero', 'componente de fuerza mal elegida'),
  e(15, 'EXPERIMENTAL', 'err', 'readPull con el cable todavía oscilando', 'meseta contaminada por la oscilación del resorte'),
  e(16, 'EXPERIMENTAL', 'err', 'ensayos sobre una tira rayada sin registrar el daño', 'μ distinto del de la superficie declarada'),
  e(17, 'EXPERIMENTAL', 'nb', 'N = m g usada en el plano inclinado', 'μ calculado con la normal incorrecta'),
  e(18, 'EXPERIMENTAL', 'nb', 'μ_s informado con menos de tres réplicas', 'sin incertidumbre empírica'),
  e(19, 'EXPERIMENTAL', 'err', 'turnElevator más allá del tope de 45°', 'contacto con el tope: el ensayo se detiene'),
  e(20, 'EXPERIMENTAL', 'err', 'closeStation con el tablero elevado y sin bloquear', 'el mecanismo baja de golpe; bloqueo del puesto', true, true),
  // 20 errores de instrumentación, registro o montaje
  e(21, 'INSTRUMENTATION', 'err', 'lectura de la balanza sin tarar', 'cada masa incorpora el corrimiento de origen'),
  e(22, 'INSTRUMENTATION', 'err', 'rango de la célula menor que la fuerza del tirón', 'la señal satura (clipped)'),
  e(23, 'INSTRUMENTATION', 'err', 'lectura con un canal sin conectar', 'no hay señal de ese canal'),
  e(24, 'INSTRUMENTATION', 'err', 'registrador a menos de 50 Hz', 'el pico estático se pierde entre muestras'),
  e(25, 'INSTRUMENTATION', 'err', 'fotopuerta bajo el pasador o dentro de la espuma', 'el haz queda tapado: sin tiempos'),
  e(26, 'INSTRUMENTATION', 'err', 'célula de carga montada inclinada respecto del cable', 'mide T cos α'),
  e(27, 'INSTRUMENTATION', 'err', 'lectura sin calibrar la pendiente de la célula', 'fuerzas multiplicadas por 1,04'),
  e(28, 'INSTRUMENTATION', 'err', 'ensayos con el pie del elevador sin abrazadera', 'el soporte cede con el golpe y el ángulo cambia'),
  e(29, 'INSTRUMENTATION', 'err', 'lectura de goniómetro o escala con la vista oblicua', 'error de paralaje'),
  e(30, 'INSTRUMENTATION', 'err', 'lectura antes de estabilizarse (balanza o tablero recién movido)', 'valor transitorio tomado como final'),
  e(31, 'INSTRUMENTATION', 'nb', 'dato bruto escrito a mano en lugar de importarlo de una lectura', 'sin procedencia: dato no observado'),
  e(32, 'INSTRUMENTATION', 'err', 'cambio de montaje con el bloque en marcha', 'el ensayo mezcla dos condiciones'),
  e(33, 'INSTRUMENTATION', 'nb', 'ensayo importado cuya carga o material no es el de la fila', 'datos de otro ensayo'),
  e(34, 'INSTRUMENTATION', 'nb', 'conversión g → kg o cm → m errónea', 'resultado en escala incorrecta'),
  e(35, 'INSTRUMENTATION', 'nb', 'tan θ calculada con el ángulo redondeado al grado', 'sesgo por truncamiento en μ_s'),
  e(36, 'INSTRUMENTATION', 'nb', 'pendiente de F_k contra N con los ejes invertidos', 'se informa 1/μ_k en lugar de μ_k'),
  e(37, 'INSTRUMENTATION', 'nb', 'menos de tres ensayos válidos para μ_k', 'repetibilidad no sustentada'),
  e(38, 'INSTRUMENTATION', 'nb', 'u escrita menor que la tipo B del instrumento', 'intervalo subestimado'),
  e(39, 'INSTRUMENTATION', 'err', 'lecturas de la bajada tras golpear el tope sin espuma', 'bandera torcida: tiempos sesgados', true),
  e(40, 'INSTRUMENTATION', 'err', 'soltar el cable con el resorte estirado', 'el gancho salta; bloqueo del puesto', true, true),
];

/** Clave corta (E01…E40), que también es la clave de retroalimentación `f05fb.Exx`. */
export const errKeyF5 = (x: SimulatedErrorF05) => x.evidenceKey.replace(/^(err|nb):/, '');
