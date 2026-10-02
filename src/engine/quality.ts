/**
 * Niveles de calidad (§3.9). Los efectos se degradan SIN cambiar datos científicos.
 */
export type QualityLevel = 'HIGH' | 'MEDIUM' | 'LOW';
export type QualitySetting = QualityLevel | 'AUTO';

export interface QualityProfile {
  shadows: boolean;
  shadowMapSize: number;
  maxDpr: number;
  antialias: boolean;
  /** Fracción de partículas visibles. */
  particles: number;
  /** Vidrio con clearcoat y reflejos completos; en Baja, vidrio transparente simple. */
  richGlass: boolean;
  /** Detalle de la sala (vitrinas con material, frascos del estante). */
  roomDetail: boolean;
  latheSegments: number;
}

export const QUALITY: Record<QualityLevel, QualityProfile> = {
  HIGH: { shadows: true, shadowMapSize: 2048, maxDpr: 2, antialias: true, particles: 1, richGlass: true, roomDetail: true, latheSegments: 48 },
  MEDIUM: { shadows: true, shadowMapSize: 1024, maxDpr: 1.5, antialias: true, particles: 0.6, richGlass: true, roomDetail: true, latheSegments: 32 },
  LOW: { shadows: false, shadowMapSize: 512, maxDpr: 1.25, antialias: false, particles: 0.3, richGlass: false, roomDetail: false, latheSegments: 20 },
};

/** Selección automática por una prueba breve de rendimiento (fps medidos durante ~3 s). */
export function pickQuality(fps: number, current: QualityLevel): QualityLevel {
  if (fps < 28) return current === 'HIGH' ? 'MEDIUM' : 'LOW';
  if (fps > 55 && current === 'MEDIUM') return 'HIGH';
  return current;
}
