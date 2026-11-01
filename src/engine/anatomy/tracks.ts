/**
 * Huellas 3D de B10 (§6.6): una placa de barro cuyo relieve es la suma de los apoyos del pie. La geometría es un campo de alturas, de modo
 * que la lectura depende de la luz: con luz cenital el relieve se aplana y con luz rasante cada apoyo proyecta sombra. Las zonas señalables
 * son discos invisibles sobre cada apoyo, con la región del catálogo.
 */
import * as THREE from 'three';

/** Hundimiento elíptico, con borde levantado por el barro desplazado. */
interface Dent { x: number; y: number; rx: number; ry: number; depth: number; rot?: number; region: string | null; pick?: boolean }

const SIZE = 10;
const RES = 180;

const dents: Record<string, Dent[]> = {
  // Casco único y redondeado, con la ranilla en V.
  trackHorse: [
    { x: 0, y: 0, rx: 2.6, ry: 2.9, depth: 0.5, region: 'a', pick: true },
    { x: 0, y: -1.5, rx: 0.6, ry: 1.1, depth: -0.3, region: null },
  ],
  // Dos pezuñas alargadas, separadas por una hendidura.
  trackCow: [
    { x: -1.2, y: 0.2, rx: 1.1, ry: 2.8, depth: 0.5, rot: -0.07, region: 'a', pick: true },
    { x: 1.2, y: 0.2, rx: 1.1, ry: 2.8, depth: 0.5, rot: 0.07, region: 'a', pick: true },
  ],
  trackDog: pawDents([[-1.5, 1], [-0.55, 2.3], [0.55, 2.3], [1.5, 1]], 0.62, true, 1.45, 1.1),
  trackCat: pawDents([[-1.75, 0.8], [-0.62, 1.9], [0.62, 1.9], [1.75, 0.8]], 0.58, false, 1.6, 1.15),
  // Almohadilla plantar larga y cinco dedos con uñas.
  trackBear: [
    ...[-2.1, -1.05, 0, 1.05, 2.1].flatMap((x, i): Dent[] => [
      { x, y: 1.5 + (i === 2 ? 0.2 : i % 4 === 0 ? -0.4 : 0.05), rx: 0.5, ry: 0.55, depth: 0.42, region: 'a', pick: true },
      { x: x * 1.1, y: 2.85 + (i === 2 ? 0.2 : i % 4 === 0 ? -0.4 : 0.05), rx: 0.11, ry: 0.32, depth: 0.32, region: 'c', pick: true },
    ]),
    { x: 0, y: -1.2, rx: 2.5, ry: 1.95, depth: 0.48, region: 'b', pick: true },
  ],
  // Tres dedos largos hacia adelante y uno hacia atrás.
  trackBird: [
    { x: 0, y: 1.3, rx: 0.33, ry: 2.3, depth: 0.42, region: 'a', pick: true },
    { x: -1.5, y: 0.85, rx: 0.3, ry: 1.9, depth: 0.42, rot: 0.8, region: 'a', pick: true },
    { x: 1.5, y: 0.85, rx: 0.3, ry: 1.9, depth: 0.42, rot: -0.8, region: 'a', pick: true },
    { x: 0, y: -2.2, rx: 0.3, ry: 1.25, depth: 0.42, region: 'b', pick: true },
    { x: 0, y: 3.8, rx: 0.1, ry: 0.32, depth: 0.3, region: 'c', pick: true },
    { x: -2.82, y: 2.15, rx: 0.1, ry: 0.32, depth: 0.3, rot: 0.8, region: 'c', pick: true },
    { x: 2.82, y: 2.15, rx: 0.1, ry: 0.32, depth: 0.3, rot: -0.8, region: 'c', pick: true },
  ],
};

function pawDents(toes: Array<[number, number]>, r: number, claws: boolean, padW: number, padH: number): Dent[] {
  return [
    ...toes.flatMap(([x, y]): Dent[] => [
      { x, y, rx: r, ry: r * 1.22, depth: 0.44, region: 'a', pick: true },
      ...(claws ? [{ x: x * 1.1, y: y + 1.12, rx: 0.1, ry: 0.28, depth: 0.32, region: 'c', pick: true } as Dent] : []),
    ]),
    { x: 0, y: -1.25, rx: padW, ry: padH, depth: 0.46, region: 'b', pick: true },
  ];
}

function heightAt(list: Dent[], x: number, y: number) {
  let z = 0;
  // Ruido suave y determinista: textura de barro sin afectar la forma de los apoyos.
  z += Math.sin(x * 2.1 + y * 0.7) * 0.012 + Math.sin(y * 3.3 - x) * 0.01 + Math.sin(x * 7.1 + y * 5.3) * 0.006;
  for (const d of list) {
    const c = Math.cos(d.rot ?? 0);
    const s = Math.sin(d.rot ?? 0);
    const dx = (x - d.x) * c - (y - d.y) * s;
    const dy = (x - d.x) * s + (y - d.y) * c;
    const q = (dx * dx) / (d.rx * d.rx) + (dy * dy) / (d.ry * d.ry);
    z -= d.depth * Math.exp(-(q * q) * 1.3);
    z += Math.abs(d.depth) * 0.13 * Math.exp(-((q - 1.7) * (q - 1.7)) * 3);
  }
  return z;
}

export function buildTrack(id: string): THREE.Group {
  const list = [...dents[id]];
  const root = new THREE.Group();
  const geo = new THREE.PlaneGeometry(SIZE, SIZE, RES, RES);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  // El color es uniforme a propósito: si se distingue el apoyo es por el relieve, no por una mancha pintada.
  for (let i = 0; i < pos.count; i++) {
    const z = heightAt(list, pos.getX(i), pos.getY(i));
    pos.setZ(i, z);
    const v = 0.5 + Math.sin(pos.getX(i) * 13 + pos.getY(i) * 17) * 0.012;
    colors.set([v * 1.12, v * 0.94, v * 0.74], i * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  const slab = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.96 }));
  slab.userData.region = null;
  slab.userData.relief = true;
  root.add(slab);
  // La hendidura de la vaca también es señalable: es lo que separa las dos pezuñas.
  if (id === 'trackCow') list.push({ x: 0, y: 0.2, rx: 0.42, ry: 2.4, depth: 0, region: 'b', pick: true });
  for (const d of list.filter((x) => x.pick && x.region)) {
    const g = new THREE.CircleGeometry(1, 20);
    const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: 0xffb300, transparent: true, opacity: 0, depthWrite: false }));
    m.position.set(d.x, d.y, 0.05);
    m.scale.set(d.rx, d.ry, 1);
    m.rotation.z = -(d.rot ?? 0);
    m.userData.region = d.region;
    m.userData.pick = true;
    root.add(m);
  }
  // Se mira desde arriba: la placa acostada, con +y (la punta del pie) hacia el fondo.
  root.rotation.x = -Math.PI / 2;
  const holder = new THREE.Group();
  holder.add(root);
  return holder;
}

export const TRACK_IDS = Object.keys(dents);
