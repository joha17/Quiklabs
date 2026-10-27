/**
 * Registro de piezas manipulables de los instrumentos de B01 (§6.1): cada mando tiene un identificador estable
 * (`mic:coarse`, `ste:zoom`…), un tipo de agarre y su volumen de selección colocado SOBRE la pieza visible, con el
 * eje de giro o de desplazamiento en el marco local de ese volumen. No hay zonas flotantes: si el rayo no toca la
 * pieza, el gesto no hace nada.
 */
import * as THREE from 'three';
import { materials } from '../renderers/materials';

/**
 * - `rotary`: perilla, anillo o rueda que gira sobre su eje (macro, micro, X/Y, revólver, zoom, dioptrías…).
 * - `lever`: palanca que gira alrededor de un pivote con recorrido limitado (pinza, diafragma).
 * - `linear`: pieza que se desliza a lo largo de un eje (oculares → distancia interpupilar, carro del estéreo).
 * - `press`: interruptor o pieza que se pulsa (encendido, tapa de la caja, ocular para mirar).
 */
export type GripKind = 'rotary' | 'lever' | 'linear' | 'press';
export type GripAxis = 'x' | 'y' | 'z';

export interface PartGrip {
  kind: GripKind;
  axis: GripAxis;
  /** Un clic sin arrastre también actúa (mirar por el ocular, encender, abrir la tapa). */
  click?: boolean;
  /** Variante de la pieza (p. ej. `objective`: el revólver tomado por un objetivo, `left`/`right`: lado del ocular). */
  variant?: string;
}

/** Datos de selección que lleva cada volumen (`userData` de la malla invisible). */
export interface HitData {
  objId: string;
  part?: string;
  grip?: PartGrip;
}

const hitMat = () => materials('LOW').hit;

/** Volumen de selección del objeto o de una de sus piezas. */
export function hitMesh(geo: THREE.BufferGeometry, objId: string, part?: string, grip?: PartGrip): THREE.Mesh {
  const m = new THREE.Mesh(geo, hitMat());
  const data: HitData = { objId, part, grip };
  m.userData = data;
  return m;
}

/** Volumen cilíndrico de una perilla con su eje (el cilindro de three.js está a lo largo de Y). */
export function knobHit(r: number, len: number, axis: GripAxis, objId: string, part: string, grip: Omit<PartGrip, 'axis'> = { kind: 'rotary' }): THREE.Mesh {
  const geo = new THREE.CylinderGeometry(r, r, len, 12);
  if (axis === 'x') geo.rotateZ(Math.PI / 2);
  if (axis === 'z') geo.rotateX(Math.PI / 2);
  return hitMesh(geo, objId, part, { ...grip, axis });
}

/** Coloca un volumen (o cualquier objeto) en (x, y, z) de su padre. */
export function placeAt<T extends THREE.Object3D>(o: T, x: number, y: number, z: number): T {
  o.position.set(x, y, z);
  return o;
}

/** Clave de i18n con el nombre de la pieza y el gesto (`b01.grip.<obj>_<parte>`). */
export const gripKey = (objId: string, part: string) => `b01.grip.${objId}_${part}`;

/**
 * Relación entre el giro (o desplazamiento) visible de cada pieza y la magnitud del dominio. La usan los modelos
 * (ángulo = valor × k, giro positivo según la mano derecha sobre el eje de la pieza) y el controlador (Δvalor =
 * Δángulo / k), de modo que la pieza siempre acompaña a la mano y el dominio recibe el mismo número.
 */
export const KIN = {
  /** Macro, micro y perilla de enfoque del estéreo: una vuelta de la pieza = una vuelta del dominio. */
  radPerTurn: Math.PI * 2,
  /** Mandos coaxiales X/Y (rad por mm de carro) `pending`: 12 mm por vuelta. */
  stageRadPerMm: (Math.PI * 2) / 12,
  /** Revólver: rad por grado del dominio (el rotor gira en sentido contrario al ángulo del dominio). */
  turretRadPerDeg: -Math.PI / 180,
  /** Rueda de intensidad y diales de luz del estéreo (rad por unidad 0–1). */
  dialRadPer01: 4,
  /** Palanca del iris: ángulo en 0 y recorrido (rad por unidad 0–1). */
  irisRad0: -0.8,
  irisRadPer01: 1.6,
  /** Perilla de altura del condensador (rad por unidad 0–1). */
  condenserRadPer01: 3,
  /** Palanca de la pinza: abierta a −0,9 rad sobre su pivote vertical. */
  clipOpenRad: -0.9,
  /** Zoom del estéreo (rad por aumento). */
  zoomRadPerX: 1.4,
  /** Anillos de dioptrías (rad por dioptría). */
  diopterRadPerD: 0.8,
} as const;
