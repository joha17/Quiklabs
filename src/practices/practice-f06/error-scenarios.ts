/**
 * Escenarios docentes (§10) y catálogo de 40 errores simulables (§9). Contrato de cada error: `id`, `group`,
 * `trigger` (comando o predicado de libreta), `effect` (estado o sesgo calculado), `evidenceKey` (`err:Exx` en el
 * mundo o `nb:Exx` en la libreta), `feedbackKey` (`f06fb.Exx`), `recoverable` y `fixture` (prueba de integración).
 */
import { SF6 } from '../../simulation/f06-world/world';

export type F06Scenario = (typeof SF6)[keyof typeof SF6];
export const F06_SCENARIOS: F06Scenario[] = Object.values(SF6);

export interface SimulatedErrorF06 {
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

const e = (n: number, group: SimulatedErrorF06['group'], src: 'err' | 'nb', trigger: string, effect: string, recoverable = true, safety = false): SimulatedErrorF06 => {
  const id = `E${String(n).padStart(2, '0')}`;
  return { id: `F06-${id}`, group, trigger, effect, evidenceKey: `${src}:${id}`, feedbackKey: `f06fb.${id}`, recoverable, fixture: `f06-flow:${id}`, safety };
};

export const SIMULATED_ERRORS_F06: SimulatedErrorF06[] = [
  // 20 errores experimentales específicos
  e(1, 'EXPERIMENTAL', 'err', 'compress más allá del límite elástico del resorte', 'rigidez no lineal y daño permanente del resorte'),
  e(2, 'EXPERIMENTAL', 'err', 'releaseCart con el resorte del lanzador sin su presilla', 'el resorte salta a mitad de carrera: el carro recibe menos energía'),
  e(3, 'EXPERIMENTAL', 'err', 'readRuler con el cero de la regla corrido', 'todos los alargamientos sesgados: k estimada mal'),
  e(4, 'EXPERIMENTAL', 'err', 'loadCart con el carro en marcha', 'choque inelástico con la pesa: salto en la energía del ensayo'),
  e(5, 'EXPERIMENTAL', 'err', 'readRuler con la carga todavía oscilando', 'lectura con componente dinámica'),
  e(6, 'EXPERIMENTAL', 'err', 'readHeight desde la mesada en lugar del tramo del lanzador', 'U_g desplazada en m g z₀'),
  e(7, 'EXPERIMENTAL', 'nb', 'fuerza de la calibración sin la masa del porta-pesas', 'F subestimada: k sesgada'),
  e(8, 'EXPERIMENTAL', 'err', 'releaseCart empujando el carro', 'energía inicial extra de la mano'),
  e(9, 'EXPERIMENTAL', 'nb', 'trabajo neto escrito igual al de una sola fuerza', 'W_neto ≠ ΔK'),
  e(10, 'EXPERIMENTAL', 'nb', 'trabajo del roce con signo positivo', 'la energía parece generarse'),
  e(11, 'EXPERIMENTAL', 'nb', 'K = m v² en lugar de ½ m v²', 'energía cinética al doble'),
  e(12, 'EXPERIMENTAL', 'nb', 'W de la fuerza variable como F_máx · x', 'área bajo F–x al doble'),
  e(13, 'EXPERIMENTAL', 'err', 'carro lanzado sin el freno del extremo alto', 'choca con el soporte del extremo: rueda torcida y bloqueo', true, true),
  e(14, 'EXPERIMENTAL', 'err', 'fotopuerta fuera del tramo llano (abajo o en la cima)', 'la rapidez se mide en otro punto del perfil'),
  e(15, 'EXPERIMENTAL', 'err', 'readLaunch con los canales de fuerza y posición sin sincronizar', 'F(t) y x(t) desfasados: área y potencia sesgadas'),
  e(16, 'EXPERIMENTAL', 'nb', 'conclusión de conservación ideal con el amortiguador activo', 'contradicción con la energía disipada'),
  e(17, 'EXPERIMENTAL', 'err', 'releaseBob con empuje lateral', 'trayectoria 3D: la esfera corta el haz fuera de su diámetro'),
  e(18, 'EXPERIMENTAL', 'err', 'lecturas con un resorte dañado tomado como conservativo', 'histéresis: el trabajo de ida no vuelve'),
  e(19, 'EXPERIMENTAL', 'nb', 'potencia máxima escrita como W/Δt', 'P(t) tomada como constante'),
  e(20, 'EXPERIMENTAL', 'err', 'readLaunch de un disparo con compresión fuera del tramo lineal', 'U_el ≠ ½ k x²'),
  // 20 errores de instrumentación, registro o montaje
  e(21, 'INSTRUMENTATION', 'err', 'lectura del sensor de fuerza sin cero o de la balanza sin tarar', 'cada lectura incorpora el sesgo de origen'),
  e(22, 'INSTRUMENTATION', 'err', 'rango del sensor de fuerza menor que la fuerza del resorte', 'la señal satura (clipped)'),
  e(23, 'INSTRUMENTATION', 'err', 'lectura con un canal sin conectar', 'no hay señal de ese canal'),
  e(24, 'INSTRUMENTATION', 'err', 'registrador a menos de 1000 Hz para el disparo', 'el empuje de ~70 ms queda con pocas muestras'),
  e(25, 'INSTRUMENTATION', 'err', 'compuerta dentro del tramo del lanzador', 'tapa el haz del sensor de posición'),
  e(26, 'INSTRUMENTATION', 'err', 'sensor de fuerza montado inclinado respecto del eje del resorte', 'mide F cos α'),
  e(27, 'INSTRUMENTATION', 'err', 'lectura sin calibrar la pendiente del sensor de fuerza', 'fuerzas multiplicadas por 1,05'),
  e(28, 'INSTRUMENTATION', 'err', 'ensayos con la columna del riel sin abrazadera', 'la parte alta baja con cada pasada'),
  e(29, 'INSTRUMENTATION', 'err', 'lectura de regla, medidor o escala con la vista oblicua', 'error de paralaje'),
  e(30, 'INSTRUMENTATION', 'err', 'lectura antes de estabilizarse (balanza, medidor o escala recién movidos)', 'valor transitorio tomado como final'),
  e(31, 'INSTRUMENTATION', 'nb', 'dato bruto escrito a mano en lugar de importarlo de una lectura', 'sin procedencia: dato no observado'),
  e(32, 'INSTRUMENTATION', 'err', 'cambio de montaje con el carro o la esfera en marcha', 'el ensayo mezcla dos condiciones'),
  e(33, 'INSTRUMENTATION', 'nb', 'ensayo importado de otra altura, compresión o con pérdidas en una fila que no corresponde', 'datos de otro ensayo'),
  e(34, 'INSTRUMENTATION', 'nb', 'conversión g → kg o cm → m errónea', 'resultado en escala incorrecta'),
  e(35, 'INSTRUMENTATION', 'nb', 'rapidez calculada con el tiempo de bloqueo redondeado al ms', 'sesgo por truncamiento en K'),
  e(36, 'INSTRUMENTATION', 'nb', 'pendiente de F contra x con los ejes invertidos', 'se informa 1/k en lugar de k'),
  e(37, 'INSTRUMENTATION', 'nb', 'menos de tres disparos válidos a la altura de referencia', 'repetibilidad no sustentada'),
  e(38, 'INSTRUMENTATION', 'nb', 'u escrita menor que la tipo B del instrumento', 'intervalo subestimado'),
  e(39, 'INSTRUMENTATION', 'err', 'lecturas del riel tras un golpe del carro sin repararlo', 'rueda torcida: más roce y tiempos sesgados'),
  e(40, 'INSTRUMENTATION', 'err', 'desmontar el resorte del lanzador con el carro trabado y comprimido', 'la energía se libera de golpe; bloqueo del puesto', true, true),
];

/** Clave corta (E01…E40), que también es la clave de retroalimentación `f06fb.Exx`. */
export const errKeyF6 = (x: SimulatedErrorF06) => x.evidenceKey.replace(/^(err|nb):/, '');
