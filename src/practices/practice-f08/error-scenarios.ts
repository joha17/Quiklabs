/**
 * Escenarios docentes (§10) y catálogo de 40 errores simulables (§9). Contrato de cada error: `id`, `group`,
 * `trigger` (comando o predicado de libreta), `effect` (estado o sesgo calculado), `evidenceKey` (`err:Exx` en el
 * mundo o `nb:Exx` en la libreta), `feedbackKey` (`f08fb.Exx`), `recoverable` y `fixture` (prueba de integración).
 */
import { SF8 } from '../../simulation/f08-world/world';

export type F08Scenario = (typeof SF8)[keyof typeof SF8];
export const F08_SCENARIOS: F08Scenario[] = Object.values(SF8);

export interface SimulatedErrorF08 {
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

const e = (n: number, group: SimulatedErrorF08['group'], src: 'err' | 'nb', trigger: string, effect: string, recoverable = true, safety = false): SimulatedErrorF08 => {
  const id = `E${String(n).padStart(2, '0')}`;
  return { id: `F08-${id}`, group, trigger, effect, evidenceKey: `${src}:${id}`, feedbackKey: `f08fb.${id}`, recoverable, fixture: `f08-flow:${id}`, safety };
};

export const SIMULATED_ERRORS_F08: SimulatedErrorF08[] = [
  // 20 errores experimentales específicos
  e(1, 'EXPERIMENTAL', 'err', 'release con el aro acoplado con holgura (excentricidad > 1 mm)', 'I aumenta en M e² y el desbalance agrega roce y vibración'),
  e(2, 'EXPERIMENTAL', 'nb', 'I previsto del disco calculado con el diámetro como radio', 'I previsto cuatro veces mayor'),
  e(3, 'EXPERIMENTAL', 'err', 'ensayo con una masa corrediza sin fijar', 'la masa se desliza hacia afuera: I cambia durante el ensayo'),
  e(4, 'EXPERIMENTAL', 'err', 'release con las masas corredizas a radios distintos', 'desbalance: roce extra y oscilación lateral'),
  e(5, 'EXPERIMENTAL', 'err', 'release con más vueltas que las de una capa (cuerda superpuesta)', 'el radio de enrollamiento real es mayor que el medido'),
  e(6, 'EXPERIMENTAL', 'err', 'encoder puesto a cero lejos de la marca (o sin cero)', 'θ con corrimiento: no coincide con el transportador'),
  e(7, 'EXPERIMENTAL', 'err', 'lectura del encoder con el sentido de conteo invertido', 'c y α informados con signo opuesto'),
  e(8, 'EXPERIMENTAL', 'nb', 'tensión supuesta igual a m g', 'torque sobrestimado: I mayor'),
  e(9, 'EXPERIMENTAL', 'nb', 'I del sólido sin restar la inercia del eje', 'I del sólido sobrestimado en I₀'),
  e(10, 'EXPERIMENTAL', 'err', 'release con la polea desalineada (cuerda inclinada > 3°)', 'el torque es T r cos φ, menor que T r'),
  e(11, 'EXPERIMENTAL', 'err', 'tocar el eje durante el ensayo', 'torque externo de roce adicional'),
  e(12, 'EXPERIMENTAL', 'err', 'masa colgante sin tope: golpea el piso', 'la cuerda deja de tirar de golpe y la masa se golpea'),
  e(13, 'EXPERIMENTAL', 'nb', 'I calculado sin corregir el roce con el tramo libre', 'I sobrestimado: α predicha mayor que la medida'),
  e(14, 'EXPERIMENTAL', 'err', 'release con el rotor todavía girando', 'energía inicial distinta de cero: el ajuste empieza con ω ≠ 0'),
  e(15, 'EXPERIMENTAL', 'nb', 'I previsto en el agujero desplazado sin el término M d²', 'teorema de ejes paralelos omitido'),
  e(16, 'EXPERIMENTAL', 'nb', 'rpm del tacómetro usadas como rad/s', 'ω sobrescalada casi diez veces'),
  e(17, 'EXPERIMENTAL', 'nb', 'coeficiente c del ajuste escrito como α', 'α a la mitad: I al doble'),
  e(18, 'EXPERIMENTAL', 'err', 'girar el rotor por encima del límite de velocidad del eje', 'la protección de sobrevelocidad frena la plataforma'),
  e(19, 'EXPERIMENTAL', 'err', 'mano en el plano de giro con el rotor en marcha y la guarda abierta', 'freno de emergencia y bloqueo de seguridad', true, true),
  e(20, 'EXPERIMENTAL', 'nb', 'ensayo con el soporte corrido importado como rotación pura', 'la traslación del soporte se atribuye a la rotación'),
  // 20 errores de instrumentación, registro o montaje
  e(21, 'INSTRUMENTATION', 'err', 'lectura del sensor de tensión sin cero o de la balanza sin tarar', 'cada lectura incorpora el sesgo de origen'),
  e(22, 'INSTRUMENTATION', 'err', 'rango del tacómetro menor que la velocidad máxima', 'la señal satura (clipped): ω máxima subestimada'),
  e(23, 'INSTRUMENTATION', 'err', 'lectura con un canal sin conectar', 'no hay señal de ese canal'),
  e(24, 'INSTRUMENTATION', 'err', 'registrador a menos de 50 Hz', 'pocas muestras: el ajuste θ(t) pierde el arranque y el roce'),
  e(25, 'INSTRUMENTATION', 'err', 'brazo del tope a menos de 2 cm del haz de la fotopuerta', 'el haz queda tapado: la fotopuerta no mide'),
  e(26, 'INSTRUMENTATION', 'err', 'sensor de tensión montado inclinado respecto de la cuerda', 'mide T cos α'),
  e(27, 'INSTRUMENTATION', 'err', 'lectura del encoder sin calibrar las cuentas por vuelta', 'ángulos multiplicados por 400/360'),
  e(28, 'INSTRUMENTATION', 'err', 'release con la base del soporte sin sujetar', 'la tensión arrastra el soporte: la masa baja más que r θ'),
  e(29, 'INSTRUMENTATION', 'err', 'lectura del transportador o de la regla radial con la vista oblicua', 'error de paralaje'),
  e(30, 'INSTRUMENTATION', 'err', 'lectura antes de estabilizarse (balanza, rotor en marcha)', 'valor transitorio tomado como final'),
  e(31, 'INSTRUMENTATION', 'nb', 'dato bruto escrito a mano en lugar de importarlo de una lectura', 'sin procedencia: dato no observado'),
  e(32, 'INSTRUMENTATION', 'err', 'cambio de montaje con el rotor en marcha', 'el ensayo mezcla dos condiciones'),
  e(33, 'INSTRUMENTATION', 'nb', 'ensayo importado en una tabla que no corresponde (otro sólido u otra masa)', 'datos de otro ensayo'),
  e(34, 'INSTRUMENTATION', 'nb', 'conversión g → kg o cm → m errónea', 'resultado en escala incorrecta'),
  e(35, 'INSTRUMENTATION', 'nb', 'α redondeada a 0,1 rad/s² antes de calcular I', 'sesgo por truncamiento en I'),
  e(36, 'INSTRUMENTATION', 'nb', 'pendiente I vs r² calculada con los ejes invertidos', 'se informa 1/(2m)'),
  e(37, 'INSTRUMENTATION', 'nb', 'menos de tres ensayos válidos con el disco', 'repetibilidad no sustentada'),
  e(38, 'INSTRUMENTATION', 'nb', 'u escrita menor que la tipo B del instrumento', 'intervalo subestimado'),
  e(39, 'INSTRUMENTATION', 'err', 'lecturas tras un golpe contra la guarda (o un sólido despedido) sin reparar', 'el sólido marcado roza: el modelo ideal no describe la señal'),
  e(40, 'INSTRUMENTATION', 'err', 'desmontar un sólido con el rotor girando', 'el sólido sale despedido; bloqueo del puesto', true, true),
];

/** Clave corta (E01…E40), que también es la clave de retroalimentación `f08fb.Exx`. */
export const errKeyF8 = (x: SimulatedErrorF08) => x.evidenceKey.replace(/^(err|nb):/, '');
