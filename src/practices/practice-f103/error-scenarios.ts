/**
 * Escenarios docentes (§10) y catálogo de 40 errores simulables (§9). Contrato de cada error: `id`, `group`,
 * `trigger` (comando o predicado de libreta), `effect` (estado o sesgo calculado), `evidenceKey` (`err:Exx` en el
 * mundo o `nb:Exx` en la libreta), `feedbackKey` (`f103fb.Exx`), `recoverable` y `fixture` (prueba de integración).
 */
import { SF3 } from '../../simulation/f103-world/world';

export type F103Scenario = (typeof SF3)[keyof typeof SF3];
export const F103_SCENARIOS: F103Scenario[] = Object.values(SF3);

export interface SimulatedErrorF103 {
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

const e = (n: number, group: SimulatedErrorF103['group'], src: 'err' | 'nb', trigger: string, effect: string, recoverable = true, safety = false): SimulatedErrorF103 => {
  const id = `E${String(n).padStart(2, '0')}`;
  return { id: `F103-${id}`, group, trigger, effect, evidenceKey: `${src}:${id}`, feedbackKey: `f103fb.${id}`, recoverable, fixture: `f103-flow:${id}`, safety };
};

export const SIMULATED_ERRORS_F103: SimulatedErrorF103[] = [
  // 20 errores experimentales específicos
  e(1, 'EXPERIMENTAL', 'err', 'setAngle con el soporte sin anclar', 'el par del mando corre la base, gira el azimut e inclina el deck'),
  e(2, 'EXPERIMENTAL', 'err', 'readGate con el haz descentrado > 2 mm (o fuera de la esfera)', 'la cuerda cortada es menor que el diámetro: v₀ sobrestimada o sin dato'),
  e(3, 'EXPERIMENTAL', 'err', 'fire con el resorte cargado y sin esfera', 'el émbolo descarga toda la energía contra el tope (disparo en vacío)'),
  e(4, 'EXPERIMENTAL', 'nb', 'v₀ de la libreta tomada de una muesca distinta de la del disparo', 'la predicción del alcance no corresponde al ensayo'),
  e(5, 'EXPERIMENTAL', 'nb', 'ángulo en grados usado como radianes en sen/cos', 'componentes y alcance predicho absurdos'),
  e(6, 'EXPERIMENTAL', 'err', 'altura o distancias medidas desde la base o el deck en lugar de la boca', 'y₀ o x se corren varios cm'),
  e(7, 'EXPERIMENTAL', 'err', 'primer contacto en el suelo con la plataforma conectada', 'la plataforma no registra el primer impacto (alcance perdido)'),
  e(8, 'EXPERIMENTAL', 'err', 'fire con la barrera de la zona abierta', 'enclavamiento: el disparo no sale y el ensayo se suspende', true, true),
  e(9, 'EXPERIMENTAL', 'nb', 'réplicas promediadas con viento distinto', 'el promedio mezcla dos condiciones'),
  e(10, 'EXPERIMENTAL', 'nb', 'v_y con el signo cambiado (hacia arriba negativo tras el vértice o al revés)', 'el signo contradice el eje vertical'),
  e(11, 'EXPERIMENTAL', 'nb', 'lectura de plataforma marcada BOUNCE usada como alcance', 'el alcance es el de un rebote, no el del primer contacto'),
  e(12, 'EXPERIMENTAL', 'nb', 'tiempo del vértice escrito como tiempo de vuelo', 'T subestimada a la mitad (o menos)'),
  e(13, 'EXPERIMENTAL', 'nb', 'fórmula de alcance a nivel con la boca elevada (y₀ > 5 cm)', 'R_pred subestimada'),
  e(14, 'EXPERIMENTAL', 'nb', 'comparación de alcances con esferas de distinto diámetro', 'el arrastre y la fotopuerta difieren: comparación inválida'),
  e(15, 'EXPERIMENTAL', 'nb', 'ajuste de la trayectoria con menos de tres puntos de pantalla', 'la parábola no queda determinada'),
  e(16, 'EXPERIMENTAL', 'err', 'ventilador encendido o apagado con la esfera en vuelo', 'el viento cambia a mitad del vuelo'),
  e(17, 'EXPERIMENTAL', 'err', 'fire antes de que la plataforma se asiente tras moverla', 'la posición registrada vibra (±1 cm)'),
  e(18, 'EXPERIMENTAL', 'err', 'readTape con el cero de la cinta fuera de la plomada', 'todas las distancias se corren varios cm'),
  e(19, 'EXPERIMENTAL', 'err', 'impacto con desvío lateral > 3 cm y el lanzador girado > 1°', 'el disparo sale del plano de la pista: Δx no es el alcance'),
  e(20, 'EXPERIMENTAL', 'nb', 'alcance escrito solo con Δx cuando hay desvío lateral', 'el alcance real es √(Δx² + Δy²)'),
  // 20 errores de instrumentación, registro o montaje
  e(21, 'INSTRUMENTATION', 'err', 'readProtractor sin ajustar el cero con el cañón horizontal', 'cada lectura lleva el error de cero (±1,5°)'),
  e(22, 'INSTRUMENTATION', 'err', 'tiempo de vuelo > 1 s con el reloj en rango corto', 'el reloj satura en 1 s'),
  e(23, 'INSTRUMENTATION', 'err', 'fotopuerta o plataforma sin conectar', 'no hay señal de ese canal'),
  e(24, 'INSTRUMENTATION', 'err', 'fotopuerta a 1 kHz con < 10 muestras de bloqueo', 'Δt sin resolver: v₀ con error de ±20 %'),
  e(25, 'INSTRUMENTATION', 'err', 'readImpact con la pantalla interceptando la esfera', 'la plataforma no ve el impacto (línea de vuelo bloqueada)'),
  e(26, 'INSTRUMENTATION', 'err', 'readProtractor con el deck inclinado respecto del cero', 'el transportador no indica la elevación real'),
  e(27, 'INSTRUMENTATION', 'err', 'readImpact sin calibrar la plataforma con las esquinas patrón', 'posiciones multiplicadas por 1,03'),
  e(28, 'INSTRUMENTATION', 'err', 'fire con el soporte sin anclar', 'el soporte retrocede: la boca se desplaza y v₀ baja'),
  e(29, 'INSTRUMENTATION', 'err', 'lectura de transportador, cinta, regla o pantalla con la vista oblicua', 'la división leída se corre'),
  e(30, 'INSTRUMENTATION', 'err', 'lectura del nivel o del transportador sin estabilizar', 'valor transitorio tomado como final'),
  e(31, 'INSTRUMENTATION', 'nb', 'dato bruto escrito a mano en lugar de importarlo de una lectura', 'sin procedencia: dato no observado'),
  e(32, 'INSTRUMENTATION', 'err', 'cambio de montaje (ángulo, muesca, plataforma, pantalla) con la esfera en vuelo', 'el disparo mezcla dos condiciones'),
  e(33, 'INSTRUMENTATION', 'nb', 'fila con lecturas de montajes distintos (posición o ángulo)', 'datos incompatibles con el montaje'),
  e(34, 'INSTRUMENTATION', 'nb', 'conversión cm → m o ms → s errónea', 'resultado en escala incorrecta (×10, ×100, ×1000)'),
  e(35, 'INSTRUMENTATION', 'nb', 'Δt de la fotopuerta redondeado al ms antes de calcular v₀', 'sesgo por truncamiento (≈ 10–20 %)'),
  e(36, 'INSTRUMENTATION', 'nb', 'coeficiente del ajuste o componente con el signo contrario', 'la parábola abre hacia arriba o la pendiente no corresponde'),
  e(37, 'INSTRUMENTATION', 'nb', 'menos de tres disparos válidos para v₀', 'repetibilidad no sustentada'),
  e(38, 'INSTRUMENTATION', 'nb', 'u escrita menor que la tipo B del instrumento', 'intervalo subestimado'),
  e(39, 'INSTRUMENTATION', 'err', 'lecturas con una esfera abollada tras un choque fuerte', 'diámetro efectivo y arrastre cambian: datos sesgados', true, true),
  e(40, 'INSTRUMENTATION', 'err', 'sacar la esfera con el resorte cargado', 'el émbolo se dispara sin control; bloqueo', true, true),
];

/** Clave corta (E01…E40), que también es la clave de retroalimentación `f103fb.Exx`. */
export const errKeyF3 = (x: SimulatedErrorF103) => x.evidenceKey.replace(/^(err|nb):/, '');
