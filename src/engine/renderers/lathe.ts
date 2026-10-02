/**
 * Geometrías procedurales por revolución (LatheGeometry) a partir de los perfiles de instruments.ts (§3.5).
 * Se cachean por perfil y nivel de detalle.
 */
import * as THREE from 'three';
import type { InstrumentProfile, ProfilePt } from '../../practices/practice-02/instruments';

const cache = new Map<string, THREE.BufferGeometry>();

function key(name: string, seg: number) {
  return `${name}|${seg}`;
}

/** Pared con espesor: perfil exterior (base→borde) + interior (borde→fondo), cerrada en el borde. */
export function shellGeometry(name: string, p: InstrumentProfile, seg: number, innerOverride?: ProfilePt[]): THREE.BufferGeometry {
  const k = key(`shell:${name}`, seg);
  const c = cache.get(k);
  if (c) return c;
  const inner = innerOverride ?? p.inner;
  const pts: THREE.Vector2[] = [];
  for (const [r, y] of p.outer) pts.push(new THREE.Vector2(Math.max(r, 0.0001), y));
  // Borde redondeado
  const top = p.outer[p.outer.length - 1];
  const inTop = inner[inner.length - 1];
  pts.push(new THREE.Vector2((top[0] + inTop[0]) / 2, top[1] + 0.04));
  for (let i = inner.length - 1; i >= 0; i--) pts.push(new THREE.Vector2(Math.max(inner[i][0], 0.0001), inner[i][1]));
  const g = new THREE.LatheGeometry(pts, seg);
  g.computeVertexNormals();
  cache.set(k, g);
  return g;
}

/** Volumen interior cerrado (para el líquido recortado por el plano de nivel). */
export function cavityGeometry(name: string, p: InstrumentProfile, seg: number, inset = 0.035): THREE.BufferGeometry {
  const k = key(`cavity:${name}:${inset}`, seg);
  const c = cache.get(k);
  if (c) return c;
  const pts: THREE.Vector2[] = [];
  const first = p.inner[0];
  pts.push(new THREE.Vector2(0.0001, first[1] + inset));
  for (const [r, y] of p.inner) if (r > 0) pts.push(new THREE.Vector2(Math.max(0.0001, r - inset), Math.max(y, first[1] + inset)));
  const last = p.inner[p.inner.length - 1];
  pts.push(new THREE.Vector2(0.0001, last[1]));
  const g = new THREE.LatheGeometry(pts, seg);
  g.computeVertexNormals();
  cache.set(k, g);
  return g;
}

/** Envolvente cilíndrica parcial (para graduaciones y etiquetas que siguen la curvatura). */
export function wrapGeometry(r: number, h: number, arc: number, seg = 24): THREE.CylinderGeometry {
  const k = `wrap:${r.toFixed(3)}:${h.toFixed(3)}:${arc.toFixed(3)}:${seg}`;
  const c = cache.get(k);
  if (c) return c as THREE.CylinderGeometry;
  // Centrado hacia el observador (+Z de la escena): en CylinderGeometry θ = 0 apunta a +Z.
  const g = new THREE.CylinderGeometry(r, r, h, seg, 1, true, -arc / 2, arc);
  cache.set(k, g);
  return g;
}

export function sphericalCap(radius: number, height: number, seg = 32): THREE.BufferGeometry {
  const k = `cap:${radius}:${height}:${seg}`;
  const c = cache.get(k);
  if (c) return c;
  // Radio de la esfera que da un casquete de ese diámetro y altura.
  const R = (radius * radius + height * height) / (2 * height);
  const theta = Math.asin(radius / R);
  const g = new THREE.SphereGeometry(R, seg, 8, 0, Math.PI * 2, Math.PI - theta, theta);
  g.translate(0, R, 0);
  cache.set(k, g);
  return g;
}
