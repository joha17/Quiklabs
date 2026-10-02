/**
 * Lo que la capa de interacción necesita de la vista (3D u otra): proyección del puntero sobre la mesada,
 * selección por rayo y navegación de cámara. El controlador trabaja en cm de mesada (x, y, z) y nunca
 * conoce Three.js.
 */
export interface PickHit {
  id: string;
  /** Parte del objeto (p. ej. 'knob' de la placa, 'tare' de la balanza). */
  part?: string;
}

export interface ViewAdapter {
  /** Intersección del rayo del puntero (px del lienzo) con el plano horizontal de altura z (cm). */
  toBench(sx: number, sy: number, z: number): { x: number; y: number };
  /** Objeto bajo el puntero (raycast sobre volúmenes simples). */
  pick(sx: number, sy: number, excludeId?: string | null): PickHit | null;
  /** Ancho del lienzo en px (para el desplazamiento en los bordes). */
  viewW(): number;
  /** Desplaza la vista lateralmente (arrastre cerca de los bordes). */
  edgePan(dir: -1 | 1, dt: number): void;
  zoomBy(f: number): void;
  /** Asegura que la posición x (cm) sea visible. */
  reveal(x: number): void;
  /** Activa/desactiva la órbita de cámara (se desactiva mientras se sostiene un objeto). */
  setOrbitEnabled(on: boolean): void;
  /**
   * Coloca un objeto suelto sobre la mesada. Si la vista tiene física, el objeto cae y se apoya solo
   * (devuelve true); si no, el controlador busca un hueco libre.
   */
  releaseToPhysics?(id: string, isProp: boolean): boolean;
}
