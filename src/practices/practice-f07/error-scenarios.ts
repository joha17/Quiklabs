/**
 * Escenarios docentes (§10) y catálogo de 40 errores simulables (§9). Contrato de cada error: `id`, `group`,
 * `trigger` (comando o predicado de libreta), `effect` (estado o sesgo calculado), `evidenceKey` (`err:Exx` en el
 * mundo o `nb:Exx` en la libreta), `feedbackKey` (`f07fb.Exx`), `recoverable` y `fixture` (prueba de integración).
 */
import { SF7 } from '../../simulation/f07-world/world';

export type F07Scenario = (typeof SF7)[keyof typeof SF7];
export const F07_SCENARIOS: F07Scenario[] = Object.values(SF7);

export interface SimulatedErrorF07 {
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

const e = (n: number, group: SimulatedErrorF07['group'], src: 'err' | 'nb', trigger: string, effect: string, recoverable = true, safety = false): SimulatedErrorF07 => {
  const id = `E${String(n).padStart(2, '0')}`;
  return { id: `F07-${id}`, group, trigger, effect, evidenceKey: `${src}:${id}`, feedbackKey: `f07fb.${id}`, recoverable, fixture: `f07-flow:${id}`, safety };
};

export const SIMULATED_ERRORS_F07: SimulatedErrorF07[] = [
  // 20 errores experimentales específicos
  e(1, 'EXPERIMENTAL', 'err', 'release con el riel sin nivelar (|θ| > 0,1°)', 'la gravedad da un impulso externo: Σp cambia antes y después del choque'),
  e(2, 'EXPERIMENTAL', 'err', 'readGates con una carga en el carro que no se pesó', 'p calculado con la masa equivocada'),
  e(3, 'EXPERIMENTAL', 'err', 'choque con el carro blanco en movimiento sin medir su velocidad inicial', 'v₂i supuesta nula: Σp inicial mal'),
  e(4, 'EXPERIMENTAL', 'err', 'readGates con banderas de distinto ancho sin medirlas (o una bandera girada)', 'velocidades de un carro escaladas'),
  e(5, 'EXPERIMENTAL', 'err', 'fotopuerta dentro de la zona de choque o después de ella', 'el paso «antes» se corta o no existe'),
  e(6, 'EXPERIMENTAL', 'err', 'release con el velcro sin apretar ni fijar', 'los carros se despegan: el choque no es perfectamente inelástico'),
  e(7, 'EXPERIMENTAL', 'err', 'release con los imanes enfrentados por polos opuestos', 'se atraen y se pegan en vez de rebotar'),
  e(8, 'EXPERIMENTAL', 'err', 'release con los carros ya en contacto', 'no hay velocidades «antes» bien definidas'),
  e(9, 'EXPERIMENTAL', 'err', 'pushCart durante el ensayo', 'la mano aporta un impulso externo'),
  e(10, 'EXPERIMENTAL', 'err', 'release con el freno de un carro puesto', 'roce grande: el carro se frena y Σp no se conserva'),
  e(11, 'EXPERIMENTAL', 'nb', 'velocidad de rebote escrita con signo positivo', 'Σp después sobrestimado'),
  e(12, 'EXPERIMENTAL', 'nb', 'impulso escrito igual al pico de fuerza', 'unidades y orden de magnitud equivocados (N en lugar de N·s)'),
  e(13, 'EXPERIMENTAL', 'nb', 'e calculado con velocidades no relativas (v₁f/v₁i o v₂f/v₁i)', 'restitución sesgada'),
  e(14, 'EXPERIMENTAL', 'err', 'un carro llega al tope del extremo antes de pasar su fotopuerta (o sin amortiguador)', 'impulso del tope dentro del ensayo; un golpe fuerte bloquea el puesto', true, true),
  e(15, 'EXPERIMENTAL', 'err', 'release con los carros desalineados lateralmente (choque oblicuo)', 'las pestañas rozan el riel: impulso externo y menos restitución'),
  e(16, 'EXPERIMENTAL', 'err', 'release con una rueda que no gira libre', 'roce de rodadura grande: la rotación de las ruedas frena el carro'),
  e(17, 'EXPERIMENTAL', 'nb', 'energía cinética supuesta conservada en el choque con velcro', 'contradice la energía perdida medida'),
  e(18, 'EXPERIMENTAL', 'err', 'loadCart con el carro en marcha', 'la masa del ensayo cambia sin registrarlo'),
  e(19, 'EXPERIMENTAL', 'err', 'tocar el carro con la bandera dentro del haz', 'tiempo de bloqueo alterado'),
  e(20, 'EXPERIMENTAL', 'nb', 'impulso sobre el carro 1 escrito con el signo del que recibe el carro 2', 'J₁ con signo opuesto a Δp₁'),
  // 20 errores de instrumentación, registro o montaje
  e(21, 'INSTRUMENTATION', 'err', 'lectura del sensor de fuerza sin cero o de la balanza sin tarar', 'cada lectura incorpora el sesgo de origen'),
  e(22, 'INSTRUMENTATION', 'err', 'rango del sensor de fuerza menor que el pico del choque', 'la señal satura (clipped): impulso subestimado'),
  e(23, 'INSTRUMENTATION', 'err', 'lectura con un canal sin conectar', 'no hay señal de ese canal'),
  e(24, 'INSTRUMENTATION', 'err', 'registrador a menos de 1000 Hz para el choque', 'el contacto de ~30 ms queda con pocas muestras'),
  e(25, 'INSTRUMENTATION', 'err', 'release con una bandera dentro del haz', 'el primer cruce queda cortado'),
  e(26, 'INSTRUMENTATION', 'err', 'sensor de fuerza montado inclinado respecto del eje del choque', 'mide F cos α'),
  e(27, 'INSTRUMENTATION', 'err', 'lectura sin calibrar la pendiente del sensor de fuerza', 'fuerzas multiplicadas por 1,05'),
  e(28, 'INSTRUMENTATION', 'err', 'ensayos con las fotopuertas sin abrazadera', 'la compuerta se corre al pasar el carro'),
  e(29, 'INSTRUMENTATION', 'err', 'lectura del nivel o de la regla con la vista oblicua', 'error de paralaje'),
  e(30, 'INSTRUMENTATION', 'err', 'lectura antes de estabilizarse (balanza, nivel recién ajustado o carro en marcha)', 'valor transitorio tomado como final'),
  e(31, 'INSTRUMENTATION', 'nb', 'dato bruto escrito a mano en lugar de importarlo de una lectura', 'sin procedencia: dato no observado'),
  e(32, 'INSTRUMENTATION', 'err', 'cambio de montaje con los carros en marcha', 'el ensayo mezcla dos condiciones'),
  e(33, 'INSTRUMENTATION', 'nb', 'ensayo importado en una tabla que no corresponde (otro paragolpes, otras masas)', 'datos de otro ensayo'),
  e(34, 'INSTRUMENTATION', 'nb', 'conversión g → kg o cm → m errónea', 'resultado en escala incorrecta'),
  e(35, 'INSTRUMENTATION', 'nb', 'velocidad calculada con el tiempo de bloqueo redondeado al ms', 'sesgo por truncamiento en p'),
  e(36, 'INSTRUMENTATION', 'nb', 'velocidad del centro de masa con los ejes invertidos (Δt/Δx)', 'se informa 1/v_CM'),
  e(37, 'INSTRUMENTATION', 'nb', 'menos de tres choques elásticos válidos', 'repetibilidad no sustentada'),
  e(38, 'INSTRUMENTATION', 'nb', 'u escrita menor que la tipo B del instrumento', 'intervalo subestimado'),
  e(39, 'INSTRUMENTATION', 'err', 'lecturas tras un golpe contra el tope sin reparar el carro', 'rueda torcida: más roce y tiempos sesgados'),
  e(40, 'INSTRUMENTATION', 'err', 'levantar un carro trabado en su lanzador', 'el émbolo se dispara contra la mano; bloqueo del puesto', true, true),
];

/** Clave corta (E01…E40), que también es la clave de retroalimentación `f07fb.Exx`. */
export const errKeyF7 = (x: SimulatedErrorF07) => x.evidenceKey.replace(/^(err|nb):/, '');
