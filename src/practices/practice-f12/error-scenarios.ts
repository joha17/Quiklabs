/**
 * Escenarios docentes (§10) y catálogo de 40 errores simulables (§9). Contrato de cada error: `id`, `group`,
 * `trigger` (comando o predicado de libreta), `effect` (estado o sesgo calculado), `evidenceKey` (`err:Exx` en el
 * mundo o `nb:Exx` en la libreta), `feedbackKey` (`f12fb.Exx`), `recoverable` y `fixture` (prueba de integración).
 */
import { SF12 } from '../../simulation/f12-world/world';

export type F12Scenario = (typeof SF12)[keyof typeof SF12];
export const F12_SCENARIOS: F12Scenario[] = Object.values(SF12);

export interface SimulatedErrorF12 {
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

const e = (n: number, group: SimulatedErrorF12['group'], src: 'err' | 'nb', trigger: string, effect: string, recoverable = true, safety = false): SimulatedErrorF12 => {
  const id = `E${String(n).padStart(2, '0')}`;
  return { id: `F12-${id}`, group, trigger, effect, evidenceKey: `${src}:${id}`, feedbackKey: `f12fb.${id}`, recoverable, fixture: `f12-flow:${id}`, safety };
};

export const SIMULATED_ERRORS_F12: SimulatedErrorF12[] = [
  // 20 errores experimentales específicos
  e(1, 'EXPERIMENTAL', 'err', 'apretar una junta sin empaquetadura (o con la gastada)', 'la fuga se lleva caudal: aguas abajo pasa menos que lo que marca el caudalímetro'),
  e(2, 'EXPERIMENTAL', 'err', 'no purgar el aire del circuito', 'la burbuja de los tubos se comprime: sensores lentos y con sesgo'),
  e(3, 'EXPERIMENTAL', 'nb', 'usar el diámetro externo como interno', 'el área y la velocidad calculadas quedan erradas'),
  e(4, 'EXPERIMENTAL', 'err', 'leer con la bomba todavía acelerando', 'flujo transitorio: no vale la hipótesis estacionaria'),
  e(5, 'EXPERIMENTAL', 'err', 'cerrar la válvula de golpe con caudal', 'golpe de ariete: el alivio se abre y la bomba se detiene', true, true),
  e(6, 'EXPERIMENTAL', 'err', 'leer una toma que sigue tapada', 'el sensor no ve la presión del tubo'),
  e(7, 'EXPERIMENTAL', 'err', 'colocar la sonda de Pitot de frente al flujo', 'registra la presión total, no la estática'),
  e(8, 'EXPERIMENTAL', 'err', 'enchufar los tubos de los sensores en tomas cruzadas', 'Δp aparece con el signo invertido'),
  e(9, 'EXPERIMENTAL', 'nb', 'ignorar la diferencia de altura entre tomas', 'la pérdida calculada absorbe ρgΔz'),
  e(10, 'EXPERIMENTAL', 'err', 'cambiar el tramo liso por el rugoso con la serie empezada', 'la serie mezcla dos rugosidades'),
  e(11, 'EXPERIMENTAL', 'err', 'subir la bomba con la válvula casi cerrada sin verificar la tubería', 'la presión supera el umbral seguro: alivio y bloqueo', true, true),
  e(12, 'EXPERIMENTAL', 'err', 'leer con el registrador en modo absoluto', 'las presiones llevan ~101 kPa de más: intercepto incorrecto'),
  e(13, 'EXPERIMENTAL', 'err', 'medir el volumen recogido sin cronometrar (o sin sincronizar el cronómetro)', 'no se puede deducir Q'),
  e(14, 'EXPERIMENTAL', 'err', 'dejar el vaso volumétrico rebosando', 'el volumen perdido no se cuenta'),
  e(15, 'EXPERIMENTAL', 'nb', 'usar la velocidad en cm/s como si fuera m/s', 'la energía cinética sale 10⁴ veces mayor'),
  e(16, 'EXPERIMENTAL', 'nb', 'extender el modelo incompresible a un gas rápido', 'predicción no válida (Ma > 0,3)'),
  e(17, 'EXPERIMENTAL', 'err', 'aceptar una lectura bajo el rango (presión negativa en la garganta)', 'el sensor marca 0 aunque la garganta está en succión'),
  e(18, 'EXPERIMENTAL', 'err', 'dejar un objeto dentro del conducto', 'la sección libre de la garganta baja y Δp crece'),
  e(19, 'EXPERIMENTAL', 'nb', 'suponer pérdidas nulas con el tramo rugoso y los codos activos', 'queda un residuo de presión sin explicar'),
  e(20, 'EXPERIMENTAL', 'err', 'cerrar el puesto con la bomba encendida', 'el circuito sigue presurizado: el cierre se rechaza'),
  // 20 errores de instrumentación, registro o montaje
  e(21, 'INSTRUMENTATION', 'err', 'leer sin poner en cero los sensores con la bomba detenida', 'cada lectura incorpora el sesgo de origen'),
  e(22, 'INSTRUMENTATION', 'err', 'dejar el registrador en el rango de 10 kPa', 'la toma 1 satura (clipped) a caudales altos'),
  e(23, 'INSTRUMENTATION', 'err', 'leer un canal sin sensor conectado', 'no hay señal: la etapa no se acredita'),
  e(24, 'INSTRUMENTATION', 'err', 'registrar a menos de 20 Hz', 'menos muestras promediadas: más ruido y la pulsación de la bomba se cuela'),
  e(25, 'INSTRUMENTATION', 'err', 'leer el vaso debajo del desviador', 'la manguera tapa la graduación'),
  e(26, 'INSTRUMENTATION', 'err', 'apoyar el calibre inclinado sobre la pieza', 'mide D / cos α'),
  e(27, 'INSTRUMENTATION', 'err', 'usar los sensores sin calibrar su pendiente', 'las presiones quedan multiplicadas por su factor de escala'),
  e(28, 'INSTRUMENTATION', 'err', 'dejar el Venturi sin abrazaderas', 'el empuje del flujo lo corre y afloja J1'),
  e(29, 'INSTRUMENTATION', 'err', 'leer una escala con la vista oblicua', 'error de paralaje'),
  e(30, 'INSTRUMENTATION', 'err', 'leer antes de que los sensores o el caudalímetro se estabilicen', 'valor transitorio tomado como estacionario'),
  e(31, 'INSTRUMENTATION', 'nb', 'dato bruto escrito a mano en lugar de importarlo de una lectura', 'sin procedencia: dato no observado'),
  e(32, 'INSTRUMENTATION', 'err', 'cambiar la configuración de los sensores con una serie empezada', 'la serie mezcla dos condiciones'),
  e(33, 'INSTRUMENTATION', 'nb', 'presiones y caudal de ensayos distintos en la misma fila', 'datos de otro ensayo'),
  e(34, 'INSTRUMENTATION', 'nb', 'conversión kPa → Pa, L/s → m³/s o cm → m errónea', 'resultado en escala incorrecta'),
  e(35, 'INSTRUMENTATION', 'nb', 'velocidades redondeadas a 0,1 m/s antes de elevarlas al cuadrado', 'sesgo por truncamiento'),
  e(36, 'INSTRUMENTATION', 'nb', 'pendiente calculada como ½(v₂² − v₁²) frente a Δp', 'se informa 1/ρ'),
  e(37, 'INSTRUMENTATION', 'nb', 'menos de cinco caudales (o de tres con pérdidas)', 'tendencia y repetibilidad no sustentadas'),
  e(38, 'INSTRUMENTATION', 'nb', 'u escrita menor que la tipo B de los instrumentos', 'intervalo subestimado'),
  e(39, 'INSTRUMENTATION', 'err', 'seguir midiendo con un sensor dañado por sobrepresión', 'el sensor golpeado no describe el modelo'),
  e(40, 'INSTRUMENTATION', 'err', 'abrir una junta, una toma o cambiar el tramo con el circuito presurizado', 'el agua sale a presión: el puesto se bloquea', true, true),
];

/** Clave corta (E01…E40), que también es la clave de retroalimentación `f12fb.Exx`. */
export const errKeyF12 = (x: SimulatedErrorF12) => x.evidenceKey.replace(/^(err|nb):/, '');
