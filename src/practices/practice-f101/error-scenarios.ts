/**
 * Escenarios docentes (§10) y catálogo de 40 errores simulables (§9). Contrato de cada error: `id`, `group`,
 * `trigger` (comando o predicado de libreta), `effect` (estado o sesgo calculado), `evidenceKey` (`err:Exx` en el
 * mundo o `nb:Exx` en la libreta), `feedbackKey` (`f101fb.Exx`), `recoverable` y `fixture` (prueba de integración).
 */
import { SF } from '../../simulation/f101-world/world';

export type F101Scenario = (typeof SF)[keyof typeof SF];
export const F101_SCENARIOS: F101Scenario[] = Object.values(SF);

export interface SimulatedErrorF101 {
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

const e = (n: number, group: SimulatedErrorF101['group'], src: 'err' | 'nb', trigger: string, effect: string, recoverable = true, safety = false): SimulatedErrorF101 => {
  const id = `E${String(n).padStart(2, '0')}`;
  return { id: `F101-${id}`, group, trigger, effect, evidenceKey: `${src}:${id}`, feedbackKey: `f101fb.${id}`, recoverable, fixture: `f101-flow:${id}`, safety };
};

export const SIMULATED_ERRORS_F101: SimulatedErrorF101[] = [
  // 20 errores experimentales específicos
  e(1, 'EXPERIMENTAL', 'err', 'readCaliper sobre una pieza sin haber leído el cero con las mordazas cerradas', 'todas las lecturas llevan el sesgo de cero (S01: +0,06 mm)'),
  e(2, 'EXPERIMENTAL', 'err', 'readCaliper con fuerza de contacto > límite', 'mordazas y pieza se comprimen F(1/k_m + 1/k_p): la lectura baja'),
  e(3, 'EXPERIMENTAL', 'err', 'placeInCaliper con inclinación > 2°', 'se lee L cos θ + w |sen θ| en lugar del diámetro'),
  e(4, 'EXPERIMENTAL', 'err', 'turnMicrometer con el tambor (sin trinquete) y lectura con F > límite', 'el arco se deforma: lectura menor que con la fuerza nominal'),
  e(5, 'EXPERIMENTAL', 'err', 'readMicrometer con caras sucias', 'el residuo suma su espesor a cada lectura'),
  e(6, 'EXPERIMENTAL', 'err', 'lectura de escala (calibrador, micrómetro, regla, dinamómetro) con la vista oblicua', 'la división leída se corre una posición'),
  e(7, 'EXPERIMENTAL', 'err', 'readBalance con la base desnivelada', 'la indicación oscila (ruido 20×) y lleva el error de nivel'),
  e(8, 'EXPERIMENTAL', 'err', 'readBalance con la pieza en la cápsula sin tarar con la cápsula', 'la masa incluye el recipiente'),
  e(9, 'EXPERIMENTAL', 'err', 'dropIntoCylinder desde más de 3 cm sobre el agua', 'salpica agua a la mesada (el volumen baja), espuma y nivel oscilante; > 12 cm raja la probeta', true, true),
  e(10, 'EXPERIMENTAL', 'err', 'readVolume con el ojo fuera del menisco o con espuma', 'volumen sobreestimado (ojo alto o espuma) o subestimado'),
  e(11, 'EXPERIMENTAL', 'err', 'recordEquilibrium con una prensa de polea floja', 'la polea gira bajo la carga: la dirección real difiere de la escala'),
  e(12, 'EXPERIMENTAL', 'err', 'recordEquilibrium con el hilo fuera de la rueda', 'el hilo roza el borde: la tensión real cae a m g e^(−μπ/2)'),
  e(13, 'EXPERIMENTAL', 'err', 'recordEquilibrium con el anillo apoyado en el perno', 'el perno absorbe la fuerza neta: equilibrio aparente'),
  e(14, 'EXPERIMENTAL', 'nb', 'ángulo de la libreta medido desde +y (90° − θ) o componentes intercambiadas', 'componentes con signo/valor cambiado'),
  e(15, 'EXPERIMENTAL', 'nb', 'fuerza escrita como la masa (g o kg) en lugar de m·g', 'comparaciones dimensionalmente inválidas'),
  e(16, 'EXPERIMENTAL', 'nb', 'repeticiones de una dimensión en unidades distintas (mm y cm)', 'dispersión artificial ×10'),
  e(17, 'EXPERIMENTAL', 'nb', 'densidad sin u(ρ)', 'intervalo de resultado no sustentado'),
  e(18, 'EXPERIMENTAL', 'nb', 'u_B del instrumento dividida entre √n (tratada como independiente)', 'intervalo subestimado'),
  e(19, 'EXPERIMENTAL', 'err', 'hang/loadMass con el perno retirado', 'el anillo se sacude: transitorio en el sensor'),
  e(20, 'EXPERIMENTAL', 'err', 'closeStation con portapesas colgados', 'estación incompleta: cierre rechazado', true, true),
  // 20 errores de instrumentación, registro o montaje
  e(21, 'INSTRUMENTATION', 'err', 'readMicrometer / readDynamometer sin cero en la posición de uso', 'cada lectura lleva el sesgo de origen (dinamómetro +0,12 N en horizontal)'),
  e(22, 'INSTRUMENTATION', 'err', 'captura con el rango de 2 N y fuerza mayor', 'la señal satura en el rango y subestima'),
  e(23, 'INSTRUMENTATION', 'err', 'startCapture/calibrateSensor sin conectar el cable', 'no hay señal ni registro'),
  e(24, 'INSTRUMENTATION', 'err', 'captura a 5 Hz con transitorio o < 10 muestras', 'se omite el transitorio (submuestreo)'),
  e(25, 'INSTRUMENTATION', 'err', 'readVolume con un objeto entre el ojo y la escala', 'el dato no se obtiene (oclusión)'),
  e(26, 'INSTRUMENTATION', 'err', 'readDynamometer con el cuerpo desalineado > 3°', 'se lee F cos α (proyección)'),
  e(27, 'INSTRUMENTATION', 'err', 'captura sin calibrar la pendiente del sensor', 'fuerzas multiplicadas por 1,06'),
  e(28, 'INSTRUMENTATION', 'err', 'recordEquilibrium con la mesa sin nivelar', 'el anillo tiende a bajar la pendiente: sesgo en la resultante'),
  e(29, 'INSTRUMENTATION', 'err', 'recordEquilibrium con la vista rasante (< 60° de elevación)', 'paralaje del índice angular (±1–2°)'),
  e(30, 'INSTRUMENTATION', 'err', 'lectura con la balanza, la probeta, el anillo o el sensor sin estabilizar', 'valor transitorio tomado como estacionario'),
  e(31, 'INSTRUMENTATION', 'nb', 'dato bruto escrito a mano en lugar de importarlo de una lectura', 'sin procedencia: dato no observado'),
  e(32, 'INSTRUMENTATION', 'err', 'cambio de masa, polea o dinamómetro durante una captura', 'la réplica mezcla dos montajes'),
  e(33, 'INSTRUMENTATION', 'nb', 'contraste con una captura de otro montaje (versión distinta)', 'resultados incompatibles con el montaje'),
  e(34, 'INSTRUMENTATION', 'nb', 'conversión g/cm³ → kg/m³ o mm³ → cm³ errónea', 'resultado en escala incorrecta'),
  e(35, 'INSTRUMENTATION', 'nb', 'media redondeada por debajo de la resolución antes de calcular', 'sesgo por truncamiento'),
  e(36, 'INSTRUMENTATION', 'nb', 'resultante escrita con el ángulo de la equilibrante (180°)', 'dirección contradice la medida'),
  e(37, 'INSTRUMENTATION', 'nb', 'menos de tres repeticiones válidas por dimensión', 'repetibilidad no sustentada'),
  e(38, 'INSTRUMENTATION', 'nb', 'u escrita menor que la tipo B del instrumento', 'intervalo subestimado'),
  e(39, 'INSTRUMENTATION', 'err', 'readVolume con la probeta rajada o tras el impacto sin reemplazarla', 'la fuga cambia el nivel durante la medida', true, true),
  e(40, 'INSTRUMENTATION', 'err', 'desmontar el dinamómetro tensado o quitar un portapesas con el anillo libre', 'energía residual: el gancho salta o las masas caen; bloqueo', true, true),
];

/** Clave corta (E01…E40), que también es la clave de retroalimentación `f101fb.Exx`. */
export const errKeyF = (x: SimulatedErrorF101) => x.evidenceKey.replace(/^(err|nb):/, '');
