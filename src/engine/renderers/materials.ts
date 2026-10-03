/**
 * Materiales 3D compartidos (§3.5). Se crean una vez por nivel de calidad y se reutilizan (pocas llamadas de dibujo).
 * Vidrio: transparente con reflejos del entorno y barniz (clearcoat). No se usa `transmission`: en Three.js los
 * objetos transmisivos solo «ven» objetos opacos, y el líquido (translúcido) dentro del vaso desaparecería.
 */
import * as THREE from 'three';
import type { QualityLevel } from '../quality';

export interface MaterialSet {
  glass: THREE.MeshPhysicalMaterial;
  glassHot: THREE.MeshPhysicalMaterial;
  amberGlass: THREE.MeshPhysicalMaterial;
  porcelain: THREE.MeshPhysicalMaterial;
  plasticWhite: THREE.MeshPhysicalMaterial;
  plasticBlue: THREE.MeshStandardMaterial;
  plasticYellow: THREE.MeshStandardMaterial;
  rubberRed: THREE.MeshStandardMaterial;
  steel: THREE.MeshStandardMaterial;
  chrome: THREE.MeshStandardMaterial;
  darkMetal: THREE.MeshStandardMaterial;
  blackPlastic: THREE.MeshStandardMaterial;
  enamel: THREE.MeshStandardMaterial;
  wood: THREE.MeshStandardMaterial;
  paper: THREE.MeshStandardMaterial;
  wetPaper: THREE.MeshStandardMaterial;
  ice: THREE.MeshPhysicalMaterial;
  hit: THREE.MeshBasicMaterial;
}

const cache = new Map<QualityLevel, MaterialSet>();

export function materials(q: QualityLevel): MaterialSet {
  const c = cache.get(q);
  if (c) return c;
  const rich = q !== 'LOW';
  const glass = new THREE.MeshPhysicalMaterial({
    color: 0xeef6fb,
    roughness: 0.04,
    metalness: 0,
    transparent: true,
    opacity: rich ? 0.22 : 0.28,
    clearcoat: rich ? 1 : 0,
    clearcoatRoughness: 0.05,
    envMapIntensity: rich ? 1.6 : 1.0,
    ior: 1.5,
    specularIntensity: 1,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const glassHot = glass.clone();
  glassHot.color = new THREE.Color(0xffd9c9);
  const amberGlass = glass.clone();
  amberGlass.color = new THREE.Color(0xa0662a);
  amberGlass.opacity = 0.55;
  const set: MaterialSet = {
    glass,
    glassHot,
    amberGlass,
    porcelain: new THREE.MeshPhysicalMaterial({ color: 0xf8f6f0, roughness: 0.25, clearcoat: rich ? 0.8 : 0, clearcoatRoughness: 0.15 }),
    plasticWhite: new THREE.MeshPhysicalMaterial({ color: 0xf2f4f6, roughness: 0.45, transparent: true, opacity: 0.72, side: THREE.DoubleSide, depthWrite: false }),
    plasticBlue: new THREE.MeshStandardMaterial({ color: 0x2f7fd1, roughness: 0.45 }),
    plasticYellow: new THREE.MeshStandardMaterial({ color: 0xf2c230, roughness: 0.5 }),
    rubberRed: new THREE.MeshStandardMaterial({ color: 0xc0392b, roughness: 0.65 }),
    steel: new THREE.MeshStandardMaterial({ color: 0xc4ccd3, metalness: 0.9, roughness: 0.28 }),
    chrome: new THREE.MeshStandardMaterial({ color: 0xe8edf1, metalness: 1, roughness: 0.12 }),
    darkMetal: new THREE.MeshStandardMaterial({ color: 0x3e464e, metalness: 0.6, roughness: 0.45 }),
    blackPlastic: new THREE.MeshStandardMaterial({ color: 0x1f262d, roughness: 0.5 }),
    enamel: new THREE.MeshStandardMaterial({ color: 0xeef1f4, roughness: 0.35 }),
    wood: new THREE.MeshStandardMaterial({ color: 0xc8a27a, roughness: 0.7 }),
    paper: new THREE.MeshStandardMaterial({ color: 0xfbfbf6, roughness: 0.95, side: THREE.DoubleSide }),
    wetPaper: new THREE.MeshStandardMaterial({ color: 0xd9e1e8, roughness: 0.8, side: THREE.DoubleSide, transparent: true, opacity: 0.92 }),
    ice: new THREE.MeshPhysicalMaterial({ color: 0xeaf6ff, roughness: 0.15, transparent: true, opacity: 0.75, clearcoat: 1 }),
    // Volúmenes de selección: invisibles pero «tocables» por el rayo.
    hit: new THREE.MeshBasicMaterial({ visible: false }),
  };
  cache.set(q, set);
  return set;
}

/** Material de líquido recortado por un plano horizontal (nivel). */
export function liquidMaterial(color: number, opacity: number, planes: THREE.Plane[]): THREE.MeshPhysicalMaterial {
  return new THREE.MeshPhysicalMaterial({
    color,
    // Un poco de luz propia para que el líquido se lea también en la sombra o contra la mesada oscura.
    emissive: color,
    emissiveIntensity: 0.12,
    roughness: 0.08,
    metalness: 0,
    transparent: true,
    opacity,
    clearcoat: 0.6,
    clippingPlanes: planes,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
}
