/**
 * Partículas puramente visuales (granos de polvo que caen, gotas, salpicaduras, burbujas, cubitos de hielo, destellos).
 * Viven en coordenadas de mesada (cm) y nunca afectan al dominio.
 */

export type ParticleKind = 'grain' | 'drop' | 'splash' | 'bubble' | 'cube' | 'spark' | 'mist';

export interface Particle {
  kind: ParticleKind;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  /** Altura a la que se detiene (superficie del receptor o mesada). */
  floorZ: number;
  /** Techo para burbujas (superficie del líquido). */
  ceilZ?: number;
  color: number;
  size: number;
  life: number;
  age: number;
  /** Al tocar el suelo: 'die' | 'splash' | 'rest'. */
  onFloor: 'die' | 'splash' | 'rest';
}

const MAX = 900;

export class ParticleSystem {
  list: Particle[] = [];
  quality = 1;

  spawn(p: Partial<Particle> & Pick<Particle, 'kind' | 'x' | 'y' | 'z'>) {
    if (this.list.length >= MAX * this.quality) return;
    this.list.push({
      vx: 0, vy: 0, vz: 0, floorZ: 0, color: 0xffffff, size: 1, life: 2, age: 0, onFloor: 'die', ...p,
    });
  }

  /** Chorro de granos (espátula, vial, papel de pesada). */
  pourGrains(x: number, y: number, z: number, floorZ: number, colors: number[], n: number) {
    for (let i = 0; i < n; i++) {
      this.spawn({
        kind: 'grain', x: x + (Math.random() - 0.5) * 0.5, y: y + (Math.random() - 0.5) * 0.4, z: z - Math.random() * 0.3,
        vx: (Math.random() - 0.5) * 2, vz: -Math.random() * 3, floorZ, color: colors[i % colors.length],
        size: 0.6 + Math.random() * 0.7, life: 2, onFloor: 'rest',
      });
    }
  }

  drop(x: number, y: number, z: number, floorZ: number, color: number, size = 1.6) {
    this.spawn({ kind: 'drop', x, y, z, vz: -4, floorZ, color, size, life: 2, onFloor: 'splash' });
  }

  splash(x: number, y: number, z: number, color: number, n = 5) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      this.spawn({
        kind: 'splash', x, y, z, vx: Math.cos(a) * (6 + Math.random() * 8), vy: Math.sin(a) * 4, vz: 6 + Math.random() * 8,
        floorZ: z - 0.5, color, size: 0.5 + Math.random() * 0.5, life: 0.5, onFloor: 'die',
      });
    }
  }

  bubble(x: number, y: number, z: number, ceilZ: number, size = 0.8) {
    this.spawn({ kind: 'bubble', x, y, z, vz: 3 + Math.random() * 4, vx: (Math.random() - 0.5) * 0.6, floorZ: -1e3, ceilZ, color: 0xffffff, size, life: 3, onFloor: 'die' });
  }

  cube(x: number, y: number, z: number, floorZ: number) {
    this.spawn({ kind: 'cube', x, y, z, vx: (Math.random() - 0.5) * 3, vz: -2, floorZ, color: 0xeaf6ff, size: 2.4 + Math.random(), life: 1.6, onFloor: 'rest' });
  }

  spark(x: number, y: number, z: number) {
    this.spawn({ kind: 'spark', x, y, z, vz: 1.5, vx: (Math.random() - 0.5) * 2, color: 0xffffff, size: 1.2, life: 0.8, onFloor: 'die', floorZ: -1e3 });
  }

  mist(x: number, y: number, z: number, vx: number) {
    this.spawn({ kind: 'mist', x, y, z, vx, vz: 1.2, color: 0xffffff, size: 2, life: 1.4, onFloor: 'die', floorZ: -1e3 });
  }

  update(dt: number) {
    const g = 60; // cm/s² (atenuada para que se vea la caída)
    for (const p of this.list) {
      p.age += dt;
      if (p.kind === 'bubble') {
        p.z += p.vz * dt;
        p.x += p.vx * dt;
        if (p.ceilZ !== undefined && p.z >= p.ceilZ) p.age = p.life;
        continue;
      }
      if (p.kind === 'mist' || p.kind === 'spark') {
        p.x += p.vx * dt;
        p.z += p.vz * dt;
        continue;
      }
      if (p.z > p.floorZ) {
        p.vz -= g * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.z += p.vz * dt;
        if (p.z <= p.floorZ) {
          p.z = p.floorZ;
          if (p.onFloor === 'splash') {
            this.splash(p.x, p.y, p.z, p.color, 3);
            p.age = p.life;
          } else if (p.onFloor === 'die') p.age = p.life;
          else {
            p.vx = p.vy = p.vz = 0;
            p.life = Math.min(p.life, p.age + 0.35);
          }
        }
      }
    }
    this.list = this.list.filter((p) => p.age < p.life);
  }
}
