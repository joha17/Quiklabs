/**
 * Perfiles de emisión de los cationes (§9.2–9.3) y del filtro de cobalto (§9.5). Configurables.
 * Cada catión es un conjunto de líneas/bandas (no un color RGB). Cu y Ba incluyen bandas moleculares (CuCl, BaCl/BaOH),
 * porque la coloración de la llama no proviene de una sola línea atómica.
 */
import type { SpectralComponent } from '../../simulation/spectroscopy/spectrum';

export type CationId = 'Li+' | 'Na+' | 'K+' | 'Ca2+' | 'Cu2+' | 'Ba2+';

export const CATIONS: CationId[] = ['Li+', 'Na+', 'K+', 'Ca2+', 'Cu2+', 'Ba2+'];

export interface CationEmissionProfile {
  cation: CationId;
  components: SpectralComponent[];
  /** Descriptor docente (no se usa para pintar). */
  visualLabel: string;
  /** Rapidez relativa de consumo de la muestra en la llama. */
  volatilityFactor: number;
  /** Brillo relativo por mg consumido (el sodio es muy intenso, §10.4). */
  sodiumSensitivity: number;
}

const L = (centerNm: number, relativeIntensity: number, widthNm = 1.1): SpectralComponent => ({ centerNm, widthNm, relativeIntensity, type: 'LINE' });
const B = (centerNm: number, relativeIntensity: number, widthNm: number): SpectralComponent => ({ centerNm, widthNm, relativeIntensity, type: 'BAND' });

export const CATION_PROFILES: Record<CationId, CationEmissionProfile> = {
  'Li+': {
    cation: 'Li+',
    components: [L(670.8, 1), L(610.4, 0.1), L(460.3, 0.003)],
    visualLabel: 'rojo carmín',
    volatilityFactor: 0.9,
    sodiumSensitivity: 26,
  },
  'Na+': {
    cation: 'Na+',
    // Doblete D: 589,0 y 589,6 nm, muy intenso.
    components: [L(589.0, 1), L(589.6, 0.5)],
    visualLabel: 'amarillo intenso',
    volatilityFactor: 1,
    sodiumSensitivity: 90,
  },
  'K+': {
    cation: 'K+',
    // 404,4/404,7 nm (violeta), 691/694 nm (rojo) y 766,5/769,9 nm (límite rojo/IR cercano) + continuo débil.
    components: [L(404.4, 0.3), L(404.7, 0.15), L(691.1, 0.05), L(693.9, 0.08), L(766.5, 1), L(769.9, 0.5), B(560, 0.03, 60)],
    visualLabel: 'lila / morado pálido',
    volatilityFactor: 1.1,
    sodiumSensitivity: 95,
  },
  'Ca2+': {
    cation: 'Ca2+',
    // Bandas de CaOH/CaO (rojo ladrillo–anaranjado) + línea atómica de 422,7 nm.
    components: [B(622, 1, 7), B(606, 0.45, 5), B(554, 0.3, 5), L(422.7, 0.08)],
    visualLabel: 'rojo ladrillo / anaranjado rojizo',
    volatilityFactor: 0.7,
    sodiumSensitivity: 6,
  },
  'Cu2+': {
    cation: 'Cu2+',
    // Bandas de CuCl (verde-azul) y líneas de Cu.
    components: [B(478, 0.5, 5), B(488, 0.85, 5), B(498, 0.85, 5), B(510, 0.65, 5), B(526, 0.5, 6), B(538, 0.25, 5), L(510.5, 0.12), L(521.8, 0.1)],
    visualLabel: 'verde azulado',
    volatilityFactor: 0.75,
    sodiumSensitivity: 4,
  },
  'Ba2+': {
    cation: 'Ba2+',
    // Línea de 553,5 nm y bandas de BaCl/BaOH (verde manzana / amarillo verdoso).
    components: [L(553.5, 1, 1.3), B(513, 0.18, 5), B(524, 0.25, 5), B(487, 0.05, 5)],
    visualLabel: 'verde manzana / amarillo verdoso',
    volatilityFactor: 0.75,
    sodiumSensitivity: 5,
  },
};

/**
 * Transmisión aproximada del vidrio azul de cobalto: deja pasar azul/violeta y parte del rojo profundo,
 * bloquea fuertemente la región amarilla (589 nm del Na).
 */
export const COBALT_TRANSMISSION: ReadonlyArray<readonly [number, number]> = [
  [380, 0.55], [400, 0.72], [440, 0.78], [470, 0.62], [500, 0.3], [520, 0.12], [540, 0.04], [560, 0.012],
  [575, 0.004], [589, 0.002], [605, 0.004], [625, 0.012], [645, 0.05], [665, 0.16], [690, 0.38], [720, 0.62], [780, 0.75],
];

/** Componentes de la llama base (CH* 431 nm y bandas de Swan del C₂). */
export const BLUE_FLAME_COMPONENTS: SpectralComponent[] = [
  B(431.4, 1, 2.5), B(473.7, 0.28, 3), B(516.5, 0.42, 3), B(563.5, 0.15, 3), B(390, 0.12, 4),
];

/** Fórmula de la sal y concentración (§9.2). */
export interface SaltSolutionDef {
  id: string;
  label: string;
  /** Catión(es) y fracción de masa de sal en la disolución. */
  species: Partial<Record<CationId, number>>;
  concentrationPercent: number;
  /** Color de la disolución (absorción, no emisión): solo el Cu²⁺ es azul verdoso pálido. */
  solutionColor: number;
  solutionOpacity: number;
}
